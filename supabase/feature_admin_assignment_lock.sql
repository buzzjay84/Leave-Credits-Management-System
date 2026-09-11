-- Run after feature_staff_assignment.sql.
-- When the Admin Console assigns a teacher to a school/SDO, that assignment
-- is now locked: AO self-service (lcms_assign_teacher_to_school, the CSV
-- linker) can no longer take the teacher over or remove them. Only HRMO/Admin,
-- writing directly to leave_employees under the employees_update RLS policy,
-- can change a locked assignment.
begin;

alter table public.leave_employees add column if not exists assignment_locked boolean not null default false;

-- Retire a legacy RPC with no role/emp_type/leadership/lock checks (granted
-- even to anon) that predates lcms_assign_teacher_to_school, is no longer
-- called from any frontend code, and would otherwise bypass this lock.
drop function if exists public.lcms_unassign_employee_from_school(uuid);

-- Return shape gains admin_locked, so replace the old signature first.
drop function if exists public.lcms_search_teachers_by_name(text, text, text);
create or replace function public.lcms_search_teachers_by_name(
  family_name text, given_name text, middle text default ''
)
returns table(id uuid, last_name text, first_name text, middle_name text,
  "position" text, school_id text, item_number text, assignment_locked boolean, admin_locked boolean)
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public."LCMS-profiles" p
    where p.id = auth.uid() and p.is_active and p.role = 'aoii'
      and nullif(trim(p.school_id), '') is not null
      and p.school_id not in ('DEFAULT', 'UNASSIGNED')) then
    raise exception 'An active school AO account is required';
  end if;
  if coalesce(trim(family_name), '') = '' or coalesce(trim(given_name), '') = '' then
    raise exception 'Enter the family name and first name';
  end if;
  return query select e.id, e.last_name, e.first_name, e.middle_name,
    e.position, e.school_id, e.item_number,
    (e.ao_assigned_school_id is not null or e.assignment_locked), e.assignment_locked
  from public.leave_employees e
  where e.is_active and e.emp_type = 'Teaching'
    and e.position !~* 'principal|head teacher|school head'
    and lower(trim(e.last_name)) = lower(trim(family_name))
    and lower(trim(e.first_name)) = lower(trim(given_name))
    and (coalesce(trim(middle), '') = ''
      or lower(trim(e.middle_name)) = lower(trim(middle))
      or public.lcms_name_initials(e.middle_name) = public.lcms_name_initials(middle))
  order by e.last_name, e.first_name, e.middle_name, e.id;
end;
$$;

