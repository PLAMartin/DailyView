(function () {
  'use strict';

  var dvData = window.dvDashboardData;

  var NETWORK_FAILURE =
    'We could not reach Daily View just now. Please check your connection and try again.';

  // Time-of-day icon assets — same files used by the marketing page's mockup
  // (index.html's periodIcons object). Kept as a small local copy since this
  // page is a separate script with no shared stylesheet/data module for it.
  // Note: index.html's own periodIcons object points its MORNING entry at
  // assets/icon/logo_icon_v5.svg, which does not exist (only assets/icon/
  // logo_icon_v5.png does) — a pre-existing broken path on the marketing
  // page, left as-is there since it's out of scope here. This copy points at
  // assets/logo/logo_icon_v5.svg, which is the real file with that name.
  var PERIOD_ICONS = {
    morning:   '../assets/logo/logo_icon_v5.svg',
    afternoon: '../assets/icon/afternoon%20icon%20v1.svg',
    evening:   '../assets/icon/evening_icon_v2.svg',
    night:     '../assets/icon/night_icon_v1.svg'
  };

  // Visibility values whose events must never appear on the Daily View
  // display — mirrors the server-side trigger in
  // supabase/migrations/20260706112913_dv_today_page.sql. Kept in sync with
  // the live seed data (dv_event_visibility), not the spec doc's naming.
  var HIDDEN_VISIBILITY_VALUES = ['private', 'supporters_only'];

  var currentAccount = null;
  var currentLookups = null;
  var editingEventId = null;
  var pendingConfirmAction = null;

  // ---- small helpers ----

  function accountLocalIsoDate(timezone) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  }

  function dayDateLabels(timezone) {
    var now = new Date();
    var day = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'long' }).format(now);
    var date = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, day: 'numeric', month: 'long', year: 'numeric'
    }).format(now);
    return { day: day.toUpperCase(), date: date.toUpperCase() };
  }

  function timeLabel(t) {
    return t ? t.slice(0, 5) : '';
  }

  function humanize(text) {
    if (!text) return '';
    var s = text.replace(/_/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
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

  function deviceStatusLabel(device) {
    if (!device.is_active) return 'Inactive';
    if (!device.last_seen_at) return 'Waiting to connect';
    var mins = (Date.now() - new Date(device.last_seen_at).getTime()) / 60000;
    if (mins <= 5) return 'Online';
    if (mins <= 24 * 60) return 'Recently seen';
    return 'Offline';
  }

  function el(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  // ---- field-error helpers (mirrors login/login.js conventions) ----

  function showFieldError(input, errorEl, fieldEl, message) {
    fieldEl.setAttribute('data-invalid', 'true');
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', errorEl.id);
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearFieldError(input, errorEl, fieldEl) {
    fieldEl.removeAttribute('data-invalid');
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
    errorEl.textContent = '';
    errorEl.hidden = true;
  }

  function setMessage(messageEl, text, tone) {
    messageEl.textContent = text;
    if (tone) {
      messageEl.setAttribute('data-tone', tone);
    } else {
      messageEl.removeAttribute('data-tone');
    }
  }

  // ---- dialogs ----

  var dialogsReady = false;
  var eventDialog, eventForm, eventMessageEl, eventSubmitBtn, eventTitleEl;
  var confirmDialog, confirmTitleEl, confirmMessageTextEl, confirmMessageEl, confirmBtn, confirmCancelBtn;

  function ensureDialogs() {
    if (dialogsReady) return;
    dialogsReady = true;

    eventDialog     = document.getElementById('event-dialog');
    eventForm       = document.getElementById('event-form');
    eventMessageEl  = document.getElementById('event-dialog-message');
    eventSubmitBtn  = document.getElementById('event-submit-btn');
    eventTitleEl    = document.getElementById('event-dialog-title');

    document.getElementById('event-dialog-close').addEventListener('click', closeEventDialog);
    document.getElementById('event-cancel-btn').addEventListener('click', closeEventDialog);
    eventForm.addEventListener('submit', handleEventSubmit);

    document.getElementById('event-visibility').addEventListener('change', applyVisibilityRule);

    confirmDialog         = document.getElementById('confirm-dialog');
    confirmTitleEl        = document.getElementById('confirm-dialog-title');
    confirmMessageTextEl  = document.getElementById('confirm-dialog-message-text');
    confirmMessageEl      = document.getElementById('confirm-dialog-message');
    confirmBtn            = document.getElementById('confirm-dialog-confirm');
    confirmCancelBtn      = document.getElementById('confirm-dialog-cancel');

    confirmCancelBtn.addEventListener('click', function () {
      pendingConfirmAction = null;
      confirmDialog.close();
    });
    confirmBtn.addEventListener('click', handleConfirmClick);
  }

  function applyVisibilityRule() {
    var visSelect = document.getElementById('event-visibility');
    var showCheckbox = document.getElementById('event-show-on-display');
    var selected = visSelect.options[visSelect.selectedIndex];
    var value = selected ? selected.getAttribute('data-value') : '';

    if (HIDDEN_VISIBILITY_VALUES.indexOf(value) !== -1) {
      showCheckbox.checked = false;
      showCheckbox.disabled = true;
    } else {
      showCheckbox.disabled = false;
    }
  }

  function populateSelect(selectEl, items, idKey, labelKey, defaultId) {
    selectEl.textContent = '';
    items.forEach(function (item) {
      var opt = document.createElement('option');
      opt.value = String(item[idKey]);
      opt.setAttribute('data-value', item[labelKey]);
      opt.textContent = humanize(item[labelKey]);
      if (item[idKey] === defaultId) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }

  function resetEventForm() {
    [
      ['event-title', 'event-title-error', 'event-title-field'],
      ['event-date', 'event-date-error', 'event-date-field'],
      ['event-end-time', 'event-end-time-error', 'event-end-time-field'],
      ['event-priority', 'event-priority-error', 'event-priority-field']
    ].forEach(function (ids) {
      clearFieldError(document.getElementById(ids[0]), document.getElementById(ids[1]), document.getElementById(ids[2]));
    });
    setMessage(eventMessageEl, '', null);

    document.getElementById('event-title').value = '';
    document.getElementById('event-date').value = accountLocalIsoDate(currentAccount.timezone);
    document.getElementById('event-start-time').value = '';
    document.getElementById('event-end-time').value = '';
    document.getElementById('event-description').value = '';
    document.getElementById('event-priority').value = '5';
    document.getElementById('event-show-on-display').checked = true;
    document.getElementById('event-show-on-display').disabled = false;

    populateSelect(document.getElementById('event-type'), currentLookups.eventTypes, 'event_type_id', 'event_type',
      firstIdWhere(currentLookups.eventTypes, 'event_type_id', 'event_type', 'other'));
    populateSelect(document.getElementById('event-visibility'), currentLookups.visibilities, 'event_visibility_id', 'event_visibility',
      firstIdWhere(currentLookups.visibilities, 'event_visibility_id', 'event_visibility', 'display'));
    populateSelect(document.getElementById('event-accuracy'), currentLookups.accuracies, 'event_accuracy_id', 'event_accuracy',
      firstIdWhere(currentLookups.accuracies, 'event_accuracy_id', 'event_accuracy', 'confirmed'));
  }

  function firstIdWhere(items, idKey, labelKey, value) {
    var match = items.filter(function (i) { return i[labelKey] === value; })[0];
    return match ? match[idKey] : null;
  }

  function openAddEventDialog() {
    ensureDialogs();
    editingEventId = null;
    eventTitleEl.textContent = 'Add event';
    eventSubmitBtn.textContent = 'Save event';
    resetEventForm();
    eventDialog.showModal();
  }

  function openEditEventDialog(ev) {
    ensureDialogs();
    editingEventId = ev.event_id;
    eventTitleEl.textContent = 'Edit event';
    eventSubmitBtn.textContent = 'Save event';
    resetEventForm();

    document.getElementById('event-title').value = ev.title || '';
    document.getElementById('event-date').value = ev.event_date;
    document.getElementById('event-start-time').value = ev.start_time ? ev.start_time.slice(0, 5) : '';
    document.getElementById('event-end-time').value = ev.end_time ? ev.end_time.slice(0, 5) : '';
    document.getElementById('event-description').value = ev.description || '';
    document.getElementById('event-priority').value = String(ev.display_priority || 5);
    document.getElementById('event-show-on-display').checked = !!ev.show_on_display;
    document.getElementById('event-type').value = String(ev.event_type_id);
    document.getElementById('event-visibility').value = String(ev.event_visibility_id);
    document.getElementById('event-accuracy').value = String(ev.event_accuracy_id);
    applyVisibilityRule();

    eventDialog.showModal();
  }

  function closeEventDialog() {
    eventDialog.close();
  }

  function validateEventForm() {
    var valid = true;
    var firstInvalid = null;

    var titleInput = document.getElementById('event-title');
    var titleError = document.getElementById('event-title-error');
    var titleField = document.getElementById('event-title-field');
    clearFieldError(titleInput, titleError, titleField);

    var dateInput = document.getElementById('event-date');
    var dateError = document.getElementById('event-date-error');
    var dateField = document.getElementById('event-date-field');
    clearFieldError(dateInput, dateError, dateField);

    var endInput = document.getElementById('event-end-time');
    var endError = document.getElementById('event-end-time-error');
    var endField = document.getElementById('event-end-time-field');
    clearFieldError(endInput, endError, endField);

    var priorityInput = document.getElementById('event-priority');
    var priorityError = document.getElementById('event-priority-error');
    var priorityField = document.getElementById('event-priority-field');
    clearFieldError(priorityInput, priorityError, priorityField);

    var title = titleInput.value.trim();
    if (!title) {
      showFieldError(titleInput, titleError, titleField, 'Enter a title for this event.');
      valid = false;
      firstInvalid = firstInvalid || titleInput;
    } else if (title.length > 100) {
      showFieldError(titleInput, titleError, titleField, 'Titles must be 100 characters or fewer.');
      valid = false;
      firstInvalid = firstInvalid || titleInput;
    }

    if (!dateInput.value) {
      showFieldError(dateInput, dateError, dateField, 'Choose a date.');
      valid = false;
      firstInvalid = firstInvalid || dateInput;
    }

    var startVal = document.getElementById('event-start-time').value;
    var endVal = endInput.value;
    if (startVal && endVal && endVal <= startVal) {
      showFieldError(endInput, endError, endField, 'End time must be later than the start time.');
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

  function handleEventSubmit(e) {
    e.preventDefault();
    setMessage(eventMessageEl, '', null);
    if (!validateEventForm()) return;

    var payload = {
      account_id: currentAccount.account_id,
      title: document.getElementById('event-title').value.trim(),
      description: document.getElementById('event-description').value.trim() || null,
      event_date: document.getElementById('event-date').value,
      start_time: document.getElementById('event-start-time').value || null,
      end_time: document.getElementById('event-end-time').value || null,
      event_type_id: Number(document.getElementById('event-type').value),
      event_visibility_id: Number(document.getElementById('event-visibility').value),
      event_accuracy_id: Number(document.getElementById('event-accuracy').value),
      display_priority: Number(document.getElementById('event-priority').value),
      show_on_display: document.getElementById('event-show-on-display').checked,
      updated_by_user_id: currentAccount.user_id
    };

    eventSubmitBtn.disabled = true;
    eventSubmitBtn.textContent = 'Saving…';

    var request = editingEventId
      ? dvData.updateEvent(editingEventId, payload)
      : dvData.createEvent(Object.assign({
          event_source_id: 3, // web_dashboard — confirmed seed value, see migration
          created_by_user_id: currentAccount.user_id
        }, payload));

    request.then(function () {
      eventSubmitBtn.disabled = false;
      eventSubmitBtn.textContent = 'Save event';
      closeEventDialog();
      refresh();
    }, function () {
      eventSubmitBtn.disabled = false;
      eventSubmitBtn.textContent = 'Save event';
      setMessage(eventMessageEl, NETWORK_FAILURE, 'error');
    });
  }

  function openConfirmDialog(opts) {
    ensureDialogs();
    confirmTitleEl.textContent = opts.title;
    confirmMessageTextEl.textContent = opts.message;
    confirmBtn.textContent = opts.confirmLabel || 'Confirm';
    setMessage(confirmMessageEl, '', null);
    pendingConfirmAction = opts.onConfirm;
    confirmDialog.showModal();
  }

  function handleConfirmClick() {
    if (!pendingConfirmAction) return;
    var action = pendingConfirmAction;
    confirmBtn.disabled = true;
    confirmCancelBtn.disabled = true;
    action().then(function () {
      confirmBtn.disabled = false;
      confirmCancelBtn.disabled = false;
      pendingConfirmAction = null;
      confirmDialog.close();
      refresh();
    }, function () {
      confirmBtn.disabled = false;
      confirmCancelBtn.disabled = false;
      setMessage(confirmMessageEl, NETWORK_FAILURE, 'error');
    });
  }

  function handleCancelEvent(ev) {
    openConfirmDialog({
      title: 'Cancel this event?',
      message: '"' + ev.title + '" will no longer appear on the Daily View screen.',
      confirmLabel: 'Cancel event',
      onConfirm: function () {
        return dvData.cancelEvent(ev.event_id, currentAccount.user_id);
      }
    });
  }

  function handleDeleteEvent(ev) {
    openConfirmDialog({
      title: 'Delete this event?',
      message: '"' + ev.title + '" will be permanently removed. This cannot be undone.',
      confirmLabel: 'Delete event',
      onConfirm: function () {
        return dvData.deleteEvent(ev.event_id, currentAccount.user_id);
      }
    });
  }

  // ---- rendering ----

  function buildHeader(account, allAccounts, shell) {
    var header = el('div', 'today-header');

    var titleWrap = el('div');
    titleWrap.appendChild(el('h2', null, 'Today'));
    titleWrap.appendChild(el('p', 'today-account-name', account.account_name));

    var actions = el('div', 'today-header-actions');
    if (allAccounts && allAccounts.length > 1) {
      var switchBtn = el('button', 'btn-outline', 'Switch account');
      switchBtn.type = 'button';
      switchBtn.addEventListener('click', shell.switchAccount);
      actions.appendChild(switchBtn);
    }
    actions.appendChild(shell.signOutButton());

    header.appendChild(titleWrap);
    header.appendChild(actions);
    return header;
  }

  function buildPreview(viewModel) {
    var wrap = el('div', 'dv-device-frame');
    var article = el('article', 'dv-mockup dv-mockup--landscape');
    article.setAttribute('aria-label', 'Live Daily View preview');

    article.appendChild(el('div', 'dvm-title', 'Daily View'));

    var labels = dayDateLabels(currentAccount.timezone);
    var top = el('div', 'dvm-top');
    var dayDateWrap = el('div');
    dayDateWrap.appendChild(el('div', 'dvm-day', labels.day));
    dayDateWrap.appendChild(el('div', 'dvm-date', labels.date));
    var todIcon = el('div', 'dvm-tod-icon');
    todIcon.setAttribute('aria-hidden', 'true');
    var iconSrc = PERIOD_ICONS[viewModel.dayPeriod];
    if (iconSrc) {
      var img = document.createElement('img');
      img.src = iconSrc;
      img.alt = '';
      todIcon.appendChild(img);
    }
    var timeBlock = el('div', 'dvm-time-block');
    timeBlock.appendChild(el('div', 'dvm-time', viewModel.timeLabel));
    timeBlock.appendChild(el('div', 'dvm-period', viewModel.showDayPeriod ? viewModel.dayPeriod.toUpperCase() : ''));
    top.appendChild(dayDateWrap);
    top.appendChild(todIcon);
    top.appendChild(timeBlock);
    article.appendChild(top);

    article.appendChild(el('div', 'dvm-divider'));
    article.appendChild(el('div', 'dvm-today-label', 'TODAY'));

    var list = el('ul', 'dvm-events');
    list.setAttribute('aria-label', "Today's events");
    if (viewModel.events.length === 0) {
      var emptyLi = el('li', 'dvm-event-empty', 'Nothing has been added for today yet.');
      list.appendChild(emptyLi);
    } else {
      viewModel.events.forEach(function (ev) {
        var li = el('li', 'dvm-event' + (ev.isPast ? ' dvm-event--past' : ''));
        li.appendChild(el('span', 'dvm-event-icon'));
        li.appendChild(el('span', 'dvm-event-name', ev.title));
        li.appendChild(el('span', 'dvm-event-time', ev.timeLabel || ''));
        list.appendChild(li);
      });
    }
    article.appendChild(list);

    if (viewModel.showNextReminder) {
      var next = el('aside', 'dvm-next-card');
      next.appendChild(el('div', 'dvm-next-label', 'NEXT'));
      if (viewModel.nextEvent) {
        next.appendChild(el('div', 'dvm-next-item', viewModel.nextEvent.title));
        next.appendChild(el('div', 'dvm-next-time', 'at ' + viewModel.nextEvent.timeLabel));
      } else {
        next.appendChild(el('div', 'dvm-next-item', 'Nothing else planned today.'));
      }
      article.appendChild(next);
    }

    wrap.appendChild(article);
    return wrap;
  }

  function eventBadges(ev) {
    var badges = el('div', 'schedule-event-badges');
    badges.appendChild(el('span', 'badge', humanize(ev.dv_event_status.event_status)));
    if (ev.dv_event_visibility.event_visibility !== 'display') {
      badges.appendChild(el('span', 'badge', humanize(ev.dv_event_visibility.event_visibility)));
    } else if (!ev.show_on_display) {
      badges.appendChild(el('span', 'badge', 'Hidden from display'));
    }
    if (ev.dv_event_accuracy.event_accuracy !== 'confirmed') {
      badges.appendChild(el('span', 'badge', humanize(ev.dv_event_accuracy.event_accuracy)));
    }
    return badges;
  }

  function buildScheduleSection(events, canManage) {
    var section = el('section', 'schedule-section');

    var headerRow = el('div', 'schedule-section-header');
    headerRow.appendChild(el('h3', null, "Today's schedule"));
    if (canManage) {
      var addBtn = el('button', 'btn', 'Add event');
      addBtn.type = 'button';
      addBtn.addEventListener('click', openAddEventDialog);
      headerRow.appendChild(addBtn);
    }
    section.appendChild(headerRow);

    if (!canManage) {
      section.appendChild(el('p', 'schedule-readonly-note', 'You have view-only access to this account.'));
    }

    if (events.length === 0) {
      section.appendChild(el('p', 'schedule-empty', 'Nothing has been added for today yet.'));
      return section;
    }

    var list = el('ul', 'schedule-list');
    events.forEach(function (ev) {
      var li = el('li', 'schedule-row');

      var timeCol = el('div', 'schedule-row-time');
      timeCol.textContent = ev.start_time ? timeLabel(ev.start_time) + (ev.end_time ? '–' + timeLabel(ev.end_time) : '') : 'All day';

      var mainCol = el('div', 'schedule-row-main');
      mainCol.appendChild(el('div', 'schedule-row-title', ev.title));
      if (ev.description) {
        mainCol.appendChild(el('div', 'schedule-row-description', ev.description));
      }
      mainCol.appendChild(eventBadges(ev));

      li.appendChild(timeCol);
      li.appendChild(mainCol);

      if (canManage) {
        var actions = el('div', 'schedule-row-actions');

        var editBtn = el('button', 'btn-outline', 'Edit');
        editBtn.type = 'button';
        editBtn.addEventListener('click', function () { openEditEventDialog(ev); });
        actions.appendChild(editBtn);

        if (ev.dv_event_status.event_status !== 'cancelled') {
          var cancelBtn = el('button', 'btn-outline', 'Cancel');
          cancelBtn.type = 'button';
          cancelBtn.addEventListener('click', function () { handleCancelEvent(ev); });
          actions.appendChild(cancelBtn);
        }

        var deleteBtn = el('button', 'btn-outline schedule-delete-btn', 'Delete');
        deleteBtn.type = 'button';
        deleteBtn.addEventListener('click', function () { handleDeleteEvent(ev); });
        actions.appendChild(deleteBtn);

        li.appendChild(actions);
      }

      list.appendChild(li);
    });
    section.appendChild(list);
    return section;
  }

  function buildDeviceSection(devices) {
    var section = el('section', 'device-section');
    section.appendChild(el('h3', null, 'Device status'));

    if (devices.length === 0) {
      section.appendChild(el('p', 'device-empty', 'Add a Daily View screen to see its connection status here.'));
      return section;
    }

    var list = el('ul', 'device-list');
    devices.forEach(function (device) {
      var li = el('li', 'device-row');
      var label = deviceStatusLabel(device);

      var nameRow = el('div', 'device-row-name');
      nameRow.appendChild(el('span', null, device.device_name || 'Daily View screen'));
      var statusBadge = el('span', 'badge device-status-badge device-status-' + label.toLowerCase().replace(/\s+/g, '-'), label);
      nameRow.appendChild(statusBadge);
      li.appendChild(nameRow);

      if (label === 'Offline') {
        li.appendChild(el('p', 'device-row-note', 'This screen has not checked in recently. Check its power and internet connection.'));
      } else if (device.last_seen_at) {
        li.appendChild(el('p', 'device-row-note', 'Last seen: ' + relativeTime(device.last_seen_at)));
      }

      list.appendChild(li);
    });
    section.appendChild(list);
    return section;
  }

  function renderBody(bodyEl, viewModel, events, devices) {
    bodyEl.textContent = '';

    var top = el('div', 'today-top-row');
    top.appendChild(buildPreview(viewModel));
    top.appendChild(buildDeviceSection(devices));
    bodyEl.appendChild(top);

    bodyEl.appendChild(buildScheduleSection(events, !!currentAccount.can_manage_events));
  }

  function loadAndRenderBody(bodyEl, statusEl, account, isoDate) {
    Promise.all([
      dvData.getTodayViewModel(account.account_id),
      dvData.listTodayEvents(account.account_id, isoDate),
      dvData.listDevices(account.account_id),
      dvData.listEventLookups()
    ]).then(function (results) {
      statusEl.textContent = '';
      statusEl.removeAttribute('data-tone');
      currentLookups = results[3];
      renderBody(bodyEl, results[0], results[1], results[2]);
    }, function () {
      statusEl.textContent = NETWORK_FAILURE;
      statusEl.setAttribute('data-tone', 'error');
    });
  }

  function refresh() {
    var contentEl = document.getElementById('dashboard-content');
    var bodyEl = contentEl.querySelector('.today-body');
    var statusEl = contentEl.querySelector('.today-status');
    statusEl.textContent = 'Updating…';
    statusEl.removeAttribute('data-tone');
    loadAndRenderBody(bodyEl, statusEl, currentAccount, accountLocalIsoDate(currentAccount.timezone));
  }

  function render(contentEl, account, allAccounts, shell) {
    currentAccount = account;
    ensureDialogs();

    var panel = contentEl.closest('.auth-panel');
    if (panel) panel.classList.add('auth-panel--wide');

    contentEl.textContent = '';
    contentEl.appendChild(buildHeader(account, allAccounts, shell));

    var statusEl = el('p', 'today-status');
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.textContent = 'Loading today’s plan…';
    contentEl.appendChild(statusEl);

    var bodyEl = el('div', 'today-body');
    contentEl.appendChild(bodyEl);

    loadAndRenderBody(bodyEl, statusEl, account, accountLocalIsoDate(account.timezone));
  }

  window.dvToday = { render: render };
})();
