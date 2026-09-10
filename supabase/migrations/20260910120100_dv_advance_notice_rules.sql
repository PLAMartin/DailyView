-- Daily View display: frequency-aware "coming up" advance notice.
--
-- 20260817220200_dv_upcoming_reminder.sql picked the single nearest event with
-- `series_id is not null` inside one account-wide window. That rule only holds while the only
-- recurring events are yearly. Now that weekly/monthly series exist
-- (20260910120000_dv_event_series_frequencies.sql), it breaks three ways:
--
--   1. A weekly event is always within the window, so the COMING UP card would never change --
--      notice becomes wallpaper on a display designed for low cognitive load.
--   2. Ordering by date alone means a frequent event always beats a rare one to the single
--      slot: bowls club tomorrow displaces Mum's birthday in three days, which is backwards.
--   3. Gating on `series_id is not null` means a one-off hospital appointment next Tuesday --
--      the thing most worth flagging -- can never produce a card at all.
--
-- This migration resolves notice length per event (event override -> series override ->
-- dv_default_notice_days() by frequency), and breaks ties by rarity via
-- dv_series_freq_rank(). An explicit per-event override ranks above everything, because a
-- carer setting it is a deliberate act.
--
-- Still deliberately a single item, not a list -- see the note at
-- 20260817220200_dv_upcoming_reminder.sql:5-7.
--
-- dv_get_viewer_snapshot() (20260707090000_dv_display_viewer.sql) delegates to
-- dv_get_today_view_model() and returns its jsonb as-is, so the real display picks this up
-- with no change of its own.
--
-- Scope note: this project also hosts an unrelated schema (block/cube/cuboid/...) for a
-- separate app. Nothing here touches any table outside the dv_ prefix.

-- ============================================================================
-- 1. dv_sync_series_occurrences(): carry advance_notice_days to future occurrences
-- ============================================================================
-- Unchanged from 20260817220000_dv_event_series.sql:274-322 apart from adding
-- advance_notice_days to the update list, so a series-level notice change propagates like
-- every other series field: future, non-overridden, non-cancelled occurrences only.

