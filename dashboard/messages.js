(function () {
  'use strict';

  var dvData = window.dvDashboardData;
  var dvEventDialog = window.dvEventDialog;

  var NETWORK_FAILURE =
    'We could not reach Daily View just now. Please check your connection and try again.';

  var currentAccount = null;

  function el(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  function relativeTime(iso) {
    var mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + (mins === 1 ? ' minute ago' : ' minutes ago');
    var hours = Math.round(mins / 60);
    if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
    var days = Math.round(hours / 24);
    return days + (days === 1 ? ' day ago' : ' days ago');
  }

  // ---- account-local <-> UTC conversion for datetime-local inputs ----
  // datetime-local inputs hold a naive "YYYY-MM-DDTHH:MM" string with no
  // timezone of its own. We treat that string as wall-clock time in the
  // account's timezone (spec: "use account-local timezone in the UI"), not
  // the browser's own timezone, so two conversions are needed either way.

  function utcIsoToAccountLocalInputValue(iso, timezone) {
    if (!iso) return '';
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    }).formatToParts(new Date(iso)).reduce(function (acc, p) { acc[p.type] = p.value; return acc; }, {});
    return parts.year + '-' + parts.month + '-' + parts.day + 'T' + parts.hour + ':' + parts.minute;
  }

  function accountLocalInputValueToUtcIso(localValue, timezone) {
    if (!localValue) return null;
    var datePart = localValue.split('T')[0].split('-').map(Number);
    var timePart = localValue.split('T')[1].split(':').map(Number);
    var asUtcGuess = Date.UTC(datePart[0], datePart[1] - 1, datePart[2], timePart[0], timePart[1]);

    // What does that guessed UTC instant look like when rendered in the
    // account's timezone? The gap between the two is the zone's offset.
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(new Date(asUtcGuess)).reduce(function (acc, p) { acc[p.type] = p.value; return acc; }, {});
    var asIfLocal = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second)
    );
    var offset = asUtcGuess - asIfLocal;
    return new Date(asUtcGuess + offset).toISOString();
  }

  function formatDateTime(iso, timezone) {
    if (!iso) return '';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    }).format(new Date(iso));
  }

  function messageStatus(m) {
    var now = new Date();
    if (!m.is_active) return 'paused';
    if (m.start_at && new Date(m.start_at) > now) return 'scheduled';
    if (m.end_at && new Date(m.end_at) < now) return 'expired';
    return 'active';
  }

  // ---- message dialog ----

  var dialogsReady = false;
  var msgDialog, msgForm, msgMessageEl, msgSubmitBtn, msgTitleEl;
  var editingMessageId = null;

  function ensureDialog() {
    if (dialogsReady) return;
    dialogsReady = true;

    msgDialog     = document.getElementById('message-dialog');
    msgForm       = document.getElementById('message-form');
    msgMessageEl  = document.getElementById('message-dialog-message');
    msgSubmitBtn  = document.getElementById('message-submit-btn');
    msgTitleEl    = document.getElementById('message-dialog-title');

    document.getElementById('message-dialog-close').addEventListener('click', closeDialog);
    document.getElementById('message-cancel-btn').addEventListener('click', closeDialog);
    msgForm.addEventListener('submit', handleSubmit);
  }

  function closeDialog() {
    msgDialog.close();
  }

  function setMessage(messageEl, text, tone) {
    messageEl.textContent = text;
    if (tone) messageEl.setAttribute('data-tone', tone);
    else messageEl.removeAttribute('data-tone');
  }

  function clearFieldError(input, errorEl, fieldEl) {
    fieldEl.removeAttribute('data-invalid');
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
    errorEl.textContent = '';
    errorEl.hidden = true;
  }

  function showFieldError(input, errorEl, fieldEl, text) {
    fieldEl.setAttribute('data-invalid', 'true');
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', errorEl.id);
    errorEl.textContent = text;
    errorEl.hidden = false;
  }

  function resetForm(m) {
    setMessage(msgMessageEl, '', null);
    [
      ['message-text', 'message-text-error', 'message-text-field'],
      ['message-end', 'message-end-error', 'message-end-field'],
      ['message-priority', 'message-priority-error', 'message-priority-field']
    ].forEach(function (ids) {
      clearFieldError(document.getElementById(ids[0]), document.getElementById(ids[1]), document.getElementById(ids[2]));
    });

    document.getElementById('message-text').value = m ? m.message : '';
    document.getElementById('message-start').value = m ? utcIsoToAccountLocalInputValue(m.start_at, currentAccount.timezone) : '';
    document.getElementById('message-end').value = m ? utcIsoToAccountLocalInputValue(m.end_at, currentAccount.timezone) : '';
    document.getElementById('message-priority').value = m ? String(m.display_priority) : '1';
    document.getElementById('message-active').checked = m ? !!m.is_active : true;
  }

  function openAddDialog(onChanged) {
    ensureDialog();
    editingMessageId = null;
    msgTitleEl.textContent = 'Add message';
    msgSubmitBtn.textContent = 'Save message';
    resetForm(null);
    msgDialog.showModal();
    msgDialog._onChanged = onChanged;
  }

  function openEditDialog(m, onChanged) {
    ensureDialog();
    editingMessageId = m.message_id;
    msgTitleEl.textContent = 'Edit message';
    msgSubmitBtn.textContent = 'Save message';
    resetForm(m);
    msgDialog.showModal();
    msgDialog._onChanged = onChanged;
  }

  function validate() {
    var valid = true;
    var firstInvalid = null;

    var textInput = document.getElementById('message-text');
    var textError = document.getElementById('message-text-error');
    var textField = document.getElementById('message-text-field');
    clearFieldError(textInput, textError, textField);

    var endInput = document.getElementById('message-end');
    var endError = document.getElementById('message-end-error');
    var endField = document.getElementById('message-end-field');
    clearFieldError(endInput, endError, endField);

    var priorityInput = document.getElementById('message-priority');
    var priorityError = document.getElementById('message-priority-error');
    var priorityField = document.getElementById('message-priority-field');
    clearFieldError(priorityInput, priorityError, priorityField);

    var text = textInput.value.trim();
    if (!text) {
      showFieldError(textInput, textError, textField, 'Enter a message.');
      valid = false;
      firstInvalid = firstInvalid || textInput;
    } else if (text.length > 220) {
      showFieldError(textInput, textError, textField, 'Messages must be 220 characters or fewer.');
      valid = false;
      firstInvalid = firstInvalid || textInput;
    }

    var startVal = document.getElementById('message-start').value;
    var endVal = endInput.value;
    if (startVal && endVal && endVal <= startVal) {
      showFieldError(endInput, endError, endField, 'Show until must be later than show from.');
      valid = false;
      firstInvalid = firstInvalid || endInput;
    }

    var priority = Number(priorityInput.value);
    if (!priorityInput.value || isNaN(priority) || priority < 1 || priority > 9 || Math.floor(priority) !== priority) {
      showFieldError(priorityInput, priorityError, priorityField, 'Priority must be a whole number from 1 to 9.');
      valid = false;
      firstInvalid = firstInvalid || priorityInput;
    }

    if (firstInvalid) firstInvalid.focus();
    return valid;
  }

  function handleSubmit(e) {
    e.preventDefault();
    setMessage(msgMessageEl, '', null);
    if (!validate()) return;

    var tz = currentAccount.timezone;
    var payload = {
      account_id: currentAccount.account_id,
      message: document.getElementById('message-text').value.trim(),
      start_at: accountLocalInputValueToUtcIso(document.getElementById('message-start').value, tz),
      end_at: accountLocalInputValueToUtcIso(document.getElementById('message-end').value, tz),
      display_priority: Number(document.getElementById('message-priority').value),
      is_active: document.getElementById('message-active').checked,
      updated_by_user_id: currentAccount.user_id
    };

    msgSubmitBtn.disabled = true;
    msgSubmitBtn.textContent = 'Saving…';

    var request = editingMessageId
      ? dvData.updateMessage(editingMessageId, payload)
      : dvData.createMessage(Object.assign({ created_by_user_id: currentAccount.user_id }, payload));

    var onChanged = msgDialog._onChanged;
    request.then(function () {
      msgSubmitBtn.disabled = false;
      msgSubmitBtn.textContent = 'Save message';
      closeDialog();
      if (onChanged) onChanged();
    }, function () {
      msgSubmitBtn.disabled = false;
      msgSubmitBtn.textContent = 'Save message';
      setMessage(msgMessageEl, NETWORK_FAILURE, 'error');
    });
  }

  // ---- list rendering ----

  function statusLabel(status) {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  function buildMessageRow(m, canManage, onChanged) {
    var status = messageStatus(m);
    var li = el('li', 'message-row');

    var top = el('div', 'message-row-top');
    top.appendChild(el('span', 'badge message-status-badge message-status-' + status, statusLabel(status)));
    top.appendChild(el('span', 'message-row-priority', 'Priority ' + m.display_priority));
    li.appendChild(top);

    li.appendChild(el('div', 'message-row-preview', m.message));

    var metaParts = [];
    if (m.start_at || m.end_at) {
      metaParts.push('Shows ' + (m.start_at ? formatDateTime(m.start_at, currentAccount.timezone) : 'now') +
        ' – ' + (m.end_at ? formatDateTime(m.end_at, currentAccount.timezone) : 'until removed'));
    } else {
      metaParts.push('Shows until manually removed');
    }
    metaParts.push('Updated ' + relativeTime(m.updated_at));
    li.appendChild(el('div', 'message-row-meta', metaParts.join(' · ')));

    if (canManage) {
      var actions = el('div', 'message-row-actions');

      var editBtn = el('button', 'btn-outline', 'Edit');
      editBtn.type = 'button';
      editBtn.addEventListener('click', function () { openEditDialog(m, onChanged); });
      actions.appendChild(editBtn);

      var toggleBtn = el('button', 'btn-outline', m.is_active ? 'Pause' : 'Resume');
      toggleBtn.type = 'button';
      toggleBtn.addEventListener('click', function () {
        dvData.updateMessage(m.message_id, { is_active: !m.is_active, updated_by_user_id: currentAccount.user_id })
          .then(onChanged, function () { /* left as-is; list will just not refresh */ });
      });
      actions.appendChild(toggleBtn);

      var deleteBtn = el('button', 'btn-outline schedule-delete-btn', 'Delete');
      deleteBtn.type = 'button';
      deleteBtn.addEventListener('click', function () {
        dvEventDialog.openConfirm({
          title: 'Delete this message?',
          message: '"' + m.message + '" will be permanently removed.',
          confirmLabel: 'Delete message',
          onConfirm: function () {
            return dvData.deleteMessage(m.message_id, currentAccount.user_id);
          }
        }, onChanged);
      });
      actions.appendChild(deleteBtn);

      li.appendChild(actions);
    }

    return li;
  }

  function renderBody(bodyEl, messages, canManage, onChanged) {
    bodyEl.textContent = '';

    if (canManage) {
      var headerRow = el('div', 'schedule-section-header schedule-section-header--end');
      var addBtn = el('button', 'btn', 'Add message');
      addBtn.type = 'button';
      addBtn.addEventListener('click', function () { openAddDialog(onChanged); });
      headerRow.appendChild(addBtn);
      bodyEl.appendChild(headerRow);
    }

    if (messages.length === 0) {
      bodyEl.appendChild(el('p', 'schedule-empty', 'Use a message for a short, important update that should stand out on the screen.'));
      return;
    }

    var list = el('ul', 'message-list');
    messages.forEach(function (m) {
      list.appendChild(buildMessageRow(m, canManage, onChanged));
    });
    bodyEl.appendChild(list);
  }

  function refresh() {
    var contentEl = document.getElementById('dashboard-content');
    var bodyEl = contentEl.querySelector('.messages-body');
    var statusEl = contentEl.querySelector('.messages-status');
    if (!bodyEl || !statusEl) return;

    statusEl.textContent = 'Loading…';
    statusEl.removeAttribute('data-tone');

    dvData.listMessages(currentAccount.account_id).then(function (messages) {
      statusEl.textContent = '';
      renderBody(bodyEl, messages, !!currentAccount.can_manage_events, refresh);
    }, function () {
      statusEl.textContent = NETWORK_FAILURE;
      statusEl.setAttribute('data-tone', 'error');
    });
  }

  function render(contentEl, account) {
    currentAccount = account;

    contentEl.textContent = '';
    contentEl.appendChild(el('h2', null, 'Messages'));

    var statusEl = el('p', 'messages-status today-status');
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.textContent = 'Loading…';
    contentEl.appendChild(statusEl);

    var bodyEl = el('div', 'messages-body');
    contentEl.appendChild(bodyEl);

    refresh();
  }

  window.dvMessages = { render: render };
})();
