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

  // Generic event marker — real events carry no category (medical/home/
  // social/etc.), only title, time and past/upcoming state, so every event
  // gets the same calendar glyph rather than a per-category icon.
  var EVENT_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>';

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

  function currentTimeLabel(timezone) {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false
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
        var icon = el('span', 'dvm-event-icon');
        icon.innerHTML = EVENT_ICON_SVG;
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
