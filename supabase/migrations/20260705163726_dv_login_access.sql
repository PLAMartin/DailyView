-- Daily View login/auth access layer.
-- Adds: dv_get_my_account_access() RPC, supporting indexes, RLS policies for
-- the dv_ tables reachable from the browser, and least-privilege grants.
--
-- Scope note: this project also hosts an unrelated schema (block/cube/cuboid/...)
-- for a separate app. Nothing here touches any table outside the dv_ prefix.

-- ============================================================================
-- 1. dv_get_my_account_access()
-- ============================================================================
-- Returns the active Daily View accounts available to the currently
-- authenticated user. No arguments; keyed entirely off auth.uid(). Returns
-- zero rows for anonymous callers (auth.uid() is null, which never matches
-- dv_user.auth_user_id).

create or replace function public.dv_get_my_account_access()
returns table (
  account_id             integer,
  account_name           text,
  account_type           text,
  user_id                integer,
  full_name              text,
  preferred_name         text,
  role                   text,
  relationship_to_viewer text,
  permission             text,
  can_manage_events      boolean,
  can_manage_users       boolean,
  can_manage_devices     boolean,
  can_send_prompts       boolean,
  is_primary_contact     boolean,
  timezone               text
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    a.account_id,
    a.account_name,
    at.account_type,
    u.user_id,
    u.full_name,
    u.preferred_name,
    r.role,
    au.relationship_to_viewer,
    p.permission,
    coalesce(au.can_manage_events,  false),
    coalesce(au.can_manage_users,   false),
    coalesce(au.can_manage_devices, false),
    coalesce(au.can_send_prompts,   false),
    coalesce(au.is_primary_contact, false),
    a.timezone
  from public.dv_user u
  join public.dv_account_user au on au.user_id = u.user_id
  join public.dv_account a on a.account_id = au.account_id
  left join public.dv_account_type at on at.account_type_id = a.account_type_id
  left join public.dv_account_user_role r on r.role_id = au.role_id
  left join public.dv_account_user_permission p on p.permission_id = au.permission_id
  where u.auth_user_id = auth.uid()
    and u.is_active = true
    and au.deleted_at is null;
$$;

revoke all on function public.dv_get_my_account_access() from public;
revoke all on function public.dv_get_my_account_access() from anon;
grant execute on function public.dv_get_my_account_access() to authenticated;

-- ============================================================================
-- 2. Supporting indexes
-- ============================================================================

create index if not exists dv_account_user_active_user_idx
  on public.dv_account_user (user_id, account_id)
  where deleted_at is null;

create index if not exists dv_account_user_active_account_idx
  on public.dv_account_user (account_id, user_id)
  where deleted_at is null;

create index if not exists dv_user_active_auth_idx
  on public.dv_user (auth_user_id)
  where is_active = true;

-- ============================================================================
-- 3. Row Level Security
-- ============================================================================
-- RLS is already enabled on every dv_ table in this project; the ENABLE
-- statements below are included for self-documentation. No policies existed
-- prior to this migration, so there are no naming collisions to worry about.

-- ── dv_user: read own profile only ──────────────────────────────────────
alter table public.dv_user enable row level security;

create policy dv_user_select_own on public.dv_user
  for select to authenticated
  using (auth_user_id = auth.uid());

-- ── dv_account: read only where an active membership exists ────────────
alter table public.dv_account enable row level security;

create policy dv_account_select_member on public.dv_account
  for select to authenticated
  using (
    exists (
      select 1 from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = dv_account.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
    )
  );

-- ── dv_account_user: read membership rows only for accounts you actively belong to ──
alter table public.dv_account_user enable row level security;

create policy dv_account_user_select_same_account on public.dv_account_user
  for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1 from public.dv_account_user my
      join public.dv_user u on u.user_id = my.user_id
      where my.account_id = dv_account_user.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and my.deleted_at is null
    )
  );

-- ── dv_event: read for active members; write requires can_manage_events ─
alter table public.dv_event enable row level security;

create policy dv_event_select_member on public.dv_event
  for select to authenticated
  using (
    exists (
      select 1 from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = dv_event.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
    )
  );

create policy dv_event_insert_manage on public.dv_event
  for insert to authenticated
  with check (
    exists (
      select 1 from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = dv_event.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
        and au.can_manage_events = true
    )
  );

create policy dv_event_update_manage on public.dv_event
  for update to authenticated
  using (
    exists (
      select 1 from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = dv_event.account_id
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
      where au.account_id = dv_event.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
        and au.can_manage_events = true
    )
  );

