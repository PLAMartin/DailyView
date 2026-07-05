(function () {
  'use strict';

  var dvAuth = window.dvAuth;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  var form       = document.getElementById('forgot-form');
  var emailInput = document.getElementById('forgot-email');
  var emailField = document.getElementById('forgot-email-field');
  var emailError = document.getElementById('forgot-email-error');
  var submitBtn  = document.getElementById('forgot-submit');
  var messageEl  = document.getElementById('forgot-message');

  var CONFIRMATION =
    'If this email is linked to Daily View, we have sent password-reset instructions.\n' +
    'Please check your inbox and spam folder.';
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

  function showFieldError(message) {
    emailField.setAttribute('data-invalid', 'true');
    emailInput.setAttribute('aria-invalid', 'true');
    emailInput.setAttribute('aria-describedby', emailError.id);
    emailError.textContent = message;
    emailError.hidden = false;
  }

  function clearFieldError() {
    emailField.removeAttribute('data-invalid');
    emailInput.removeAttribute('aria-invalid');
    emailInput.removeAttribute('aria-describedby');
    emailError.textContent = '';
    emailError.hidden = true;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    messageEl.textContent = '';
    messageEl.removeAttribute('data-tone');
    clearFieldError();

    var emailVal = emailInput.value.trim();
    if (!emailVal) {
      showFieldError('Enter your email address.');
      emailInput.focus();
      return;
    }
    if (!EMAIL_RE.test(emailVal)) {
      showFieldError('Enter a valid email address.');
      emailInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    dvAuth.sendPasswordReset(emailVal).then(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send reset link';
      setMessage(CONFIRMATION, 'success');
    }, function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send reset link';
      setMessage(NETWORK_FAILURE, 'error');
    });
  });

  document.getElementById('copyright-year').textContent = new Date().getFullYear();
})();
