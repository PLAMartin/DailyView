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
    'event_type_id, event_status_id, event_visibility_id, event_accuracy_id, event_source_id, ' +
    'dv_event_type(event_type), ' +
    'dv_event_status(event_status), ' +
    'dv_event_visibility(event_visibility), ' +
    'dv_event_accuracy(event_accuracy), ' +
    'dv_event_source(event_source)';

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

  function listEventsInRange(accountId, startIsoDate, endIsoDate) {
    return sb
      .from('dv_event')
      .select(EVENT_SELECT)
      .eq('account_id', accountId)
      .gte('event_date', startIsoDate)
      .lte('event_date', endIsoDate)
      .is('deleted_at', null)
      .order('event_date', { ascending: true })
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

  var MESSAGE_SELECT =
    'message_id, account_id, message, start_at, end_at, display_priority, ' +
    'is_active, show_on_display, created_at, updated_at, created_by_user_id, updated_by_user_id';

  function listMessages(accountId) {
    return sb
      .from('dv_display_message')
      .select(MESSAGE_SELECT)
      .eq('account_id', accountId)
      .is('deleted_at', null)
      .order('display_priority', { ascending: true })
      .order('updated_at', { ascending: false })
      .then(function (result) {
        if (result.error) throw result.error;
        return result.data;
      });
  }

  function createMessage(payload) {
    return sb
      .from('dv_display_message')
      .insert(payload)
      .select(MESSAGE_SELECT)
      .single()
      .then(function (result) {
        if (result.error) throw result.error;
        return result.data;
      });
  }

  function updateMessage(messageId, patch) {
    return sb
      .from('dv_display_message')
      .update(patch)
      .eq('message_id', messageId)
      .select(MESSAGE_SELECT)
      .single()
      .then(function (result) {
        if (result.error) throw result.error;
        return result.data;
      });
  }

  function deleteMessage(messageId, byUserId) {
    return sb
      .from('dv_display_message')
      .update({ deleted_at: new Date().toISOString(), deleted_by_user_id: byUserId })
      .eq('message_id', messageId)
      .then(function (result) {
        if (result.error) throw result.error;
        return true;
      });
  }

  // device_secret_hash is deliberately never selected here — spec section 19.3
  // ("avoid exposing hidden fields such as device secrets"). It exists for a
  // future device-redemption endpoint outside this repo.
  var DEVICE_SELECT =
    'device_id, account_id, device_name, device_type_id, display_mode_id, is_active, ' +
    'last_seen_at, paired_at, pairing_code, pairing_code_expires_at, last_refresh_requested_at, ' +
    'created_at, updated_at, ' +
    'dv_device_type(device_type), ' +
    'dv_device_display_mode(display_mode)';

  var deviceLookupsCache = null;

  function listDevices(accountId) {
    return sb
      .from('dv_device')
      .select(DEVICE_SELECT)
      .eq('account_id', accountId)
      .is('deleted_at', null)
      .order('device_name', { ascending: true })
      .then(function (result) {
        if (result.error) throw result.error;
        return result.data;
      });
  }

  function createDevice(payload) {
    return sb
      .from('dv_device')
      .insert(payload)
      .select(DEVICE_SELECT)
      .single()
      .then(function (result) {
        if (result.error) throw result.error;
        return result.data;
      });
  }

  function updateDevice(deviceId, patch) {
    return sb
      .from('dv_device')
      .update(patch)
      .eq('device_id', deviceId)
      .select(DEVICE_SELECT)
      .single()
      .then(function (result) {
        if (result.error) throw result.error;
        return result.data;
      });
  }

  function removeDevice(deviceId, byUserId) {
    return sb
      .from('dv_device')
      .update({ deleted_at: new Date().toISOString(), deleted_by_user_id: byUserId, is_active: false })
      .eq('device_id', deviceId)
      .then(function (result) {
        if (result.error) throw result.error;
        return true;
      });
  }

  function listDeviceLookups() {
    if (deviceLookupsCache) return Promise.resolve(deviceLookupsCache);

    return Promise.all([
      sb.from('dv_device_type').select('device_type_id, device_type').eq('is_active', true).order('device_type_id'),
      sb.from('dv_device_display_mode').select('display_mode_id, display_mode').order('display_mode_id')
    ]).then(function (results) {
      for (var i = 0; i < results.length; i++) {
        if (results[i].error) throw results[i].error;
      }
      deviceLookupsCache = {
        deviceTypes: results[0].data,
        displayModes: results[1].data
      };
      return deviceLookupsCache;
    });
  }

  // Member rows have a composite (account_id, user_id) key — no surrogate id
  // column exists on dv_account_user.
  //
  // dv_account_user has four FKs into dv_user (user_id, created_by_user_id,
  // updated_by_user_id, deleted_by_user_id), so an unqualified `dv_user(...)`
  // embed is ambiguous to PostgREST (PGRST201) and the request fails outright
  // — confirmed live via a direct REST call. The `!fkey_name` hint pins it to
  // the membership's own user.
  var MEMBER_SELECT =
    'account_id, user_id, role_id, permission_id, relationship_to_viewer, is_primary_contact, ' +
    'can_manage_events, can_manage_users, can_manage_devices, can_send_prompts, created_at, ' +
    'dv_user!dv_account_user_user_id_fkey(full_name, preferred_name, email), ' +
    'dv_account_user_role(role), ' +
    'dv_account_user_permission(permission)';

  function listMembers(accountId) {
    return sb
      .from('dv_account_user')
      .select(MEMBER_SELECT)
      .eq('account_id', accountId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .then(function (result) {
        if (result.error) throw result.error;
        return result.data;
      });
  }

  function updateMember(accountId, userId, patch) {
    return sb
      .from('dv_account_user')
      .update(patch)
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .select(MEMBER_SELECT)
      .single()
      .then(function (result) {
        if (result.error) throw result.error;
        return result.data;
      });
  }

  function removeMember(accountId, userId, byUserId) {
    return sb
      .from('dv_account_user')
      .update({ deleted_at: new Date().toISOString(), deleted_by_user_id: byUserId })
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .then(function (result) {
        if (result.error) throw result.error;
        return true;
      });
  }

  var roleAndPermissionCache = null;

  function listRolesAndPermissions() {
    if (roleAndPermissionCache) return Promise.resolve(roleAndPermissionCache);

    return Promise.all([
      sb.from('dv_account_user_role').select('role_id, role').order('role_id'),
      sb.from('dv_account_user_permission').select('permission_id, permission').order('permission_id')
    ]).then(function (results) {
      for (var i = 0; i < results.length; i++) {
        if (results[i].error) throw results[i].error;
      }
      roleAndPermissionCache = {
        roles: results[0].data,
        permissions: results[1].data
      };
      return roleAndPermissionCache;
    });
  }

  // token_hash is deliberately never selected here — it's a one-time
  // credential, never exposed once created (spec section 19.3).
  var INVITE_SELECT =
    'invite_id, account_id, email, role_id, permission_id, relationship_to_viewer, ' +
    'can_manage_events, can_manage_users, can_manage_devices, can_send_prompts, is_primary_contact, ' +
    'expires_at, accepted_at, revoked_at, created_at, ' +
    'dv_account_user_role(role)';

  function listInvites(accountId) {
    return sb
      .from('dv_account_invite')
      .select(INVITE_SELECT)
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .then(function (result) {
        if (result.error) throw result.error;
        return result.data;
      });
  }

  function createInvite(payload) {
    return sb
      .from('dv_account_invite')
      .insert(payload)
      .select(INVITE_SELECT)
      .single()
      .then(function (result) {
        if (result.error) throw result.error;
        return result.data;
      });
  }

  function updateInvite(inviteId, patch) {
    return sb
      .from('dv_account_invite')
      .update(patch)
      .eq('invite_id', inviteId)
      .select(INVITE_SELECT)
      .single()
      .then(function (result) {
        if (result.error) throw result.error;
        return result.data;
      });
  }

  function getAccountSettings(accountId) {
    return sb
      .from('dv_account')
      .select('*')
      .eq('account_id', accountId)
      .single()
      .then(function (result) {
        if (result.error) throw result.error;
        return result.data;
      });
  }

  function updateAccountSettings(accountId, patch) {
    return sb
      .from('dv_account')
      .update(patch)
      .eq('account_id', accountId)
      .select('*')
      .single()
      .then(function (result) {
        if (result.error) throw result.error;
        return result.data;
      });
  }

  // MVP uses one account-level "default" preference row (user_id is null —
  // see spec section 17.3); create it on first visit if none exists yet.
  function getOrCreateDisplayPreference(accountId) {
    return sb
      .from('dv_display_preference')
      .select('*')
      .eq('account_id', accountId)
      .is('user_id', null)
      .maybeSingle()
      .then(function (result) {
        if (result.error) throw result.error;
        if (result.data) return result.data;
        return sb
          .from('dv_display_preference')
          .insert({ account_id: accountId, user_id: null })
          .select('*')
          .single()
          .then(function (insertResult) {
            if (insertResult.error) throw insertResult.error;
            return insertResult.data;
          });
      });
  }

  function updateDisplayPreference(displayPrefId, patch) {
    return sb
      .from('dv_display_preference')
      .update(patch)
      .eq('display_pref_id', displayPrefId)
      .select('*')
      .single()
      .then(function (result) {
        if (result.error) throw result.error;
        return result.data;
      });
  }

  window.dvDashboardData = {
    getTodayViewModel: getTodayViewModel,
    listTodayEvents: listTodayEvents,
    listEventsInRange: listEventsInRange,
    createEvent: createEvent,
    updateEvent: updateEvent,
    cancelEvent: cancelEvent,
    deleteEvent: deleteEvent,
    listEventLookups: listEventLookups,
    listDevices: listDevices,
    createDevice: createDevice,
    updateDevice: updateDevice,
    removeDevice: removeDevice,
    listDeviceLookups: listDeviceLookups,
    listMessages: listMessages,
    createMessage: createMessage,
    updateMessage: updateMessage,
    deleteMessage: deleteMessage,
    listMembers: listMembers,
    updateMember: updateMember,
    removeMember: removeMember,
    listRolesAndPermissions: listRolesAndPermissions,
    listInvites: listInvites,
    createInvite: createInvite,
    updateInvite: updateInvite,
    getAccountSettings: getAccountSettings,
    updateAccountSettings: updateAccountSettings,
    getOrCreateDisplayPreference: getOrCreateDisplayPreference,
    updateDisplayPreference: updateDisplayPreference
  };
})();
