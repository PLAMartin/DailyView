(function () {
  'use strict';

  var dvViewerData = window.dvViewerData;
  var dvViewerRender = window.dvViewerRender;

  var DEVICE_ID_KEY = 'dv_display_device_id';
  var CACHE_KEY = 'dv_display_snapshot_cache';
  var POLL_INTERVAL_MS = 60 * 1000;
  var OFFLINE_INDICATOR_DELAY_MS = 5 * 60 * 1000;

  var loadingView = document.getElementById('loading-view');
  var loadingMessageEl = document.getElementById('loading-message');
  var pairingView = document.getElementById('pairing-view');
  var pairingForm = document.getElementById('pairing-form');
  var pairingCodeInput = document.getElementById('pairing-code-input');
  var pairingSubmitBtn = document.getElementById('pairing-submit-btn');
  var pairingMessageEl = document.getElementById('pairing-message');
  var viewerView = document.getElementById('viewer-view');
  var viewerMount = document.getElementById('viewer-mount');
  var offlinePill = document.getElementById('viewer-offline-pill');

  var state = {
    deviceId: null,
    snapshot: null,
    clockTimer: null,
    pollTimer: null,
    firstFailureAt: null
  };

  // ---- localStorage (never throws — private browsing / storage-disabled
  // browsers fall back to online-only behaviour with no user-facing error,
  // per spec §19's "browser storage unavailable" row) ----

  function readCache() {
    try {
      var raw = window.localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeCache(snapshot) {
    try {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify({
        data: snapshot,
        cachedAt: new Date().toISOString()
      }));
    } catch (e) { /* storage unavailable — continue online-only */ }
  }

  function getStoredDeviceId() {
    try {
      return window.localStorage.getItem(DEVICE_ID_KEY);
    } catch (e) {
      return null;
    }
  }

  function storeDeviceId(id) {
    try {
      window.localStorage.setItem(DEVICE_ID_KEY, String(id));
    } catch (e) { /* storage unavailable — session still works, just won't survive reload */ }
  }

  function clearDeviceState() {
    try {
      window.localStorage.removeItem(DEVICE_ID_KEY);
      window.localStorage.removeItem(CACHE_KEY);
    } catch (e) {}
    state.deviceId = null;
    state.snapshot = null;
  }

  // ---- view switching ----

  function showOnly(view) {
    loadingView.hidden = view !== 'loading';
    pairingView.hidden = view !== 'pairing';
    viewerView.hidden = view !== 'viewer';
  }

  function setPairingMessage(text, tone) {
    pairingMessageEl.textContent = text;
    if (tone) pairingMessageEl.setAttribute('data-tone', tone);
    else pairingMessageEl.removeAttribute('data-tone');
  }

  // ---- clock ----
  // Only the visible time ticks locally every second; dateLabel/dayPeriod/
  // events/next/message stay exactly as last fetched until the next poll —
  // see the plan's accepted trade-off on per-minute "current" event state.

  function stopClock() {
    if (state.clockTimer) {
      window.clearInterval(state.clockTimer);
      state.clockTimer = null;
    }
  }

  function tickClock() {
    if (!state.snapshot) return;
    var timeEl = viewerMount.querySelector('.dvm-time');
    if (timeEl) {
      timeEl.textContent = dvViewerRender.currentTimeLabel(
        state.snapshot.timezone,
        state.snapshot.preferences && state.snapshot.preferences.timeFormat
      );
    }
  }

  function startClock() {
    stopClock();
    tickClock();
    state.clockTimer = window.setInterval(tickClock, 1000);
  }

  // ---- rendering ----

  function renderViewer(snapshot) {
    state.snapshot = snapshot;
    viewerMount.textContent = '';
    viewerMount.appendChild(dvViewerRender.buildMockup(snapshot, snapshot.timezone, { ariaLabel: 'Daily View' }));
    showOnly('viewer');
    startClock();
  }

  function setOfflinePillVisible(visible) {
    offlinePill.hidden = !visible;
  }

  // ---- fetch / poll ----

  function handleFetchSuccess(snapshot) {
    state.firstFailureAt = null;
    setOfflinePillVisible(false);
    writeCache(snapshot);
    renderViewer(snapshot);
    // Fire-and-forget: a failed heartbeat should never affect what's on screen.
    dvViewerData.touchHeartbeat(state.deviceId).catch(function () {});
  }

  function handleFetchFailure(error) {
    if (error && error.code === '42501') {
      stopClock();
      clearDeviceState();
      showOnly('pairing');
      setPairingMessage(
        'This screen is no longer connected to a Daily View account. Enter a new code to reconnect.',
        'info'
      );
      return;
    }

    if (!state.firstFailureAt) state.firstFailureAt = Date.now();

    var cache = readCache();
    if (cache && cache.data) {
      if (!state.snapshot) renderViewer(cache.data);
      setOfflinePillVisible((Date.now() - state.firstFailureAt) > OFFLINE_INDICATOR_DELAY_MS);
    } else {
      stopClock();
      loadingMessageEl.textContent = 'Daily View is reconnecting. Your information will appear here shortly.';
      showOnly('loading');
    }
  }

  function fetchSnapshot() {
    if (!state.deviceId) return;
    dvViewerData.getViewerSnapshot(state.deviceId).then(handleFetchSuccess, handleFetchFailure);
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') fetchSnapshot();
  }

  function startPolling() {
    if (state.pollTimer) window.clearInterval(state.pollTimer);
    state.pollTimer = window.setInterval(fetchSnapshot, POLL_INTERVAL_MS);
    window.addEventListener('online', fetchSnapshot);
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  // ---- pairing ----

  function normalizeCode(raw) {
    return (raw || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').trim();
  }

  var pairingSubmitLocked = false;

  function handlePairingSubmit(e) {
    e.preventDefault();
    if (pairingSubmitLocked) return;

    var code = normalizeCode(pairingCodeInput.value);
    if (!code) {
      setPairingMessage('Enter the code shown on the dashboard.', 'error');
      return;
    }

    setPairingMessage('', null);
    pairingSubmitLocked = true;
    pairingSubmitBtn.disabled = true;
    pairingSubmitBtn.textContent = 'Connecting…';

    dvViewerData.redeemPairingCode(code).then(function (result) {
      storeDeviceId(result.deviceId);
      state.deviceId = result.deviceId;
      pairingSubmitLocked = false;
      pairingSubmitBtn.disabled = false;
      pairingSubmitBtn.textContent = 'Connect';
      pairingCodeInput.value = '';
      startPolling();
      fetchSnapshot();
    }, function () {
      // A light client-side throttle only — not a substitute for real
      // server-side rate limiting, which is out of scope for this slice.
      window.setTimeout(function () {
        pairingSubmitLocked = false;
        pairingSubmitBtn.disabled = false;
      }, 1500);
      pairingSubmitBtn.textContent = 'Connect';
      setPairingMessage('That code is not valid or has expired. Ask your family member for a new code.', 'error');
    });
  }

  // ---- init ----

  function init() {
    showOnly('loading');
    loadingMessageEl.textContent = 'Daily View is getting ready…';

    var storedId = getStoredDeviceId();
    var cache = readCache();

    // Read the cache synchronously before the first network call resolves,
    // so a warm reload shows the last-known screen instantly (spec §12.1),
    // then reconciles once the live fetch below returns.
    if (storedId && cache && cache.data) {
      state.deviceId = storedId;
      renderViewer(cache.data);
    }

    pairingForm.addEventListener('submit', handlePairingSubmit);

    dvViewerData.ensureDeviceSession().then(function () {
      if (storedId) {
        state.deviceId = storedId;
        startPolling();
        fetchSnapshot();
      } else {
        showOnly('pairing');
      }
    }, function (error) {
      // Anonymous sign-in itself failing (most likely: "Allow anonymous
      // sign-ins" not enabled on the Supabase project) is a distinct,
      // non-connectivity failure — retrying won't help, so it gets its own
      // calm message rather than the generic reconnecting state.
      console.error('Daily View: could not start a device session', error);
      loadingMessageEl.textContent = 'Daily View could not start. Please contact support.';
      showOnly('loading');
    });
  }

  init();
})();
