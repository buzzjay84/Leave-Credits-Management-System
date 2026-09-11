-- Tracks which personnel have passed the National Assessment for School Heads
-- (NASH, formerly NQESH) so HRMO can quickly find candidates eligible for
-- promotion to School Head / Principal positions.
begin;
alter table public.leave_employees
  add column if not exists nash_passer boolean not null default false,
  add column if not exists nash_batch text;
commit;
