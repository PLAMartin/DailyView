-- Daily View dashboard: weekly / 2-weekly / 4-weekly / monthly recurrence, and the
-- `advance_notice_days` columns that frequency-aware "coming up" notice is built on.
--
-- 20260817220000_dv_event_series.sql shipped dv_event_series with a full RFC 5545 `rrule`
-- column but a generator that understood only FREQ=YEARLY, returning 0 for everything else
-- (see its section 4). This migration replaces dv_generate_series_occurrences() with one that
-- also understands FREQ=WEEKLY (with INTERVAL) and FREQ=MONTHLY.
--
-- Deliberately NOT supported, so the parsing stays trivial and total:
--   * BYDAY / BYMONTHDAY -- the weekday of a weekly series and the day-of-month of a monthly
--     one are both implied by dv_event_series.start_date, exactly as the yearly generator
--     already derives its month and day from start_date.
--   * FREQ=DAILY -- an unbounded row count for no product benefit; a daily routine belongs in
--     the account's standing events, not in a series.
-- An rrule this function does not recognise is still a documented no-op (returns 0), as before.
--
-- The function signature is kept at (integer, integer) so the existing trigger function
-- dv_event_series_generate_on_write(), dv_refresh_all_event_series_occurrences() and the
-- existing grants all keep working without a drop/recreate. p_horizon_years now applies only
-- to the yearly branch -- sub-yearly frequencies derive their own, much shorter horizon below.
--
-- Scope note: this project also hosts an unrelated schema (block/cube/cuboid/...) for a
-- separate app. Nothing here touches any table outside the dv_ prefix.

-- ============================================================================
-- 1. rrule helpers
-- ============================================================================
-- Immutable, total, and null-safe: a null or unrecognised rrule yields a null frequency, which
-- every caller below treats as "one-off / not understood". Shared by the occurrence generator
-- and by dv_get_today_view_model()'s "coming up" query (next migration), so the two can never
-- disagree about what a given rrule means.

create or replace function public.dv_rrule_freq(p_rrule text)
returns text
language sql
immutable
as $$
  select case
    when p_rrule is null then null
    when upper(p_rrule) like 'FREQ=YEARLY%'  then 'YEARLY'
    when upper(p_rrule) like 'FREQ=MONTHLY%' then 'MONTHLY'
    when upper(p_rrule) like 'FREQ=WEEKLY%'  then 'WEEKLY'
    else null
  end;
$$;

create or replace function public.dv_rrule_interval(p_rrule text)
returns integer
language sql
immutable
as $$
  select greatest(
    coalesce(
      (regexp_match(upper(coalesce(p_rrule, '')), 'INTERVAL=([0-9]+)'))[1]::integer,
      1
    ),
    1
  );
$$;

-- How *rare* a series is, lowest = rarest. Used to break ties for the single "coming up" slot
-- on the display: a birthday three days away must outrank a bowls club that happens to be
-- tomorrow, because the rare thing is the one at risk of being forgotten.
create or replace function public.dv_series_freq_rank(p_rrule text)
returns smallint
language sql
immutable
as $$
  select (case public.dv_rrule_freq(p_rrule)
    when 'YEARLY'  then 1
    when 'MONTHLY' then 2
    when 'WEEKLY'  then
      case
        when public.dv_rrule_interval(p_rrule) >= 4 then 3
        when public.dv_rrule_interval(p_rrule) >= 2 then 4
        else 5
      end
    else 9   -- one-off, or an rrule we do not understand
  end)::smallint;
$$;

-- Default days of advance notice, derived from rarity. The account-level
-- dv_account.upcoming_reminder_lead_days (default 3) now seeds *only* the yearly case, which
-- is what it has always meant in practice -- it shipped labelled "for birthdays and
-- anniversaries".
--
-- Only yearly and monthly get notice by default. Anything coming round more often than once a
-- month is, by then, part of the ordinary shape of the week -- and an event that sits inside
-- the notice window almost permanently would occupy the COMING UP card permanently too, which
-- turns notice into wallpaper on a display built for low cognitive load. A carer can still opt
-- any individual event or series in explicitly via advance_notice_days.
create or replace function public.dv_default_notice_days(
  p_rrule text,
  p_account_lead_days smallint default 3
)
returns smallint
language sql
immutable
as $$
  select (case public.dv_rrule_freq(p_rrule)
    when 'YEARLY'  then coalesce(p_account_lead_days, 3)
    when 'MONTHLY' then 1
    else 0   -- weekly, 2-weekly, 4-weekly, and un-flagged one-offs
  end)::smallint;
$$;

-- Pure string helpers with no data access, but locked down the same way as every other
-- function in this schema for consistency.
revoke all on function public.dv_rrule_freq(text) from public;
revoke all on function public.dv_rrule_freq(text) from anon;
grant execute on function public.dv_rrule_freq(text) to authenticated;