create or replace function public.lcms_assign_teacher_to_school(
  personnel_id uuid, expected_school_id text, remove_assignment boolean default false
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  caller_school text;
  actor text;
  employee public.leave_employees%rowtype;
  destination text;
begin
  select p.school_id, p.username into caller_school, actor
  from public."LCMS-profiles" p
  where p.id = auth.uid() and p.is_active and p.role = 'aoii';
  if nullif(trim(caller_school), '') is null or caller_school in ('DEFAULT', 'UNASSIGNED') then
    raise exception 'An active school AO account is required';
  end if;
  if remove_assignment is null then raise exception 'Choose an assignment action'; end if;
  select * into employee from public.leave_employees e where e.id = personnel_id for update;
  if not found then raise exception 'Personnel record no longer exists'; end if;
  if employee.is_active is distinct from true or employee.emp_type <> 'Teaching'
    or employee.position ~* 'principal|head teacher|school head' then
    raise exception 'This personnel assignment must be managed by HRMO';
  end if;
  if employee.school_id is distinct from expected_school_id then
    raise exception 'The assignment has changed. Refresh the list and try again';
  end if;
  -- An Administrator placed this teacher here from the Admin Console — AO
  -- self-service can neither take them over nor remove them, on add or removal alike.
  if employee.assignment_locked then
    raise exception 'This teacher''s school assignment was set by the Administrator and can only be changed from the Admin Console';
  end if;
  if remove_assignment and employee.school_id <> caller_school then
    raise exception 'You can only remove teachers currently assigned to your school';
  end if;
  if not remove_assignment and employee.school_id = caller_school then
    raise exception 'This teacher is already assigned to your school';
  end if;
  if not remove_assignment and employee.ao_assigned_school_id is not null then
    raise exception 'This teacher is already assigned by another AO. Their current school must remove them first';
  end if;
  destination := case when remove_assignment then 'UNASSIGNED' else caller_school end;
  if employee.school_id = destination then return; end if;
  if exists (select 1 from public.leave_requests r
    where r.employee_id = personnel_id and r.status = 'pending') then
    raise exception 'HRMO must resolve pending leave requests before changing this assignment';
  end if;
  update public.leave_employees e set
    item_school_id = coalesce(e.item_school_id,
      nullif(nullif(e.assigned_school_id, 'UNASSIGNED'), 'DEFAULT'),
      nullif(nullif(e.school_id, 'UNASSIGNED'), 'DEFAULT')),
    school_id = destination,
    ao_assigned_school_id = case when remove_assignment then null else caller_school end,
    assigned_school_id = case when remove_assignment then null else caller_school end,
    updated_at = now(), updated_by = actor
  where e.id = personnel_id;
  insert into public.leave_staff_assignment_log
    (employee_id, previous_school_id, new_school_id, changed_by)
    values (personnel_id, employee.school_id, destination, auth.uid());
end;
$$;

-- Keep bulk CSV linking from picking up an admin-locked record too (in
-- practice a locked Teaching record is never left UNASSIGNED, but this stays
-- consistent with the manual-search-and-add path above).
create or replace function public.lcms_link_unassigned_employees_by_name(rows jsonb)
returns table(last_name text, first_name text, middle_name text, linked boolean, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_school_id text;
  caller_school_name text;
  actor text;
  r jsonb;
  match_count int;
  matched_id uuid;
  row_last text;
  row_first text;
  row_middle text;
begin
  select p.school_id, p.school_name, p.username into caller_school_id, caller_school_name, actor
  from public."LCMS-profiles" p
  where p.id = (select auth.uid()) and p.is_active and p.role = 'aoii';

  if nullif(trim(caller_school_id), '') is null or caller_school_id in ('DEFAULT', 'UNASSIGNED') then
    raise exception 'Only a school-based account can link unassigned employees to a school';
  end if;

  for r in select * from jsonb_array_elements(rows) loop
    row_last := trim(coalesce(r ->> 'last_name', ''));
    row_first := trim(coalesce(r ->> 'first_name', ''));
    row_middle := nullif(trim(coalesce(r ->> 'middle_name', '')), '');
    last_name := row_last; first_name := row_first; middle_name := row_middle;

    if row_last = '' or row_first = '' then
      linked := false; reason := 'Missing family or first name';
      return next; continue;
    end if;

    select count(*), (array_agg(e.id))[1] into match_count, matched_id
    from public.leave_employees e
    where e.school_id = 'UNASSIGNED' and e.is_active and e.ao_assigned_school_id is null
      and not e.assignment_locked
      and e.position !~* 'principal|head teacher|school head'
      and lower(trim(e.last_name)) = lower(row_last)
      and lower(trim(e.first_name)) = lower(row_first)
      and (
        row_middle is null or coalesce(trim(e.middle_name), '') = ''
        or lower(trim(e.middle_name)) = lower(row_middle)
        or public.lcms_name_initials(e.middle_name) = public.lcms_name_initials(row_middle)
      );

    if match_count = 0 then
      linked := false; reason := 'No matching unassigned employee found';
    elsif match_count > 1 then
      linked := false; reason := 'Multiple matches found — ask HRMO to link this one manually';
    else
      update public.leave_employees set
        item_school_id = coalesce(item_school_id, nullif(nullif(assigned_school_id, 'UNASSIGNED'), 'DEFAULT')),
        school_id = caller_school_id,
        ao_assigned_school_id = caller_school_id,
        assigned_school_id = caller_school_id,
        work_assignment = case when emp_type = 'Non-Teaching' then 'School-Based' else work_assignment end,
        updated_at = now(), updated_by = actor
      where id = matched_id and school_id = 'UNASSIGNED' and ao_assigned_school_id is null and not assignment_locked;
      linked := found;
      if linked then
        insert into public.leave_staff_assignment_log (employee_id, previous_school_id, new_school_id, changed_by)
          values (matched_id, 'UNASSIGNED', caller_school_id, auth.uid());
        reason := caller_school_name;
      else
        reason := 'Assignment changed; search again';
      end if;
    end if;
    return next;
  end loop;
end;
$$;

revoke all on function public.lcms_search_teachers_by_name(text, text, text) from public;
revoke all on function public.lcms_link_unassigned_employees_by_name(jsonb) from public;
grant execute on function public.lcms_search_teachers_by_name(text, text, text) to authenticated;
grant execute on function public.lcms_link_unassigned_employees_by_name(jsonb) to authenticated;

commit;
