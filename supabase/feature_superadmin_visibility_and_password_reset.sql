-- Run after feature_superadmin_settings.sql.
-- Lets the Allowed Users screen hide the superadmin's own row from regular
-- admins (lcms_superadmins isn't directly readable by them, so the client
-- needs a security-definer way to know which registered_user_id is one).
begin;

create or replace function public.lcms_superadmin_user_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select case when public.lcms_is_admin()
    then coalesce(array(select user_id from public.lcms_superadmins), array[]::uuid[])
    else array[]::uuid[]
  end;
$$;
revoke all on function public.lcms_superadmin_user_ids() from public, anon;
grant execute on function public.lcms_superadmin_user_ids() to authenticated;

commit;
