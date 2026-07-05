(function () {
  'use strict';

  var dvAuth = window.dvAuth;
  var statusEl = document.getElementById('callback-status');

  var params = new URLSearchParams(window.location.search);
  var safeNext = dvAuth.getSafeNextPath(params.get('next'));

  function goToLogin(notice) {
    window.location.href = '../../login/?notice=' + encodeURIComponent(notice);
  }

  dvAuth.exchangeCodeFromUrl().then(function (result) {
    if (result.error || !result.hadCode) {
      goToLogin('link-invalid');
      return;
    }

    dvAuth.requireDailyViewAccess().then(function (access) {
      if (access.ok) {
        window.location.href = safeNext;
        return;
      }
      if (access.reason === 'no-access') {
        goToLogin('no-access');
        return;
      }
      statusEl.textContent = 'We could not reach Daily View just now. Please check your connection and try again.';
    }, function () {
      statusEl.textContent = 'We could not reach Daily View just now. Please check your connection and try again.';
    });
  }, function () {
    goToLogin('link-invalid');
  });
})();
