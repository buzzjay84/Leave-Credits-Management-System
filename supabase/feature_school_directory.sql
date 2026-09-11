-- LCMS feature upgrade: per-employee DepEd school assignment for School-Based staff.
-- Run after schema.sql, LCMS_SQL_EDITOR_SETUP.sql, and feature_leave_enhancements.sql
-- in the Supabase SQL editor.
--
-- assigned_school_id holds the official DepEd School ID (e.g. '126001') of the
-- specific school a Teaching or School-Based Non-Teaching employee works at.
-- This is distinct from leave_employees.school_id, which scopes rows to the
-- LCMS tenant/office account and is unrelated to the individual school.
alter table public.leave_employees
  add column if not exists assigned_school_id text;

-- work_assignment distinguishes SDO-Based from School-Based Non-Teaching staff
-- (null for Teaching employees, who are always school-based via assigned_school_id).
alter table public.leave_employees
  add column if not exists work_assignment text
    check (work_assignment is null or work_assignment in ('SDO-Based', 'School-Based'));

-- item_number holds the DBM PSIPOP plantilla item number (e.g.
-- 'OSEC-DECSB-ADOF2-570237-2020'), used to trace an employee record back to
-- their itemized position on the division's PSIPOP.
alter table public.leave_employees
  add column if not exists item_number text;

-- Keep TIN separate from employee_no. Discard PSIPOP's trailing 000 branch
-- code and store the normalized nine-digit TIN used by the admin UI.
alter table public.leave_employees
  add column if not exists tin_number text;

-- birth_date is sourced from the PSIPOP "Date of Birth" column. Not yet
-- surfaced in the Add/Edit Employee UI as of this migration.
alter table public.leave_employees
  add column if not exists birth_date date;