revoke all on function public.dv_rrule_interval(text) from public;
revoke all on function public.dv_rrule_interval(text) from anon;
grant execute on function public.dv_rrule_interval(text) to authenticated;

revoke all on function public.dv_series_freq_rank(text) from public;
revoke all on function public.dv_series_freq_rank(text) from anon;
grant execute on function public.dv_series_freq_rank(text) to authenticated;

revoke all on function public.dv_default_notice_days(text, smallint) from public;
revoke all on function public.dv_default_notice_days(text, smallint) from anon;
grant execute on function public.dv_default_notice_days(text, smallint) to authenticated;

-- ============================================================================
-- 2. advance_notice_days
-- ============================================================================
-- Null at both levels means "resolve from the frequency default above", so every row that
-- already exists keeps exactly today's behaviour. Resolution order is
-- event -> series -> frequency default.
--
-- The column on dv_event is what decouples notice from recurrence: a one-off hospital
-- appointment next Tuesday can now be flagged for advance notice, which the shipped
-- `series_id is not null` gate made impossible.

alter table public.dv_event_series
  add column if not exists advance_notice_days smallint null;

alter table public.dv_event
  add column if not exists advance_notice_days smallint null;

-- ============================================================================
-- 3. dv_generate_series_occurrences(): all supported frequencies
-- ============================================================================
-- Replaces the yearly-only generator from 20260817220000_dv_event_series.sql:171-260.
-- Behaviour preserved from that version: idempotent (a date that already has a dv_event row
-- for the series is skipped whatever its status, so a cancelled occurrence is never
-- regenerated); generated rows are stamped event_source = 'recurring_series'; dv_event's own
-- BEFORE INSERT trigger dv_event_enforce_visibility still forces show_on_display = false for
-- private/supporters_only visibility, so that rule is not duplicated here.
--
-- Two things differ by frequency, deliberately:
--
--  * Horizon. Yearly keeps p_horizon_years (default 3). Monthly looks 12 months ahead, weekly
--    6 months -- ~26 rows for the worst case, a weekly series. An unchanged 3-year horizon
--    would materialise ~156 rows per weekly series for no benefit on a today-focused display.
--
--  * Window start. Yearly still generates from start_date's own year, so past birthdays exist
--    for the calendar view. Sub-yearly frequencies generate from max(start_date, today) only:
--    a weekly series entered with a start date two years back must not backfill a hundred dead
--    occurrence rows.

