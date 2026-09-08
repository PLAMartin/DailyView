(function () {
  'use strict';

  var dvAuth = window.dvAuth;

  var form            = document.getElementById('reset-form');
  var passwordInput   = document.getElementById('reset-password');
  var confirmInput    = document.getElementById('reset-confirm');
  var passwordField   = document.getElementById('reset-password-field');
  var confirmField    = document.getElementById('reset-confirm-field');
  var passwordError   = document.getElementById('reset-password-error');
  var confirmError    = document.getElementById('reset-confirm-error');
  var submitBtn       = document.getElementById('reset-submit');
  var messageEl       = document.getElementById('reset-message');
  var toggleBtn       = document.getElementById('reset-password-toggle');
  var requestNewLink  = document.getElementById('reset-request-new');

  var INVALID_LINK = 'This password-reset link is no longer valid. Please request a new one.';
  var NETWORK_FAILURE = 'We could not reach Daily View just now. Please check your connection and try again.';

  function setMessage(text, tone) {
    messageEl.textContent = text;
    if (tone) {
      messageEl.setAttribute('data-tone', tone);
    } else {
      messageEl.removeAttribute('data-tone');
    }
  }

  function showFieldError(input, errorEl, fieldEl, message) {
    fieldEl.setAttribute('data-invalid', 'true');
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', errorEl.id);
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearFieldError(input, errorEl, fieldEl) {
    fieldEl.removeAttribute('data-invalid');
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
    errorEl.textContent = '';
    errorEl.hidden = true;
  }

  function showInvalidLink() {
    setMessage(INVALID_LINK, 'error');
    form.hidden = true;
    requestNewLink.hidden = false;
  }

  toggleBtn.addEventListener('click', function () {
    var isHidden = passwordInput.type === 'password';
    var newType = isHidden ? 'text' : 'password';
    passwordInput.type = newType;
    confirmInput.type = newType;
    toggleBtn.textContent = isHidden ? 'Hide' : 'Show';
    toggleBtn.setAttribute('aria-pressed', String(isHidden));
  });

  function validate() {
    var valid = true;
    var firstInvalid = null;

    clearFieldError(passwordInput, passwordError, passwordField);
    clearFieldError(confirmInput, confirmError, confirmField);

    if (passwordInput.value.length < 12) {
      showFieldError(passwordInput, passwordError, passwordField, 'Use at least 12 characters.');
      valid = false;
      firstInvalid = firstInvalid || passwordInput;
    }

    if (confirmInput.value !== passwordInput.value || !confirmInput.value) {
      showFieldError(confirmInput, confirmError, confirmField, 'Passwords do not match.');
      valid = false;
      firstInvalid = firstInvalid || confirmInput;
    }

    if (firstInvalid) firstInvalid.focus();
    return valid;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    setMessage('', null);
    if (!validate()) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';

    dvAuth.completePasswordReset(passwordInput.value).then(function (result) {
      if (result.error) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save new password';
        setMessage(NETWORK_FAILURE, 'error');
        return;
      }
      dvAuth.signOut().then(function () {
        window.location.href = '../login/?notice=password-updated';
      }, function () {
        window.location.href = '../login/?notice=password-updated';
      });
    }, function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save new password';
      setMessage(NETWORK_FAILURE, 'error');
    });
  });

  document.getElementById('copyright-year').textContent = new Date().getFullYear();

  // A valid recovery session either arrives as a `code` param to exchange,
  // or (rarely) already exists on the page load. Either way, no session
  // means there is nothing to reset against.
  dvAuth.exchangeCodeFromUrl().then(function (result) {
    if (result.error) {
      showInvalidLink();
      return;
    }
    dvAuth.getSession().then(function (session) {
      if (!session) {
        showInvalidLink();
      }
    }, function () {
      showInvalidLink();
    });
  }, function () {
    showInvalidLink();
  });
})();
