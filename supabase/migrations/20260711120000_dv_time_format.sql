-- Daily View dashboard: time format display setting.
-- Adds a 12-hour/24-hour toggle for how times are shown on the display
-- (default 12-hour, e.g. "5:00 pm"; 24-hour shows e.g. "17:00").
--
-- Scope note: this project also hosts an unrelated schema (block/cube/cuboid/...)
-- for a separate app. Nothing here touches any table outside the dv_ prefix.

-- ============================================================================
-- 1. dv_display_preference.time_format
-- ============================================================================

alter table public.dv_display_preference
  add column if not exists time_format text not null default '12_hour';

alter table public.dv_display_preference
  drop constraint if exists dv_display_preference_time_format_check;

alter table public.dv_display_preference
  add constraint dv_display_preference_time_format_check
  check (time_format in ('12_hour', '24_hour'));

-- ============================================================================
-- 2. dv_get_today_view_model(): format timeLabel per account's time_format
-- ============================================================================
-- Full function body reproduced (create or replace requires it), matching
-- this repo's established pattern (see 20260706140000_dv_display_message.sql
-- and 20260707090000_dv_display_viewer.sql, which did the same). The only
-- change is v_time_fmt below, used in place of the hardcoded 'HH24:MI'
-- to_char template everywhere a timeLabel is built -- 'FMHH12:MI am' gives
-- lowercase, no-leading-zero 12-hour times (e.g. "5:00 pm") for the 12-hour
-- default; 'HH24:MI' is unchanged for the 24-hour choice. The FM modifier
-- only suppresses padding on the item immediately following it (HH12 here),
-- so minutes stay zero-padded ("5:00", not "5:0").

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
    (select jsonb_build_object('title', title, 'timeLabel', to_char(start_time, v_time_fmt))
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
    'timeLabel', to_char(v_local_time, v_time_fmt),
    'dayPeriod', v_day_period,
    'message', v_message,
    'events', v_events,
    'nextEvent', v_next,
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
