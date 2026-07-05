(function () {
  'use strict';

  var dvAuth = window.dvAuth;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  var form          = document.getElementById('login-form');
  var emailInput    = document.getElementById('login-email');
  var passwordInput = document.getElementById('login-password');
  var emailField    = document.getElementById('login-email-field');
  var passwordField = document.getElementById('login-password-field');
  var emailError    = document.getElementById('login-email-error');
  var passwordError = document.getElementById('login-password-error');
  var submitBtn     = document.getElementById('login-submit');
  var messageEl     = document.getElementById('login-message');
  var toggleBtn     = document.getElementById('login-password-toggle');
  var magicLinkBtn  = document.getElementById('login-magic-link');

  var GENERIC_SIGNIN_FAILURE =
    'We could not sign you in with those details. Check your email and ' +
    'password, try a secure sign-in link, or reset your password.';
  var NO_ACCESS_MESSAGE =
    'Your sign-in worked, but this email has not yet been given access to ' +
    'a Daily View account.\nPlease contact the person who invited you or ' +
    'email support@dailyview.org.';
  var NETWORK_FAILURE =
    'We could not reach Daily View just now. Please check your connection and try again.';
  var MAGIC_LINK_SENT =
    'If this email is linked to Daily View, we have sent a secure sign-in link.\n' +
    'Please check your inbox and spam folder.';

  // Other pages (dashboard sign-out/no-access, callback, reset-password)
  // redirect here with ?notice=<key> instead of passing message text
  // through the URL directly.
  var NOTICES = {
    'signed-out':       { text: 'You have signed out.', tone: 'info' },
    'no-access':        { text: NO_ACCESS_MESSAGE, tone: 'info' },
    'link-invalid':     { text: 'That sign-in link is no longer valid. Please request a new one.', tone: 'error' },
    'reset-invalid':    { text: 'This password-reset link is no longer valid. Please request a new one.', tone: 'error' },
    'password-updated': { text: 'Your password has been updated. You can now sign in.', tone: 'success' }
  };

  function showNoticeFromQuery() {
    var params = new URLSearchParams(window.location.search);
    var key = params.get('notice');
    if (key && NOTICES[key]) {
      setMessage(NOTICES[key].text, NOTICES[key].tone);
      return true;
    }
    return false;
  }

  function getNextParam() {
    var params = new URLSearchParams(window.location.search);
    return dvAuth.getSafeNextPath(params.get('next'));
  }

  function setMessage(text, tone) {
    messageEl.textContent = text;
    if (tone) {
      messageEl.setAttribute('data-tone', tone);
    } else {
      messageEl.removeAttribute('data-tone');
    }
  }

  function clearMessage() {
    messageEl.textContent = '';
    messageEl.removeAttribute('data-tone');
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

  function validate() {
    var valid = true;
    var firstInvalid = null;

    clearFieldError(emailInput, emailError, emailField);
    clearFieldError(passwordInput, passwordError, passwordField);

    var emailVal = emailInput.value.trim();
    if (!emailVal) {
      showFieldError(emailInput, emailError, emailField, 'Enter your email address.');
      valid = false;
      firstInvalid = firstInvalid || emailInput;
    } else if (!EMAIL_RE.test(emailVal)) {
      showFieldError(emailInput, emailError, emailField, 'Enter a valid email address.');
      valid = false;
      firstInvalid = firstInvalid || emailInput;
    }

    if (!passwordInput.value) {
      showFieldError(passwordInput, passwordError, passwordField, 'Enter your password.');
      valid = false;
      firstInvalid = firstInvalid || passwordInput;
    }

    if (firstInvalid) firstInvalid.focus();
    return valid;
  }

  function resetSubmitButton() {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign in';
  }

  function handleAccessResult(access) {
    if (access.ok) {
      window.location.href = getNextParam();
      return;
    }
    if (access.reason === 'no-access') {
      setMessage(NO_ACCESS_MESSAGE, 'info');
    } else if (access.reason === 'network') {
      setMessage(NETWORK_FAILURE, 'error');
    }
    // reason 'no-session': leave the blank form as-is, no message.
  }

  toggleBtn.addEventListener('click', function () {
    var isHidden = passwordInput.type === 'password';
    passwordInput.type = isHidden ? 'text' : 'password';
    toggleBtn.textContent = isHidden ? 'Hide' : 'Show';
    toggleBtn.setAttribute('aria-pressed', String(isHidden));
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearMessage();
    if (!validate()) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in…';

    dvAuth.signInWithPassword(emailInput.value, passwordInput.value).then(function (result) {
      if (result.error) {
        resetSubmitButton();
        setMessage(GENERIC_SIGNIN_FAILURE, 'error');
        return;
      }
      return dvAuth.requireDailyViewAccess().then(function (access) {
        resetSubmitButton();
        handleAccessResult(access);
      });
    }, function () {
      resetSubmitButton();
      setMessage(NETWORK_FAILURE, 'error');
    });
  });

  magicLinkBtn.addEventListener('click', function () {
    clearMessage();
    clearFieldError(emailInput, emailError, emailField);

    var emailVal = emailInput.value.trim();
    if (!emailVal || !EMAIL_RE.test(emailVal)) {
      showFieldError(emailInput, emailError, emailField, 'Enter a valid email address first.');
      emailInput.focus();
      return;
    }

    magicLinkBtn.disabled = true;
    var originalLabel = magicLinkBtn.textContent;
    magicLinkBtn.textContent = 'Sending…';

    dvAuth.sendMagicLink(emailVal, getNextParam()).then(function () {
      magicLinkBtn.disabled = false;
      magicLinkBtn.textContent = originalLabel;
      setMessage(MAGIC_LINK_SENT, 'success');
    }, function () {
      magicLinkBtn.disabled = false;
      magicLinkBtn.textContent = originalLabel;
      setMessage(NETWORK_FAILURE, 'error');
    });
  });

  document.getElementById('copyright-year').textContent = new Date().getFullYear();

  var hadNotice = showNoticeFromQuery();

  dvAuth.requireDailyViewAccess().then(function (access) {
    if (access.ok) {
      window.location.href = getNextParam();
      return;
    }
    if (!hadNotice) handleAccessResult(access);
  }, function () {
    // Silent on initial-load network failure — just leave the blank form.
  });
})();
