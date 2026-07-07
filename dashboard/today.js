(function () {
  'use strict';

  var dvData = window.dvDashboardData;
  var dvEventDialog = window.dvEventDialog;
  var dvViewerRender = window.dvViewerRender;

  var NETWORK_FAILURE =
    'We could not reach Daily View just now. Please check your connection and try again.';

  var currentAccount = null;
  var currentLookups = null;

  // ---- small helpers ----

  function accountLocalIsoDate(timezone) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
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

  function isMessageActive(m) {
    var now = new Date();
    if (!m.is_active) return false;
    if (m.start_at && new Date(m.start_at) > now) return false;
    if (m.end_at && new Date(m.end_at) < now) return false;
    return true;
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

  function context() {
    return { accountId: currentAccount.account_id, timezone: currentAccount.timezone, userId: currentAccount.user_id };
  }

  // ---- rendering ----

  function buildHeader() {
    var header = el('div', 'today-header');
    header.appendChild(el('h2', null, 'Today'));
    return header;
  }

  function buildPreview(viewModel) {
    var wrap = el('div', 'dv-device-frame');
    var article = dvViewerRender.buildMockup(viewModel, currentAccount.timezone, {
      ariaLabel: 'Live Daily View preview'
    });
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
      addBtn.addEventListener('click', function () {
        dvEventDialog.openAdd(context(), currentLookups, null, refresh);
      });
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
        editBtn.addEventListener('click', function () {
          dvEventDialog.openEdit(ev, context(), currentLookups, refresh);
        });
        actions.appendChild(editBtn);

        if (ev.dv_event_status.event_status !== 'cancelled') {
          var cancelBtn = el('button', 'btn-outline', 'Cancel');
          cancelBtn.type = 'button';
          cancelBtn.addEventListener('click', function () {
            dvEventDialog.openCancelConfirm(ev, context(), refresh);
          });
          actions.appendChild(cancelBtn);
        }

        var deleteBtn = el('button', 'btn-outline schedule-delete-btn', 'Delete');
        deleteBtn.type = 'button';
        deleteBtn.addEventListener('click', function () {
          dvEventDialog.openDeleteConfirm(ev, context(), refresh);
        });
        actions.appendChild(deleteBtn);

        li.appendChild(actions);
      }

      list.appendChild(li);
    });
    section.appendChild(list);
    return section;
  }

  function buildMessagesSection(messages, canManage) {
    var section = el('section', 'schedule-section');

    var headerRow = el('div', 'schedule-section-header');
    headerRow.appendChild(el('h3', null, 'Active messages'));
    if (canManage) {
      var sendBtn = el('button', 'btn-outline', 'Send message');
      sendBtn.type = 'button';
      sendBtn.addEventListener('click', function () { window.location.hash = '#messages'; });
      headerRow.appendChild(sendBtn);
    }
    section.appendChild(headerRow);

    if (messages.length === 0) {
      section.appendChild(el('p', 'schedule-empty', 'No messages are currently showing on the display.'));
      return section;
    }

    var list = el('ul', 'schedule-list');
    messages.forEach(function (m) {
      var li = el('li', 'schedule-row schedule-row--message');
      var mainCol = el('div', 'schedule-row-main');
      mainCol.appendChild(el('div', 'schedule-row-title', m.message));
      li.appendChild(mainCol);
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

  function renderBody(bodyEl, viewModel, events, devices, messages) {
    bodyEl.textContent = '';

    var top = el('div', 'today-top-row');
    top.appendChild(buildPreview(viewModel));
    top.appendChild(buildDeviceSection(devices));
    bodyEl.appendChild(top);

    var canManage = !!currentAccount.can_manage_events;
    bodyEl.appendChild(buildScheduleSection(events, canManage));
    bodyEl.appendChild(buildMessagesSection(messages.filter(isMessageActive), canManage));
  }

  function loadAndRenderBody(bodyEl, statusEl, account, isoDate) {
    Promise.all([
      dvData.getTodayViewModel(account.account_id),
      dvData.listTodayEvents(account.account_id, isoDate),
      dvData.listDevices(account.account_id),
      dvData.listEventLookups(),
      dvData.listMessages(account.account_id)
    ]).then(function (results) {
      statusEl.textContent = '';
      statusEl.removeAttribute('data-tone');
      currentLookups = results[3];
      renderBody(bodyEl, results[0], results[1], results[2], results[4]);
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

  function render(contentEl, account) {
    currentAccount = account;

    contentEl.textContent = '';
    contentEl.appendChild(buildHeader());

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
