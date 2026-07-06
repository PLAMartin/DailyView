(function () {
  'use strict';

  var cfg = window.DAILY_VIEW_AUTH_CONFIG;

  // Separate client instance from dv-auth.js (which does not expose its own).
  // Both read/write the same persisted Supabase session in localStorage
  // (keyed by project URL), so auth state stays in sync across the two.
  var sb = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce'
    }
  });

  var EVENT_SELECT =
    'event_id, account_id, title, description, event_date, start_time, end_time, ' +
    'display_priority, show_on_display, created_at, updated_at, ' +
    'event_type_id, event_status_id, event_visibility_id, event_accuracy_id, ' +
    'dv_event_type(event_type), ' +
    'dv_event_status(event_status), ' +
    'dv_event_visibility(event_visibility), ' +
    'dv_event_accuracy(event_accuracy)';

  var eventLookupsCache = null;

  function getTodayViewModel(accountId, deviceId) {
    return sb.rpc('dv_get_today_view_model', {
      p_account_id: accountId,
      p_device_id: deviceId || null
    }).then(function (result) {
      if (result.error) throw result.error;
      return result.data;
    });
  }

  function listTodayEvents(accountId, isoDate) {
    return sb
      .from('dv_event')
      .select(EVENT_SELECT)
      .eq('account_id', accountId)
      .eq('event_date', isoDate)
      .is('deleted_at', null)
      .order('display_priority', { ascending: true })
      .order('start_time', { ascending: true, nullsFirst: false })
      .then(function (result) {
        if (result.error) throw result.error;
        return result.data;
      });
  }

  function createEvent(payload) {
    return sb
      .from('dv_event')
      .insert(payload)
      .select(EVENT_SELECT)
      .single()
      .then(function (result) {
        if (result.error) throw result.error;
        return result.data;
      });
  }

  function updateEvent(eventId, patch) {
    return sb
      .from('dv_event')
      .update(patch)
      .eq('event_id', eventId)
      .select(EVENT_SELECT)
      .single()
      .then(function (result) {
        if (result.error) throw result.error;
        return result.data;
      });
  }

  // event_status_id 3 = 'cancelled' (seeded lookup value, confirmed against
  // the live schema — see supabase/migrations/20260706112913_dv_today_page.sql).
  function cancelEvent(eventId, byUserId) {
    return updateEvent(eventId, {
      event_status_id: 3,
      updated_by_user_id: byUserId
    });
  }

  function deleteEvent(eventId, byUserId) {
    return sb
      .from('dv_event')
      .update({ deleted_at: new Date().toISOString(), deleted_by_user_id: byUserId })
      .eq('event_id', eventId)
      .then(function (result) {
        if (result.error) throw result.error;
        return true;
      });
  }

  function listEventLookups() {
    if (eventLookupsCache) return Promise.resolve(eventLookupsCache);

    return Promise.all([
      sb.from('dv_event_type').select('event_type_id, event_type').eq('is_active', true).order('event_type_id'),
      sb.from('dv_event_visibility').select('event_visibility_id, event_visibility').order('event_visibility_id'),
      sb.from('dv_event_accuracy').select('event_accuracy_id, event_accuracy').order('event_accuracy_id')
    ]).then(function (results) {
      for (var i = 0; i < results.length; i++) {
        if (results[i].error) throw results[i].error;
      }
      eventLookupsCache = {
        eventTypes: results[0].data,
        visibilities: results[1].data,
        accuracies: results[2].data
      };
      return eventLookupsCache;
    });
  }

  function listDevices(accountId) {
    return sb
      .from('dv_device')
      .select('device_id, device_name, is_active, last_seen_at, updated_at')
      .eq('account_id', accountId)
      .is('deleted_at', null)
      .order('device_name', { ascending: true })
      .then(function (result) {
        if (result.error) throw result.error;
        return result.data;
      });
  }

  window.dvDashboardData = {
    getTodayViewModel: getTodayViewModel,
    listTodayEvents: listTodayEvents,
    createEvent: createEvent,
    updateEvent: updateEvent,
    cancelEvent: cancelEvent,
    deleteEvent: deleteEvent,
    listEventLookups: listEventLookups,
    listDevices: listDevices
  };
})();
