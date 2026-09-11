-- Captures why and when an employee's active service ended (death, transfer
-- to another agency, resignation, or other reasons) so HRMO/Admin can mark a
-- record inactive (is_active = false) without deleting it. is_active already
-- drives leave_balances and psipopVacancies (frees the OSEC item back into
-- Vacant Items) — this just gives it a UI-facing reason/date instead of only
-- being settable by direct SQL.
begin;

alter table public.leave_employees add column if not exists separation_date date;
alter table public.leave_employees add column if not exists separation_reason text;
alter table public.leave_employees add column if not exists separation_notes text;

alter table public.leave_employees drop constraint if exists leave_employees_separation_reason_check;
alter table public.leave_employees add constraint leave_employees_separation_reason_check
  check (separation_reason is null or separation_reason in ('Death', 'Transferred to Other Agency', 'Resigned', 'Other'));

commit;
