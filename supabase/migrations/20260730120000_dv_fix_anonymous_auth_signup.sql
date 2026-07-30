-- Fix "Database error creating anonymous user" breaking every /display
-- screen pairing attempt (dv_viewer_data.js's signInAnonymously() call).
--
-- This project also hosts an unrelated app's schema (it_ prefix: it_profiles,
-- it_customers, it_products, ...). That app's public.handle_new_auth_user()
-- trigger fires AFTER INSERT ON auth.users for every new auth user
-- project-wide -- including Daily View's anonymous device sessions, which
-- have email = NULL by design. it_profiles.email is NOT NULL, so the
-- trigger's insert violated that constraint, the whole auth.users insert
-- rolled back, and anonymous sign-in failed with a 500 for every viewer
-- device, not just one user.
--
-- Daily View's dv_device table doesn't reference it_profiles at all (it just
-- stores the anon user's uid in dv_device.auth_user_id for RLS matching), so
-- anonymous users never needed an it_profiles row. This guards the insert to
-- only run for real (non-anonymous) signups, leaving the other app's normal
-- signup flow untouched.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.email is not null then
    insert into public.it_profiles (id, email)
    values (new.id, public.it_normalize_email(new.email))
    on conflict (id) do nothing;
  end if;
  return new;
end;
$function$;
