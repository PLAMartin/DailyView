-- Daily View dashboard: Messages page foundation.
-- Adds: dv_display_message table (short, high-priority temporary display
-- notices — spec section 6.1), supporting index, updated_at trigger, RLS,
-- least-privilege grants, and wires the active message into
-- dv_get_today_view_model()'s 'message' field, which the prior migration
-- left hardcoded to null specifically anticipating this table.
--
-- Scope note: this project also hosts an unrelated schema (block/cube/cuboid/...)
-- for a separate app. Nothing here touches any table outside the dv_ prefix.

-- ============================================================================
-- 1. dv_display_message
-- ============================================================================

create table if not exists public.dv_display_message (
  message_id         bigint generated always as identity primary key,
  account_id         integer not null references public.dv_account(account_id),
  message            text not null check (char_length(message) <= 220),
  start_at           timestamptz null,
  end_at             timestamptz null,
  display_priority   smallint not null default 1,
  is_active          boolean not null default true,
  show_on_display    boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by_user_id integer null references public.dv_user(user_id),
  updated_by_user_id integer null references public.dv_user(user_id),
  deleted_at         timestamptz null,
  deleted_by_user_id integer null references public.dv_user(user_id),
  constraint dv_display_message_end_after_start
    check (end_at is null or start_at is null or end_at > start_at)
);

create index if not exists dv_display_message_account_active_idx
  on public.dv_display_message (account_id, is_active, start_at, end_at)
  where deleted_at is null;

create trigger dv_display_message_set_updated_at
  before update on public.dv_display_message
  for each row execute function public.dv_set_updated_at();

-- ============================================================================
-- 2. Row Level Security
-- ============================================================================
-- Read for active account members; create/update/delete requires
-- can_manage_events (spec section 9.1 RLS policy summary table).

alter table public.dv_display_message enable row level security;

create policy dv_display_message_select_member on public.dv_display_message
  for select to authenticated
  using (
    exists (
      select 1 from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = dv_display_message.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
    )
  );

create policy dv_display_message_insert_manage on public.dv_display_message
  for insert to authenticated
  with check (
    exists (
      select 1 from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = dv_display_message.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
        and au.can_manage_events = true
    )
  );

create policy dv_display_message_update_manage on public.dv_display_message
  for update to authenticated
  using (
    exists (
      select 1 from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = dv_display_message.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
        and au.can_manage_events = true
    )
  )
  with check (
    exists (
      select 1 from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = dv_display_message.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
        and au.can_manage_events = true
    )
  );

create policy dv_display_message_delete_manage on public.dv_display_message
  for delete to authenticated
  using (
    exists (
      select 1 from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = dv_display_message.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
        and au.can_manage_events = true
    )
  );

-- ============================================================================
-- 3. Least-privilege grants
-- ============================================================================

revoke all on table public.dv_display_message from anon;
revoke all on table public.dv_display_message from authenticated;
grant select, insert, update, delete on table public.dv_display_message to authenticated;

-- ============================================================================
-- 4. dv_get_today_view_model(): populate the 'message' field
-- ============================================================================
-- Full function body reproduced (create or replace requires it) — the only
-- change from 20260706112913_dv_today_page.sql is the new v_message lookup
-- and passing it into the returned jsonb instead of a hardcoded null.
-- Highest-priority (lowest display_priority number) active message wins;
-- ties broken by most recently updated, matching spec section 14.3.

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
  v_day_period             text;
  v_events                 jsonb;
  v_next                   jsonb;
  v_message                text;
  v_device_mode            text;
  v_status_cancelled_id    integer;
  v_visibility_display_id  integer;
begin
  if not exists (
    select 1
    from public.dv_account_user au
    join public.dv_user u on u.user_id = au.user_id
    where au.account_id = p_account_id
      and u.auth_user_id = auth.uid()
      and u.is_active = true
      and au.deleted_at is null
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
