(function () {
  'use strict';

  var dvData = window.dvDashboardData;
  var dvEventDialog = window.dvEventDialog;

  var NETWORK_FAILURE =
    'We could not reach Daily View just now. Please check your connection and try again.';

  var PAIRING_CODE_MINUTES = 15;
  var PAIRING_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

  var currentAccount = null;
  var currentLookups = null;
  var pollTimer = null;
  var POLL_INTERVAL_MS = 60 * 1000;

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

  function relativeTime(iso) {
    var mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + (mins === 1 ? ' minute ago' : ' minutes ago');
    var hours = Math.round(mins / 60);
    if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
    var days = Math.round(hours / 24);
    return days + (days === 1 ? ' day ago' : ' days ago');
  }

  function formatDateTime(iso, timezone) {
    if (!iso) return '';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(new Date(iso));
  }

  function deviceStatusLabel(device) {
    if (!device.is_active) return 'Inactive';
    if (!device.last_seen_at) return 'Waiting to connect';
    var mins = (Date.now() - new Date(device.last_seen_at).getTime()) / 60000;
    if (mins <= 5) return 'Online';
    if (mins <= 24 * 60) return 'Recently seen';
    return 'Offline';
  }

  function generatePairingCode() {
    var bytes = new Uint8Array(6);
    window.crypto.getRandomValues(bytes);
    var code = '';
    for (var i = 0; i < bytes.length; i++) {
      code += PAIRING_CODE_CHARS[bytes[i] % PAIRING_CODE_CHARS.length];
    }
    return code.slice(0, 3) + '-' + code.slice(3);
  }

  function pairingCodeExpiresAtIso() {
    return new Date(Date.now() + PAIRING_CODE_MINUTES * 60000).toISOString();
  }

  function isPairingCodeExpired(device) {
    return !device.pairing_code_expires_at || new Date(device.pairing_code_expires_at) < new Date();
  }

  // ---- Add device dialog ----

  var dialogsReady = false;
  var addDialog, addForm, addMessageEl, addSubmitBtn;
  var editDialog, editForm, editMessageEl, editSubmitBtn;
  var pairDialog, pairCodeEl, pairExpiryEl, pairQrEl, pairRegenerateBtn, pairCloseBtn2;
  var editingDeviceId = null;
  var pairingDeviceId = null;

  function ensureDialogs() {
    if (dialogsReady) return;
    dialogsReady = true;

    addDialog = document.getElementById('add-device-dialog');
    addForm = document.getElementById('add-device-form');
    addMessageEl = document.getElementById('add-device-message');
    addSubmitBtn = document.getElementById('add-device-submit-btn');
    document.getElementById('add-device-close').addEventListener('click', function () { addDialog.close(); });
    document.getElementById('add-device-cancel-btn').addEventListener('click', function () { addDialog.close(); });
    addForm.addEventListener('submit', handleAddSubmit);

    editDialog = document.getElementById('edit-device-dialog');
    editForm = document.getElementById('edit-device-form');
    editMessageEl = document.getElementById('edit-device-message');
    editSubmitBtn = document.getElementById('edit-device-submit-btn');
    document.getElementById('edit-device-close').addEventListener('click', function () { editDialog.close(); });
    document.getElementById('edit-device-cancel-btn').addEventListener('click', function () { editDialog.close(); });
    editForm.addEventListener('submit', handleEditSubmit);

    pairDialog = document.getElementById('pair-device-dialog');
    pairCodeEl = document.getElementById('pair-device-code');
    pairExpiryEl = document.getElementById('pair-device-expiry');
    pairQrEl = document.getElementById('pair-device-qr');
    pairRegenerateBtn = document.getElementById('pair-device-regenerate-btn');
    pairCloseBtn2 = document.getElementById('pair-device-done-btn');
    document.getElementById('pair-device-close').addEventListener('click', function () { pairDialog.close(); });
    pairCloseBtn2.addEventListener('click', function () { pairDialog.close(); });
    pairRegenerateBtn.addEventListener('click', handleRegenerateCode);
  }

  function populateSelect(selectEl, items, idKey, labelKey, defaultId) {
    selectEl.textContent = '';
    items.forEach(function (item) {
      var opt = document.createElement('option');
      opt.value = String(item[idKey]);
      opt.textContent = humanize(item[labelKey]);
      if (item[idKey] === defaultId) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }

  function setMessage(messageEl, text, tone) {
    messageEl.textContent = text;
    if (tone) messageEl.setAttribute('data-tone', tone);
    else messageEl.removeAttribute('data-tone');
  }

  function renderQr(container, text) {
    container.textContent = '';
    if (!window.qrcode) return;
    var qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    container.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2 });
  }

  var onDeviceChanged = null;

  function openAddDialog(onChanged) {
    ensureDialogs();
    onDeviceChanged = onChanged;
    setMessage(addMessageEl, '', null);
    document.getElementById('add-device-name').value = '';
    populateSelect(document.getElementById('add-device-type'), currentLookups.deviceTypes, 'device_type_id', 'device_type', null);
    addSubmitBtn.disabled = false;
    addSubmitBtn.textContent = 'Add device';
    addDialog.showModal();
  }

  function handleAddSubmit(e) {
    e.preventDefault();
    setMessage(addMessageEl, '', null);

    addSubmitBtn.disabled = true;
    addSubmitBtn.textContent = 'Adding…';

    var payload = {
      account_id: currentAccount.account_id,
      device_name: document.getElementById('add-device-name').value.trim() || null,
      device_type_id: Number(document.getElementById('add-device-type').value) || null,
      is_active: true,
      pairing_code: generatePairingCode(),
      pairing_code_expires_at: pairingCodeExpiresAtIso()
    };

    dvData.createDevice(payload).then(function (device) {
      addSubmitBtn.disabled = false;
      addSubmitBtn.textContent = 'Add device';
      addDialog.close();
      if (onDeviceChanged) onDeviceChanged();
      openPairDialog(device, onDeviceChanged);
    }, function () {
      addSubmitBtn.disabled = false;
      addSubmitBtn.textContent = 'Add device';
      setMessage(addMessageEl, NETWORK_FAILURE, 'error');
    });
  }

  function openEditDialog(device, onChanged) {
    ensureDialogs();
    onDeviceChanged = onChanged;
    editingDeviceId = device.device_id;
    setMessage(editMessageEl, '', null);

    document.getElementById('edit-device-name').value = device.device_name || '';
    populateSelect(document.getElementById('edit-device-type'), currentLookups.deviceTypes, 'device_type_id', 'device_type', device.device_type_id);
    populateSelect(document.getElementById('edit-device-mode'), currentLookups.displayModes, 'display_mode_id', 'display_mode', device.display_mode_id);

    editSubmitBtn.disabled = false;
    editSubmitBtn.textContent = 'Save changes';
    editDialog.showModal();
  }

  function handleEditSubmit(e) {
    e.preventDefault();
    setMessage(editMessageEl, '', null);

    editSubmitBtn.disabled = true;
    editSubmitBtn.textContent = 'Saving…';

    var patch = {
      device_name: document.getElementById('edit-device-name').value.trim() || null,
      device_type_id: Number(document.getElementById('edit-device-type').value) || null,
      display_mode_id: Number(document.getElementById('edit-device-mode').value) || null
    };

    dvData.updateDevice(editingDeviceId, patch).then(function () {
      editSubmitBtn.disabled = false;
      editSubmitBtn.textContent = 'Save changes';
      editDialog.close();
      if (onDeviceChanged) onDeviceChanged();
    }, function () {
      editSubmitBtn.disabled = false;
      editSubmitBtn.textContent = 'Save changes';
      setMessage(editMessageEl, NETWORK_FAILURE, 'error');
    });
  }

  function openPairDialog(device, onChanged) {
    ensureDialogs();
    onDeviceChanged = onChanged;
    pairingDeviceId = device.device_id;
    renderPairDialogContent(device);
    pairDialog.showModal();
  }

  function renderPairDialogContent(device) {
    var expired = isPairingCodeExpired(device);
    pairCodeEl.textContent = device.pairing_code || '——— ———';
    pairCodeEl.classList.toggle('pair-device-code--expired', expired);
    pairExpiryEl.textContent = expired
      ? 'This pairing code has expired. Create a new one and try again.'
      : 'Expires ' + PAIRING_CODE_MINUTES + ' minutes after it was created. Enter it on the Daily View screen to connect.';
    pairExpiryEl.setAttribute('data-tone', expired ? 'error' : 'info');
    if (device.pairing_code && !expired) {
      renderQr(pairQrEl, device.pairing_code);
      pairQrEl.hidden = false;
    } else {
      pairQrEl.textContent = '';
      pairQrEl.hidden = true;
    }
  }

  function handleRegenerateCode() {
    pairRegenerateBtn.disabled = true;
    pairRegenerateBtn.textContent = 'Generating…';
    // Clearing auth_user_id/paired_at here is this design's revoke-and-
    // reinvite for this device slot: dv_redeem_device_pairing_code() only
    // claims a row whose auth_user_id is null, and dv_get_today_view_model's
    // device branch / dv_touch_device_heartbeat both require the caller's
    // auth_user_id to still match the row — so the instant a fresh code is
    // generated, the old physical device's next poll/heartbeat gets 42501
    // and it's shown the "no longer connected" state, not stale data. This
    // is intentional, not a bug: it's what makes "Generate new code" also
    // work as a revoke, without a separate dedicated button.
    dvData.updateDevice(pairingDeviceId, {
      pairing_code: generatePairingCode(),
      pairing_code_expires_at: pairingCodeExpiresAtIso(),
      auth_user_id: null,
      paired_at: null
    }).then(function (device) {
      pairRegenerateBtn.disabled = false;
      pairRegenerateBtn.textContent = 'Generate new code';
      renderPairDialogContent(device);
      if (onDeviceChanged) onDeviceChanged();
    }, function () {
      pairRegenerateBtn.disabled = false;
      pairRegenerateBtn.textContent = 'Generate new code';
    });
  }

  // ---- list rendering ----

  function buildDeviceRow(device, canManage, onChanged) {
    var li = el('li', 'device-card');
    var label = deviceStatusLabel(device);

    var top = el('div', 'device-card-top');
    top.appendChild(el('div', 'device-card-name', device.device_name || 'Unnamed device'));
    top.appendChild(el('span', 'badge device-status-badge device-status-' + label.toLowerCase().replace(/\s+/g, '-'), label));
    li.appendChild(top);

    var metaParts = [];
    metaParts.push(device.dv_device_type ? humanize(device.dv_device_type.device_type) : 'Type not set');
    metaParts.push(device.dv_device_display_mode ? humanize(device.dv_device_display_mode.display_mode) : 'Display mode not set');
    li.appendChild(el('div', 'device-card-meta', metaParts.join(' · ')));

    var detailParts = [];
    detailParts.push(device.last_seen_at ? 'Last seen ' + relativeTime(device.last_seen_at) : 'Never checked in');
    detailParts.push(device.paired_at ? 'Paired ' + formatDateTime(device.paired_at, currentAccount.timezone) : 'Not yet paired');
    if (device.last_refresh_requested_at) {
      detailParts.push('Refresh requested ' + relativeTime(device.last_refresh_requested_at));
    }
    li.appendChild(el('div', 'device-card-detail', detailParts.join(' · ')));

    if (canManage) {
      var actions = el('div', 'device-card-actions');

      if (!device.paired_at) {
        var pairBtn = el('button', 'btn-outline', 'Pair device');
        pairBtn.type = 'button';
        pairBtn.addEventListener('click', function () { openPairDialog(device, onChanged); });
        actions.appendChild(pairBtn);
      }

      var editBtn = el('button', 'btn-outline', 'Edit');
      editBtn.type = 'button';
      editBtn.addEventListener('click', function () { openEditDialog(device, onChanged); });
      actions.appendChild(editBtn);

      var refreshBtn = el('button', 'btn-outline', 'Refresh display');
      refreshBtn.type = 'button';
      refreshBtn.addEventListener('click', function () {
        refreshBtn.disabled = true;
        dvData.updateDevice(device.device_id, { last_refresh_requested_at: new Date().toISOString() })
          .then(onChanged, function () { refreshBtn.disabled = false; });
      });
      actions.appendChild(refreshBtn);

      var toggleBtn = el('button', 'btn-outline', device.is_active ? 'Deactivate' : 'Reactivate');
      toggleBtn.type = 'button';
      toggleBtn.addEventListener('click', function () {
        dvData.updateDevice(device.device_id, { is_active: !device.is_active }).then(onChanged, function () {});
      });
      actions.appendChild(toggleBtn);

      var removeBtn = el('button', 'btn-outline schedule-delete-btn', 'Remove');
      removeBtn.type = 'button';
      removeBtn.addEventListener('click', function () {
        dvEventDialog.openConfirm({
          title: 'Remove this device?',
          message: '"' + (device.device_name || 'Unnamed device') + '" will be removed and its access revoked.',
          confirmLabel: 'Remove device',
          onConfirm: function () {
            return dvData.removeDevice(device.device_id, currentAccount.user_id);
          }
        }, onChanged);
      });
      actions.appendChild(removeBtn);

      li.appendChild(actions);
    }

    return li;
  }

  function renderBody(bodyEl, devices, canManage, onChanged) {
    bodyEl.textContent = '';

    if (canManage) {
      var headerRow = el('div', 'schedule-section-header schedule-section-header--end');
      var addBtn = el('button', 'btn', 'Add device');
      addBtn.type = 'button';
      addBtn.addEventListener('click', function () { openAddDialog(onChanged); });
      headerRow.appendChild(addBtn);
      bodyEl.appendChild(headerRow);
    }

    if (devices.length === 0) {
      bodyEl.appendChild(el('p', 'schedule-empty', 'Add a Daily View screen to see its connection status here.'));
      return;
    }

    var list = el('ul', 'device-card-list');
    devices.forEach(function (device) {
      list.appendChild(buildDeviceRow(device, canManage, onChanged));
    });
    bodyEl.appendChild(list);
  }

  function refresh() {
    var contentEl = document.getElementById('dashboard-content');
    var bodyEl = contentEl.querySelector('.devices-body');
    var statusEl = contentEl.querySelector('.devices-status');
    if (!bodyEl || !statusEl) {
      // Devices tab is no longer on screen (user navigated away) — the
      // interval has no DOM left to update, so stop it rather than tick
      // forever in the background.
      if (pollTimer) { window.clearInterval(pollTimer); pollTimer = null; }
      return;
    }

    statusEl.textContent = 'Loading…';
    statusEl.removeAttribute('data-tone');

    Promise.all([
      dvData.listDevices(currentAccount.account_id),
      dvData.listDeviceLookups()
    ]).then(function (results) {
      statusEl.textContent = '';
      currentLookups = results[1];
      renderBody(bodyEl, results[0], !!currentAccount.can_manage_devices, refresh);
    }, function () {
      statusEl.textContent = NETWORK_FAILURE;
      statusEl.setAttribute('data-tone', 'error');
    });
  }

  function render(contentEl, account) {
    currentAccount = account;
    if (pollTimer) { window.clearInterval(pollTimer); pollTimer = null; }

    contentEl.textContent = '';
    contentEl.appendChild(el('h2', null, 'Devices'));

    var statusEl = el('p', 'devices-status today-status');
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.textContent = 'Loading…';
    contentEl.appendChild(statusEl);

    var bodyEl = el('div', 'devices-body');
    contentEl.appendChild(bodyEl);

    refresh();
    // Online/Recently seen/Offline is derived from last_seen_at against the
    // current time, so this also catches a device quietly aging past a
    // threshold with no new heartbeat, not just fresh data.
    pollTimer = window.setInterval(refresh, POLL_INTERVAL_MS);
  }

  window.dvDevices = { render: render };
})();
