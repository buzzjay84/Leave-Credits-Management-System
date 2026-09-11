-- Run after feature_appointments_role.sql to enable personnel editing.
begin;

drop policy if exists "appointments_employees_update" on public.leave_employees;
create policy "appointments_employees_update"
on public.leave_employees for update to authenticated
using ((select public.lcms_is_appointments()))
with check ((select public.lcms_is_appointments()));

-- Desktop offline synchronization uses INSERT ... ON CONFLICT UPDATE,
-- which requires both insert and update policies even for existing records.
drop policy if exists "appointments_employees_insert" on public.leave_employees;
create policy "appointments_employees_insert"
on public.leave_employees for insert to authenticated
with check ((select public.lcms_is_appointments()));

commit;
