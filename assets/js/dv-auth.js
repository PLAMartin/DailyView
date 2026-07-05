(function () {
  'use strict';

  var cfg = window.DAILY_VIEW_AUTH_CONFIG;

  // Only ever expose the public anon/publishable key here — never a
  // service-role key. Data protection is enforced by Supabase RLS, not by
  // hiding this key.
  var sb = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // detectSessionInUrl is off: /auth/callback/ and /reset-password/
      // exchange the PKCE `code` param themselves via exchangeCodeFromUrl(),
      // so there is exactly one place that handles the URL, not two racing.
      detectSessionInUrl: false,
      flowType: 'pkce'
    }
  });

  // Only internal destinations a caller-supplied `next` value may resolve
  // to. Anything else (an external URL, an unlisted path) falls back to
  // DEFAULT_NEXT_PATH. This is what keeps `?next=https://example.com` inert.
  var ALLOWED_NEXT_PATHS = ['/dashboard/'];
  var DEFAULT_NEXT_PATH = '/dashboard/';

  function getSafeNextPath(rawNext) {
    if (typeof rawNext === 'string' && ALLOWED_NEXT_PATHS.indexOf(rawNext) !== -1) {
      return rawNext;
    }
    return DEFAULT_NEXT_PATH;
  }

  function normalizeEmail(email) {
    return (email || '').trim().toLowerCase();
  }

  function getSession() {
    return sb.auth.getSession().then(function (result) {
      return result.data.session;
    });
  }

  function getCurrentUser() {
    return sb.auth.getUser().then(function (result) {
      return result.data.user;
    });
  }

  function signInWithPassword(email, password) {
    return sb.auth.signInWithPassword({
      email: normalizeEmail(email),
      password: password
    });
  }

  function sendMagicLink(email, redirectPath) {
    var nextPath = getSafeNextPath(redirectPath);
    return sb.auth.signInWithOtp({
      email: normalizeEmail(email),
      options: {
        emailRedirectTo: cfg.siteUrl + '/auth/callback/?next=' + encodeURIComponent(nextPath),
        shouldCreateUser: false
      }
    });
  }

  function sendPasswordReset(email) {
    return sb.auth.resetPasswordForEmail(normalizeEmail(email), {
      redirectTo: cfg.siteUrl + '/reset-password/'
    });
  }

  function completePasswordReset(newPassword) {
    return sb.auth.updateUser({ password: newPassword });
  }

  function signOut() {
    return sb.auth.signOut({ scope: 'local' });
  }

  function getMyAccountAccess() {
    return sb.rpc('dv_get_my_account_access');
  }

  // Answers "does this signed-in visitor have a usable Daily View account?"
  // Never trusts membership data from anywhere but this RPC call.
  function requireDailyViewAccess() {
    return getSession().then(function (session) {
      if (!session) {
        return { ok: false, reason: 'no-session' };
      }
      return getMyAccountAccess().then(function (result) {
        if (result.error) {
          return { ok: false, reason: 'network' };
        }
        var accounts = result.data || [];
        if (accounts.length === 0) {
          return signOut().then(function () {
            return { ok: false, reason: 'no-access' };
          });
        }
        return { ok: true, accounts: accounts };
      }, function () {
        return { ok: false, reason: 'network' };
      });
    }, function () {
      return { ok: false, reason: 'network' };
    });
  }

  // Removes one-time auth params (?code=, ?error=, ...) from the visible
  // URL via history replacement, without a page reload.
  function stripAuthParamsFromUrl() {
    var url = new URL(window.location.href);
    ['code', 'error', 'error_code', 'error_description', 'type'].forEach(function (p) {
      url.searchParams.delete(p);
    });
    var qs = url.searchParams.toString();
    window.history.replaceState({}, document.title, url.pathname + (qs ? '?' + qs : '') + url.hash);
  }

  // Shared by /auth/callback/ and /reset-password/: both land with a PKCE
  // `code` param that must be exchanged for a session before anything else
  // happens. Returns hadCode:false when there is nothing to exchange, so a
  // caller can distinguish "no code present" from "code exchange failed".
  function exchangeCodeFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var errorParam = params.get('error');
    if (errorParam) {
      stripAuthParamsFromUrl();
      return Promise.resolve({ data: null, error: { message: errorParam }, hadCode: false });
    }
    var code = params.get('code');
    if (!code) {
      return Promise.resolve({ data: null, error: null, hadCode: false });
    }
    return sb.auth.exchangeCodeForSession(code).then(function (result) {
      stripAuthParamsFromUrl();
      return { data: result.data, error: result.error, hadCode: true };
    });
  }

  window.dvAuth = {
    getSession: getSession,
    getCurrentUser: getCurrentUser,
    signInWithPassword: signInWithPassword,
    sendMagicLink: sendMagicLink,
    sendPasswordReset: sendPasswordReset,
    completePasswordReset: completePasswordReset,
    signOut: signOut,
    getMyAccountAccess: getMyAccountAccess,
    requireDailyViewAccess: requireDailyViewAccess,
    getSafeNextPath: getSafeNextPath,
    exchangeCodeFromUrl: exchangeCodeFromUrl,
    stripAuthParamsFromUrl: stripAuthParamsFromUrl
  };
})();