create or replace function public.dv_generate_series_occurrences(
  p_series_id integer,
  p_horizon_years integer default 3
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_series              record;
  v_account             record;
  v_local_today         date;
  v_scheduled_id        integer;
  v_source_recurring_id integer;
  v_freq                text;
  v_interval            integer;
  v_horizon             date;
  v_window_start        date;
  v_dates               date[] := '{}';
  v_occurrence_date     date;
  v_cursor_month        date;
  v_start_month         date;
  v_last_day            integer;
  v_month               integer;
  v_day                 integer;
  v_year                integer;
  v_step                integer;
  v_steps               integer;
  v_inserted_count      integer := 0;
begin
  select * into v_series from public.dv_event_series where series_id = p_series_id;
  if not found or v_series.deleted_at is not null or v_series.is_active = false then
    return 0;
  end if;

  v_freq := public.dv_rrule_freq(v_series.rrule);
  if v_freq is null then
    return 0; -- unrecognised rrule: documented no-op, as in the original generator
  end if;
  v_interval := public.dv_rrule_interval(v_series.rrule);

  select a.* into v_account from public.dv_account a where a.account_id = v_series.account_id;
  if not found then
    return 0;
  end if;

  v_local_today := (now() at time zone v_account.timezone)::date;

  if v_freq = 'YEARLY' then
    v_horizon      := make_date(extract(year from v_local_today)::integer + p_horizon_years, 12, 31);
    v_window_start := v_series.start_date;
  elsif v_freq = 'MONTHLY' then
    v_horizon      := (v_local_today + interval '12 months')::date;
    v_window_start := greatest(v_series.start_date, v_local_today);
  else
    v_horizon      := (v_local_today + interval '6 months')::date;
    v_window_start := greatest(v_series.start_date, v_local_today);
  end if;

  if v_series.end_date is not null and v_series.end_date < v_horizon then
    v_horizon := v_series.end_date;
  end if;

  if v_horizon < v_window_start then
    return 0;
  end if;

  -- --- build the occurrence dates -------------------------------------------------------
  if v_freq = 'YEARLY' then
    v_month := extract(month from v_series.start_date);
    v_day   := extract(day from v_series.start_date);
    for v_year in extract(year from v_window_start)::integer
      .. extract(year from v_horizon)::integer
    loop
      -- Feb 29 birthdays fall back to Feb 28 in non-leap years.
      begin
        v_occurrence_date := make_date(v_year, v_month, v_day);
      exception when others then
        v_occurrence_date := make_date(v_year, 2, 28);
      end;
      if v_occurrence_date >= v_window_start and v_occurrence_date <= v_horizon then
        v_dates := v_dates || v_occurrence_date;
      end if;
    end loop;

  elsif v_freq = 'MONTHLY' then
    -- Same-date-each-month, clamped to the length of the month: a series anchored on the 31st
    -- lands on the 30th in April and the 28th (29th in a leap year) in February. Same spirit
    -- as the yearly branch's Feb 29 fallback above.
    v_day         := extract(day from v_series.start_date);
    v_start_month := date_trunc('month', v_series.start_date)::date;
    -- Anchor to start_month so INTERVAL is honoured rather than assumed to be 1.
    v_steps := greatest(
      ceil(
        ( (extract(year  from v_window_start)::integer - extract(year  from v_start_month)::integer) * 12
        + (extract(month from v_window_start)::integer - extract(month from v_start_month)::integer)
        )::numeric / v_interval
      )::integer,
      0
    );
    v_cursor_month := (v_start_month + (v_steps * v_interval) * interval '1 month')::date;
    while v_cursor_month <= v_horizon loop
      v_last_day := extract(day from (v_cursor_month + interval '1 month - 1 day'))::integer;
      v_occurrence_date := v_cursor_month + (least(v_day, v_last_day) - 1);
      if v_occurrence_date >= v_window_start and v_occurrence_date <= v_horizon then
        v_dates := v_dates || v_occurrence_date;
      end if;
      v_cursor_month := (v_cursor_month + v_interval * interval '1 month')::date;
    end loop;

  else -- WEEKLY, at INTERVAL-week spacing; the weekday comes from start_date
    v_step  := 7 * v_interval;
    v_steps := greatest(ceil((v_window_start - v_series.start_date)::numeric / v_step)::integer, 0);
    v_occurrence_date := v_series.start_date + (v_steps * v_step);
    while v_occurrence_date <= v_horizon loop
      v_dates := v_dates || v_occurrence_date;
      v_occurrence_date := v_occurrence_date + v_step;
    end loop;
  end if;

  if array_length(v_dates, 1) is null then
    return 0;
  end if;

  select event_status_id into v_scheduled_id
    from public.dv_event_status where event_status = 'scheduled';
  select event_source_id into v_source_recurring_id
    from public.dv_event_source where event_source = 'recurring_series';

  -- One set-based insert rather than the original per-year INSERT...SELECT plus `if found`
  -- counter, so the returned count is the real number of rows written.
  insert into public.dv_event (
    account_id, title, description, event_date, start_time, end_time,
    event_type_id, event_status_id, event_visibility_id, event_source_id,
    event_accuracy_id, display_priority, show_on_display, advance_notice_days, series_id,
    created_by_user_id, updated_by_user_id
  )
  select
    v_series.account_id, v_series.title, v_series.description, occ.occurrence_date, v_series.start_time,
    v_series.end_time, v_series.event_type_id, v_scheduled_id, v_series.event_visibility_id,
    v_source_recurring_id, v_series.event_accuracy_id, v_series.display_priority,
    v_series.show_on_display, v_series.advance_notice_days, v_series.series_id,
    v_series.updated_by_user_id, v_series.updated_by_user_id
  from unnest(v_dates) as occ(occurrence_date)
  where not exists (
    select 1 from public.dv_event e
    where e.series_id = v_series.series_id and e.event_date = occ.occurrence_date
  );

  get diagnostics v_inserted_count = row_count;
  return v_inserted_count;
end;
$$;

revoke all on function public.dv_generate_series_occurrences(integer, integer) from public;
revoke all on function public.dv_generate_series_occurrences(integer, integer) from anon;
grant execute on function public.dv_generate_series_occurrences(integer, integer) to authenticated;

-- ============================================================================
-- 4. Retime the top-up cron
-- ============================================================================
-- 20260817220300_dv_event_series_cron.sql tops occurrences up on the 1st of each month, which
-- was ample for a 3-year yearly horizon. A 6-month weekly horizon wants a shorter cycle, so
-- move to weekly. Guarded the same way as the original migration so a missing job is created
-- rather than erroring.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'dv-refresh-event-series-occurrences') then
    perform cron.unschedule('dv-refresh-event-series-occurrences');
  end if;
  perform cron.schedule(
    'dv-refresh-event-series-occurrences',
    '0 3 * * 1', -- 03:00 UTC every Monday
    $cron$select public.dv_refresh_all_event_series_occurrences();$cron$
  );
end;
$$;
