(function () {
  'use strict';

  var dvData = window.dvDashboardData;
  var dvEventDialog = window.dvEventDialog;

  var NETWORK_FAILURE =
    'We could not reach Daily View just now. Please check your connection and try again.';

  var INVITE_EXPIRY_DAYS = 7;

  // Maps the five standard roles (spec section 7.1) to a permission preset
  // (section 7.2) and the granular can_manage_* flags (section 8.1's role
  // defaults table). The dashboard exposes one Role choice rather than
  // separate role/permission/four-checkbox controls — simpler to reason
  // about, and matches the "readable summary of permissions" requirement
  // (section 16.2) better than raw checkboxes would.
  var ROLE_PRESETS = {
    owner: {
      permission: 'full_access', can_manage_events: true, can_manage_users: true,
      can_manage_devices: true, can_send_prompts: true,
      summary: 'Full control: events, messages, devices, people and settings.'
    },
    editor: {
      permission: 'schedule_editor', can_manage_events: true, can_manage_users: false,
      can_manage_devices: false, can_send_prompts: true,
      summary: 'Can manage events, messages and prompts. Cannot manage people, devices or settings.'
    },
    carer: {
      permission: 'schedule_editor', can_manage_events: true, can_manage_users: false,
      can_manage_devices: false, can_send_prompts: true,
      summary: 'Can manage events, messages and prompts. Cannot manage people, devices or settings.'
    },
    viewer: {
      permission: 'read_only', can_manage_events: false, can_manage_users: false,
      can_manage_devices: false, can_send_prompts: false,
      summary: 'Read-only access to the schedule. Cannot make changes.'
    },
    device_manager: {
      permission: 'device_admin', can_manage_events: false, can_manage_users: false,
      can_manage_devices: true, can_send_prompts: false,
      summary: 'Can pair, refresh and manage devices and display settings only.'
    }
  };

  var currentAccount = null;
  var currentRolesAndPermissions = null;

  function el(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  function humanize(text) {
    if (!text) return '';
    var s = text.replace(/_/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function formatDate(iso, timezone) {
    if (!iso) return '';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, day: 'numeric', month: 'short', year: 'numeric'
    }).format(new Date(iso));
  }

  function friendlyError(err) {
    if (err && /last remaining account owner/i.test(err.message || '')) {
      return 'This person cannot be removed or changed — every account needs at least one owner.';
    }
    return NETWORK_FAILURE;
  }

  // ---- invite token: random secret, hashed before it ever reaches the server ----

  function generateInviteToken() {
    var bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function sha256Hex(text) {
    var data = new TextEncoder().encode(text);
    return window.crypto.subtle.digest('SHA-256', data).then(function (buf) {
      var bytes = new Uint8Array(buf);
      var hex = '';
      for (var i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
      return hex;
    });
  }

  function inviteStatus(invite) {
    if (invite.revoked_at) return 'revoked';
    if (invite.accepted_at) return 'accepted';
    if (new Date(invite.expires_at) < new Date()) return 'expired';
    return 'pending';
  }

  // ---- role select population ----

  function populateRoleSelect(selectEl, defaultRole) {
    selectEl.textContent = '';
    var roles = currentRolesAndPermissions.roles.filter(function (r) { return ROLE_PRESETS[r.role]; });
    roles.forEach(function (r) {
      var opt = document.createElement('option');
      opt.value = r.role;
      opt.textContent = humanize(r.role);
      if (r.role === defaultRole) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }

  function roleIdFor(roleString) {
    var match = currentRolesAndPermissions.roles.filter(function (r) { return r.role === roleString; })[0];
    return match ? match.role_id : null;
  }

  function permissionIdFor(permissionString) {
    var match = currentRolesAndPermissions.permissions.filter(function (p) { return p.permission === permissionString; })[0];
    return match ? match.permission_id : null;
  }

  function rolePayloadFields(roleString) {
    var preset = ROLE_PRESETS[roleString];
    return {
      role_id: roleIdFor(roleString),
      permission_id: permissionIdFor(preset.permission),
      can_manage_events: preset.can_manage_events,
      can_manage_users: preset.can_manage_users,
      can_manage_devices: preset.can_manage_devices,
      can_send_prompts: preset.can_send_prompts
    };
  }

  function updateRoleSummary(selectEl, summaryEl) {
    var preset = ROLE_PRESETS[selectEl.value];
    summaryEl.textContent = preset ? preset.summary : '';
  }

  // ---- invite dialog ----

  var dialogsReady = false;
  var inviteDialog, inviteForm, inviteMessageEl, inviteSubmitBtn;
  var inviteFormView, inviteResultView, inviteLinkInput, inviteCopyBtn, inviteDoneBtn;
  var editDialog, editForm, editMessageEl, editSubmitBtn;
  var onPeopleChanged = null;

  function ensureDialogs() {
    if (dialogsReady) return;
    dialogsReady = true;

    inviteDialog = document.getElementById('invite-dialog');
    inviteForm = document.getElementById('invite-form');
    inviteMessageEl = document.getElementById('invite-dialog-message');
    inviteSubmitBtn = document.getElementById('invite-submit-btn');
    inviteFormView = document.getElementById('invite-form-view');
    inviteResultView = document.getElementById('invite-result-view');
    inviteLinkInput = document.getElementById('invite-link-input');
    inviteCopyBtn = document.getElementById('invite-copy-btn');
    inviteDoneBtn = document.getElementById('invite-done-btn');

    document.getElementById('invite-dialog-close').addEventListener('click', function () { inviteDialog.close(); });
    document.getElementById('invite-cancel-btn').addEventListener('click', function () { inviteDialog.close(); });
    inviteDoneBtn.addEventListener('click', function () { inviteDialog.close(); });
    inviteForm.addEventListener('submit', handleInviteSubmit);
    document.getElementById('invite-role').addEventListener('change', function () {
      updateRoleSummary(this, document.getElementById('invite-role-summary'));
    });
    inviteCopyBtn.addEventListener('click', function () {
      inviteLinkInput.select();
      navigator.clipboard.writeText(inviteLinkInput.value).then(function () {
        inviteCopyBtn.textContent = 'Copied';
        setTimeout(function () { inviteCopyBtn.textContent = 'Copy link'; }, 2000);
      }, function () { /* clipboard unavailable — link is still selected for manual copy */ });
    });

    editDialog = document.getElementById('edit-member-dialog');
    editForm = document.getElementById('edit-member-form');
    editMessageEl = document.getElementById('edit-member-message');
    editSubmitBtn = document.getElementById('edit-member-submit-btn');
    document.getElementById('edit-member-close').addEventListener('click', function () { editDialog.close(); });
    document.getElementById('edit-member-cancel-btn').addEventListener('click', function () { editDialog.close(); });
    editForm.addEventListener('submit', handleEditSubmit);
    document.getElementById('edit-member-role').addEventListener('change', function () {
      updateRoleSummary(this, document.getElementById('edit-member-role-summary'));
    });
  }

  function setMessage(messageEl, text, tone) {
    messageEl.textContent = text;
    if (tone) messageEl.setAttribute('data-tone', tone);
    else messageEl.removeAttribute('data-tone');
  }

  function openInviteDialog(onChanged) {
    ensureDialogs();
    onPeopleChanged = onChanged;
    setMessage(inviteMessageEl, '', null);
    inviteFormView.hidden = false;
    inviteResultView.hidden = true;
    inviteForm.reset();
    document.getElementById('invite-email').value = '';
    document.getElementById('invite-relationship').value = '';
    populateRoleSelect(document.getElementById('invite-role'), 'editor');
    updateRoleSummary(document.getElementById('invite-role'), document.getElementById('invite-role-summary'));
    inviteSubmitBtn.disabled = false;
    inviteSubmitBtn.textContent = 'Send invite';
    inviteDialog.showModal();
  }

  function handleInviteSubmit(e) {
    e.preventDefault();
    setMessage(inviteMessageEl, '', null);

    var email = document.getElementById('invite-email').value.trim();
    if (!email) {
      setMessage(inviteMessageEl, 'Enter an email address.', 'error');
      return;
    }

    inviteSubmitBtn.disabled = true;
    inviteSubmitBtn.textContent = 'Sending…';

    var roleString = document.getElementById('invite-role').value;
    var token = generateInviteToken();

    sha256Hex(token).then(function (tokenHash) {
      var payload = Object.assign({
        account_id: currentAccount.account_id,
        email: email,
        relationship_to_viewer: document.getElementById('invite-relationship').value.trim() || null,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString(),
        created_by_user_id: currentAccount.user_id
      }, rolePayloadFields(roleString));

      return dvData.createInvite(payload).then(function (invite) {
        inviteSubmitBtn.disabled = false;
        inviteSubmitBtn.textContent = 'Send invite';
        if (onPeopleChanged) onPeopleChanged();
        return sendInviteEmailAndShowResult(invite, token);
      });
    }, function () {
      inviteSubmitBtn.disabled = false;
      inviteSubmitBtn.textContent = 'Send invite';
      setMessage(inviteMessageEl, NETWORK_FAILURE, 'error');
    });
  }

  function inviteLinkFor(invite, token) {
    return window.location.origin + '/accept-invite/?invite=' + invite.invite_id + '.' + token;
  }

  function setInviteEmailStatus(state, email) {
    var statusEl = document.getElementById('invite-result-status');
    if (state === 'sending') {
      statusEl.textContent = 'Sending an invite email to ' + email + '…';
      statusEl.removeAttribute('data-tone');
    } else if (state === 'sent') {
      statusEl.textContent = 'An invite email has been sent to ' + email + '.';
      statusEl.removeAttribute('data-tone');
    } else {
      statusEl.textContent = 'We could not send the invite email to ' + email + ' just now.';
      statusEl.setAttribute('data-tone', 'error');
    }
  }

  // Shows the link immediately (it's already valid — no need to wait on the
  // network) and updates the status line once send-invite-email resolves.
  // send-invite-email re-verifies the invite itself rather than trusting
  // anything from this client. Either way the copy-link fallback stays
  // available, so a bounced or blocked email never strands the invite.
  function sendInviteEmailAndShowResult(invite, token) {
    inviteFormView.hidden = true;
    inviteResultView.hidden = false;
    inviteLinkInput.value = inviteLinkFor(invite, token);
    setInviteEmailStatus('sending', invite.email);

    return dvAuth.invokeFunction('send-invite-email', { invite_id: invite.invite_id, token: token })
      .then(function (result) {
        setInviteEmailStatus(result.error ? 'failed' : 'sent', invite.email);
      }, function () {
        setInviteEmailStatus('failed', invite.email);
      });
  }

  function openEditDialog(member, onChanged) {
    ensureDialogs();
    onPeopleChanged = onChanged;
    setMessage(editMessageEl, '', null);

    document.getElementById('edit-member-name').textContent = member.dv_user.full_name;
    document.getElementById('edit-member-relationship').value = member.relationship_to_viewer || '';
    document.getElementById('edit-member-primary').checked = !!member.is_primary_contact;
    populateRoleSelect(document.getElementById('edit-member-role'), member.dv_account_user_role.role);
    updateRoleSummary(document.getElementById('edit-member-role'), document.getElementById('edit-member-role-summary'));

    editSubmitBtn.disabled = false;
    editSubmitBtn.textContent = 'Save changes';
    editDialog.showModal();
    editDialog._member = member;
  }

  function handleEditSubmit(e) {
    e.preventDefault();
    setMessage(editMessageEl, '', null);

    editSubmitBtn.disabled = true;
    editSubmitBtn.textContent = 'Saving…';

    var member = editDialog._member;
    var roleString = document.getElementById('edit-member-role').value;
    var patch = Object.assign({
      relationship_to_viewer: document.getElementById('edit-member-relationship').value.trim() || null,
      is_primary_contact: document.getElementById('edit-member-primary').checked
    }, rolePayloadFields(roleString));

    dvData.updateMember(member.account_id, member.user_id, patch).then(function () {
      editSubmitBtn.disabled = false;
      editSubmitBtn.textContent = 'Save changes';
      editDialog.close();
      if (onPeopleChanged) onPeopleChanged();
    }, function (err) {
      editSubmitBtn.disabled = false;
      editSubmitBtn.textContent = 'Save changes';
      setMessage(editMessageEl, friendlyError(err), 'error');
    });
  }

  // ---- member list ----

  function buildMemberRow(member, canManage, onChanged) {
    var li = el('li', 'people-row');
    var u = member.dv_user;

    var top = el('div', 'people-row-top');
    var nameText = u.full_name + (u.preferred_name && u.preferred_name !== u.full_name ? ' (' + u.preferred_name + ')' : '');
    top.appendChild(el('div', 'people-row-name', nameText));
    if (member.is_primary_contact) {
      top.appendChild(el('span', 'badge', 'Primary contact'));
    }
    li.appendChild(top);

    var metaParts = [u.email || 'No email on file'];
    if (member.relationship_to_viewer) metaParts.push(member.relationship_to_viewer);
    metaParts.push(humanize(member.dv_account_user_role.role));
    li.appendChild(el('div', 'people-row-meta', metaParts.join(' · ')));

    if (canManage) {
      var actions = el('div', 'people-row-actions');

      var editBtn = el('button', 'btn-outline', 'Edit');
      editBtn.type = 'button';
      editBtn.addEventListener('click', function () { openEditDialog(member, onChanged); });
      actions.appendChild(editBtn);

      var removeBtn = el('button', 'btn-outline schedule-delete-btn', 'Remove');
      removeBtn.type = 'button';
      removeBtn.addEventListener('click', function () {
        dvEventDialog.openConfirm({
          title: 'Remove this person?',
          message: '"' + u.full_name + '" will lose access to this Daily View account.',
          confirmLabel: 'Remove access',
          onConfirm: function () {
            return dvData.removeMember(member.account_id, member.user_id, currentAccount.user_id)
              .catch(function (err) {
                var friendly = new Error(friendlyError(err));
                friendly.friendly = true;
                throw friendly;
              });
          }
        }, onChanged);
      });
      actions.appendChild(removeBtn);

      li.appendChild(actions);
    }

    return li;
  }

  function buildInviteRow(invite, canManage, onChanged) {
    var status = inviteStatus(invite);
    var li = el('li', 'people-row');

    var top = el('div', 'people-row-top');
    top.appendChild(el('span', 'badge invite-status-badge invite-status-' + status, humanize(status)));
    top.appendChild(el('span', 'people-row-name', invite.email));
    li.appendChild(top);

    var metaParts = [humanize(invite.dv_account_user_role.role)];
    metaParts.push('Sent ' + formatDate(invite.created_at, currentAccount.timezone));
    if (status === 'pending') metaParts.push('Expires ' + formatDate(invite.expires_at, currentAccount.timezone));
    li.appendChild(el('div', 'people-row-meta', metaParts.join(' · ')));

    if (canManage && status === 'pending') {
      var actions = el('div', 'people-row-actions');

      var resendBtn = el('button', 'btn-outline', 'Resend');
      resendBtn.type = 'button';
      resendBtn.addEventListener('click', function () {
        var token = generateInviteToken();
        resendBtn.disabled = true;
        sha256Hex(token).then(function (tokenHash) {
          return dvData.updateInvite(invite.invite_id, {
            token_hash: tokenHash,
            expires_at: new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()
          });
        }).then(function (updated) {
          resendBtn.disabled = false;
          ensureDialogs();
          setMessage(inviteMessageEl, '', null);
          inviteDialog.showModal();
          onPeopleChanged = onChanged;
          return sendInviteEmailAndShowResult(updated, token);
        }, function () { resendBtn.disabled = false; });
      });
      actions.appendChild(resendBtn);

      var revokeBtn = el('button', 'btn-outline schedule-delete-btn', 'Revoke');
      revokeBtn.type = 'button';
      revokeBtn.addEventListener('click', function () {
        dvEventDialog.openConfirm({
          title: 'Revoke this invite?',
          message: '"' + invite.email + '" will no longer be able to use this invite link.',
          confirmLabel: 'Revoke invite',
          onConfirm: function () {
            return dvData.updateInvite(invite.invite_id, { revoked_at: new Date().toISOString() });
          }
        }, onChanged);
      });
      actions.appendChild(revokeBtn);

      li.appendChild(actions);
    }

    return li;
  }

  function renderBody(bodyEl, members, invites, canManage, onChanged) {
    bodyEl.textContent = '';

    var headerRow = el('div', 'schedule-section-header');
    headerRow.appendChild(el('h3', null, 'People'));
    if (canManage) {
      var inviteBtn = el('button', 'btn', 'Invite person');
      inviteBtn.type = 'button';
      inviteBtn.addEventListener('click', function () { openInviteDialog(onChanged); });
      headerRow.appendChild(inviteBtn);
    }
    bodyEl.appendChild(headerRow);

    var memberList = el('ul', 'people-list');
    members.forEach(function (m) { memberList.appendChild(buildMemberRow(m, canManage, onChanged)); });
    bodyEl.appendChild(memberList);

    var pendingInvites = invites.filter(function (i) { return inviteStatus(i) === 'pending'; });
    if (pendingInvites.length > 0 || invites.length > 0) {
      bodyEl.appendChild(el('h3', 'people-invites-heading', 'Invites'));
      if (invites.length === 0) {
        bodyEl.appendChild(el('p', 'schedule-empty', 'Invite a family member or carer to help keep Daily View up to date.'));
      } else {
        var inviteList = el('ul', 'people-list');
        invites.forEach(function (i) { inviteList.appendChild(buildInviteRow(i, canManage, onChanged)); });
        bodyEl.appendChild(inviteList);
      }
    }
  }

  function refresh() {
    var contentEl = document.getElementById('dashboard-content');
    var bodyEl = contentEl.querySelector('.people-body');
    var statusEl = contentEl.querySelector('.people-status');
    if (!bodyEl || !statusEl) return;

    statusEl.textContent = 'Loading…';
    statusEl.removeAttribute('data-tone');

    Promise.all([
      dvData.listMembers(currentAccount.account_id),
      dvData.listInvites(currentAccount.account_id),
      dvData.listRolesAndPermissions()
    ]).then(function (results) {
      statusEl.textContent = '';
      currentRolesAndPermissions = results[2];
      renderBody(bodyEl, results[0], results[1], !!currentAccount.can_manage_users, refresh);
    }, function () {
      statusEl.textContent = NETWORK_FAILURE;
      statusEl.setAttribute('data-tone', 'error');
    });
  }

  function render(contentEl, account) {
    currentAccount = account;

    contentEl.textContent = '';
    contentEl.appendChild(el('h2', null, 'People'));

    var statusEl = el('p', 'people-status today-status');
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.textContent = 'Loading…';
    contentEl.appendChild(statusEl);

    var bodyEl = el('div', 'people-body');
    contentEl.appendChild(bodyEl);

    refresh();
  }

  window.dvPeople = { render: render };
})();
