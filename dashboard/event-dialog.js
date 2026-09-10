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

  // Repeat frequency -> the rrule string stored on dv_event_series.rrule, and the plain-language
  // label used when an existing series is shown read-only. These are the only rrules
  // dv_generate_series_occurrences() understands (see
  // supabase/migrations/20260910120000_dv_event_series_frequencies.sql) — the weekday of a
  // weekly series and the day-of-month of a monthly one both come from start_date, so there is
  // no BYDAY/BYMONTHDAY to build here.
  var REPEAT_OPTIONS = {
    weekly:       { rrule: 'FREQ=WEEKLY',            label: 'Repeats every week' },
    fortnightly:  { rrule: 'FREQ=WEEKLY;INTERVAL=2', label: 'Repeats every 2 weeks' },
    four_weekly:  { rrule: 'FREQ=WEEKLY;INTERVAL=4', label: 'Repeats every 4 weeks' },
    monthly:      { rrule: 'FREQ=MONTHLY',           label: 'Repeats every month' },
    yearly:       { rrule: 'FREQ=YEARLY',            label: 'Repeats every year' }
  };

  // What "Use the usual notice for this kind of event" resolves to, mirroring
  // dv_default_notice_days() in that same migration. Kept here only to explain the default to
  // the carer in plain language — the server is the authority, and the yearly case defers to
  // the account's own setting, which this dialog does not load.
  var DEFAULT_NOTICE_HINTS = {
    '':           'One-off events are not announced in advance unless you choose a reminder here.',
    weekly:       'Weekly events are not announced in advance — they would be on the screen almost every day. Choose a reminder above if you want one.',
    fortnightly:  'Events every 2 weeks are not announced in advance. Choose a reminder above if you want one.',
    four_weekly:  'Events every 4 weeks are not announced in advance. Choose a reminder above if you want one.',
    monthly:      'Monthly events are announced the day before.',
    yearly:       'Yearly events use the notice set on the Settings page (3 days to start with).'
  };

  // Shared by every page that opens these dialogs (Today, Calendar, ...).
  // context = { accountId, timezone, userId }; onChanged is called after a
  // successful save/cancel/delete so the caller can refresh its own view.
  var currentContext = null;
  var currentLookups = null;
  var editingEventId = null;
  var editingSeriesId = null;
  var currentEditingEvent = null;
  var editingSeries = null;
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

    document.getElementById('event-delete-btn').addEventListener('click', function () {
      if (!currentEditingEvent) return;
      var outerOnChanged = onChangeCallback;
      openDeleteConfirm(currentEditingEvent, currentContext, function () {
        closeEventDialog();
        if (outerOnChanged) outerOnChanged();
      });
    });

    document.getElementById('event-visibility').addEventListener('change', function () {
      applyVisibilityRule(true);
    });

    document.getElementById('event-repeats').addEventListener('change', applyRepeatRule);

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

  // Reveals "Repeat until" only once a frequency is chosen, and keeps the advance-notice hint
  // describing whichever frequency is currently selected.
  function applyRepeatRule() {
    var repeatsEl = document.getElementById('event-repeats');
    var freq = editingSeries ? seriesFreqKey(editingSeries.rrule) : repeatsEl.value;
    document.getElementById('event-repeat-until-field').hidden = !freq;
    document.getElementById('event-advance-notice-hint').textContent =
      DEFAULT_NOTICE_HINTS[freq] || DEFAULT_NOTICE_HINTS[''];
  }

  // rrule string -> the REPEAT_OPTIONS key that produced it, so an existing series can be
  // described back to the carer.
  function seriesFreqKey(rrule) {
    var match = '';
    Object.keys(REPEAT_OPTIONS).forEach(function (key) {
      if (REPEAT_OPTIONS[key].rrule === rrule) match = key;
    });
    return match;
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
    document.getElementById('event-repeats').value = '';
    document.getElementById('event-repeats').disabled = false;
    document.getElementById('event-repeat-until').value = '';
    document.getElementById('event-advance-notice').value = '';
    document.getElementById('event-series-scope-occurrence').checked = true;
    document.getElementById('event-series-scope-field').hidden = true;
    editingSeriesId = null;
    editingSeries = null;
    applyRepeatRule();

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
    currentEditingEvent = null;
    eventTitleEl.textContent = 'Add event';
    eventSubmitBtn.textContent = 'Save event';
    resetEventForm(defaultDate);
    document.getElementById('event-repeats-field').hidden = false;
    document.getElementById('event-repeats-select-field').hidden = false;
    document.getElementById('event-repeats-static').hidden = true;
    document.getElementById('event-delete-btn').hidden = true;
    eventDialog.showModal();
  }

  function openEditEventDialog(ev, context, lookups, onChanged) {
    ensureDialogs();
    currentContext = context;
    currentLookups = lookups;
    onChangeCallback = onChanged;
    editingEventId = ev.event_id;
    currentEditingEvent = ev;
    eventTitleEl.textContent = 'Edit event';
    eventSubmitBtn.textContent = 'Save event';
    resetEventForm(ev.event_date);
    document.getElementById('event-delete-btn').hidden = false;

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

    document.getElementById('event-advance-notice').value =
      ev.advance_notice_days === null || ev.advance_notice_days === undefined
        ? '' : String(ev.advance_notice_days);

    // How often an event repeats can only be chosen when it is first created, not retrofitted
    // onto an existing one-off event — the frequency control stays create-only. What a carer
    // does revisit is when the series ends and how much notice it gets, so those two stay
    // editable via the "Entire series" scope below.
    document.getElementById('event-repeats-field').hidden = true;
    editingSeriesId = ev.series_id || null;
    editingSeries = null;
    document.getElementById('event-series-scope-field').hidden = !editingSeriesId;
    document.getElementById('event-repeat-until-field').hidden = true;
    applyRepeatRule();

    eventDialog.showModal();

    if (editingSeriesId) loadSeriesIntoDialog(editingSeriesId);
  }

  // The event row carries only series_id, so the series' own end date and rrule are fetched
  // after the dialog is already open. Guarded on editingSeriesId because the carer may have
  // closed or reopened the dialog before this resolves.
  function loadSeriesIntoDialog(seriesId) {
    var repeatsField = document.getElementById('event-repeats-field');
    dvData.getEventSeries(seriesId).then(function (series) {
      if (editingSeriesId !== seriesId) return;
      editingSeries = series;

      var freq = seriesFreqKey(series.rrule);
      var label = freq ? REPEAT_OPTIONS[freq].label : 'Repeats';
      var staticEl = document.getElementById('event-repeats-static');
      staticEl.textContent = label;
      repeatsField.hidden = false;
      document.getElementById('event-repeats-select-field').hidden = true;
      staticEl.hidden = false;

      document.getElementById('event-repeat-until').value = series.end_date || '';
      applyRepeatRule();
    }, function () {
      // A failed lookup only costs the carer the end-date field; the rest of the dialog is
      // already usable, so this stays silent rather than throwing an alarming error at them.
    });
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

    var untilInput = document.getElementById('event-repeat-until');
    var untilError = document.getElementById('event-repeat-until-error');
    var untilField = document.getElementById('event-repeat-until-field');
    clearFieldError(untilInput, untilError, untilField);
    if (!untilField.hidden && untilInput.value && dateInput.value && untilInput.value < dateInput.value) {
      showFieldError(untilInput, untilError, untilField, 'The repeat end date must be on or after the event date.');
      valid = false;
      firstInvalid = firstInvalid || untilInput;
    }

    if (firstInvalid) firstInvalid.focus();
    return valid;
  }

  // '' (the "use the usual notice" option) means null — resolve from the frequency
  // server-side — which is distinct from 0, "never announce this in advance".
  function selectedNoticeDays() {
    var raw = document.getElementById('event-advance-notice').value;
    return raw === '' ? null : Number(raw);
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
      advance_notice_days: selectedNoticeDays(),
      updated_by_user_id: currentContext.userId
    };

    eventSubmitBtn.disabled = true;
    eventSubmitBtn.textContent = 'Saving…';

    var repeatKey = !editingEventId ? document.getElementById('event-repeats').value : '';
    var repeatOption = REPEAT_OPTIONS[repeatKey] || null;
    var seriesScope = editingSeriesId
      ? (document.getElementById('event-series-scope-series').checked ? 'series' : 'occurrence')
      : null;

    var request;
    if (repeatOption) {
      // dv_event_series' AFTER INSERT trigger (see supabase/migrations/20260817220000_dv_event_series.sql)
      // materializes the actual dv_event occurrence rows synchronously, in the same transaction
      // — by the time this insert resolves, they already exist for the caller's refresh to pick up.
      var seriesPayload = Object.assign({
        event_source_id: 3, // web_dashboard — confirmed seed value, see migration
        created_by_user_id: currentContext.userId,
        rrule: repeatOption.rrule,
        start_date: payload.event_date,
        end_date: document.getElementById('event-repeat-until').value || null
      }, payload);
      delete seriesPayload.event_date;
      request = dvData.createEventSeries(seriesPayload);
    } else if (seriesScope === 'series') {
      var seriesEditPayload = Object.assign({
        end_date: document.getElementById('event-repeat-until').value || null
      }, payload);
      delete seriesEditPayload.event_date; // the series has no single date of its own
      request = dvData.updateEventSeries(editingSeriesId, seriesEditPayload);
    } else if (editingEventId) {
      request = dvData.updateEvent(editingEventId, seriesScope === 'occurrence'
        ? Object.assign({ series_overridden: true }, payload)
        : payload);
    } else {
      request = dvData.createEvent(Object.assign({
        event_source_id: 3, // web_dashboard — confirmed seed value, see migration
        created_by_user_id: currentContext.userId
      }, payload));
    }

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

    // opts.scopeLegend opts this dialog into the "just this one / and all future ones" choice;
    // every other caller (Messages, people, ...) gets the plain two-button dialog unchanged.
    var scopeField = document.getElementById('confirm-dialog-scope-field');
    scopeField.hidden = !opts.scopeLegend;
    document.getElementById('confirm-dialog-scope-one').checked = true;
    if (opts.scopeLegend) {
      document.getElementById('confirm-dialog-scope-legend').textContent = opts.scopeLegend;
    }

    pendingConfirmAction = opts.onConfirm;
    confirmDialog.showModal();
  }

  function selectedConfirmScope() {
    if (document.getElementById('confirm-dialog-scope-field').hidden) return null;
    return document.getElementById('confirm-dialog-scope-future').checked ? 'future' : 'one';
  }

  function handleConfirmClick() {
    if (!pendingConfirmAction) return;
    var action = pendingConfirmAction;
    var scope = selectedConfirmScope();
    confirmBtn.disabled = true;
    confirmCancelBtn.disabled = true;
    action(scope).then(function () {
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
    var repeats = !!ev.series_id;
    openConfirmDialog({
      title: 'Delete this event?',
      message: repeats
        ? '"' + ev.title + '" repeats. Choose how much of it to remove. This cannot be undone.'
        : '"' + ev.title + '" will be permanently removed. This cannot be undone.',
      confirmLabel: 'Delete event',
      scopeLegend: repeats ? 'This event repeats' : null,
      onConfirm: function (scope) {
        // "This one and all future ones" also ends the series itself — otherwise is_active
        // stays true and the weekly top-up job regenerates everything just deleted.
        if (repeats && scope === 'future') {
          return dvData.stopEventSeries(ev.series_id, context.userId, ev.event_date);
        }
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
