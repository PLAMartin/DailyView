-- Daily View dashboard: Devices page foundation.
-- Adds the device-pairing/refresh columns from spec section 6.4 to the
-- existing dv_device table. RLS/grants for dv_device already exist (added in
-- 20260705163726_dv_login_access.sql) and apply to these new columns without
-- change — Postgres/PostgREST grants are table-level, not column-level.
--
-- Scope note: this project also hosts an unrelated schema (block/cube/cuboid/...)
-- for a separate app. Nothing here touches any table outside the dv_ prefix.
--
-- Design note on dv_device.pairing_code: this column already exists in the
-- live schema (predates this migration) and is a plain text column, not a
-- hash. Spec section 15.3 step 10 ("server sets paired_at, clears pairing
-- code") is consistent with either a plaintext or hashed value being wiped on
-- successful pairing, but redefining the existing column's semantics (and
-- whatever the separate physical-device app already expects to compare
-- against) is out of scope here without visibility into that app's code. This
-- migration keeps pairing_code as-is and only adds the new columns spec 6.4
-- actually calls out: an expiry for that code, plus paired_at/device_secret_hash/
-- last_refresh_requested_at for the ongoing device-credential lifecycle.
-- device_secret_hash is never selected by dashboard queries (see
-- dv-dashboard-data.js) — it exists for a future device-redemption endpoint,
-- which lives outside this repo.

alter table public.dv_device
  add column if not exists pairing_code_expires_at timestamptz null,
  add column if not exists paired_at timestamptz null,
  add column if not exists device_secret_hash text null,
  add column if not exists last_refresh_requested_at timestamptz null;
