-- Client-side error logging for the /display viewer screen.
--
-- Until now, a viewer screen that failed to start or fell out of sync (e.g.
-- 20260730120000_dv_fix_anonymous_auth_signup.sql's anonymous-signin bug)
-- only surfaced a generic "contact support" message with nothing recorded
-- anywhere -- there was no way to tell what actually went wrong for a given
-- user without reproducing it. This adds a small log table plus a
-- SECURITY DEFINER RPC that display.js calls (fire-and-forget) when it hits
-- one of these failure states, so the failure is queryable afterward.
--
-- display.js also generates a short reference code per failure and shows it
-- in the on-screen message for the states that already read as "something's
-- wrong, contact support" (not for transient/self-explanatory states like
-- "reconnecting" or "enter a new code") -- so a support conversation can
-- reference the exact log row instead of a vague description.
--
-- No select/update/delete access is granted to anon/authenticated: this is
-- a write-only log from the client's perspective. Only accessible via the
-- Supabase dashboard / service role.
--
-- Scope note: this project also hosts an unrelated schema (it_ prefix) for
-- a separate app. Nothing here touches any table outside the dv_ prefix.

create table if not exists public.dv_client_error_log (
  error_log_id    bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  reference_code  text not null,
  context         text not null,
  error_code      text null,
  error_message   text null,
  device_id       bigint null references public.dv_device(device_id) on delete set null,
  auth_user_id    uuid null,
  user_agent      text null
);

create index if not exists dv_client_error_log_reference_code_idx
  on public.dv_client_error_log (reference_code);

create index if not exists dv_client_error_log_created_at_idx
  on public.dv_client_error_log (created_at desc);

alter table public.dv_client_error_log enable row level security;
-- Intentionally no policies: anon/authenticated get zero direct access to
-- this table. All writes go through dv_log_client_error() below.

revoke all on table public.dv_client_error_log from anon;
revoke all on table public.dv_client_error_log from authenticated;

-- ============================================================================
-- dv_log_client_error(): the only way anon/authenticated can write a row.
-- ============================================================================
-- Runs as its owner (SECURITY DEFINER) so it can insert despite the table
-- having no RLS policies for the calling role. Anon is included deliberately:
-- the exact bug this was built to catch (ensureDeviceSession failing) means
-- the client has no session at all yet, so it calls this as role anon, not
-- authenticated.

create or replace function public.dv_log_client_error(
  p_context text,
  p_error_code text default null,
  p_error_message text default null,
  p_device_id bigint default null,
  p_reference_code text default null,
  p_user_agent text default null
)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_reference_code text := coalesce(nullif(trim(p_reference_code), ''), upper(substr(md5(random()::text), 1, 6)));
begin
  insert into public.dv_client_error_log (
    reference_code, context, error_code, error_message, device_id, auth_user_id, user_agent
  )
  values (
    v_reference_code,
    left(coalesce(p_context, 'unknown'), 100),
    left(p_error_code, 100),
    left(p_error_message, 500),
    p_device_id,
    auth.uid(),
    left(p_user_agent, 300)
  );

  return v_reference_code;
end;
$function$;

revoke all on function public.dv_log_client_error(text, text, text, bigint, text, text) from public;
grant execute on function public.dv_log_client_error(text, text, text, bigint, text, text) to anon;
grant execute on function public.dv_log_client_error(text, text, text, bigint, text, text) to authenticated;