create policy dv_event_delete_manage on public.dv_event
  for delete to authenticated
  using (
    exists (
      select 1 from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = dv_event.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
        and au.can_manage_events = true
    )
  );

-- ── dv_device: read for active members; write requires can_manage_devices ──
alter table public.dv_device enable row level security;

create policy dv_device_select_member on public.dv_device
  for select to authenticated
  using (
    exists (
      select 1 from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = dv_device.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
    )
  );

create policy dv_device_insert_manage on public.dv_device
  for insert to authenticated
  with check (
    exists (
      select 1 from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = dv_device.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
        and au.can_manage_devices = true
    )
  );

create policy dv_device_update_manage on public.dv_device
  for update to authenticated
  using (
    exists (
      select 1 from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = dv_device.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
        and au.can_manage_devices = true
    )
  )
  with check (
    exists (
      select 1 from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = dv_device.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
        and au.can_manage_devices = true
    )
  );

create policy dv_device_delete_manage on public.dv_device
  for delete to authenticated
  using (
    exists (
      select 1 from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = dv_device.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
        and au.can_manage_devices = true
    )
  );

-- ── dv_update_prompt: read for active members; send requires can_send_prompts ──
alter table public.dv_update_prompt enable row level security;

create policy dv_update_prompt_select_member on public.dv_update_prompt
  for select to authenticated
  using (
    account_id is not null
    and exists (
      select 1 from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = dv_update_prompt.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
    )
  );

create policy dv_update_prompt_insert_manage on public.dv_update_prompt
  for insert to authenticated
  with check (
    account_id is not null
    and exists (
      select 1 from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = dv_update_prompt.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
        and au.can_send_prompts = true
    )
  );

create policy dv_update_prompt_update_manage on public.dv_update_prompt
  for update to authenticated
  using (
    account_id is not null
    and exists (
      select 1 from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = dv_update_prompt.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
        and au.can_send_prompts = true
    )
  )
  with check (
    account_id is not null
    and exists (
      select 1 from public.dv_account_user au
      join public.dv_user u on u.user_id = au.user_id
      where au.account_id = dv_update_prompt.account_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
        and au.deleted_at is null
        and au.can_send_prompts = true
    )
  );

-- ── dv_display_preference: own rows only (conservative default; no capability
--    flag exists for this table today, so account-level rows with user_id
--    is null are left inaccessible pending a future product decision) ──
alter table public.dv_display_preference enable row level security;

create policy dv_display_preference_select_own on public.dv_display_preference
  for select to authenticated
  using (
    user_id is not null
    and exists (
      select 1 from public.dv_user u
      where u.user_id = dv_display_preference.user_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
    )
  );

create policy dv_display_preference_update_own on public.dv_display_preference
  for update to authenticated
  using (
    user_id is not null
    and exists (
      select 1 from public.dv_user u
      where u.user_id = dv_display_preference.user_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
    )
  )
  with check (
    user_id is not null
    and exists (
      select 1 from public.dv_user u
      where u.user_id = dv_display_preference.user_id
        and u.auth_user_id = auth.uid()
        and u.is_active = true
    )
  );

-- ============================================================================
-- 4. Least-privilege grants
-- ============================================================================
-- The existing table-level grants on these tables are broader than RLS alone
-- should leave in place (anon/authenticated previously held INSERT/UPDATE/
-- DELETE/TRUNCATE/REFERENCES/TRIGGER). RLS governs SELECT/INSERT/UPDATE/DELETE
-- but not TRUNCATE, so grants are tightened here to least-privilege. This is
-- a no-op for the separate Next.js Daily View app if (as expected) it talks to
-- these tables server-side with a service-role key, which bypasses grants and
-- RLS entirely.

revoke all on table
  public.dv_user,
  public.dv_account,
  public.dv_account_user,
  public.dv_event,
  public.dv_device,
  public.dv_update_prompt,
  public.dv_display_preference
from anon;

revoke all on table
  public.dv_user,
  public.dv_account,
  public.dv_account_user,
  public.dv_event,
  public.dv_device,
  public.dv_update_prompt,
  public.dv_display_preference
from authenticated;

grant select on table
  public.dv_user,
  public.dv_account,
  public.dv_account_user,
  public.dv_display_preference
to authenticated;

grant select, insert, update, delete on table
  public.dv_event,
  public.dv_device,
  public.dv_update_prompt
to authenticated;

grant update on table public.dv_display_preference to authenticated;
