-- New 'appointments' account role: a division-wide, read-only counterpart to
-- HRMO scoped to exactly two things — viewing personnel (no edit) and
-- generating CS Form 33-B appointment paperwork from vacant OSEC items.
begin;

alter table public."LCMS-profiles" drop constraint if exists "LCMS-profiles_role_check";
alter table public."LCMS-profiles" add constraint "LCMS-profiles_role_check"
  check (role = any (array['hrmo'::text, 'aoii'::text, 'appointments'::text]));

alter table public."LCMS-allowed-users" drop constraint if exists "LCMS-allowed-users_role_check";
alter table public."LCMS-allowed-users" add constraint "LCMS-allowed-users_role_check"
  check (role = any (array['hrmo'::text, 'aoii'::text, 'appointments'::text]));

create or replace function public.lcms_is_appointments() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public."LCMS-profiles" p
    where p.id = (select auth.uid())
      and p.role = 'appointments'
      and p.is_active
  );
$$;

-- Read-only personnel visibility division-wide (no insert/update/delete grant).
drop policy if exists "employees_select" on public.leave_employees;
create policy "employees_select" on public.leave_employees for select to authenticated
using (
  (select public.lcms_is_hrmo())
  or school_id = (select public.lcms_current_school_id())
  or (select public.lcms_is_appointments())
);

-- Needed to list vacant OSEC items for the appointment generator.
drop policy if exists "psipop_items_read" on public.leave_psipop_items;
create policy "psipop_items_read" on public.leave_psipop_items for select to authenticated
using ((select public.lcms_is_hrmo()) or (select public.lcms_is_appointments()));

drop policy if exists "cti_items_select" on public.leave_cti_items;
create policy "cti_items_select" on public.leave_cti_items for select to authenticated
using ((select public.lcms_is_hrmo()) or (select public.lcms_is_appointments()));

-- Full read/write on position templates, matching what Admin can already do —
-- this role's whole purpose is generating and refining these appointments.
drop policy if exists "position_templates_select" on public.leave_position_templates;
create policy "position_templates_select" on public.leave_position_templates for select to authenticated
using ((select public.lcms_is_admin()) or (select public.lcms_is_appointments()));

drop policy if exists "position_templates_write" on public.leave_position_templates;
create policy "position_templates_write" on public.leave_position_templates for all to authenticated
using ((select public.lcms_is_admin()) or (select public.lcms_is_appointments()))
with check ((select public.lcms_is_admin()) or (select public.lcms_is_appointments()));

-- Let the superadmin switch into this dashboard like the others.
create or replace function public.lcms_switch_superadmin_role(target_dashboard text, target_school_id text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public."LCMS-profiles"%rowtype; next_role text; next_school text; next_school_name text;
begin
  if not public.lcms_is_superadmin() then raise exception 'Superadmin access required'; end if;
  if target_dashboard not in ('admin', 'hrmo', 'aoii', 'appointments') or target_dashboard is null then raise exception 'Invalid dashboard'; end if;
  select * into p from public."LCMS-profiles" where id = auth.uid() for update;
  next_role := case
    when target_dashboard = 'aoii' then 'aoii'
    when target_dashboard = 'appointments' then 'appointments'
    else 'hrmo'
  end;
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

commit;
