-- Daily View dashboard: configurable advance-notice window for "coming up" reminders on the
-- display (birthdays/anniversaries via dv_event_series). See dv_get_today_view_model()'s new
-- `upcomingReminder` field, added in the next migration.

alter table public.dv_account
  add column if not exists upcoming_reminder_lead_days smallint not null default 3;
