(function () {
  'use strict';

  var dvAuth = window.dvAuth;
  var messageEl = document.getElementById('dashboard-message');
  var contentEl = document.getElementById('dashboard-content');

  var LAST_ACCOUNT_KEY = 'dv_last_account_id';

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
    btn.className = 'btn-outline dashboard-signout';
    btn.textContent = 'Sign out';
    btn.addEventListener('click', handleSignOut);
    return btn;
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

  function activateAccount(account, allAccounts) {
    rememberAccount(account.account_id);
    contentEl.textContent = '';
    window.dvToday.render(contentEl, account, allAccounts, {
      signOutButton: makeSignOutButton,
      switchAccount: function () {
        renderAccountChoice(allAccounts);
      }
    });
  }

  function renderAccountChoice(accounts) {
    contentEl.textContent = '';

    var h2 = document.createElement('h2');
    h2.textContent = 'Choose the Daily View account you want to open';
    contentEl.appendChild(h2);

    var list = document.createElement('ul');
    list.className = 'account-list';

    accounts.forEach(function (acc) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'account-choice-btn';

      var nameSpan = document.createElement('span');
      nameSpan.className = 'account-choice-name';
      nameSpan.textContent = acc.account_name;

      var roleSpan = document.createElement('span');
      roleSpan.className = 'account-choice-role';
      roleSpan.textContent = acc.relationship_to_viewer || acc.role || '';

      btn.appendChild(nameSpan);
      btn.appendChild(roleSpan);
      btn.addEventListener('click', function () {
        activateAccount(acc, accounts);
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
