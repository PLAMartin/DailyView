(function () {
  'use strict';

  var dvAuth = window.dvAuth;
  var messageEl = document.getElementById('dashboard-message');
  var contentEl = document.getElementById('dashboard-content');

  var NETWORK_FAILURE =
    'We could not reach Daily View just now. Please check your connection and try again.';

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

  function makeSignOutButton() {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn dashboard-signout';
    btn.textContent = 'Sign out';
    btn.addEventListener('click', handleSignOut);
    return btn;
  }

  function displayNameFor(account) {
    if (account.preferred_name) return account.preferred_name;
    if (account.full_name) return account.full_name.split(' ')[0];
    return 'there';
  }

  function renderWelcome(account) {
    contentEl.textContent = '';

    var h2 = document.createElement('h2');
    h2.textContent = 'Welcome, ' + displayNameFor(account) + '.';

    var p1 = document.createElement('p');
    p1.textContent = 'You are signed in to ' + account.account_name + '.';

    var p2 = document.createElement('p');
    p2.textContent = 'Your Daily View account area is being prepared.';

    contentEl.appendChild(h2);
    contentEl.appendChild(p1);
    contentEl.appendChild(p2);
    contentEl.appendChild(makeSignOutButton());
  }

  function renderAccountChoice(accounts) {
    contentEl.textContent = '';

    var h2 = document.createElement('h2');
    h2.textContent = 'Choose the Daily View account you want to open';
    contentEl.appendChild(h2);

    var status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    contentEl.appendChild(status);

    var list = document.createElement('ul');
    list.className = 'account-list';

    accounts.forEach(function (acc) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'account-choice-btn';
      btn.setAttribute('aria-pressed', 'false');

      var nameSpan = document.createElement('span');
      nameSpan.className = 'account-choice-name';
      nameSpan.textContent = acc.account_name;

      var roleSpan = document.createElement('span');
      roleSpan.className = 'account-choice-role';
      roleSpan.textContent = acc.relationship_to_viewer || acc.role || '';

      btn.appendChild(nameSpan);
      btn.appendChild(roleSpan);

      btn.addEventListener('click', function () {
        var buttons = list.querySelectorAll('.account-choice-btn');
        for (var i = 0; i < buttons.length; i++) {
          buttons[i].setAttribute('aria-pressed', 'false');
        }
        btn.setAttribute('aria-pressed', 'true');
        status.textContent = 'Selected: ' + acc.account_name + '.';
      });

      li.appendChild(btn);
      list.appendChild(li);
    });

    contentEl.appendChild(list);
    contentEl.appendChild(makeSignOutButton());
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
    if (access.accounts.length === 1) {
      renderWelcome(access.accounts[0]);
    } else {
      renderAccountChoice(access.accounts);
    }
  }, function () {
    setMessage(NETWORK_FAILURE, 'error');
  });

  document.getElementById('copyright-year').textContent = new Date().getFullYear();
})();
