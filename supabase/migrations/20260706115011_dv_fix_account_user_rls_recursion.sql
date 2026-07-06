-- Fix infinite-recursion bug in the dv_account_user RLS policy.
--
-- dv_account_user_select_same_account (added in 20260705163726_dv_login_access.sql)
-- subqueries dv_account_user itself to check "is the caller an active member
-- of this row's account". Evaluating that subquery re-triggers the same
-- policy on the inner reference, which subqueries dv_account_user again, and
-- so on -- infinite recursion (Postgres error 42P17).
--
-- This was never caught in production because the only code path that
-- touched dv_account_user before now, dv_get_my_account_access(), is
-- SECURITY DEFINER and therefore bypasses RLS entirely -- it silently never
-- exercised this policy. Any direct authenticated-role access to
-- dv_account_user hits the recursion, including transitively: dv_event,
-- dv_device, and dv_update_prompt's insert/update/delete policies all
-- subquery dv_account_user, so writes to those tables from the browser
-- (via PostgREST as the `authenticated` role, not a SECURITY DEFINER
-- wrapper) were broken too, not just direct dv_account_user reads.
--
-- Fix: move the membership check into a SECURITY DEFINER helper function
-- (as anticipated in the dashboard spec's section 9 "is_active_account_member"),
-- which bypasses RLS internally rather than re-entering the calling table's
-- own policy.

create or replace function public.is_active_account_member(p_account_id bigint)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.dv_account_user au
    join public.dv_user u on u.user_id = au.user_id
    where au.account_id = p_account_id
      and u.auth_user_id = auth.uid()
      and u.is_active = true
      and au.deleted_at is null
  );
$$;

revoke all on function public.is_active_account_member(bigint) from public;
revoke all on function public.is_active_account_member(bigint) from anon;
grant execute on function public.is_active_account_member(bigint) to authenticated;

drop policy if exists dv_account_user_select_same_account on public.dv_account_user;

create policy dv_account_user_select_same_account on public.dv_account_user
  for select to authenticated
  using (
    deleted_at is null
    and public.is_active_account_member(account_id)
  );
