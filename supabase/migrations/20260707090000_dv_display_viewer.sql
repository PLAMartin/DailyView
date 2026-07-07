-- Daily View viewer screen (/display/): device-side identity and data access.
--
-- Until now dv_device has been entirely dashboard-side: a carer generates a
-- pairing_code/pairing_code_expires_at pair and shows it as a QR/code, but
-- nothing has ever redeemed it (20260706150000_dv_device_pairing.sql's own
-- comment already anticipated this, reserving device_secret_hash "for a
-- future device-redemption endpoint"). This migration is that endpoint's
-- Postgres side, built on Supabase anonymous authentication rather than a
-- bespoke secret-token scheme, so the device gets a real auth.uid() and can
-- reuse this schema's existing auth.uid()-keyed RLS conventions instead of a
-- second, parallel authorization mechanism.
--
-- Scope note: this project also hosts an unrelated schema (block/cube/cuboid/...)
-- for a separate app. Nothing here touches any table outside the dv_ prefix.
--
-- Pre-flight dependency (not something this migration can set): the Supabase
-- project's Authentication settings must have "Allow anonymous sign-ins"
-- turned on, or supabase.auth.signInAnonymously() fails client-side before
-- any of this is ever reached.

-- ============================================================================
-- 1. dv_device.auth_user_id — links one anonymous auth session to one device
-- ============================================================================

alter table public.dv_device
  add column if not exists auth_user_id uuid null;

-- Guarantees one anonymous session can never end up linked to two devices,
-- which is what keeps every auth_user_id lookup below unambiguous.
create unique index if not exists dv_device_auth_user_id_uq
  on public.dv_device (auth_user_id)
  where auth_user_id is not null and deleted_at is null;

create index if not exists dv_device_auth_user_active_idx
  on public.dv_device (auth_user_id)
  where is_active = true and deleted_at is null;

-- ============================================================================
-- 2. RLS: a device may read its own dv_device row
-- ============================================================================
-- Additive alongside the existing dv_device_select_member policy from
-- 20260705163726_dv_login_access.sql -- Postgres OR's multiple permissive
-- SELECT policies together, so dashboard members keep working unchanged.
-- Unlike the two prior 42P17 recursion bugs (20260706115011, 20260706180000),
-- this policy only reads columns on dv_device itself -- no self-referencing
-- subquery, so there is no recursion risk here.
--
-- No write policy is added for the device role: every device write goes
-- through the SECURITY DEFINER RPCs below instead, so the device's writable
-- surface is exactly one column (last_seen_at, via dv_touch_device_heartbeat)
-- rather than anything RLS would have to restrict column-by-column.

create policy dv_device_select_own_device on public.dv_device
  for select to authenticated
  using (
    auth_user_id = auth.uid()
    and is_active = true
    and deleted_at is null
  );

-- ============================================================================
-- 3. dv_get_today_view_model(): add a device-auth branch
-- ============================================================================
-- Full function body reproduced (create or replace requires it), matching
-- this repo's established pattern (see 20260706140000_dv_display_message.sql,
-- which did the same to add the message lookup). The only change is the
-- authorization check at the top: it now accepts EITHER an authenticated
-- dashboard account member OR a device-authenticated session for its own
-- active device on this account. A thin wrapper RPC could not do this
-- instead -- SECURITY DEFINER changes the privilege role used for internal
-- queries, it does not change auth.uid() (a session-level value) -- so the
-- authorization branch has to live inside this function itself. No existing
-- caller passes p_device_id today (dashboard/today.js's getTodayViewModel()
-- never does), so this is purely additive for every current call site.

