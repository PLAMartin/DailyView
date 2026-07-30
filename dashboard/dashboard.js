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

    section.appendChild(renderDeviceGuide());
    section.appendChild(renderScreenSetupGuide());
    section.appendChild(renderInviteGuide());
    section.appendChild(renderRolesGuide());
    section.appendChild(renderEventsGuide());
    section.appendChild(renderMessagesGuide());
    section.appendChild(renderDisplaySettingsGuide());
    section.appendChild(renderTroubleshootingGuide());

    contentEl.appendChild(section);
  }

  // Mirrors the actual invite flow in people.js: an email is sent
  // automatically, with a copy-link fallback shown right away in case it
  // bounces or the sender wants to share it another way (e.g. text).
  function renderInviteGuide() {
    var guide = el('div', 'help-guide');
    guide.appendChild(el('h3', null, 'Inviting a family member or carer'));
    guide.appendChild(el(
      'p',
      'help-guide-intro',
      'Anyone helping to manage the plan — checking it, updating it, or just keeping an eye on things — can have their own sign-in.'
    ));

    var list = el('ol', 'help-guide-steps');

    var step1 = el('li', 'help-guide-step');
    step1.appendChild(el('span', 'help-guide-badge', '1'));
    var step1Body = el('div', 'help-guide-step-body');
    step1Body.appendChild(el('h4', null, 'Send the invite'));
    var step1List = el('ol', 'help-guide-substeps');
    var peopleItem = el('li');
    peopleItem.appendChild(document.createTextNode('Go to '));
    var peopleLink = el('a', null, 'People → Invite person');
    peopleLink.href = '#people';
    peopleItem.appendChild(peopleLink);
    peopleItem.appendChild(document.createTextNode(' and enter their email address.'));
    step1List.appendChild(peopleItem);
    step1List.appendChild(el(
      'li',
      null,
      'Choose a role — each one shows a short summary of what that person will be able to see and change.'
    ));
    step1List.appendChild(el('li', null, 'Select Send invite.'));
    step1Body.appendChild(step1List);
    step1.appendChild(step1Body);
    list.appendChild(step1);

    var step2 = el('li', 'help-guide-step');
    step2.appendChild(el('span', 'help-guide-badge', '2'));
    var step2Body = el('div', 'help-guide-step-body');
    step2Body.appendChild(el('h4', null, 'They accept it'));
    var step2List = el('ol', 'help-guide-substeps');
    step2List.appendChild(el(
      'li',
      null,
      'An invite email goes out straight away with a link to accept. The invite dialog also shows a Copy link button — use it if the email does not arrive, or to share the invite another way.'
    ));
    step2List.appendChild(el('li', null, 'The link is valid for 7 days. You can see who has and hasn’t accepted yet in People.'));
    step2Body.appendChild(step2List);
    step2.appendChild(step2Body);
    list.appendChild(step2);

    guide.appendChild(list);
    guide.appendChild(el(
      'p',
      'help-guide-outro',
      'You can change someone’s role, resend, or revoke an invite at any time from People.'
    ));

    return guide;
  }

  // Comes before the screen-setup guide since choosing a device is the step
  // before pairing one. Reusing an existing device is the recommended path
  // (Daily View is just a web page — no app install, no special hardware),
  // so that's presented first; buying new is the fallback with a short,
  // deliberately small list of specific models rather than an exhaustive
  // comparison, matching the "fewer, clearer choices" design principle.
  function renderDeviceGuide() {
    var guide = el('div', 'help-guide');
    guide.appendChild(el('h3', null, 'Choosing a device for the viewer'));
    guide.appendChild(el(
      'p',
      'help-guide-intro',
      'Daily View runs in an ordinary web browser, so in most cases you won’t need to buy anything new.'
    ));

    var list = el('ol', 'help-guide-steps');

    var step1 = el('li', 'help-guide-step');
    step1.appendChild(el('span', 'help-guide-badge', '1'));
    var step1Body = el('div', 'help-guide-step-body');
    step1Body.appendChild(el('h4', null, 'Recommended: use a device you already have'));
    step1Body.appendChild(el(
      'p',
      'help-guide-step-note',
      'An old tablet or phone that’s no longer anyone’s daily device is often ideal — it keeps costs down and puts something already in a drawer back to use. Look for:'
    ));
    var step1List = el('ul', 'help-guide-substeps');
    [
      'A screen of at least 8–10 inches, so today’s plan is easy to read from across the room.',
      'A web browser that’s still receiving updates — recent versions of Safari or Chrome both work well.',
      'Wi‑Fi, and a spot within range of it near where the screen will sit.',
      'Somewhere it can stay plugged in permanently — battery life and battery health don’t matter once it’s always on charge.',
      'A way to prop it up — a stand, dock, case with a built-in kickstand, or wall mount.',
      'The ability to turn off its auto-lock/screen timeout and notification pop-ups in Settings, so the plan stays visible and undisturbed.'
    ].forEach(function (text) {
      step1List.appendChild(el('li', null, text));
    });
    step1Body.appendChild(step1List);
    step1.appendChild(step1Body);
    list.appendChild(step1);

    var step2 = el('li', 'help-guide-step');
    step2.appendChild(el('span', 'help-guide-badge', '2'));
    var step2Body = el('div', 'help-guide-step-body');
    step2Body.appendChild(el('h4', null, 'If you do need to buy one'));
    step2Body.appendChild(el(
      'p',
      'help-guide-step-note',
      'The same characteristics above still apply. A plain, everyday tablet is all that’s needed — there’s no reason to pay for a high-end model. A few reliable, affordable options:'
    ));

    var models = [
      {
        name: 'Amazon Fire HD 10',
        detail: 'The most budget-friendly option. 10.1" screen, plenty large enough, and inexpensive enough that it’s an easy first purchase.',
        href: 'https://www.amazon.co.uk/fire-hd-10-tablet/dp/B0CXL5RV2F'
      },
      {
        name: 'Samsung Galaxy Tab A11+',
        detail: 'An 11" Android tablet a step up from the Fire tablet — a smoother browser and more storage, still at a modest price.',
        href: 'https://www.samsung.com/uk/tablets/galaxy-tab-a/galaxy-tab-a11-plus-grey-128gb-wi-fi-sm-x230nzareub/'
      },
      {
        name: 'Apple iPad (11-inch)',
        detail: 'Costs more, but Guided Access (Settings → Accessibility) locks the screen into Daily View so nothing else can be opened by mistake — worth it if that reassurance matters to your family.',
        href: 'https://www.apple.com/uk/ipad-11/'
      }
    ].map(function (model) {
      var entry = el('div', 'help-guide-faq-item');
      entry.appendChild(el('dt', null, model.name));
      var dd = el('dd');
      dd.appendChild(document.createTextNode(model.detail + ' '));
      var link = el('a', null, 'See current price');
      link.href = model.href;
      link.target = '_blank';
      link.rel = 'noopener';
      dd.appendChild(link);
      entry.appendChild(dd);
      return entry;
    });
    var modelList = el('dl', 'help-guide-faq');
    models.forEach(function (entry) { modelList.appendChild(entry); });
    step2Body.appendChild(modelList);
    step2.appendChild(step2Body);
    list.appendChild(step2);

    guide.appendChild(list);

    var outro = el('p', 'help-guide-outro');
    outro.appendChild(document.createTextNode('Whichever device you use, a simple '));
    var standLink = el('a', null, 'stand or case with a kickstand');
    standLink.href = 'https://www.amazon.co.uk/Tablet-Stands/b?node=1499988031';
    standLink.target = '_blank';
    standLink.rel = 'noopener';
    outro.appendChild(standLink);
    outro.appendChild(document.createTextNode(' makes it easy to prop up wherever it will live.'));
    guide.appendChild(outro);

    return guide;
  }

  // Mirrors the steps in the welcome email and the Devices "Pair this
  // device" dialog copy, so the guide stays consistent wherever a carer
  // encounters it.
  function renderScreenSetupGuide() {
    var guide = el('div', 'help-guide');
    guide.appendChild(el('h3', null, 'Setting up your Daily View viewer device'));
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

  // Mirrors event-dialog.js: title (max 100 chars), a specific date and
  // optional times, and a visibility choice — 'display' is the only one
  // that ever reaches the screen (see HIDDEN_VISIBILITY_VALUES there).
  function renderEventsGuide() {
    var guide = el('div', 'help-guide');
    guide.appendChild(el('h3', null, 'Adding and updating events'));
    guide.appendChild(el(
      'p',
      'help-guide-intro',
      'Events are what actually show up on the screen, so this is the part you’ll use most day to day.'
    ));

    var list = el('ol', 'help-guide-steps');

    var step1 = el('li', 'help-guide-step');
    step1.appendChild(el('span', 'help-guide-badge', '1'));
    var step1Body = el('div', 'help-guide-step-body');
    step1Body.appendChild(el('h4', null, 'Add an event'));
    var step1List = el('ol', 'help-guide-substeps');
    var addItem = el('li');
    addItem.appendChild(document.createTextNode('From '));
    var calendarLink = el('a', null, 'Today or Calendar');
    calendarLink.href = '#calendar';
    addItem.appendChild(calendarLink);
    addItem.appendChild(document.createTextNode(', select Add event and give it a title, a date, and a time.'));
    step1List.appendChild(addItem);
    step1List.appendChild(el(
      'li',
      null,
      'Set its visibility to Display so it appears on the screen — the other options keep it private to the dashboard only.'
    ));
    step1Body.appendChild(step1List);
    step1.appendChild(step1Body);
    list.appendChild(step1);

    var step2 = el('li', 'help-guide-step');
    step2.appendChild(el('span', 'help-guide-badge', '2'));
    var step2Body = el('div', 'help-guide-step-body');
    step2Body.appendChild(el('h4', null, 'Change or remove one'));
    var step2List = el('ol', 'help-guide-substeps');
    step2List.appendChild(el('li', null, 'Open the event and edit any detail, then save.'));
    step2List.appendChild(el(
      'li',
      null,
      'Use Cancel for a one-off change (it stops showing on the screen but stays in your records) — use Delete to remove it for good.'
    ));
    step2Body.appendChild(step2List);
    step2.appendChild(step2Body);
    list.appendChild(step2);

    guide.appendChild(list);
    return guide;
  }

  // Mirrors the "Add message" dialog (220-char limit) and the Pause/Resume
  // toggle in messages.js — messages show as a banner on the display.
  function renderMessagesGuide() {
    var guide = el('div', 'help-guide');
    guide.appendChild(el('h3', null, 'Sending a message to the screen'));
    guide.appendChild(el(
      'p',
      'help-guide-intro',
      'A message is a short note that appears on the display alongside the schedule — handy for a one-off reminder that isn’t really an event.'
    ));

    var list = el('ol', 'help-guide-steps');

    var step1 = el('li', 'help-guide-step');
    step1.appendChild(el('span', 'help-guide-badge', '1'));
    var step1Body = el('div', 'help-guide-step-body');
    step1Body.appendChild(el('h4', null, 'Write and send it'));
    var step1List = el('ol', 'help-guide-substeps');
    var msgItem = el('li');
    msgItem.appendChild(document.createTextNode('Go to '));
    var messagesLink = el('a', null, 'Messages → Add message');
    messagesLink.href = '#messages';
    msgItem.appendChild(messagesLink);
    msgItem.appendChild(document.createTextNode(' and type your note (up to 220 characters).'));
    step1List.appendChild(msgItem);
    step1Body.appendChild(step1List);
    step1.appendChild(step1Body);
    list.appendChild(step1);

    var step2 = el('li', 'help-guide-step');
    step2.appendChild(el('span', 'help-guide-badge', '2'));
    var step2Body = el('div', 'help-guide-step-body');
    step2Body.appendChild(el('h4', null, 'Pause, resume, or remove it'));
    var step2List = el('ol', 'help-guide-substeps');
    step2List.appendChild(el(
      'li',
      null,
      'Use Pause to take it off the screen temporarily without deleting it, or Resume to bring it back.'
    ));
    step2Body.appendChild(step2List);
    step2.appendChild(step2Body);
    list.appendChild(step2);

    guide.appendChild(list);
    return guide;
  }

  // Explains the owner / role / primary contact model backing people.js and
  // dv_account_user, in plain language — kept as an FAQ like the settings
  // guide below, since these are independent facts rather than a sequence.
  function renderRolesGuide() {
    var guide = el('div', 'help-guide');
    guide.appendChild(el('h3', null, 'Owner, roles, and primary contact'));
    guide.appendChild(el(
      'p',
      'help-guide-intro',
      'Everyone on an account is either the owner or has a role that decides what they can see and change.'
    ));

    var items = [
      {
        label: 'The owner',
        detail: 'Whoever set up the account. The owner has full control — events, messages, devices, settings, and everyone else on the account. Every account always has exactly one owner.'
      },
      {
        label: 'Carer / Family member',
        detail: 'Can add and update events, messages, and prompts. Cannot change devices, people, or account settings.'
      },
      {
        label: 'Viewer',
        detail: 'Can see the schedule but cannot make changes.'
      },
      {
        label: 'Device manager',
        detail: 'Can pair and manage screens/devices, but not events or people.'
      },
      {
        label: 'Primary contact',
        detail: 'One person marked as the main point of contact for the account — separate from being the owner, so a carer can be the primary contact even if someone else owns the account.'
      }
    ];

    var list = el('dl', 'help-guide-faq');
    items.forEach(function (item) {
      var entry = el('div', 'help-guide-faq-item');
      entry.appendChild(el('dt', null, item.label));
      entry.appendChild(el('dd', null, item.detail));
      list.appendChild(entry);
    });
    guide.appendChild(list);

    var outro = el('p', 'help-guide-outro');
    outro.appendChild(document.createTextNode('Change someone’s role, or set who the primary contact is, from '));
    var peopleLink = el('a', null, 'People');
    peopleLink.href = '#people';
    outro.appendChild(peopleLink);
    outro.appendChild(document.createTextNode('.'));
    guide.appendChild(outro);

    return guide;
  }

  // Explains the two settings groups in settings.js: Account settings
  // (owner only) and Display settings (owner or device manager) — kept as
  // an FAQ rather than steps since these are independent toggles, not a
  // sequence.
  function renderDisplaySettingsGuide() {
    var guide = el('div', 'help-guide');
    guide.appendChild(el('h3', null, 'Customising the display'));
    guide.appendChild(el(
      'p',
      'help-guide-intro',
      'A few settings control how the screen looks and behaves — all in Settings.'
    ));

    var items = [
      {
        label: 'The time-of-day icon or greeting',
        detail: 'Set under Account settings (owner only): the Morning/Afternoon/Evening/Night start times control when the icon changes, and "Show time-of-day icon" turns it off entirely.'
      },
      {
        label: 'How many events show at once',
        detail: '"Events shown on display" in Account settings limits the list to a set number of upcoming items — a lower number keeps the screen simpler.'
      },
      {
        label: 'Time format',
        detail: 'Set under Display settings (owner or device manager): Time format switches between 12‑hour and 24‑hour clocks.'
      },
      {
        label: 'Events that have already happened',
        detail: '"Show past events" and "Grey out past events" in Display settings decide whether finished items stay visible (dimmed) or disappear once done.'
      }
    ];

    var list = el('dl', 'help-guide-faq');
    items.forEach(function (item) {
      var entry = el('div', 'help-guide-faq-item');
      entry.appendChild(el('dt', null, item.label));
      entry.appendChild(el('dd', null, item.detail));
      list.appendChild(entry);
    });
    guide.appendChild(list);

    return guide;
  }

  // Reflects the actual states shown in Devices (devices.js) and on the
  // screen itself (display.js: offline pill after 5 minutes of failed
  // fetches, "no longer connected" message on auth errors) so the advice
  // matches what carers will really see.
  function renderTroubleshootingGuide() {
    var guide = el('div', 'help-guide');
    guide.appendChild(el('h3', null, 'If the screen isn’t working'));

    var items = [
      {
        symptom: 'The screen shows a small “offline” notice',
        fix: 'This clears itself once the screen reconnects to Wi‑Fi. Today’s plan stays on screen from its last successful update while it reconnects, so nothing is lost in the meantime.'
      },
      {
        symptom: 'The screen asks for a new code (“This screen is no longer connected…”)',
        fix: 'This means the screen was disconnected from your account — usually after being removed or deactivated in Devices. Go to Devices, reactivate it if needed, generate a new pairing code, and enter it on the screen.'
      },
      {
        symptom: 'A device shows as “Waiting to connect” in Devices',
        fix: 'The pairing code was created but never entered on the screen. Check the screen is powered on and connected to Wi‑Fi, then enter the code — or generate a new one if it has expired.'
      },
      {
        symptom: 'A device shows as “Offline” in Devices',
        fix: 'It hasn’t checked in for over a day. Check it’s still plugged in, powered on, and connected to Wi‑Fi.'
      }
    ];

    var list = el('dl', 'help-guide-faq');
    items.forEach(function (item) {
      var entry = el('div', 'help-guide-faq-item');
      entry.appendChild(el('dt', null, item.symptom));
      entry.appendChild(el('dd', null, item.fix));
      list.appendChild(entry);
    });
    guide.appendChild(list);

    guide.appendChild(el(
      'p',
      'help-guide-outro',
      'Still stuck? Email support@dailyview.org and we’ll help you sort it out.'
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
