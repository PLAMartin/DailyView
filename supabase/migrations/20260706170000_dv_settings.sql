-- Daily View dashboard: Settings page foundation.
-- Adds: an UPDATE policy for dv_account (owner only, spec section 17.4),
-- RLS + grants for the account-level ("default") dv_display_preference row
-- (previously only per-user rows were readable/writable at all — the
-- account-level row that MVP actually uses, per spec section 17.3, was
-- unreachable from the browser), and the unique partial index spec 17.3
-- calls for so only one account-level default preference row can exist per
-- account.
--
-- Scope note: this project also hosts an unrelated schema (block/cube/cuboid/...)
-- for a separate app. Nothing here touches any table outside the dv_ prefix.

-- ============================================================================
-- 1. is_account_owner() helper
-- ============================================================================

create or replace function public.is_account_owner(p_account_id bigint)
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
    join public.dv_account_user_role r on r.role_id = au.role_id
    where au.account_id = p_account_id
      and u.auth_user_id = auth.uid()
      and u.is_active = true
      and au.deleted_at is null
      and r.role = 'owner'
  );
$$;

revoke all on function public.is_account_owner(bigint) from public;
revoke all on function public.is_account_owner(bigint) from anon;
grant execute on function public.is_account_owner(bigint) to authenticated;

-- ============================================================================
-- 2. dv_account: owner-only updates
-- ============================================================================

create policy dv_account_update_owner on public.dv_account
  for update to authenticated
  using (public.is_account_owner(account_id))
  with check (public.is_account_owner(account_id));

grant update on table public.dv_account to authenticated;

-- ============================================================================
-- 3. dv_display_preference: account-level ("default") row access
-- ============================================================================
-- Owner or device manager may read/write it — both roles carry
-- can_manage_devices = true in this dashboard's role presets (see
-- dashboard/people.js's ROLE_PRESETS), so that single flag captures "owner or
-- device manager" without needing a separate OR clause per role.

create policy dv_display_preference_select_account_default on public.dv_display_preference
  for select to authenticated
  using (
    user_id is null
    and exists (
      select 1 from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = dv_display_preference.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
    )
  );

create policy dv_display_preference_insert_account_default on public.dv_display_preference
  for insert to authenticated
  with check (
    user_id is null
    and exists (
      select 1 from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = dv_display_preference.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
        and au.can_manage_devices = true
    )
  );

create policy dv_display_preference_update_account_default on public.dv_display_preference
  for update to authenticated
  using (
    user_id is null
    and exists (
      select 1 from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = dv_display_preference.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
        and au.can_manage_devices = true
    )
  )
  with check (
    user_id is null
    and exists (
      select 1 from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = dv_display_preference.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
        and au.can_manage_devices = true
    )
  );

grant insert on table public.dv_display_preference to authenticated;

-- ============================================================================
-- 4. One account-level default preference row per account (spec 17.3)
-- ============================================================================

create unique index if not exists dv_display_preference_account_default_uq
  on public.dv_display_preference (account_id)
  where user_id is null;
