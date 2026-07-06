(function () {
  'use strict';

  var dvData = window.dvDashboardData;
  var dvEventDialog = window.dvEventDialog;

  var NETWORK_FAILURE =
    'We could not reach Daily View just now. Please check your connection and try again.';

  var VIEWS = [
    { id: 'day', label: 'Day' },
    { id: 'week', label: 'Week' },
    { id: 'agenda', label: 'Agenda' }
  ];

  var currentAccount = null;
  var currentLookups = null;
  var currentView = null;
  var anchorDate = null; // account-local ISO date (YYYY-MM-DD), the view's reference point

  // ---- date helpers (pure calendar-date arithmetic, UTC-anchored so no
  // local-timezone DST edge cases creep into day-count math) ----

  function accountLocalIsoDate(timezone) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  }

  function toUtcDate(iso) {
    var p = iso.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  }

  function fromUtcDate(d) {
    return d.toISOString().slice(0, 10);
  }

  function addDays(iso, n) {
    var d = toUtcDate(iso);
    d.setUTCDate(d.getUTCDate() + n);
    return fromUtcDate(d);
  }

  function startOfWeek(iso) {
    var d = toUtcDate(iso);
    var day = d.getUTCDay(); // 0 = Sunday .. 6 = Saturday
    var diff = day === 0 ? -6 : 1 - day; // shift back to Monday
    d.setUTCDate(d.getUTCDate() + diff);
    return fromUtcDate(d);
  }

  function formatLabel(iso, opts) {
    return new Intl.DateTimeFormat('en-GB', Object.assign({ timeZone: 'UTC' }, opts)).format(toUtcDate(iso));
  }

  function timeLabel(t) {
    return t ? t.slice(0, 5) : '';
  }

  function humanize(text) {
    if (!text) return '';
    var s = text.replace(/_/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
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

  function rangeForView(view, anchor) {
    if (view === 'day') return { start: anchor, end: anchor };
    if (view === 'week') {
      var start = startOfWeek(anchor);
      return { start: start, end: addDays(start, 6) };
    }
    return { start: anchor, end: addDays(anchor, 13) }; // agenda: 14-day rolling window
  }

  function stepDaysForView(view) {
    return view === 'day' ? 1 : view === 'week' ? 7 : 14;
  }

  function rangeLabel(view, range) {
    if (view === 'day') return formatLabel(range.start, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    var sameMonth = range.start.slice(0, 7) === range.end.slice(0, 7);
    var startLabel = formatLabel(range.start, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'long' });
    var endLabel = formatLabel(range.end, { day: 'numeric', month: 'long', year: 'numeric' });
    return startLabel + ' – ' + endLabel;
  }

  // ---- shared event presentation ----

  function eventBadges(ev) {
    var badges = el('div', 'schedule-event-badges');
    badges.appendChild(el('span', 'badge', humanize(ev.dv_event_type.event_type)));
    if (ev.dv_event_status.event_status !== 'scheduled') {
      badges.appendChild(el('span', 'badge', humanize(ev.dv_event_status.event_status)));
    }
    if (ev.dv_event_visibility.event_visibility !== 'display') {
      badges.appendChild(el('span', 'badge', humanize(ev.dv_event_visibility.event_visibility)));
    } else if (!ev.show_on_display) {
      badges.appendChild(el('span', 'badge', 'Hidden from display'));
    }
    if (ev.dv_event_accuracy.event_accuracy !== 'confirmed') {
      badges.appendChild(el('span', 'badge', humanize(ev.dv_event_accuracy.event_accuracy)));
    }
    if (ev.dv_event_source && ev.dv_event_source.event_source !== 'web_dashboard') {
      badges.appendChild(el('span', 'badge', humanize(ev.dv_event_source.event_source)));
    }
    return badges;
  }

  function buildEventRow(ev, canManage, onChanged) {
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
        dvEventDialog.openEdit(ev, context(), currentLookups, onChanged);
      });
      actions.appendChild(editBtn);

      if (ev.dv_event_status.event_status !== 'cancelled') {
        var cancelBtn = el('button', 'btn-outline', 'Cancel');
        cancelBtn.type = 'button';
        cancelBtn.addEventListener('click', function () {
          dvEventDialog.openCancelConfirm(ev, context(), onChanged);
        });
        actions.appendChild(cancelBtn);
      }

      var deleteBtn = el('button', 'btn-outline schedule-delete-btn', 'Delete');
      deleteBtn.type = 'button';
      deleteBtn.addEventListener('click', function () {
        dvEventDialog.openDeleteConfirm(ev, context(), onChanged);
      });
      actions.appendChild(deleteBtn);

      li.appendChild(actions);
    }

    return li;
  }

  // ---- view bodies ----

  function buildAgendaBody(events, canManage, showDateHeadings, onChanged) {
    var wrap = el('div', 'calendar-agenda');

    if (events.length === 0) {
      wrap.appendChild(el('p', 'schedule-empty', 'No events are scheduled for this period.'));
      return wrap;
    }

    var currentDate = null;
    var list = null;
    events.forEach(function (ev) {
      if (showDateHeadings && ev.event_date !== currentDate) {
        currentDate = ev.event_date;
        wrap.appendChild(el('h4', 'calendar-agenda-date', formatLabel(currentDate, { weekday: 'long', day: 'numeric', month: 'long' })));
        list = el('ul', 'schedule-list');
        wrap.appendChild(list);
      } else if (!list) {
        list = el('ul', 'schedule-list');
        wrap.appendChild(list);
      }
      list.appendChild(buildEventRow(ev, canManage, onChanged));
    });

    return wrap;
  }

  function buildWeekBody(events, range, canManage, onChanged) {
    var grid = el('div', 'calendar-week-grid');

    var byDate = {};
    events.forEach(function (ev) {
      (byDate[ev.event_date] = byDate[ev.event_date] || []).push(ev);
    });

    var cursor = range.start;
    var todayIso = accountLocalIsoDate(currentAccount.timezone);
    while (cursor <= range.end) {
      var iso = cursor;
      var day = el('div', 'calendar-week-day' + (iso === todayIso ? ' calendar-week-day--today' : ''));
      day.appendChild(el('div', 'calendar-week-day-header', formatLabel(iso, { weekday: 'short', day: 'numeric' })));

      var dayEvents = byDate[iso] || [];
      if (dayEvents.length === 0) {
        day.appendChild(el('p', 'calendar-week-empty', 'No events'));
      } else {
        var list = el('ul', 'calendar-week-events');
        dayEvents.forEach(function (ev) {
          var li = el('li');
          var chip = el('button', 'calendar-week-chip', (ev.start_time ? timeLabel(ev.start_time) + ' ' : '') + ev.title);
          chip.type = 'button';
          chip.addEventListener('click', function () {
            if (canManage) {
              dvEventDialog.openEdit(ev, context(), currentLookups, onChanged);
            }
          });
          li.appendChild(chip);
          list.appendChild(li);
        });
        day.appendChild(list);
      }

      grid.appendChild(day);
      cursor = addDays(cursor, 1);
    }

    return grid;
  }

  // ---- toolbar ----

  function buildToolbar(range, canManage) {
    var toolbar = el('div', 'calendar-toolbar');

    var viewGroup = el('div', 'view-toggle');
    viewGroup.setAttribute('role', 'group');
    viewGroup.setAttribute('aria-label', 'Calendar view');
    VIEWS.forEach(function (v) {
      var btn = el('button', 'view-toggle-btn', v.label);
      btn.type = 'button';
      btn.setAttribute('aria-pressed', v.id === currentView ? 'true' : 'false');
      btn.addEventListener('click', function () {
        currentView = v.id;
        refresh();
      });
      viewGroup.appendChild(btn);
    });

    var navGroup = el('div', 'calendar-nav');
    var prevBtn = el('button', 'btn-outline calendar-nav-btn', '‹');
    prevBtn.type = 'button';
    prevBtn.setAttribute('aria-label', 'Previous');
    prevBtn.addEventListener('click', function () {
      anchorDate = addDays(anchorDate, -stepDaysForView(currentView));
      refresh();
    });
    var todayBtn = el('button', 'btn-outline calendar-nav-btn', 'Today');
    todayBtn.type = 'button';
    todayBtn.addEventListener('click', function () {
      anchorDate = accountLocalIsoDate(currentAccount.timezone);
      refresh();
    });
    var nextBtn = el('button', 'btn-outline calendar-nav-btn', '›');
    nextBtn.type = 'button';
    nextBtn.setAttribute('aria-label', 'Next');
    nextBtn.addEventListener('click', function () {
      anchorDate = addDays(anchorDate, stepDaysForView(currentView));
      refresh();
    });
    navGroup.appendChild(prevBtn);
    navGroup.appendChild(todayBtn);
    navGroup.appendChild(nextBtn);

    var headerRow = el('div', 'calendar-toolbar-row');
    headerRow.appendChild(viewGroup);
    if (canManage) {
      var addBtn = el('button', 'btn', 'Add event');
      addBtn.type = 'button';
      addBtn.addEventListener('click', function () {
        dvEventDialog.openAdd(context(), currentLookups, anchorDate, refresh);
      });
      headerRow.appendChild(addBtn);
    }

    var rangeRow = el('div', 'calendar-toolbar-row');
    rangeRow.appendChild(el('h3', 'calendar-range-label', rangeLabel(currentView, range)));
    rangeRow.appendChild(navGroup);

    toolbar.appendChild(headerRow);
    toolbar.appendChild(rangeRow);
    return toolbar;
  }

  // ---- load / render ----

  function renderBody(bodyEl, range, events, canManage) {
    bodyEl.textContent = '';
    bodyEl.appendChild(buildToolbar(range, canManage));

    var section = el('section', 'calendar-view-section');
    if (currentView === 'week') {
      section.appendChild(buildWeekBody(events, range, canManage, refresh));
    } else {
      section.appendChild(buildAgendaBody(events, canManage, currentView === 'agenda', refresh));
    }
    bodyEl.appendChild(section);
  }

  function refresh() {
    var contentEl = document.getElementById('dashboard-content');
    var bodyEl = contentEl.querySelector('.calendar-body');
    var statusEl = contentEl.querySelector('.calendar-status');
    if (!bodyEl || !statusEl) return;

    statusEl.textContent = 'Loading…';
    statusEl.removeAttribute('data-tone');

    var range = rangeForView(currentView, anchorDate);
    Promise.all([
      dvData.listEventsInRange(currentAccount.account_id, range.start, range.end),
      dvData.listEventLookups()
    ]).then(function (results) {
      statusEl.textContent = '';
      currentLookups = results[1];
      renderBody(bodyEl, range, results[0], !!currentAccount.can_manage_events);
    }, function () {
      statusEl.textContent = NETWORK_FAILURE;
      statusEl.setAttribute('data-tone', 'error');
    });
  }

  function render(contentEl, account) {
    currentAccount = account;
    anchorDate = accountLocalIsoDate(account.timezone);
    currentView = window.innerWidth < 860 ? 'agenda' : 'week';

    contentEl.textContent = '';
    contentEl.appendChild(el('h2', null, 'Calendar'));

    var statusEl = el('p', 'calendar-status today-status');
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.textContent = 'Loading…';
    contentEl.appendChild(statusEl);

    var bodyEl = el('div', 'calendar-body');
    contentEl.appendChild(bodyEl);

    refresh();
  }

  window.dvCalendar = { render: render };
})();
