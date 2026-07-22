(function () {
  'use strict';

  var dvData = window.dvDashboardData;

  var NETWORK_FAILURE =
    'We could not reach Daily View just now. Please check your connection and try again.';

  // Visibility values whose events must never appear on the Daily View
  // display — mirrors the server-side trigger in
  // supabase/migrations/20260706112913_dv_today_page.sql. Kept in sync with
  // the live seed data (dv_event_visibility), not the spec doc's naming.
  var HIDDEN_VISIBILITY_VALUES = ['private', 'supporters_only'];

  // Shared by every page that opens these dialogs (Today, Calendar, ...).
  // context = { accountId, timezone, userId }; onChanged is called after a
  // successful save/cancel/delete so the caller can refresh its own view.
  var currentContext = null;
  var currentLookups = null;
  var editingEventId = null;
  var pendingConfirmAction = null;
  var onChangeCallback = null;

  function accountLocalIsoDate(timezone) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  }

  function humanize(text) {
    if (!text) return '';
    var s = text.replace(/_/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

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

    document.getElementById('event-visibility').addEventListener('change', function () {
      applyVisibilityRule(true);
    });

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

  // isUserChange distinguishes an active dropdown change (fix the "silently
  // still off after switching back to Display" gotcha by restoring the
  // checkbox) from the initial sync on dialog-open (must NOT clobber a
  // loaded event's legitimate display:true + show_on_display:false state —
  // that combination is valid: eligible for display but intentionally not
  // shown right now).
  function applyVisibilityRule(isUserChange) {
    var visSelect = document.getElementById('event-visibility');
    var showCheckbox = document.getElementById('event-show-on-display');
    var selected = visSelect.options[visSelect.selectedIndex];
    var value = selected ? selected.getAttribute('data-value') : '';

    if (HIDDEN_VISIBILITY_VALUES.indexOf(value) !== -1) {
      showCheckbox.checked = false;
      showCheckbox.disabled = true;
    } else {
      showCheckbox.disabled = false;
      if (isUserChange) showCheckbox.checked = true;
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

  function firstIdWhere(items, idKey, labelKey, value) {
    var match = items.filter(function (i) { return i[labelKey] === value; })[0];
    return match ? match[idKey] : null;
  }

  function resetEventForm(defaultDate) {
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
    document.getElementById('event-date').value = defaultDate || accountLocalIsoDate(currentContext.timezone);
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

  function openAddEventDialog(context, lookups, defaultDate, onChanged) {
    ensureDialogs();
    currentContext = context;
    currentLookups = lookups;
    onChangeCallback = onChanged;
    editingEventId = null;
    eventTitleEl.textContent = 'Add event';
    eventSubmitBtn.textContent = 'Save event';
    resetEventForm(defaultDate);
    eventDialog.showModal();
  }

  function openEditEventDialog(ev, context, lookups, onChanged) {
    ensureDialogs();
    currentContext = context;
    currentLookups = lookups;
    onChangeCallback = onChanged;
    editingEventId = ev.event_id;
    eventTitleEl.textContent = 'Edit event';
    eventSubmitBtn.textContent = 'Save event';
    resetEventForm(ev.event_date);

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
      account_id: currentContext.accountId,
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
      updated_by_user_id: currentContext.userId
    };

    eventSubmitBtn.disabled = true;
    eventSubmitBtn.textContent = 'Saving…';

    var request = editingEventId
      ? dvData.updateEvent(editingEventId, payload)
      : dvData.createEvent(Object.assign({
          event_source_id: 3, // web_dashboard — confirmed seed value, see migration
          created_by_user_id: currentContext.userId
        }, payload));

    request.then(function () {
      eventSubmitBtn.disabled = false;
      eventSubmitBtn.textContent = 'Save event';
      closeEventDialog();
      if (onChangeCallback) onChangeCallback();
    }, function () {
      eventSubmitBtn.disabled = false;
      eventSubmitBtn.textContent = 'Save event';
      setMessage(eventMessageEl, NETWORK_FAILURE, 'error');
    });
  }

  // Generic confirmation dialog — also used directly by other pages (e.g.
  // Messages' delete confirmation) since #confirm-dialog only has one owner.
  function openConfirmDialog(opts, onChanged) {
    ensureDialogs();
    onChangeCallback = onChanged || null;
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
      if (onChangeCallback) onChangeCallback();
    }, function (err) {
      confirmBtn.disabled = false;
      confirmCancelBtn.disabled = false;
      // Only ever show a caller-curated message (marked .friendly), never a
      // raw Postgrest/network error's .message verbatim — this audience
      // needs plain language, and most callers don't sanitize their
      // rejections (see people.js's friendlyError() for the pattern that does).
      setMessage(confirmMessageEl, (err && err.friendly && err.message) || NETWORK_FAILURE, 'error');
    });
  }

  function openCancelConfirm(ev, context, onChanged) {
    openConfirmDialog({
      title: 'Cancel this event?',
      message: '"' + ev.title + '" will no longer appear on the Daily View screen.',
      confirmLabel: 'Cancel event',
      onConfirm: function () {
        return dvData.cancelEvent(ev.event_id, context.userId);
      }
    }, onChanged);
  }

  function openDeleteConfirm(ev, context, onChanged) {
    openConfirmDialog({
      title: 'Delete this event?',
      message: '"' + ev.title + '" will be permanently removed. This cannot be undone.',
      confirmLabel: 'Delete event',
      onConfirm: function () {
        return dvData.deleteEvent(ev.event_id, context.userId);
      }
    }, onChanged);
  }

  window.dvEventDialog = {
    openAdd: openAddEventDialog,
    openEdit: openEditEventDialog,
    openCancelConfirm: openCancelConfirm,
    openDeleteConfirm: openDeleteConfirm,
    openConfirm: openConfirmDialog
  };
})();
