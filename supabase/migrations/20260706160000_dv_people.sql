-- Daily View dashboard: People page foundation.
-- Adds: dv_account_invite table (spec section 6.3), a "read fellow account
-- members' limited profile" RLS policy for dv_user (spec section 9.1 —
-- previously only own-profile reads were allowed, which blocks the People
-- list from ever showing other members' names), RLS + grants for the two
-- role/permission lookup tables (never policied before now), an UPDATE
-- policy for dv_account_user (previously read-only from the browser), and a
-- trigger that blocks removing or downgrading the last remaining account
-- owner (spec section 8.2).
--
-- Scope note: this project also hosts an unrelated schema (block/cube/cuboid/...)
-- for a separate app. Nothing here touches any table outside the dv_ prefix.
--
-- Scope note on invite acceptance: this migration and the People page it
-- supports create dv_account_invite rows and let an admin copy a one-time
-- invite link, but do not implement the invitee's redemption flow (accepting
-- the invite would create/link a dv_user and an active dv_account_user row).
-- That touches the login/signup pages and is left for a follow-up.

-- ============================================================================
-- 1. dv_user: allow reading fellow account members' limited profile data
-- ============================================================================
-- Additive policy (Postgres OR's multiple permissive SELECT policies
-- together) — dv_user_select_own from 20260705163726_dv_login_access.sql is
-- untouched. No recursion risk: this subqueries dv_account_user, whose own
-- SELECT policy calls the SECURITY DEFINER is_active_account_member() helper
-- rather than re-entering dv_user's policy.

create policy dv_user_select_fellow_member on public.dv_user
  for select to authenticated
  using (
    exists (
      select 1
      from public.dv_account_user target_au
      join public.dv_account_user caller_au on caller_au.account_id = target_au.account_id
      join public.dv_user caller_u on caller_u.user_id = caller_au.user_id
      where target_au.user_id = dv_user.user_id
        and target_au.deleted_at is null
        and caller_au.deleted_at is null
        and caller_u.auth_user_id = auth.uid()
        and caller_u.is_active = true
    )
  );

-- ============================================================================
-- 2. Role/permission lookup tables: read access for authenticated users
-- ============================================================================
-- Same treatment as the event lookup tables in 20260706112913_dv_today_page.sql
-- — small fixed reference tables, RLS enabled project-wide but never policied,
-- so currently unreadable by authenticated despite any legacy grants.

create policy dv_account_user_role_select_authenticated on public.dv_account_user_role
  for select to authenticated using (true);

create policy dv_account_user_permission_select_authenticated on public.dv_account_user_permission
  for select to authenticated using (true);

revoke all on table public.dv_account_user_role, public.dv_account_user_permission from anon;
revoke all on table public.dv_account_user_role, public.dv_account_user_permission from authenticated;
grant select on table public.dv_account_user_role, public.dv_account_user_permission to authenticated;

-- ============================================================================
-- 3. dv_account_user: allow managed updates (role/permissions/relationship/
--    primary contact/soft-delete removal), protected against removing the
--    last account owner
-- ============================================================================

create policy dv_account_user_update_manage on public.dv_account_user
  for update to authenticated
  using (
    exists (
      select 1 from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = dv_account_user.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
        and au.can_manage_users = true
    )
  )
  with check (
    exists (
      select 1 from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = dv_account_user.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
        and au.can_manage_users = true
    )
  );

grant update on table public.dv_account_user to authenticated;

create or replace function public.dv_account_user_protect_last_owner()
returns trigger
language plpgsql
as $$
declare
  v_owner_role_id integer;
  v_was_owner boolean;
  v_still_owner boolean;
  v_other_active_owners integer;
begin
  select role_id into v_owner_role_id from public.dv_account_user_role where role = 'owner';
  if v_owner_role_id is null then
    return new; -- no 'owner' role seeded yet; nothing to protect
  end if;

  v_was_owner := old.role_id = v_owner_role_id and old.deleted_at is null;
  v_still_owner := new.role_id = v_owner_role_id and new.deleted_at is null;

  if v_was_owner and not v_still_owner then
    select count(*) into v_other_active_owners
    from public.dv_account_user
    where account_id = old.account_id
      and user_id <> old.user_id
      and role_id = v_owner_role_id
      and deleted_at is null;

    if v_other_active_owners = 0 then
      raise exception 'cannot remove or downgrade the last remaining account owner' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger dv_account_user_protect_last_owner
  before update on public.dv_account_user
  for each row execute function public.dv_account_user_protect_last_owner();

-- ============================================================================
-- 4. dv_account_invite
-- ============================================================================

create table if not exists public.dv_account_invite (
  invite_id             uuid primary key default gen_random_uuid(),
  account_id            integer not null references public.dv_account(account_id),
  email                 text not null,
  role_id               integer not null references public.dv_account_user_role(role_id),
  permission_id         integer not null references public.dv_account_user_permission(permission_id),
  relationship_to_viewer text null,
  can_manage_events     boolean not null default false,
  can_manage_users      boolean not null default false,
  can_manage_devices    boolean not null default false,
  can_send_prompts      boolean not null default false,
  is_primary_contact    boolean not null default false,
  token_hash            text not null,
  expires_at            timestamptz not null,
  accepted_at           timestamptz null,
  revoked_at            timestamptz null,
  created_by_user_id    integer null references public.dv_user(user_id),
  created_at            timestamptz not null default now()
);

create index if not exists dv_account_invite_account_idx
  on public.dv_account_invite (account_id)
  where accepted_at is null and revoked_at is null;

alter table public.dv_account_invite enable row level security;

create policy dv_account_invite_select_manage on public.dv_account_invite
  for select to authenticated
  using (
    exists (
      select 1 from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = dv_account_invite.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
        and au.can_manage_users = true
    )
  );

create policy dv_account_invite_insert_manage on public.dv_account_invite
  for insert to authenticated
  with check (
    exists (
      select 1 from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = dv_account_invite.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
        and au.can_manage_users = true
    )
  );

create policy dv_account_invite_update_manage on public.dv_account_invite
  for update to authenticated
  using (
    exists (
      select 1 from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = dv_account_invite.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
        and au.can_manage_users = true
    )
  )
  with check (
    exists (
      select 1 from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = dv_account_invite.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
        and au.can_manage_users = true
    )
  );

revoke all on table public.dv_account_invite from anon;
revoke all on table public.dv_account_invite from authenticated;
grant select, insert, update on table public.dv_account_invite to authenticated;
