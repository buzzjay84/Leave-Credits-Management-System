-- Run after LCMS_SQL_EDITOR_SETUP.sql. Provision membership with the private
-- scripts/provision_superadmin.mjs script, never through client metadata.
begin;
create table if not exists public.lcms_superadmins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.lcms_admin_emails (
  email text primary key check (email = lower(trim(email))),
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.lcms_account_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id),
  actor_username text,
  action text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.lcms_superadmins enable row level security;
alter table public.lcms_admin_emails enable row level security;
alter table public.lcms_account_audit enable row level security;
revoke all on public.lcms_superadmins, public.lcms_admin_emails, public.lcms_account_audit from anon, authenticated;
grant select on public.lcms_admin_emails, public.lcms_account_audit to authenticated;
grant all on public.lcms_superadmins, public.lcms_admin_emails to service_role;

create or replace function public.lcms_is_superadmin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.lcms_superadmins s
    join public."LCMS-profiles" p on p.id = s.user_id
    where s.user_id = (select auth.uid()) and p.is_active)
    and public.lcms_is_current_user_allowed();
$$;
create or replace function public.lcms_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.lcms_is_superadmin() or exists (
    select 1 from public.lcms_admin_emails a join public."LCMS-profiles" p on lower(p.email) = a.email
    where p.id = (select auth.uid()) and p.is_active and p.role = 'hrmo'
      and public.lcms_is_current_user_allowed());
$$;
drop policy if exists superadmin_reads_admins on public.lcms_admin_emails;
create policy superadmin_reads_admins on public.lcms_admin_emails for select to authenticated using ((select public.lcms_is_superadmin()));
drop policy if exists superadmin_reads_audit on public.lcms_account_audit;
create policy superadmin_reads_audit on public.lcms_account_audit for select to authenticated using ((select public.lcms_is_superadmin()));

create or replace function public.lcms_switch_superadmin_role(target_dashboard text, target_school_id text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public."LCMS-profiles"%rowtype; next_role text; next_school text; next_school_name text;
begin
  if not public.lcms_is_superadmin() then raise exception 'Superadmin access required'; end if;
  if target_dashboard not in ('admin', 'hrmo', 'aoii') or target_dashboard is null then raise exception 'Invalid dashboard'; end if;
  select * into p from public."LCMS-profiles" where id = auth.uid() for update;
  next_role := case when target_dashboard = 'aoii' then 'aoii' else 'hrmo' end;
  next_school := case when next_role = 'aoii' then target_school_id else 'DEFAULT' end;
  if next_school is null or (next_role = 'aoii' and next_school !~ '^[0-9]{6}$') then raise exception 'Choose a school for the AOII dashboard'; end if;
  select school_name into next_school_name from public."LCMS-allowed-users" where school_id = next_school limit 1;
  next_school_name := coalesce(next_school_name, case when next_school = 'DEFAULT' then 'SDO Isabela City' else next_school end);
  -- Change only the owner's profile: existing policies and AO-specific RPCs
  -- now exercise the actual chosen role. All sessions of this account share it.
  update public."LCMS-profiles" set role = next_role, school_id = next_school,
    school_name = next_school_name, updated_at = now() where id = auth.uid();
  insert into public.lcms_account_audit(actor_id, actor_username, action, details)
    values(auth.uid(), p.username, 'superadmin_role_switch', jsonb_build_object(
      'previous_role', p.role, 'previous_school', p.school_id, 'dashboard', target_dashboard, 'school_id', next_school));
  return jsonb_build_object('role', next_role, 'school_id', next_school, 'school_name', next_school_name);
end $$;

create or replace function public.lcms_update_own_username(new_username text)
returns text language plpgsql security definer set search_path = '' as $$
declare old_username text; normalized text := trim(new_username);
begin
  if not public.lcms_is_admin() then raise exception 'Administrator access required'; end if;
  if normalized is null or normalized !~ '^[A-Za-z0-9_.-]{3,50}$' then raise exception 'Use 3–50 letters, numbers, dots, underscores or hyphens'; end if;
  select username into old_username from public."LCMS-profiles" where id = auth.uid() for update;
  update public."LCMS-profiles" set username = normalized, updated_at = now() where id = auth.uid();
  update public."LCMS-allowed-users" set username = normalized, updated_at = now() where registered_user_id = auth.uid();
  insert into public.lcms_account_audit(actor_id, actor_username, action, details)
    values(auth.uid(), old_username, 'username_changed', jsonb_build_object('before', old_username, 'after', normalized));
  return normalized;
exception when unique_violation then raise exception 'That username is already in use';
end $$;

create or replace function public.lcms_set_admin_email(target_email text, allow_access boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare email_value text := lower(trim(target_email)); actor text; target_user uuid;
begin
  if not public.lcms_is_superadmin() then raise exception 'Superadmin access required'; end if;
  if email_value is null or email_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or allow_access is null then raise exception 'Enter a valid email'; end if;
  select username into actor from public."LCMS-profiles" where id = auth.uid();
  if allow_access then
    if not exists(select 1 from public."LCMS-allowed-users" where lower(email) = email_value and is_active) then
      raise exception 'Add this email to Allowed Users first, including their name, then grant admin access';
    end if;
    select registered_user_id into target_user from public."LCMS-allowed-users" where lower(email) = email_value;
    update public."LCMS-allowed-users" set role = 'hrmo', updated_at = now() where lower(email) = email_value;
    if target_user is not null then update public."LCMS-profiles" set role = 'hrmo', updated_at = now() where id = target_user; end if;
    insert into public.lcms_admin_emails(email, granted_by) values(email_value, auth.uid()) on conflict(email) do nothing;
  else
    delete from public.lcms_admin_emails where email = email_value;
  end if;
  insert into public.lcms_account_audit(actor_id, actor_username, action, details)
    values(auth.uid(), actor, case when allow_access then 'admin_access_granted' else 'admin_access_revoked' end,
      jsonb_build_object('email', email_value));
end $$;

-- The allowlist belongs to approved administrators, not every HRMO account.
drop policy if exists "allowed_users_select_hrmo" on public."LCMS-allowed-users";
drop policy if exists "allowed_users_insert_hrmo" on public."LCMS-allowed-users";
drop policy if exists "allowed_users_update_hrmo" on public."LCMS-allowed-users";
drop policy if exists "allowed_users_delete_hrmo" on public."LCMS-allowed-users";
-- Replace the exact policies from the base setup (and any renamed variants).
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'LCMS-allowed-users' loop
    execute format('drop policy %I on public."LCMS-allowed-users"', p.policyname);
  end loop;
end $$;
create policy allowed_users_admin on public."LCMS-allowed-users" for all to authenticated
  using ((select public.lcms_is_admin())) with check ((select public.lcms_is_admin()));

revoke all on function public.lcms_is_superadmin(), public.lcms_is_admin(), public.lcms_switch_superadmin_role(text,text), public.lcms_update_own_username(text), public.lcms_set_admin_email(text,boolean) from public, anon;
grant execute on function public.lcms_is_superadmin(), public.lcms_is_admin(), public.lcms_switch_superadmin_role(text,text), public.lcms_update_own_username(text), public.lcms_set_admin_email(text,boolean) to authenticated;
commit;
