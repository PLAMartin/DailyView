(function () {
  'use strict';

  var cfg = window.DAILY_VIEW_AUTH_CONFIG;

  // Separate client instance and, importantly, a separate auth.storageKey
  // from dv-auth.js / dv-dashboard-data.js. Those two omit storageKey and so
  // implicitly share one Supabase-persisted-session slot in localStorage
  // (same origin, same default key, by their own code comments). Without a
  // distinct key here, opening /display/ in the same browser as a carer's
  // logged-in dashboard session (e.g. testing pairing on a laptop before
  // installing on the actual tablet) would inherit or clobber the carer's
  // session instead of getting an isolated anonymous device session. This
  // must never happen on a real physical viewer device either, but keeping
  // the storage key distinct makes it impossible by construction rather than
  // relying on the two pages never being open in the same browser.
  var sb = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      storageKey: 'dv-display-auth',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  });

  function getSession() {
    return sb.auth.getSession().then(function (result) {
      return result.data.session;
    });
  }

  // Ensures this browser tab has an anonymous Supabase session, creating one
  // on first visit. Requires "Allow anonymous sign-ins" to be enabled in the
  // Supabase project's Auth settings — signInAnonymously() rejects otherwise,
  // which callers must treat as a distinct, calm error state (not a plain
  // connectivity failure retrying won't fix).
  function ensureDeviceSession() {
    return getSession().then(function (session) {
      if (session) return session;
      return sb.auth.signInAnonymously().then(function (result) {
        if (result.error) throw result.error;
        return result.data.session;
      });
    });
  }

  // dv_get_viewer_snapshot() is the single source of truth for what the
  // viewer shows — see the migration for why a thin RPC wrapper is
  // sufficient here rather than a second copy of the authorization logic.
  function getViewerSnapshot(deviceId) {
    return sb.rpc('dv_get_viewer_snapshot', { p_device_id: deviceId }).then(function (result) {
      if (result.error) throw result.error;
      return result.data;
    });
  }

  function redeemPairingCode(pairingCode) {
    return sb.rpc('dv_redeem_device_pairing_code', { p_pairing_code: pairingCode }).then(function (result) {
      if (result.error) throw result.error;
      return result.data;
    });
  }

  function touchHeartbeat(deviceId) {
    return sb.rpc('dv_touch_device_heartbeat', { p_device_id: deviceId }).then(function (result) {
      if (result.error) throw result.error;
      return result.data;
    });
  }

  window.dvViewerData = {
    ensureDeviceSession: ensureDeviceSession,
    getViewerSnapshot: getViewerSnapshot,
    redeemPairingCode: redeemPairingCode,
    touchHeartbeat: touchHeartbeat
  };
})();