create or replace function public.dv_sync_series_occurrences(p_series_id integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_series         record;
  v_account        record;
  v_local_today    date;
  v_cancelled_id   integer;
  v_updated_count  integer;
begin
  select * into v_series from public.dv_event_series where series_id = p_series_id;
  if not found or v_series.deleted_at is not null then
    return 0;
  end if;

  select a.* into v_account from public.dv_account a where a.account_id = v_series.account_id;
  if not found then
    return 0;
  end if;

  v_local_today := (now() at time zone v_account.timezone)::date;

  select event_status_id into v_cancelled_id
    from public.dv_event_status where event_status = 'cancelled';

  update public.dv_event e
  set title = v_series.title,
      description = v_series.description,
      start_time = v_series.start_time,
      end_time = v_series.end_time,
      event_type_id = v_series.event_type_id,
      event_visibility_id = v_series.event_visibility_id,
      event_accuracy_id = v_series.event_accuracy_id,
      display_priority = v_series.display_priority,
      show_on_display = v_series.show_on_display,
      advance_notice_days = v_series.advance_notice_days,
      updated_by_user_id = v_series.updated_by_user_id
  where e.series_id = v_series.series_id
    and e.series_overridden = false
    and e.deleted_at is null
    and e.event_date >= v_local_today
    and e.event_status_id is distinct from v_cancelled_id;

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;

revoke all on function public.dv_sync_series_occurrences(integer) from public;
revoke all on function public.dv_sync_series_occurrences(integer) from anon;
grant execute on function public.dv_sync_series_occurrences(integer) to authenticated;

-- ============================================================================
-- 2. dv_stop_event_series(): end a series and clear its future occurrences
-- ============================================================================
-- Until now a series could be created but never stopped: is_active was never written from the
-- dashboard, deleteEvent() only soft-deletes a single occurrence, and the top-up cron keeps
-- regenerating. Harmless for a birthday; not harmless for a weekly series.
--
-- p_from_date is the occurrence the carer was looking at when they chose "this one and all
-- future ones", so the cut lands where they expect rather than always at today. Occurrences
-- before it are left alone -- they are a record of what happened -- as are individually
-- overridden ones, which the carer has already edited by hand. The series' end_date is moved
-- back to the day before the cut as well as being deactivated, so that if it is ever
-- reactivated it still will not regenerate what was removed here.

create or replace function public.dv_stop_event_series(
  p_series_id integer,
  p_user_id   integer default null,
  p_from_date date default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_series        record;
  v_account       record;
  v_local_today   date;
  v_cut_date      date;
  v_deleted_count integer;
begin
  select * into v_series from public.dv_event_series where series_id = p_series_id;
  if not found or v_series.deleted_at is not null then
    return 0;
  end if;

  -- security definer bypasses RLS, so re-check the caller's write permission explicitly --
  -- the same can_manage_events gate dv_event_series' own policies apply.
  if not exists (
    select 1
    from public.dv_account_user au
    join public.dv_user u on u.user_id = au.user_id
    where au.account_id = v_series.account_id
      and u.auth_user_id = auth.uid()
      and u.is_active = true
      and au.deleted_at is null
      and au.can_manage_events = true
  ) then
    raise exception 'not authorized to manage events for account %', v_series.account_id
      using errcode = '42501';
  end if;

  select a.* into v_account from public.dv_account a where a.account_id = v_series.account_id;
  v_local_today := (now() at time zone v_account.timezone)::date;
  v_cut_date := coalesce(p_from_date, v_local_today);

  update public.dv_event e
  set deleted_at = now(),
      updated_by_user_id = coalesce(p_user_id, e.updated_by_user_id)
  where e.series_id = p_series_id
    and e.deleted_at is null
    and e.series_overridden = false
    and e.event_date >= v_cut_date;

  get diagnostics v_deleted_count = row_count;

  update public.dv_event_series
  set is_active = false,
      end_date = least(coalesce(end_date, v_cut_date - 1), v_cut_date - 1),
      deleted_at = now(),
      updated_by_user_id = coalesce(p_user_id, updated_by_user_id)
  where series_id = p_series_id;

  return v_deleted_count;
end;
$$;

revoke all on function public.dv_stop_event_series(integer, integer, date) from public;
revoke all on function public.dv_stop_event_series(integer, integer, date) from anon;
grant execute on function public.dv_stop_event_series(integer, integer, date) to authenticated;

-- ============================================================================
-- 3. dv_get_today_view_model(): resolve notice per event, rank by rarity
-- ============================================================================
-- Full function body reproduced (create or replace requires it), matching this repo's
-- established pattern -- see 20260706140000_dv_display_message.sql,
-- 20260707090000_dv_display_viewer.sql, 20260711120000_dv_time_format.sql,
-- 20260726190000_dv_next_event_countdown.sql and 20260817220200_dv_upcoming_reminder.sql,
-- which all did the same. The only change from the previous version is the v_upcoming query.

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
  v_time_fmt               text;
  v_events                 jsonb;
  v_next                    jsonb;
  v_upcoming               jsonb;
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

  v_time_fmt := case when coalesce(v_pref.time_format, '12_hour') = '24_hour'
    then 'HH24:MI' else 'FMHH12:MI am' end;

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
          'timeLabel', case when start_time is not null then to_char(start_time, v_time_fmt) else null end,
          'isPast', is_past
        )
        order by display_priority, start_time nulls last, created_at
      ) from filtered),
      '[]'::jsonb
    ),
    (select jsonb_build_object(
       'title', title,
       'timeLabel', to_char(start_time, v_time_fmt),
       'minutesUntil', round(extract(epoch from (start_time - v_local_time)) / 60)
     )
     from eligible
     where not is_past and start_time is not null
     order by start_time
     limit 1)
  into v_events, v_next;

  -- "Coming up": the single most-worth-mentioning event still ahead of today, where
  -- "worth mentioning" is resolved per event rather than from one account-wide window.
  --   notice length: event override -> series override -> frequency default
  --   tie-break:     explicit override first, then rarest frequency, then soonest
  -- notice_days = 0 (the default for weekly and for un-flagged one-offs) means "never show
  -- this in COMING UP", which is what keeps the card from going stale.
  select jsonb_build_object(
    'title', e.title,
    'dateLabel', to_char(e.event_date, 'FMDay, FMDD FMMonth'),
    'daysUntil', (e.event_date - v_local_date)
  )
  into v_upcoming
  from public.dv_event e
  left join public.dv_event_series s on s.series_id = e.series_id
  cross join lateral (
    select coalesce(
      e.advance_notice_days,
      s.advance_notice_days,
      public.dv_default_notice_days(s.rrule, v_account.upcoming_reminder_lead_days)
    ) as notice_days
  ) n
  where e.account_id = p_account_id
    and e.deleted_at is null
    and e.show_on_display = true
    and e.event_visibility_id = v_visibility_display_id
    and e.event_status_id is distinct from v_status_cancelled_id
    and e.event_date > v_local_date
    and n.notice_days > 0
    and e.event_date <= v_local_date + n.notice_days::integer
  order by
    case when e.advance_notice_days is not null then 0
         else public.dv_series_freq_rank(s.rrule) end,
    e.event_date asc,
    e.display_priority asc
  limit 1;

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
    'timeLabel', to_char(v_local_time, v_time_fmt),
    'dayPeriod', v_day_period,
    'message', v_message,
    'events', v_events,
    'nextEvent', v_next,
    'upcomingReminder', v_upcoming,
    'preferences', jsonb_build_object(
      'fontSize', coalesce(v_pref.font_size, 'standard'),
      'contrast', coalesce(v_pref.contrast, 'standard'),
      'layout', coalesce(v_pref.layout, 'standard'),
      'timeFormat', coalesce(v_pref.time_format, '12_hour')
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
