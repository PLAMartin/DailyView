(function () {
  'use strict';

  var dvData = window.dvDashboardData;

  var NETWORK_FAILURE =
    'We could not reach Daily View just now. Please check your connection and try again.';

  var FONT_SIZES = ['standard', 'large', 'extra_large'];
  var CONTRASTS = ['standard', 'high'];
  var LAYOUTS = ['standard', 'simplified'];
  var TIME_FORMATS = ['12_hour', '24_hour'];

  var currentAccount = null;
  var currentPref = null;

  function el(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  function humanize(text) {
    if (!text) return '';
    var s = text.replace(/_/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function timeValue(t) {
    return t ? t.slice(0, 5) : '';
  }

  function setMessage(messageEl, text, tone) {
    messageEl.textContent = text;
    if (tone) messageEl.setAttribute('data-tone', tone);
    else messageEl.removeAttribute('data-tone');
  }

  function field(labelText, inputEl) {
    var wrap = el('div', 'field');
    var label = el('label', null, labelText);
    var inputId = 'settings-' + labelText.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    label.setAttribute('for', inputId);
    inputEl.id = inputId;
    wrap.appendChild(label);
    wrap.appendChild(inputEl);
    return wrap;
  }

  function checkboxField(labelText, checked) {
    var wrap = el('div', 'field field-checkbox');
    var label = el('label');
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!checked;
    label.appendChild(input);
    label.appendChild(document.createTextNode(' ' + labelText));
    wrap.appendChild(label);
    wrap._input = input;
    return wrap;
  }

  function selectField(labelText, options, currentValue) {
    var select = document.createElement('select');
    options.forEach(function (opt) {
      var optionEl = document.createElement('option');
      optionEl.value = opt;
      optionEl.textContent = humanize(opt);
      if (opt === currentValue) optionEl.selected = true;
      select.appendChild(optionEl);
    });
    var wrap = field(labelText, select);
    wrap._select = select;
    return wrap;
  }

  // ---- Account settings section ----

  function buildAccountSection(account, canEditAccount) {
    var section = el('section', 'settings-section');
    section.appendChild(el('h3', null, 'Account settings'));

    if (!canEditAccount) {
      section.appendChild(el('p', 'schedule-readonly-note', 'Only the account owner can change these settings.'));
    }

    var form = el('form', 'settings-form');
    form.setAttribute('novalidate', '');

    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = 100;
    nameInput.value = account.account_name;
    nameInput.disabled = !canEditAccount;
    var nameField = field('Account name', nameInput);
    form.appendChild(nameField);

    var tzWrap = el('div', 'field');
    tzWrap.appendChild(el('label', null, 'Timezone'));
    tzWrap.appendChild(el('p', 'settings-static-value', account.timezone));
    form.appendChild(tzWrap);

    var maxEventsInput = document.createElement('input');
    maxEventsInput.type = 'number';
    maxEventsInput.min = '1';
    maxEventsInput.max = '20';
    maxEventsInput.value = String(account.max_events_shown || 3);
    maxEventsInput.disabled = !canEditAccount;
    form.appendChild(field('Events shown on display', maxEventsInput));

    var timeRow = el('div', 'field-row');
    var morningInput = document.createElement('input');
    morningInput.type = 'time';
    morningInput.value = timeValue(account.morning_start_time);
    morningInput.disabled = !canEditAccount;
    timeRow.appendChild(field('Morning starts', morningInput));

    var afternoonInput = document.createElement('input');
    afternoonInput.type = 'time';
    afternoonInput.value = timeValue(account.afternoon_start_time);
    afternoonInput.disabled = !canEditAccount;
    timeRow.appendChild(field('Afternoon starts', afternoonInput));

    var eveningInput = document.createElement('input');
    eveningInput.type = 'time';
    eveningInput.value = timeValue(account.evening_start_time);
    eveningInput.disabled = !canEditAccount;
    timeRow.appendChild(field('Evening starts', eveningInput));

    var nightInput = document.createElement('input');
    nightInput.type = 'time';
    nightInput.value = timeValue(account.night_start_time);
    nightInput.disabled = !canEditAccount;
    timeRow.appendChild(field('Night starts', nightInput));
    form.appendChild(timeRow);

    var showDayPeriod = checkboxField('Show time-of-day icon on the display', account.show_day_period !== false);
    showDayPeriod._input.disabled = !canEditAccount;
    form.appendChild(showDayPeriod);

    var showNextReminder = checkboxField('Show the "next" reminder card on the display', account.show_next_reminder !== false);
    showNextReminder._input.disabled = !canEditAccount;
    form.appendChild(showNextReminder);

    var autoReset = checkboxField('Automatically reset to today each morning', account.auto_reset_to_today !== false);
    autoReset._input.disabled = !canEditAccount;
    form.appendChild(autoReset);

    var messageEl = el('p', 'auth-message');
    messageEl.setAttribute('role', 'status');
    messageEl.setAttribute('aria-live', 'polite');
    form.appendChild(messageEl);

    if (canEditAccount) {
      var submitBtn = el('button', 'btn', 'Save account settings');
      submitBtn.type = 'submit';
      form.appendChild(submitBtn);

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        setMessage(messageEl, '', null);
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving…';

        var patch = {
          account_name: nameInput.value.trim(),
          max_events_shown: Number(maxEventsInput.value) || 3,
          morning_start_time: morningInput.value || null,
          afternoon_start_time: afternoonInput.value || null,
          evening_start_time: eveningInput.value || null,
          night_start_time: nightInput.value || null,
          show_day_period: showDayPeriod._input.checked,
          show_next_reminder: showNextReminder._input.checked,
          auto_reset_to_today: autoReset._input.checked
        };

        dvData.updateAccountSettings(currentAccount.account_id, patch).then(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Save account settings';
          setMessage(messageEl, 'Account settings saved.', 'info');
        }, function () {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Save account settings';
          setMessage(messageEl, NETWORK_FAILURE, 'error');
        });
      });
    }

    section.appendChild(form);
    return section;
  }

  // ---- Display settings section ----

  function buildDisplaySection(pref, canEditDisplay) {
    var section = el('section', 'settings-section');
    section.appendChild(el('h3', null, 'Display settings'));

    if (!canEditDisplay) {
      section.appendChild(el('p', 'schedule-readonly-note', 'Only an owner or device manager can change these settings.'));
    }

    var form = el('form', 'settings-form');
    form.setAttribute('novalidate', '');

    var row = el('div', 'field-row');
    var fontSizeField = selectField('Font size', FONT_SIZES, pref.font_size || 'standard');
    fontSizeField._select.disabled = !canEditDisplay;
    row.appendChild(fontSizeField);

    var contrastField = selectField('Contrast', CONTRASTS, pref.contrast || 'standard');
    contrastField._select.disabled = !canEditDisplay;
    row.appendChild(contrastField);

    var layoutField = selectField('Layout', LAYOUTS, pref.layout || 'standard');
    layoutField._select.disabled = !canEditDisplay;
    row.appendChild(layoutField);

    var timeFormatField = selectField('Time format', TIME_FORMATS, pref.time_format || '12_hour');
    timeFormatField._select.disabled = !canEditDisplay;
    row.appendChild(timeFormatField);
    form.appendChild(row);

    var showPast = checkboxField('Show past events on the display', pref.show_past_events !== false);
    showPast._input.disabled = !canEditDisplay;
    form.appendChild(showPast);

    var greyOut = checkboxField('Grey out past events', pref.grey_out_past_events !== false);
    greyOut._input.disabled = !canEditDisplay;
    form.appendChild(greyOut);

    var messageEl = el('p', 'auth-message');
    messageEl.setAttribute('role', 'status');
    messageEl.setAttribute('aria-live', 'polite');
    form.appendChild(messageEl);

    if (canEditDisplay) {
      var submitBtn = el('button', 'btn', 'Save display settings');
      submitBtn.type = 'submit';
      form.appendChild(submitBtn);

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        setMessage(messageEl, '', null);
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving…';

        var patch = {
          font_size: fontSizeField._select.value,
          contrast: contrastField._select.value,
          layout: layoutField._select.value,
          time_format: timeFormatField._select.value,
          show_past_events: showPast._input.checked,
          grey_out_past_events: greyOut._input.checked
        };

        dvData.updateDisplayPreference(currentPref.display_pref_id, patch).then(function (updated) {
          currentPref = updated;
          submitBtn.disabled = false;
          submitBtn.textContent = 'Save display settings';
          setMessage(messageEl, 'Display settings saved.', 'info');
        }, function () {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Save display settings';
          setMessage(messageEl, NETWORK_FAILURE, 'error');
        });
      });
    }

    section.appendChild(form);
    return section;
  }

  // ---- Subscription section (placeholder — no payment handling, spec 17.5) ----

  function buildSubscriptionSection(account) {
    var section = el('section', 'settings-section');
    section.appendChild(el('h3', null, 'Subscription'));
    section.appendChild(el('p', null, 'Your subscription is managed by Daily View support.'));
    if (account.subscription_status) {
      section.appendChild(el('p', 'settings-static-value', 'Status: ' + humanize(account.subscription_status)));
    }
    return section;
  }

  function renderBody(bodyEl, account, pref, role, canManageDevices) {
    bodyEl.textContent = '';
    bodyEl.appendChild(buildAccountSection(account, role === 'owner'));
    bodyEl.appendChild(buildDisplaySection(pref, !!canManageDevices));
    bodyEl.appendChild(buildSubscriptionSection(account));
  }

  function refresh() {
    var contentEl = document.getElementById('dashboard-content');
    var bodyEl = contentEl.querySelector('.settings-body');
    var statusEl = contentEl.querySelector('.settings-status');
    if (!bodyEl || !statusEl) return;

    statusEl.textContent = 'Loading…';
    statusEl.removeAttribute('data-tone');

    Promise.all([
      dvData.getAccountSettings(currentAccount.account_id),
      dvData.getOrCreateDisplayPreference(currentAccount.account_id)
    ]).then(function (results) {
      statusEl.textContent = '';
      currentPref = results[1];
      renderBody(bodyEl, results[0], results[1], currentAccount.role, currentAccount.can_manage_devices);
    }, function () {
      statusEl.textContent = NETWORK_FAILURE;
      statusEl.setAttribute('data-tone', 'error');
    });
  }

  function render(contentEl, account) {
    currentAccount = account;

    contentEl.textContent = '';
    contentEl.appendChild(el('h2', null, 'Settings'));

    var statusEl = el('p', 'settings-status today-status');
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.textContent = 'Loading…';
    contentEl.appendChild(statusEl);

    var bodyEl = el('div', 'settings-body');
    contentEl.appendChild(bodyEl);

    refresh();
  }

  window.dvSettings = { render: render };
})();
