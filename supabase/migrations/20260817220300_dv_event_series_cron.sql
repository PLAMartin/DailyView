-- Daily View dashboard: schedule the monthly top-up for recurring-event occurrences.
-- Kept in its own migration (rather than bundled into 20260817220000_dv_event_series.sql) so
-- pg_cron availability/enablement issues can't block the core feature -- confirmed the pg_cron
-- extension (v1.6.4) is available on this project but was not yet created.
--
-- Scope note: this project also hosts an unrelated schema (block/cube/cuboid/...)
-- for a separate app. This job only calls dv_refresh_all_event_series_occurrences(), which is
-- itself scoped to the dv_ prefix.

create extension if not exists pg_cron;

do $$
begin
  if not exists (
    select 1 from cron.job where jobname = 'dv-refresh-event-series-occurrences'
  ) then
    perform cron.schedule(
      'dv-refresh-event-series-occurrences',
      '0 3 1 * *', -- 03:00 UTC on the 1st of each month
      $cron$select public.dv_refresh_all_event_series_occurrences();$cron$
    );
  end if;
end;
$$;
