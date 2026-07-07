(function () {
  'use strict';

  // ── Seed data ──────────────────────────────────────────────────────────
  // Edit only this object to change what the demo scenarios show.
  var DEMO_SCENARIOS = {
    family: {
      label: 'Family home',
      day: 'THURSDAY',
      date: '11 JUNE 2026',
      time: '14:05',
      period: 'Afternoon',
      editableEventId: 'carer-visit',
      events: [
        { id: 'lunch', title: 'Lunch with Tim', time: '12:00' },
        { id: 'carer-visit', title: 'Carer visit', time: '16:00' },
        { id: 'clare', title: 'Clare visiting', time: '17:00' }
      ]
    },
    careHome: {
      label: 'Care home resident',
      day: 'THURSDAY',
      date: '11 JUNE 2026',
      time: '10:30',
      period: 'Morning',
      editableEventId: 'family-call',
      events: [
        { id: 'breakfast', title: 'Breakfast', time: '08:30' },
        { id: 'exercise', title: 'Exercise class', time: '11:00' },
        { id: 'family-call', title: 'Family call', time: '15:30' }
      ]
    },
    supportedLiving: {
      label: 'Supported living',
      day: 'THURSDAY',
      date: '11 JUNE 2026',
      time: '15:15',
      period: 'Afternoon',
      editableEventId: 'support-visit',
      events: [
        { id: 'medication', title: 'Medication reminder', time: '09:00' },
        { id: 'support-visit', title: 'Support visit', time: '16:00' },
        { id: 'meal', title: 'Evening meal', time: '18:00' }
      ]
    }
  };

  // Night is intentionally not included in v1 (per spec).
  var PERIOD_TIMES = { MORNING: '10:30', AFTERNOON: '14:05', EVENING: '18:15' };
  var PERIOD_LABELS = { MORNING: 'Morning', AFTERNOON: 'Afternoon', EVENING: 'Evening' };
  var periodIcons = {
    MORNING: '../assets/icon/logo_icon_v5.png',
    AFTERNOON: '../assets/icon/afternoon%20icon%20v1.svg',
    EVENING: '../assets/icon/evening_icon_v2.svg'
  };

  // Fixed, hardcoded icon markup only — never interpolate visitor input into these strings.
  function svg(inner) {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }

  // Fallback event marker, used when no keyword below matches the title.
  var EVENT_ICON_SVG = svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>');

  // Demo event titles are free text (the visitor can edit one), so — same as
  // the real viewer (assets/js/dv-viewer-render.js) — the icon is picked by
  // matching keywords in the title rather than a stored category. First
  // matching category wins; order matters (e.g. "hair" before "home" so
  // "hairdresser" doesn't fall through to a house icon via some other word).
  var EVENT_CATEGORIES = [
    {
      className: 'dvm-event-icon--medical',
      keywords: ['doctor', 'dentist', 'appointment', 'clinic', 'hospital', 'nurse',
        'medicine', 'medication', 'pills', 'checkup', 'check-up', 'physio', 'therapy',
        'vaccine', 'blood test', 'surgery', 'gp'],
      svg: svg('<path d="M12 5v14M5 12h14"/>')
    },
    {
      className: 'dvm-event-icon--hair',
      keywords: ['hair', 'haircut', 'hairdresser', 'salon', 'barber'],
      svg: svg('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>' +
        '<line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/>' +
        '<line x1="8.12" y1="8.12" x2="12" y2="12"/>')
    },
    {
      className: 'dvm-event-icon--meal',
      keywords: ['breakfast', 'lunch', 'dinner', 'meal', 'coffee', 'tea', 'snack'],
      svg: svg('<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>' +
        '<line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>')
    },
    {
      className: 'dvm-event-icon--home',
      keywords: ['clean', 'cleaning', 'laundry', 'shopping', 'groceries', 'grocery',
        'bins', 'garden', 'housework'],
      svg: svg('<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>')
    },
    {
      className: 'dvm-event-icon--people',
      keywords: ['visit', 'visiting', 'family', 'friend', 'call', 'chat'],
      svg: svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>' +
        '<path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>')
    }
  ];

  function pickEventIcon(title) {
    var t = (title || '').toLowerCase();
    for (var i = 0; i < EVENT_CATEGORIES.length; i++) {
      var cat = EVENT_CATEGORIES[i];
      for (var j = 0; j < cat.keywords.length; j++) {
        if (t.indexOf(cat.keywords[j]) !== -1) return cat;
      }
    }
    return null;
  }

  var state = {
    scenarioKey: null,
    scenario: null,
    period: null,
    currentTime: null,
    selectedEventId: null,
    hasRevealedAfterUpdate: false
  };

  // ── Pure helpers ──────────────────────────────────────────────────────
  function timeToMinutes(timeString) {
    var parts = timeString.split(':').map(Number);
    return (parts[0] * 60) + parts[1];
  }

  function sortEvents(events) {
    return events.slice().sort(function (a, b) {
      return timeToMinutes(a.time) - timeToMinutes(b.time);
    });
  }

  function computeNext(events, currentTime) {
    var sorted = sortEvents(events);
    var nowMin = timeToMinutes(currentTime);
    for (var i = 0; i < sorted.length; i++) {
      if (timeToMinutes(sorted[i].time) >= nowMin) return sorted[i];
    }
    return null;
  }

  function cloneScenario(key) {
    var seed = DEMO_SCENARIOS[key];
    return typeof structuredClone === 'function'
      ? structuredClone(seed)
      : JSON.parse(JSON.stringify(seed));
  }

  function findEvent(id) {
    return state.scenario.events.filter(function (ev) { return ev.id === id; })[0] || null;
  }

  // ── State transitions ────────────────────────────────────────────────
  function loadScenario(key) {
    var scenario = cloneScenario(key);
    state.scenarioKey = key;
    state.scenario = scenario;
    state.period = scenario.period.toUpperCase();
    state.currentTime = scenario.time;
    state.selectedEventId = scenario.editableEventId;
    state.hasRevealedAfterUpdate = false;
  }

  // ── Rendering ─────────────────────────────────────────────────────────
  function buildEventRow(ev, isPast) {
    var li = document.createElement('li');
    li.className = 'dvm-event' + (isPast ? ' dvm-event--past' : '');
    li.dataset.eventId = ev.id;

    var cat = pickEventIcon(ev.title);
    var iconSpan = document.createElement('span');
    iconSpan.className = 'dvm-event-icon' + (cat ? ' ' + cat.className : '');
    iconSpan.innerHTML = cat ? cat.svg : EVENT_ICON_SVG;

    var nameSpan = document.createElement('span');
    nameSpan.className = 'dvm-event-name';
    nameSpan.textContent = ev.title;

    var timeSpan = document.createElement('span');
    timeSpan.className = 'dvm-event-time';
    timeSpan.textContent = ev.time;

    li.appendChild(iconSpan);
    li.appendChild(nameSpan);
    li.appendChild(timeSpan);
    return li;
  }

  function flashHighlight(el) {
    el.classList.add('dv-updated');
    window.setTimeout(function () { el.classList.remove('dv-updated'); }, 700);
  }

  function renderViewer(options) {
    options = options || {};
    var mockup = document.getElementById('dv-mockup-demo');
    var scenario = state.scenario;
    var sorted = sortEvents(scenario.events);
    var nowMin = timeToMinutes(state.currentTime);

    mockup.querySelector('.dvm-day').textContent = scenario.day;
    mockup.querySelector('.dvm-date').textContent = scenario.date;
    mockup.querySelector('.dvm-time').textContent = state.currentTime;
    mockup.querySelector('.dvm-period').textContent = PERIOD_LABELS[state.period];

    var todEl = mockup.querySelector('.dvm-tod-icon');
    todEl.innerHTML = '';
    var img = document.createElement('img');
    img.src = periodIcons[state.period];
    img.alt = '';
    todEl.appendChild(img);

    var list = mockup.querySelector('.dvm-events');
    list.innerHTML = '';
    sorted.forEach(function (ev) {
      var isPast = timeToMinutes(ev.time) < nowMin;
      list.appendChild(buildEventRow(ev, isPast));
    });

    var next = computeNext(scenario.events, state.currentTime);
    var nextItemEl = mockup.querySelector('.dvm-next-item');
    var nextTimeEl = mockup.querySelector('.dvm-next-time');
    var nextCard = mockup.querySelector('.dvm-next-card');
    if (next) {
      nextItemEl.textContent = next.title;
      nextTimeEl.textContent = 'at ' + next.time;
    } else {
      nextItemEl.textContent = 'Nothing else planned today';
      nextTimeEl.textContent = '';
    }

    if (options.highlightEventId) {
      var row = list.querySelector('[data-event-id="' + options.highlightEventId + '"]');
      if (row) flashHighlight(row);
      if (next && next.id === options.highlightEventId) flashHighlight(nextCard);
    }
  }

  function populateEventSelect() {
    var select = document.getElementById('event-select');
    select.innerHTML = '';
    sortEvents(state.scenario.events).forEach(function (ev) {
      var opt = document.createElement('option');
      opt.value = ev.id;
      opt.textContent = ev.title + ' · ' + ev.time;
      select.appendChild(opt);
    });
    select.value = state.selectedEventId;
  }

  function populateEditorFromEvent(eventId) {
    var ev = findEvent(eventId);
    if (!ev) return;
    document.getElementById('event-time').value = ev.time;
    document.getElementById('event-title').value = ev.title;
    clearValidationError();
  }

  function renderEditor() {
    populateEventSelect();
    populateEditorFromEvent(state.selectedEventId);
  }

  function renderAll(options) {
    renderViewer(options);
    renderEditor();
  }

  function updateScenarioContext() {
    document.getElementById('scenario-context').textContent =
      'You are exploring the ' + state.scenario.label + ' example.';
  }

  function setScenarioButtonsState() {
    document.querySelectorAll('.scenario-card').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.dataset.scenario === state.scenarioKey));
    });
  }

  function setPeriodButtonsState() {
    document.querySelectorAll('.period-btn').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.dataset.period === state.period));
    });
  }

  function announce(message) {
    var el = document.getElementById('demo-status');
    el.textContent = '';
    window.setTimeout(function () { el.textContent = message; }, 50);
  }

  function showValidationError(message) {
    var field = document.getElementById('event-time-field');
    var errorEl = document.getElementById('event-time-error');
    var input = document.getElementById('event-time');
    field.setAttribute('data-invalid', 'true');
    errorEl.textContent = message;
    errorEl.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', 'event-time-error');
    input.focus();
  }

  function clearValidationError() {
    var field = document.getElementById('event-time-field');
    var errorEl = document.getElementById('event-time-error');
    var input = document.getElementById('event-time');
    field.removeAttribute('data-invalid');
    errorEl.textContent = '';
    errorEl.hidden = true;
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
  }

  // ── Event handlers ────────────────────────────────────────────────────
  function handleFormSubmit(e) {
    e.preventDefault();
    var timeValue = document.getElementById('event-time').value;
    var titleValue = document.getElementById('event-title').value.trim();

    if (!timeValue) {
      showValidationError('Enter a time.');
      return;
    }
    clearValidationError();

    var ev = findEvent(state.selectedEventId);
    if (!ev) return;
    ev.time = timeValue;
    if (titleValue) ev.title = titleValue;

    renderViewer({ highlightEventId: ev.id });
    populateEventSelect();
    document.getElementById('event-title').value = ev.title;

    announce('Display updated. ' + ev.title + ' is now at ' + ev.time + '.');

    if (!state.hasRevealedAfterUpdate) {
      var section = document.getElementById('demo-after-update');
      section.hidden = false;
      state.hasRevealedAfterUpdate = true;
      document.getElementById('after-update-title').focus();
    }
  }

  function handleEventSelectChange() {
    state.selectedEventId = document.getElementById('event-select').value;
    populateEditorFromEvent(state.selectedEventId);
  }

  function handleScenarioChange(key) {
    loadScenario(key);
    setScenarioButtonsState();
    setPeriodButtonsState();
    renderAll();
    document.getElementById('demo-after-update').hidden = true;
    updateScenarioContext();
    announce('Now showing the ' + state.scenario.label + ' example.');
  }

  function handlePeriodChange(period) {
    state.period = period;
    state.currentTime = PERIOD_TIMES[period];
    setPeriodButtonsState();
    renderViewer();
    announce('Now viewing ' + PERIOD_LABELS[period] + ', ' + state.currentTime + '.');
  }

  function handleReset() {
    loadScenario(state.scenarioKey);
    setPeriodButtonsState();
    renderAll();
    document.getElementById('demo-after-update').hidden = true;
    updateScenarioContext();
    announce('Example reset.');
  }

  function handleTryAnotherExample(e) {
    e.preventDefault();
    var workspace = document.getElementById('demo-workspace');
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    workspace.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    var activeBtn = document.querySelector('.scenario-card[aria-pressed="true"]') ||
      document.querySelector('.scenario-card');
    if (activeBtn) activeBtn.focus();
  }

  // ── Mobile nav toggle (same pattern as the homepage) ─────────────────
  function initMobileNav() {
    var navToggle = document.getElementById('nav-toggle');
    var siteNav = document.getElementById('site-nav');

    function closeNav() {
      siteNav.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.setAttribute('aria-label', 'Open menu');
    }

    navToggle.addEventListener('click', function () {
      var isOpen = siteNav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
      navToggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
    });

    document.addEventListener('click', function (e) {
      if (!siteNav.classList.contains('is-open')) return;
      if (siteNav.contains(e.target) || navToggle.contains(e.target)) return;
      closeNav();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeNav();
    });
  }

  // ── Init ───────────────────────────────────────────────────────────────
  function init() {
    document.getElementById('copyright-year').textContent = new Date().getFullYear();

    document.querySelectorAll('.scenario-card').forEach(function (btn) {
      btn.addEventListener('click', function () { handleScenarioChange(btn.dataset.scenario); });
    });
    document.querySelectorAll('.period-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { handlePeriodChange(btn.dataset.period); });
    });
    document.getElementById('event-select').addEventListener('change', handleEventSelectChange);
    document.getElementById('demo-event-form').addEventListener('submit', handleFormSubmit);
    document.getElementById('reset-demo').addEventListener('click', handleReset);
    document.getElementById('try-another-link').addEventListener('click', handleTryAnotherExample);

    initMobileNav();

    loadScenario('family');
    setScenarioButtonsState();
    setPeriodButtonsState();
    renderAll();
    updateScenarioContext();
  }

  init();
})();
