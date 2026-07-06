-- Daily View dashboard: Today page foundation.
-- Adds: dv_get_today_view_model() RPC, supporting indexes, RLS + least-privilege
-- grants for the event lookup tables (type/status/visibility/accuracy/source),
-- an updated_at trigger on dv_event, and a server-side visibility-enforcement
-- backstop for dv_event.
--
-- Scope note: this project also hosts an unrelated schema (block/cube/cuboid/...)
-- for a separate app. Nothing here touches any table outside the dv_ prefix.
--
-- Verified against the live schema before writing this file (informal spec
-- docs used different lookup value names in places, e.g. the real
-- dv_event_visibility value is 'supporters_only', not 'account_only'; the real
-- dv_event_source value for this dashboard is 'web_dashboard', not 'dashboard').

-- ============================================================================
-- 1. Supporting indexes
-- ============================================================================

create index if not exists dv_event_account_date_start_idx
  on public.dv_event (account_id, event_date, start_time)
  where deleted_at is null;

create index if not exists dv_event_account_display_date_idx
  on public.dv_event (account_id, show_on_display, event_date)
  where deleted_at is null;

create index if not exists dv_device_account_active_idx
  on public.dv_device (account_id, is_active)
  where deleted_at is null;

-- ============================================================================
-- 2. Event lookup tables: read access for authenticated users
-- ============================================================================
-- These are small fixed reference tables (event type/status/visibility/
-- accuracy/source), not account-scoped, so a blanket authenticated-read policy
-- is safe. RLS is already enabled on every dv_ table in this project (per the
-- prior migration's own note) but no policies exist yet for these five, so
-- they are currently unreadable by anon/authenticated despite broad legacy
-- grants. Tighten those grants to least-privilege here, matching the pattern
-- already established for dv_user/dv_account/etc.

create policy dv_event_type_select_authenticated on public.dv_event_type
  for select to authenticated using (true);

create policy dv_event_status_select_authenticated on public.dv_event_status
  for select to authenticated using (true);

create policy dv_event_visibility_select_authenticated on public.dv_event_visibility
  for select to authenticated using (true);

create policy dv_event_accuracy_select_authenticated on public.dv_event_accuracy
  for select to authenticated using (true);

create policy dv_event_source_select_authenticated on public.dv_event_source
  for select to authenticated using (true);

revoke all on table
  public.dv_event_type,
  public.dv_event_status,
  public.dv_event_visibility,
  public.dv_event_accuracy,
  public.dv_event_source
from anon;

revoke all on table
  public.dv_event_type,
  public.dv_event_status,
  public.dv_event_visibility,
  public.dv_event_accuracy,
  public.dv_event_source
from authenticated;

grant select on table
  public.dv_event_type,
  public.dv_event_status,
  public.dv_event_visibility,
  public.dv_event_accuracy,
  public.dv_event_source
to authenticated;

-- ============================================================================
-- 3. dv_event: updated_at trigger
-- ============================================================================
-- No trigger existed on dv_event prior to this migration (confirmed against
-- the live schema) — the column default only fires on insert.

create or replace function public.dv_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger dv_event_set_updated_at
  before update on public.dv_event
  for each row execute function public.dv_set_updated_at();

-- ============================================================================
-- 4. dv_event: visibility-enforcement backstop
-- ============================================================================
-- Server-side backstop for the dashboard rule "private/supporters_only
-- visibility must not be shown on the display" — holds even if client code is
-- buggy or bypassed.

create or replace function public.dv_event_enforce_visibility()
returns trigger
language plpgsql
as $$
begin
  if new.event_visibility_id in (
    select event_visibility_id from public.dv_event_visibility
    where event_visibility in ('private', 'supporters_only')
  ) then
    new.show_on_display := false;
  end if;
  return new;
end;
$$;

create trigger dv_event_enforce_visibility
  before insert or update on public.dv_event
  for each row execute function public.dv_event_enforce_visibility();

-- ============================================================================
-- 5. dv_get_today_view_model()
-- ============================================================================
-- Single source of truth for "what does the viewer see today" — the Today
-- page's live preview must only ever reflect this function's output, never a
-- separately re-implemented filter. Membership-checked; never trusts a
-- client-supplied account id without verifying active membership first.

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
    'message', null,
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
