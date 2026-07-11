(function () {
  'use strict';

  // Time-of-day icon assets — same files used by the marketing page's mockup
  // (index.html's periodIcons object) and, previously, a local copy inside
  // dashboard/today.js. Single source now, shared by the dashboard's live
  // preview and the real full-screen viewer, so both stay in sync by
  // construction. Note: index.html's own periodIcons object points its
  // MORNING entry at assets/icon/logo_icon_v5.svg, which does not exist
  // (only assets/icon/logo_icon_v5.png does) — a pre-existing broken path on
  // the marketing page, left as-is there; this copy points at
  // assets/logo/logo_icon_v5.svg, the real file with that name.
  var PERIOD_ICONS = {
    morning:   '../assets/logo/logo_icon_v5.svg',
    afternoon: '../assets/icon/afternoon%20icon%20v1.svg',
    evening:   '../assets/icon/evening_icon_v2.svg',
    night:     '../assets/icon/night_icon_v1.svg'
  };

  function svg(inner) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }

  // Fallback event marker, used when no keyword below matches the title.
  var EVENT_ICON_SVG = svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>');

  // Real events carry no category field (medical/home/social/etc.), only a
  // free-text title — so the icon is picked by matching keywords in the
  // title rather than a stored type. First matching category wins; order
  // matters (e.g. "hair" is checked before "home" so "hairdresser" doesn't
  // fall through to a house icon via some other word).
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

  function el(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  function dayDateLabels(timezone) {
    var now = new Date();
    var day = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'long' }).format(now);
    var date = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, day: 'numeric', month: 'long', year: 'numeric'
    }).format(now);
    return { day: day.toUpperCase(), date: date.toUpperCase() };
  }

  function currentTimeLabel(timezone, timeFormat) {
    var is24Hour = timeFormat === '24_hour';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, hour: is24Hour ? '2-digit' : 'numeric', minute: '2-digit', hour12: !is24Hour
    }).format(new Date());
  }

  // Builds the <article class="dv-mockup dv-mockup--landscape"> DOM from a
  // dv_get_today_view_model()/dv_get_viewer_snapshot() view model. Shared by
  // dashboard/today.js's dashboard-side live preview (wrapped in a decorative
  // .dv-device-frame bezel there) and display/display.js's real full-screen
  // viewer (mounted full-bleed, no bezel) — same DOM from the same JSON, so
  // the two are provably rendering identically rather than two hand-kept
  // copies that can drift apart.
  function buildMockup(viewModel, timezone, options) {
    options = options || {};
    var article = el('article', 'dv-mockup dv-mockup--landscape');
    article.setAttribute('aria-label', options.ariaLabel || 'Daily View');

    article.appendChild(el('div', 'dvm-title', 'Daily View'));

    if (viewModel.message) {
      article.appendChild(el('div', 'dvm-message-banner', viewModel.message));
    }

    var labels = dayDateLabels(timezone);
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
        var cat = pickEventIcon(ev.title);
        var icon = el('span', 'dvm-event-icon' + (cat ? ' ' + cat.className : ''));
        icon.innerHTML = cat ? cat.svg : EVENT_ICON_SVG;
        li.appendChild(icon);
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

    return article;
  }

  window.dvViewerRender = {
    buildMockup: buildMockup,
    dayDateLabels: dayDateLabels,
    currentTimeLabel: currentTimeLabel,
    PERIOD_ICONS: PERIOD_ICONS
  };
})();
