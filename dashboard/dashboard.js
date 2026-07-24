(function () {
  'use strict';

  var dvAuth = window.dvAuth;
  var messageEl = document.getElementById('dashboard-message');
  var accountChoiceEl = document.getElementById('dashboard-account-choice');
  var authMainEl = document.getElementById('auth-main');
  var shellEl = document.getElementById('dash-shell');
  var siteFooterEl = document.querySelector('.site-footer');

  var LAST_ACCOUNT_KEY = 'dv_last_account_id';

  var NETWORK_FAILURE =
    'We could not reach Daily View just now. Please check your connection and try again.';

  // Sections shown in the sidebar (desktop) — Help lives in the topbar/More
  // sheet instead, matching the dashboard spec's shell layout.
  var SIDEBAR_SECTIONS = [
    { id: 'today', label: 'Today' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'messages', label: 'Messages' },
    { id: 'devices', label: 'Devices' },
    { id: 'people', label: 'People' },
    { id: 'settings', label: 'Settings' }
  ];
  var BOTTOM_NAV_SECTION_IDS = ['today', 'calendar', 'messages'];
  var MORE_SHEET_SECTIONS = [
    { id: 'devices', label: 'Devices' },
    { id: 'people', label: 'People' },
    { id: 'settings', label: 'Settings' },
    { id: 'help', label: 'Help' }
  ];
  var ALL_SECTION_IDS = ['today', 'calendar', 'messages', 'devices', 'people', 'settings', 'help'];
  var DEFAULT_SECTION = 'today';

  var currentAccount = null;
  var currentAllAccounts = null;
  var navBuilt = false;
  var routerBound = false;
  var moreSheet;

  function el(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  function setMessage(text, tone) {
    messageEl.textContent = text;
    if (tone) {
      messageEl.setAttribute('data-tone', tone);
    } else {
      messageEl.removeAttribute('data-tone');
    }
  }

  function handleSignOut() {
    dvAuth.signOut().then(function () {
      window.location.href = '../login/?notice=signed-out';
    }, function () {
      window.location.href = '../login/?notice=signed-out';
    });
  }

  function rememberAccount(accountId) {
    try {
      window.localStorage.setItem(LAST_ACCOUNT_KEY, String(accountId));
    } catch (e) {
      // localStorage unavailable (private browsing etc.) — not required to function.
    }
  }

  // Only ever used as a pre-select hint, never trusted: activateAccount()
  // is always called with an account object that already came back from
  // dvAuth.getMyAccountAccess() for the signed-in user.
  function getRememberedAccountId() {
    try {
      return window.localStorage.getItem(LAST_ACCOUNT_KEY);
    } catch (e) {
      return null;
    }
  }

  // ---- shell chrome: sidebar, bottom nav, more sheet ----

  function buildNav() {
    if (navBuilt) return;
    navBuilt = true;

    var navList = document.getElementById('dash-nav-list');
    SIDEBAR_SECTIONS.forEach(function (s) {
      var li = el('li');
      var a = el('a', null, s.label);
      a.href = '#' + s.id;
      a.setAttribute('data-section', s.id);
      li.appendChild(a);
      navList.appendChild(li);
    });

    var bottomNav = document.getElementById('dash-bottom-nav');
    BOTTOM_NAV_SECTION_IDS.forEach(function (id) {
      var section = SIDEBAR_SECTIONS.filter(function (s) { return s.id === id; })[0];
      var a = el('a', 'dash-bottom-link', section.label);
      a.href = '#' + id;
      a.setAttribute('data-section', id);
      bottomNav.appendChild(a);
    });
    var moreBtn = el('button', 'dash-bottom-link dash-more-btn', 'More');
    moreBtn.type = 'button';
    moreBtn.addEventListener('click', openMoreSheet);
    bottomNav.appendChild(moreBtn);

    moreSheet = document.getElementById('more-sheet');
    var moreSheetList = document.getElementById('more-sheet-list');
    document.getElementById('more-sheet-close').addEventListener('click', closeMoreSheet);
    MORE_SHEET_SECTIONS.forEach(function (s) {
      var li = el('li');
      var a = el('a', null, s.label);
      a.href = '#' + s.id;
      a.addEventListener('click', closeMoreSheet);
      li.appendChild(a);
      moreSheetList.appendChild(li);
    });

    document.getElementById('dash-signout-btn').addEventListener('click', handleSignOut);
    document.getElementById('dash-switch-btn').addEventListener('click', switchAccount);
  }

  function openMoreSheet() {
    moreSheet.showModal();
  }

  function closeMoreSheet() {
    moreSheet.close();
  }

  // ---- routing ----

  function currentSectionFromHash() {
    var id = (window.location.hash || '').replace(/^#\/?/, '');
    return ALL_SECTION_IDS.indexOf(id) !== -1 ? id : DEFAULT_SECTION;
  }

  function setActiveNav(sectionId) {
    var links = document.querySelectorAll('#dash-nav-list a[data-section], #dash-bottom-nav a[data-section]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].getAttribute('data-section') === sectionId) {
        links[i].setAttribute('aria-current', 'page');
      } else {
        links[i].removeAttribute('aria-current');
      }
    }
  }

  function renderHelpSection(contentEl) {
    var section = el('section', 'dash-placeholder');
    section.appendChild(el('h2', null, 'Help'));
    section.appendChild(el('p', null, 'Need a hand, or spotted something that does not look right?'));

    var p = el('p');
    p.appendChild(document.createTextNode('Email us at '));
    var a = el('a', null, 'support@dailyview.org');
    a.href = 'mailto:support@dailyview.org';
    p.appendChild(a);
    p.appendChild(document.createTextNode(' and we will get back to you.'));
    section.appendChild(p);

    section.appendChild(renderScreenSetupGuide());

    contentEl.appendChild(section);
  }

  // Mirrors the steps in the welcome email and the Devices "Pair this
  // device" dialog copy, so the guide stays consistent wherever a carer
  // encounters it.
  function renderScreenSetupGuide() {
    var guide = el('div', 'help-guide');
    guide.appendChild(el('h3', null, 'Setting up your Daily View screen'));
    guide.appendChild(el(
      'p',
      'help-guide-intro',
      'Two short steps and your family member will have today’s plan up on the wall — no technical experience needed.'
    ));

    var list = el('ol', 'help-guide-steps');

    // Step 1
    var step1 = el('li', 'help-guide-step');
    step1.appendChild(el('span', 'help-guide-badge', '1'));
    var step1Body = el('div', 'help-guide-step-body');
    step1Body.appendChild(el('h4', null, 'Set up the viewer screen'));
    step1Body.appendChild(el('p', 'help-guide-step-note', 'On the tablet or display itself:'));
    var step1List = el('ol', 'help-guide-substeps');
    step1List.appendChild(el('li', null, 'Plug it in and connect it to your home Wi‑Fi, as you would with any tablet.'));
    var urlItem = el('li');
    urlItem.appendChild(document.createTextNode('Open a web browser and go to '));
    urlItem.appendChild(el('code', null, 'dailyview.org/display'));
    step1List.appendChild(urlItem);
    step1List.appendChild(el(
      'li',
      null,
      'Add it to the home screen (share/menu button → Add to Home Screen), so it reopens automatically if the screen restarts.'
    ));
    step1Body.appendChild(step1List);
    step1.appendChild(step1Body);
    list.appendChild(step1);

    // Step 2
    var step2 = el('li', 'help-guide-step');
    step2.appendChild(el('span', 'help-guide-badge', '2'));
    var step2Body = el('div', 'help-guide-step-body');
    step2Body.appendChild(el('h4', null, 'Pair the two together'));
    step2Body.appendChild(el('p', 'help-guide-step-note', 'Back on your own phone or computer:'));
    var step2List = el('ol', 'help-guide-substeps');
    var addDeviceItem = el('li');
    addDeviceItem.appendChild(document.createTextNode('Go to '));
    var devicesLink = el('a', null, 'Devices → Add device');
    devicesLink.href = '#devices';
    addDeviceItem.appendChild(devicesLink);
    addDeviceItem.appendChild(document.createTextNode(' and give it a name (e.g. "Mum’s kitchen screen").'));
    step2List.appendChild(addDeviceItem);
    step2List.appendChild(el('li', null, 'You’ll see a short code and a QR code — it’s valid for 15 minutes.'));
    step2List.appendChild(el('li', null, 'On the screen, type the code into the box shown there and select Connect.'));
    step2Body.appendChild(step2List);
    step2.appendChild(step2Body);
    list.appendChild(step2);

    guide.appendChild(list);
    guide.appendChild(el(
      'p',
      'help-guide-outro',
      'That’s it — the screen updates itself automatically from here. The person using it never needs to touch a setting or log in.'
    ));

    return guide;
  }

  function renderSection() {
    var sectionId = currentSectionFromHash();
    setActiveNav(sectionId);

    var contentEl = document.getElementById('dashboard-content');
    contentEl.textContent = '';
    var statusEl = document.getElementById('dash-section-status');
    statusEl.textContent = '';
    statusEl.removeAttribute('data-tone');

    if (sectionId === 'today') {
      window.dvToday.render(contentEl, currentAccount);
    } else if (sectionId === 'calendar') {
      window.dvCalendar.render(contentEl, currentAccount);
    } else if (sectionId === 'messages') {
      window.dvMessages.render(contentEl, currentAccount);
    } else if (sectionId === 'devices') {
      window.dvDevices.render(contentEl, currentAccount);
    } else if (sectionId === 'people') {
      window.dvPeople.render(contentEl, currentAccount);
    } else if (sectionId === 'settings') {
      window.dvSettings.render(contentEl, currentAccount);
    } else {
      renderHelpSection(contentEl);
    }
  }

  // ---- account activation / switching ----

  function switchAccount() {
    window.removeEventListener('hashchange', renderSection);
    routerBound = false;
    shellEl.hidden = true;
    authMainEl.hidden = false;
    siteFooterEl.hidden = false;
    renderAccountChoice(currentAllAccounts);
  }

  function activateAccount(account, allAccounts) {
    rememberAccount(account.account_id);
    currentAccount = account;
    currentAllAccounts = allAccounts;

    authMainEl.hidden = true;
    siteFooterEl.hidden = true;
    shellEl.hidden = false;

    document.getElementById('dash-account-name').textContent = account.account_name;
    document.getElementById('dash-switch-btn').hidden = !(allAccounts && allAccounts.length > 1);

    buildNav();

    if (!routerBound) {
      routerBound = true;
      window.addEventListener('hashchange', renderSection);
    }

    if (!window.location.hash) {
      window.location.hash = '#' + DEFAULT_SECTION; // triggers hashchange -> renderSection()
    } else {
      renderSection();
    }
  }

  function renderAccountChoice(accounts) {
    accountChoiceEl.textContent = '';

    accountChoiceEl.appendChild(el('h2', null, 'Choose the Daily View account you want to open'));

    var list = el('ul', 'account-list');

    accounts.forEach(function (acc) {
      var li = el('li');
      var btn = el('button', 'account-choice-btn');
      btn.type = 'button';
      btn.appendChild(el('span', 'account-choice-name', acc.account_name));
      btn.appendChild(el('span', 'account-choice-role', acc.relationship_to_viewer || acc.role || ''));
      btn.addEventListener('click', function () {
        activateAccount(acc, accounts);
      });
      li.appendChild(btn);
      list.appendChild(li);
    });

    accountChoiceEl.appendChild(list);

    var signOutBtn = el('button', 'btn-outline dashboard-signout', 'Sign out');
    signOutBtn.type = 'button';
    signOutBtn.addEventListener('click', handleSignOut);
    accountChoiceEl.appendChild(signOutBtn);
  }

  setMessage('Checking your account…', 'info');

  dvAuth.requireDailyViewAccess().then(function (access) {
    if (!access.ok) {
      if (access.reason === 'no-access') {
        window.location.href = '../login/?notice=no-access';
        return;
      }
      if (access.reason === 'network') {
        setMessage(NETWORK_FAILURE, 'error');
        return;
      }
      // 'no-session'
      window.location.href = '../login/?next=' + encodeURIComponent('/dashboard/');
      return;
    }

    setMessage('', null);
    var accounts = access.accounts;

    if (accounts.length === 1) {
      activateAccount(accounts[0], accounts);
      return;
    }

    var rememberedId = getRememberedAccountId();
    var remembered = rememberedId && accounts.filter(function (acc) {
      return String(acc.account_id) === rememberedId;
    })[0];

    if (remembered) {
      activateAccount(remembered, accounts);
    } else {
      renderAccountChoice(accounts);
    }
  }, function () {
    setMessage(NETWORK_FAILURE, 'error');
  });

  document.getElementById('copyright-year').textContent = new Date().getFullYear();
})();