create or replace function public.dv_get_today_view_model(
  p_account_id integer,
  p_device_id  integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_account                record;
  v_pref                   record;
  v_local_ts               timestamp;
  v_local_date             date;
  v_local_time             time;
  v_day_period              text;
  v_events                 jsonb;
  v_next                    jsonb;
  v_message                 text;
  v_device_mode             text;
  v_status_cancelled_id    integer;
  v_visibility_display_id  integer;
begin
  if not (
    exists (
      select 1
      from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = p_account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
    )
    or (
      p_device_id is not null
      and exists (
        select 1
        from public.dv_device d
        where d.device_id = p_device_id
          and d.account_id = p_account_id
          and d.auth_user_id = auth.uid()
          and d.is_active = true
          and d.deleted_at is null
      )
    )
  ) then
    raise exception 'not authorized for account %', p_account_id using errcode = '42501';
  end if;

  select a.* into v_account from public.dv_account a where a.account_id = p_account_id;
  if not found then
    raise exception 'account % not found', p_account_id;
  end if;

  select dp.* into v_pref
  from public.dv_display_preference dp
  where dp.account_id = p_account_id and dp.user_id is null
  limit 1;

  v_local_ts   := now() at time zone v_account.timezone;
  v_local_date := v_local_ts::date;
  v_local_time := v_local_ts::time;

  v_day_period :=
    case
      when v_local_time >= v_account.night_start_time then 'night'
      when v_local_time >= v_account.evening_start_time then 'evening'
      when v_local_time >= v_account.afternoon_start_time then 'afternoon'
      when v_local_time >= v_account.morning_start_time then 'morning'
      else 'night'
    end;

  select event_status_id into v_status_cancelled_id
    from public.dv_event_status where event_status = 'cancelled';
  select event_visibility_id into v_visibility_display_id
    from public.dv_event_visibility where event_visibility = 'display';

  -- Both v_events and v_next are computed from a single WITH...SELECT below.
  -- A CTE's visibility does not extend past the one SQL statement it is
  -- attached to in PL/pgSQL, so "eligible" must be referenced only within
  -- this one statement (an earlier draft split this into two statements and
  -- failed with "relation eligible does not exist" on the second).
  with eligible as (
    select
      e.event_id,
      e.title,
      e.start_time,
      e.end_time,
      e.display_priority,
      e.created_at,
      case
        when e.end_time is not null then e.end_time < v_local_time
        when e.start_time is not null then e.start_time < v_local_time
        else false
      end as is_past
    from public.dv_event e
    where e.account_id = p_account_id
      and e.event_date = v_local_date
      and e.deleted_at is null
      and e.show_on_display = true
      and e.event_visibility_id = v_visibility_display_id
      and e.event_status_id is distinct from v_status_cancelled_id
  ),
  filtered as (
    select *
    from eligible
    where coalesce(v_pref.show_past_events, true) = true or not is_past
    order by display_priority, start_time nulls last, created_at
    limit greatest(coalesce(v_account.max_events_shown, 3), 0)
  )
  select
    coalesce(
      (select jsonb_agg(
        jsonb_build_object(
          'eventId', event_id,
          'title', title,
          'timeLabel', case when start_time is not null then to_char(start_time, 'HH24:MI') else null end,
          'isPast', is_past
        )
        order by display_priority, start_time nulls last, created_at
      ) from filtered),
      '[]'::jsonb
    ),
    (select jsonb_build_object('title', title, 'timeLabel', to_char(start_time, 'HH24:MI'))
     from eligible
     where not is_past and start_time is not null
     order by start_time
     limit 1)
  into v_events, v_next;

  select dm.message
  into v_message
  from public.dv_display_message dm
  where dm.account_id = p_account_id
    and dm.deleted_at is null
    and dm.is_active = true
    and dm.show_on_display = true
    and (dm.start_at is null or dm.start_at <= now())
    and (dm.end_at is null or dm.end_at >= now())
  order by dm.display_priority asc, dm.updated_at desc
  limit 1;

  if p_device_id is not null then
    select dm.display_mode
    into v_device_mode
    from public.dv_device d
    join public.dv_device_display_mode dm on dm.display_mode_id = d.display_mode_id
    where d.device_id = p_device_id
      and d.account_id = p_account_id
      and d.deleted_at is null;
  end if;

  return jsonb_build_object(
    'accountName', v_account.account_name,
    'dateLabel', to_char(v_local_date, 'FMDay, FMDD FMMonth YYYY'),
    'timeLabel', to_char(v_local_time, 'HH24:MI'),
    'dayPeriod', v_day_period,
    'message', v_message,
    'events', v_events,
    'nextEvent', v_next,
    'preferences', jsonb_build_object(
      'fontSize', coalesce(v_pref.font_size, 'standard'),
      'contrast', coalesce(v_pref.contrast, 'standard'),
      'layout', coalesce(v_pref.layout, 'standard')
    ),
    'deviceDisplayMode', v_device_mode,
    'showNextReminder', coalesce(v_account.show_next_reminder, true),
    'showDayPeriod', coalesce(v_account.show_day_period, true)
  );
end;
$$;

revoke all on function public.dv_get_today_view_model(integer, integer) from public;
revoke all on function public.dv_get_today_view_model(integer, integer) from anon;
grant execute on function public.dv_get_today_view_model(integer, integer) to authenticated;

-- ============================================================================
-- 4. dv_get_viewer_snapshot(): device-facing entry point
-- ============================================================================
-- Deliberately thin: it does not duplicate the authorization check above
-- (that would drift into two copies of the same logic over time). It only
-- resolves account_id/device_name/timezone for the given device id, then
-- delegates the actual authorized payload to dv_get_today_view_model, which
-- raises 42501 itself if this session isn't that device's own active row.
-- timezone is the one genuinely new field beyond what dv_get_today_view_model
-- already returns -- the dashboard has account.timezone from
-- dv_get_my_account_access() client-side already; the viewer has no other
-- source for it and needs it to run its own per-second local clock.

create or replace function public.dv_get_viewer_snapshot(p_device_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_account_id integer;
  v_device_name text;
  v_timezone text;
  v_model jsonb;
begin
  select d.account_id, d.device_name, a.timezone
  into v_account_id, v_device_name, v_timezone
  from public.dv_device d
  join public.dv_account a on a.account_id = d.account_id
  where d.device_id = p_device_id
    and d.deleted_at is null;

  if not found then
    raise exception 'device % not found', p_device_id using errcode = '42501';
  end if;

  -- Raises 42501 itself if this session is not p_device_id's own active,
  -- paired device -- see the authorization branch added in section 3 above.
  v_model := public.dv_get_today_view_model(v_account_id, p_device_id);

  return v_model || jsonb_build_object(
    'deviceId', p_device_id,
    'deviceName', v_device_name,
    'timezone', v_timezone
  );
end;
$$;

revoke all on function public.dv_get_viewer_snapshot(integer) from public;
revoke all on function public.dv_get_viewer_snapshot(integer) from anon;
grant execute on function public.dv_get_viewer_snapshot(integer) to authenticated;

-- ============================================================================
-- 5. dv_redeem_device_pairing_code(): device-side claim
-- ============================================================================
-- Called by an anonymous session immediately after signInAnonymously(),
-- before the session has any other link to a device. Consumes the plaintext
-- pairing_code dashboard/devices.js already generates and displays as a
-- QR/code (20260706150000_dv_device_pairing.sql's own comment anticipated
-- this exact consumer). `for update` serializes concurrent redemption
-- attempts against the same row, closing the race where two anonymous
-- sessions both pass the "auth_user_id is null" check before either commits.

create or replace function public.dv_redeem_device_pairing_code(p_pairing_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text := upper(trim(p_pairing_code));
  v_device record;
begin
  if auth.uid() is null then
    raise exception 'no session' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.dv_device
    where auth_user_id = auth.uid() and deleted_at is null
  ) then
    raise exception 'this session is already linked to a device' using errcode = '42501';
  end if;

  select * into v_device
  from public.dv_device
  where pairing_code = v_code
    and pairing_code_expires_at > now()
    and auth_user_id is null
    and deleted_at is null
  order by created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'pairing code invalid or expired' using errcode = 'P0002';
  end if;

  update public.dv_device
  set auth_user_id = auth.uid(),
      paired_at = now(),
      is_active = true,
      pairing_code = null,
      pairing_code_expires_at = null
  where device_id = v_device.device_id;

  return jsonb_build_object('deviceId', v_device.device_id, 'deviceName', v_device.device_name);
end;
$$;

revoke all on function public.dv_redeem_device_pairing_code(text) from public;
revoke all on function public.dv_redeem_device_pairing_code(text) from anon;
grant execute on function public.dv_redeem_device_pairing_code(text) to authenticated;

-- ============================================================================
-- 6. dv_touch_device_heartbeat(): device-side heartbeat
-- ============================================================================
-- A dedicated RPC rather than a raw table UPDATE from the browser: it lets
-- the device update last_seen_at without adding any new UPDATE RLS policy
-- for the device on dv_device at all -- the existing dv_device_update_manage
-- policy stays scoped to real account members only, and the device's
-- writable surface is exactly this one column via this one call.

create or replace function public.dv_touch_device_heartbeat(p_device_id integer)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.dv_device
  set last_seen_at = now()
  where device_id = p_device_id
    and auth_user_id = auth.uid()
    and is_active = true
    and deleted_at is null;
$$;

revoke all on function public.dv_touch_device_heartbeat(integer) from public;
revoke all on function public.dv_touch_device_heartbeat(integer) from anon;
grant execute on function public.dv_touch_device_heartbeat(integer) to authenticated;
