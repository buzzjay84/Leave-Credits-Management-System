-- Run after feature_superadmin_visibility_and_password_reset.sql.
-- Tracks when an admin force-reset an account to the shared default password,
-- so Allowed Users can hint that it may still be in use, and clears the flag
-- once the account holder actually sets their own password.
begin;

alter table public."LCMS-allowed-users" add column if not exists password_reset_at timestamptz;

create or replace function public.lcms_clear_password_reset_flag()
returns void language sql security definer set search_path = '' as $$
  update public."LCMS-allowed-users" set password_reset_at = null where registered_user_id = auth.uid();
$$;
revoke all on function public.lcms_clear_password_reset_flag() from public, anon;
grant execute on function public.lcms_clear_password_reset_flag() to authenticated;

commit;
