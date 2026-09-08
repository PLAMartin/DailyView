(function () {
  'use strict';

  var dvAuth = window.dvAuth;

  var headingEl = document.getElementById('accept-heading');
  var subEl     = document.getElementById('accept-sub');
  var messageEl = document.getElementById('accept-message');

  var invalidView = document.getElementById('accept-invalid-view');

  var existingForm     = document.getElementById('accept-existing-form');
  var existingEmail    = document.getElementById('accept-existing-email');
  var existingPassword = document.getElementById('accept-existing-password');
  var existingPwField  = document.getElementById('accept-existing-password-field');
  var existingPwError  = document.getElementById('accept-existing-password-error');
  var existingSubmit   = document.getElementById('accept-existing-submit');
  var existingToggle   = document.getElementById('accept-existing-toggle');

  var newForm     = document.getElementById('accept-new-form');
  var newEmail    = document.getElementById('accept-new-email');
  var newName     = document.getElementById('accept-new-name');
  var newNameField = document.getElementById('accept-new-name-field');
  var newNameError = document.getElementById('accept-new-name-error');
  var newPassword = document.getElementById('accept-new-password');
  var newPwField   = document.getElementById('accept-new-password-field');
  var newPwError   = document.getElementById('accept-new-password-error');
  var newConfirm   = document.getElementById('accept-new-confirm');
  var newConfirmField = document.getElementById('accept-new-confirm-field');
  var newConfirmError = document.getElementById('accept-new-confirm-error');
  var newSubmit    = document.getElementById('accept-new-submit');
  var newToggle    = document.getElementById('accept-new-toggle');

  var NETWORK_FAILURE = 'We could not reach Daily View just now. Please check your connection and try again.';
  var INVALID_REASONS = {
    expired: 'This invite link has expired. Ask the person who invited you to send a new one.',
    revoked: 'This invite has been withdrawn. If you still need access, ask the person who invited you.',
    accepted: 'This invite has already been used.',
    invalid: 'This invite link is not valid. Please check the link or ask for a new one.'
  };

  var inviteId = null;
  var token = null;

  function setMessage(text, tone) {
    messageEl.textContent = text;
    if (tone) messageEl.setAttribute('data-tone', tone);
    else messageEl.removeAttribute('data-tone');
  }

  function showFieldError(input, errorEl, fieldEl, text) {
    fieldEl.setAttribute('data-invalid', 'true');
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', errorEl.id);
    errorEl.textContent = text;
    errorEl.hidden = false;
  }

  function clearFieldError(input, errorEl, fieldEl) {
    fieldEl.removeAttribute('data-invalid');
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
    errorEl.textContent = '';
    errorEl.hidden = true;
  }

  // supabase-js reports a non-2xx Edge Function response as a
  // FunctionsHttpError whose `.context` is the raw Response — the `{error:
  // "..."}` body has to be read (async) rather than accessed as a property.
  function extractErrorCode(fnError) {
    if (fnError && fnError.context && typeof fnError.context.json === 'function') {
      return fnError.context.json().then(function (body) {
        return body && body.error;
      }, function () { return null; });
    }
    return Promise.resolve(null);
  }

  function parseInviteParam() {
    var params = new URLSearchParams(window.location.search);
    var raw = params.get('invite');
    if (!raw) return null;
    var dotIndex = raw.indexOf('.');
    if (dotIndex < 1) return null;
    return { id: raw.slice(0, dotIndex), token: raw.slice(dotIndex + 1) };
  }

  function showInvalid(text) {
    headingEl.textContent = 'This invite is not available';
    subEl.textContent = '';
    setMessage(text, 'error');
    invalidView.hidden = false;
    existingForm.hidden = true;
    newForm.hidden = true;
  }

  function showExistingUserForm(access) {
    headingEl.textContent = 'Join ' + (access.accountName || 'Daily View');
    subEl.textContent = access.role
      ? 'Sign in with your Daily View password to accept this invite as ' + access.role + '.'
      : 'Sign in with your Daily View password to accept this invite.';
    existingEmail.value = access.email;
    existingForm.hidden = false;
    newForm.hidden = true;
    invalidView.hidden = true;
  }

  function showNewUserForm(access) {
    headingEl.textContent = 'Join ' + (access.accountName || 'Daily View');
    subEl.textContent = 'Create your Daily View sign-in to accept this invite'
      + (access.role ? ' as ' + access.role + '.' : '.');
    newEmail.value = access.email;
    newForm.hidden = false;
    existingForm.hidden = true;
    invalidView.hidden = true;
  }

  function toggleVisibility(input, button, extraInput) {
    var isHidden = input.type === 'password';
    var newType = isHidden ? 'text' : 'password';
    input.type = newType;
    if (extraInput) extraInput.type = newType;
    button.textContent = isHidden ? 'Hide' : 'Show';
    button.setAttribute('aria-pressed', String(isHidden));
  }

  existingToggle.addEventListener('click', function () {
    toggleVisibility(existingPassword, existingToggle);
  });
  newToggle.addEventListener('click', function () {
    toggleVisibility(newPassword, newToggle, newConfirm);
  });

  existingForm.addEventListener('submit', function (e) {
    e.preventDefault();
    setMessage('', null);
    clearFieldError(existingPassword, existingPwError, existingPwField);

    if (!existingPassword.value) {
      showFieldError(existingPassword, existingPwError, existingPwField, 'Enter your password.');
      existingPassword.focus();
      return;
    }

    existingSubmit.disabled = true;
    existingSubmit.textContent = 'Signing in…';

    dvAuth.signInWithPassword(existingEmail.value, existingPassword.value).then(function (result) {
      if (result.error) {
        existingSubmit.disabled = false;
        existingSubmit.textContent = 'Sign in and accept invite';
        setMessage('That password did not match. Try again, or reset your password from the sign-in page.', 'error');
        return;
      }
      return dvAuth.invokeFunction('accept-invite', { action: 'accept', invite_id: inviteId, token: token })
        .then(function (fnResult) {
          if (fnResult.error) {
            existingSubmit.disabled = false;
            existingSubmit.textContent = 'Sign in and accept invite';
            setMessage(NETWORK_FAILURE, 'error');
            return;
          }
          window.location.href = '../dashboard/';
        });
    }, function () {
      existingSubmit.disabled = false;
      existingSubmit.textContent = 'Sign in and accept invite';
      setMessage(NETWORK_FAILURE, 'error');
    });
  });

  function validateNewForm() {
    var valid = true;
    var firstInvalid = null;

    clearFieldError(newName, newNameError, newNameField);
    clearFieldError(newPassword, newPwError, newPwField);
    clearFieldError(newConfirm, newConfirmError, newConfirmField);

    if (!newName.value.trim()) {
      showFieldError(newName, newNameError, newNameField, 'Enter your name.');
      valid = false;
      firstInvalid = firstInvalid || newName;
    }
    if (newPassword.value.length < 12) {
      showFieldError(newPassword, newPwError, newPwField, 'Use at least 12 characters.');
      valid = false;
      firstInvalid = firstInvalid || newPassword;
    }
    if (newConfirm.value !== newPassword.value || !newConfirm.value) {
      showFieldError(newConfirm, newConfirmError, newConfirmField, 'Passwords do not match.');
      valid = false;
      firstInvalid = firstInvalid || newConfirm;
    }

    if (firstInvalid) firstInvalid.focus();
    return valid;
  }

  newForm.addEventListener('submit', function (e) {
    e.preventDefault();
    setMessage('', null);
    if (!validateNewForm()) return;

    newSubmit.disabled = true;
    newSubmit.textContent = 'Creating your account…';

    dvAuth.invokeFunction('accept-invite', {
      action: 'accept',
      invite_id: inviteId,
      token: token,
      full_name: newName.value.trim(),
      password: newPassword.value
    }).then(function (result) {
      if (result.error) {
        return extractErrorCode(result.error).then(function (code) {
          newSubmit.disabled = false;
          newSubmit.textContent = 'Create account and join';
          if (code === 'account-exists') {
            setMessage('An account with this email already exists. Please refresh this page and sign in instead.', 'error');
          } else {
            setMessage(NETWORK_FAILURE, 'error');
          }
        });
      }
      return dvAuth.signInWithPassword(newEmail.value, newPassword.value).then(function () {
        window.location.href = '../dashboard/';
      }, function () {
        window.location.href = '../login/';
      });
    }, function () {
      newSubmit.disabled = false;
      newSubmit.textContent = 'Create account and join';
      setMessage(NETWORK_FAILURE, 'error');
    });
  });

  document.getElementById('copyright-year').textContent = new Date().getFullYear();

  var parsed = parseInviteParam();
  if (!parsed) {
    showInvalid(INVALID_REASONS.invalid);
  } else {
    inviteId = parsed.id;
    token = parsed.token;

    dvAuth.invokeFunction('accept-invite', { action: 'verify', invite_id: inviteId, token: token }).then(function (result) {
      if (result.error || !result.data) {
        showInvalid(NETWORK_FAILURE);
        return;
      }
      var data = result.data;
      if (!data.valid) {
        showInvalid(INVALID_REASONS[data.reason] || INVALID_REASONS.invalid);
        return;
      }

      if (!data.existingUser) {
        showNewUserForm(data);
        return;
      }

      // Already signed in as the invited person? Skip the password prompt
      // and accept immediately rather than asking them to re-authenticate.
      dvAuth.getSession().then(function (session) {
        if (session && session.user && (session.user.email || '').toLowerCase() === data.email.toLowerCase()) {
          setMessage('Joining ' + (data.accountName || 'Daily View') + '…', null);
          dvAuth.invokeFunction('accept-invite', { action: 'accept', invite_id: inviteId, token: token }).then(function (fnResult) {
            if (fnResult.error) {
              showExistingUserForm(data);
              return;
            }
            window.location.href = '../dashboard/';
          }, function () {
            showExistingUserForm(data);
          });
          return;
        }
        showExistingUserForm(data);
      }, function () {
        showExistingUserForm(data);
      });
    }, function () {
      showInvalid(NETWORK_FAILURE);
    });
  }
})();
