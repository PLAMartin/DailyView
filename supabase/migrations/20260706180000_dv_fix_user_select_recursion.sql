-- Fix infinite-recursion bug in the dv_user_select_fellow_member RLS policy
-- (added in 20260706160000_dv_people.sql).
--
-- That policy's USING clause joins `public.dv_user caller_u` to resolve the
-- calling user's own row -- but it is a policy defined ON dv_user itself, so
-- evaluating that join re-triggers dv_user's own RLS policies (including this
-- one), which re-triggers them again, and so on: Postgres error 42P17,
-- exactly the same class of bug 20260706115011_dv_fix_account_user_rls_recursion.sql
-- already fixed once for dv_account_user. This migration applies the same
-- fix here: move the "resolve my own active dv_user row" lookup into a
-- SECURITY DEFINER helper, which bypasses RLS internally instead of
-- re-entering the calling table's own policy.
--
-- Impact: this broke `dv_get_my_account_access()` for every existing user,
-- not just the new People page, because that RPC reads dv_user and (unlike
-- SECURITY DEFINER functions bypassing RLS on their *own* internal queries)
-- a broken policy on a table still applies to any ordinary query that reads
-- that table under RLS.
--
-- Scope note: this project also hosts an unrelated schema (block/cube/cuboid/...)
-- for a separate app. Nothing here touches any table outside the dv_ prefix.

create or replace function public.dv_current_user_id()
returns integer
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select user_id
  from public.dv_user
  where auth_user_id = auth.uid()
    and is_active = true;
$$;

revoke all on function public.dv_current_user_id() from public;
revoke all on function public.dv_current_user_id() from anon;
grant execute on function public.dv_current_user_id() to authenticated;

drop policy if exists dv_user_select_fellow_member on public.dv_user;

create policy dv_user_select_fellow_member on public.dv_user
  for select to authenticated
  using (
    exists (
      select 1
      from public.dv_account_user target_au
      join public.dv_account_user caller_au on caller_au.account_id = target_au.account_id
      where target_au.user_id = dv_user.user_id
        and target_au.deleted_at is null
        and caller_au.deleted_at is null
        and caller_au.user_id = public.dv_current_user_id()
    )
  );
