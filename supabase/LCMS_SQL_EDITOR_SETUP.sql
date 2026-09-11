-- Leave Credits Management System (LCMS)
-- Run this entire file once in the IECES Dashboard Manager Supabase SQL Editor.
-- It is safe for a shared project: the auth trigger only handles app_id = LCMS.

-- ---------------------------------------------------------------------------
-- LCMS identity and registration tables
-- Hyphens require these table names to remain double-quoted in SQL.
-- ---------------------------------------------------------------------------
create table if not exists public."LCMS-profiles" (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  email text not null,
  full_name text not null,
  role text not null check (role in ('hrmo', 'aoii')),
  school_id text not null default 'DEFAULT',
  school_name text not null default 'Default Organization',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists lcms_profiles_username_ci
  on public."LCMS-profiles" (lower(username));
create unique index if not exists lcms_profiles_email_ci
  on public."LCMS-profiles" (lower(email));

create table if not exists public."LCMS-allowed-users" (
  id uuid primary key default gen_random_uuid(),
  -- Username is chosen by the registrant at signup, not assigned ahead of
  -- time — eligibility is matched on email + name instead (see
  -- lcms_check_registration below), so this stays nullable pre-registration.
  username text,
  email text not null,
  full_name text,
  last_name text,
  first_name text,
  middle_name text,
  role text not null default 'aoii' check (role in ('hrmo', 'aoii')),
  school_id text not null default 'DEFAULT',
  school_name text not null default 'Default Organization',
  registered_user_id uuid unique references auth.users(id) on delete set null,
  is_active boolean not null default true,
  added_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists lcms_allowed_email_ci
  on public."LCMS-allowed-users" (lower(email));

-- ---------------------------------------------------------------------------
-- Security helper functions
-- ---------------------------------------------------------------------------
create or replace function public.lcms_is_hrmo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public."LCMS-profiles" p
    where p.id = (select auth.uid())
      and p.role = 'hrmo'
      and p.is_active
  );
$$;

create or replace function public.lcms_current_school_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.school_id from public."LCMS-profiles" p
  where p.id = (select auth.uid()) and p.is_active
  limit 1;
$$;

-- Filipino middle names are often two words (e.g. "Delos Reyes", "Delos
-- Santos"); the conventional initial for either is two letters ("D.R.",
-- "D.S."), not one. This turns a full middle name (or an initial already
-- typed as such) into that per-word-initial form so registration/linking
-- can match a full name against an initial-only entry either way.
create or replace function public.lcms_name_initials(full_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    (select string_agg(left(word, 1), '.' order by ord) || '.'
     from unnest(regexp_split_to_array(upper(trim(coalesce(full_name, ''))), '\s+')) with ordinality as t(word, ord)
     where word <> ''),
    '.'
  );
$$;

-- Single source of truth for registration eligibility: tells the caller
-- exactly which part failed (email vs name) so the UI can show a specific
-- message instead of a generic "not approved" error.
create or replace function public.lcms_check_registration(
  user_email text, family_name text, given_name text, middle_name text default null
)
returns table(email_matched boolean, name_matched boolean, already_registered boolean, role text, school_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  by_email public."LCMS-allowed-users"%rowtype;
  matched boolean := false;
begin
  select * into by_email from public."LCMS-allowed-users" a
  where lower(a.email) = lower(trim(user_email)) and a.is_active
  limit 1;

  if not found then
    return query select false, false, false, null::text, null::text;
    return;
  end if;

  matched :=
    lower(trim(by_email.last_name)) = lower(trim(family_name))
    and lower(trim(by_email.first_name)) = lower(trim(given_name))
    and (
      coalesce(trim(by_email.middle_name), '') = ''
      or coalesce(trim(middle_name), '') = ''
      or lower(trim(by_email.middle_name)) = lower(trim(middle_name))
      or public.lcms_name_initials(by_email.middle_name) = public.lcms_name_initials(middle_name)
    );

  return query select
    true,
    matched,
    (by_email.registered_user_id is not null),
    case when matched then by_email.role else null end,
    case when matched then by_email.school_name else null end;
end;
$$;

create or replace function public.lcms_get_login_email(uname text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.email
  from public."LCMS-profiles" p
  join public."LCMS-allowed-users" a on a.registered_user_id = p.id
  where lower(p.username) = lower(trim(uname))
    and p.is_active
    and a.is_active
  limit 1;
$$;

create or replace function public.lcms_is_current_user_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public."LCMS-profiles" p
    join public."LCMS-allowed-users" a on a.registered_user_id = p.id
    where p.id = (select auth.uid()) and p.is_active and a.is_active
  );
$$;

revoke all on function public.lcms_is_hrmo() from public;
revoke all on function public.lcms_current_school_id() from public;
revoke all on function public.lcms_check_registration(text, text, text, text) from public;
revoke all on function public.lcms_get_login_email(text) from public;
revoke all on function public.lcms_is_current_user_allowed() from public;
grant execute on function public.lcms_is_hrmo() to authenticated;
grant execute on function public.lcms_current_school_id() to authenticated;
grant execute on function public.lcms_check_registration(text, text, text, text) to anon, authenticated;
grant execute on function public.lcms_get_login_email(text) to anon, authenticated;
grant execute on function public.lcms_is_current_user_allowed() to authenticated;

-- ---------------------------------------------------------------------------
-- Shared-project-safe Auth trigger
-- Other apps in this Supabase project are ignored unless they set app_id=LCMS.
-- ---------------------------------------------------------------------------
create or replace function public.lcms_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  approved public."LCMS-allowed-users"%rowtype;
  meta jsonb := new.raw_user_meta_data;
  reg_last text := trim(meta ->> 'last_name');
  reg_first text := trim(meta ->> 'first_name');
  reg_middle text := nullif(trim(coalesce(meta ->> 'middle_name', '')), '');
  reg_username text := trim(meta ->> 'username');
  display_name text;
begin
  if coalesce(meta ->> 'app_id', '') <> 'LCMS' then
    return new;
  end if;

  select * into approved
  from public."LCMS-allowed-users" a
  where lower(a.email) = lower(new.email)
    and a.registered_user_id is null
    and a.is_active
  for update
  limit 1;

  if not found then
    raise exception 'LCMS registration is not authorized for this email address';
  end if;

  if lower(trim(approved.last_name)) is distinct from lower(reg_last)
     or lower(trim(approved.first_name)) is distinct from lower(reg_first)
     or not (
       coalesce(trim(approved.middle_name), '') = ''
       or coalesce(reg_middle, '') = ''
       or lower(trim(approved.middle_name)) = lower(reg_middle)
       or public.lcms_name_initials(approved.middle_name) = public.lcms_name_initials(reg_middle)
     ) then
    raise exception 'LCMS registration name does not match the approved record for this email';
  end if;

  display_name := trim(concat_ws(' ', reg_first, reg_middle, reg_last));

  insert into public."LCMS-profiles" (
    id, username, email, full_name, role, school_id, school_name
  ) values (
    new.id,
    reg_username,
    new.email,
    coalesce(nullif(display_name, ''), reg_username),
    approved.role,
    approved.school_id,
    approved.school_name
  );

  update public."LCMS-allowed-users"
  set registered_user_id = new.id, updated_at = now()
  where id = approved.id;

  return new;
end;
$$;

revoke all on function public.lcms_handle_new_user() from public;

drop trigger if exists on_lcms_auth_user_created on auth.users;
create trigger on_lcms_auth_user_created
  after insert on auth.users
  for each row execute function public.lcms_handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security for LCMS identity tables
-- ---------------------------------------------------------------------------
alter table public."LCMS-profiles" enable row level security;
alter table public."LCMS-allowed-users" enable row level security;

revoke all on table public."LCMS-profiles" from anon;
revoke all on table public."LCMS-allowed-users" from anon;
grant select on table public."LCMS-profiles" to authenticated;
grant select, insert, update, delete on table public."LCMS-allowed-users" to authenticated;

drop policy if exists "lcms_profiles_select" on public."LCMS-profiles";
create policy "lcms_profiles_select"
on public."LCMS-profiles" for select to authenticated
using (id = (select auth.uid()) or (select public.lcms_is_hrmo()));

drop policy if exists "lcms_allowed_select_hrmo" on public."LCMS-allowed-users";
create policy "lcms_allowed_select_hrmo"
on public."LCMS-allowed-users" for select to authenticated
using ((select public.lcms_is_hrmo()));

drop policy if exists "lcms_allowed_insert_hrmo" on public."LCMS-allowed-users";
create policy "lcms_allowed_insert_hrmo"
on public."LCMS-allowed-users" for insert to authenticated
with check ((select public.lcms_is_hrmo()));

drop policy if exists "lcms_allowed_update_hrmo" on public."LCMS-allowed-users";
create policy "lcms_allowed_update_hrmo"
on public."LCMS-allowed-users" for update to authenticated
using ((select public.lcms_is_hrmo()))
with check ((select public.lcms_is_hrmo()));

drop policy if exists "lcms_allowed_delete_hrmo" on public."LCMS-allowed-users";
create policy "lcms_allowed_delete_hrmo"
on public."LCMS-allowed-users" for delete to authenticated
using ((select public.lcms_is_hrmo()));

-- ---------------------------------------------------------------------------
-- Apply school-scoped RLS to the existing LCMS operational tables.
-- The main schema.sql must be run first if these tables do not yet exist.
-- ---------------------------------------------------------------------------
alter table if exists public.leave_employees enable row level security;
alter table if exists public.leave_transactions enable row level security;
alter table if exists public.leave_requests enable row level security;
alter table if exists public.leave_accrual_log enable row level security;
alter table if exists public.leave_sy_config enable row level security;

drop policy if exists "employees_select" on public.leave_employees;
create policy "employees_select" on public.leave_employees for select to authenticated
using ((select public.lcms_is_hrmo()) or school_id = (select public.lcms_current_school_id()));
drop policy if exists "employees_insert" on public.leave_employees;
create policy "employees_insert" on public.leave_employees for insert to authenticated
with check ((select public.lcms_is_hrmo()));
drop policy if exists "employees_update" on public.leave_employees;
create policy "employees_update" on public.leave_employees for update to authenticated
using ((select public.lcms_is_hrmo())) with check ((select public.lcms_is_hrmo()));
drop policy if exists "employees_delete" on public.leave_employees;
create policy "employees_delete" on public.leave_employees for delete to authenticated
using ((select public.lcms_is_hrmo()));

drop policy if exists "txn_select" on public.leave_transactions;
create policy "txn_select" on public.leave_transactions for select to authenticated
using ((select public.lcms_is_hrmo()) or school_id = (select public.lcms_current_school_id()));
drop policy if exists "txn_insert" on public.leave_transactions;
create policy "txn_insert" on public.leave_transactions for insert to authenticated
with check ((select public.lcms_is_hrmo()));

grant select, insert on table public.leave_requests to authenticated;

drop policy if exists "requests_select" on public.leave_requests;
create policy "requests_select" on public.leave_requests for select to authenticated
using (
  (select public.lcms_is_hrmo())
  or school_id = (select public.lcms_current_school_id())
);

drop policy if exists "requests_insert_aoii" on public.leave_requests;
create policy "requests_insert_aoii" on public.leave_requests for insert to authenticated
with check (
  requested_by_user = (select auth.uid())
  and status = 'pending'
  and not form6_confirmed
  and school_id = (select public.lcms_current_school_id())
  and exists (
    select 1 from public."LCMS-profiles" p
    where p.id = (select auth.uid()) and p.role = 'aoii' and p.is_active
  )
  and exists (
    select 1 from public.leave_employees e
    where e.id = leave_requests.employee_id
      and e.school_id = leave_requests.school_id
      and e.is_active
      and (
        (e.emp_type = 'Teaching' and leave_requests.txn_type in ('VSC_DEBIT', 'SPECIAL'))
        or (e.emp_type = 'Non-Teaching' and leave_requests.txn_type in ('VL_DEBIT', 'SL_DEBIT', 'SPECIAL'))
      )
  )
);

-- Approval is deliberately an atomic database operation. It locks both the
-- request and employee, prevents double approval, checks the balance, creates
-- the transaction, deducts credits, and marks the request approved.
create or replace function public.lcms_approve_leave_request(
  request_uuid uuid,
  form6_is_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested public.leave_requests%rowtype;
  employee public.leave_employees%rowtype;
  available_balance numeric;
  new_transaction_id uuid;
  approver_name text;
begin
  if not public.lcms_is_hrmo() then
    raise exception 'Only an active HRMO account can approve leave requests';
  end if;
  if not coalesce(form6_is_confirmed, false) then
    raise exception 'Approval requires confirmation of the signed and approved CS Form 6';
  end if;

  select p.username into approver_name from public."LCMS-profiles" p
  where p.id = (select auth.uid()) and p.is_active;

  select * into requested from public.leave_requests
  where id = request_uuid for update;
  if not found then raise exception 'Leave request not found'; end if;
  if requested.status <> 'pending' then raise exception 'Leave request has already been reviewed'; end if;

  select * into employee from public.leave_employees
  where id = requested.employee_id for update;
  if not found then raise exception 'Employee not found'; end if;
  if employee.school_id <> requested.school_id then raise exception 'Employee and request school do not match'; end if;

  if requested.txn_type = 'VL_DEBIT' then
    if employee.emp_type <> 'Non-Teaching' then raise exception 'VL deduction is not valid for this employee type'; end if;
    available_balance := coalesce(employee.vl_override,
      greatest(0, public.months_of_service(employee.hired_date) * 1.25 - coalesce(employee.vl_used, 0)));
    if requested.days > available_balance then raise exception 'Insufficient vacation leave balance'; end if;
    update public.leave_employees set
      vl_used = coalesce(vl_used, 0) + requested.days,
      vl_override = case when vl_override is null then null else vl_override - requested.days end,
      updated_at = now(), updated_by = approver_name
    where id = employee.id;
  elsif requested.txn_type = 'SL_DEBIT' then
    if employee.emp_type <> 'Non-Teaching' then raise exception 'SL deduction is not valid for this employee type'; end if;
    available_balance := coalesce(employee.sl_override,
      greatest(0, public.months_of_service(employee.hired_date) * 1.25 - coalesce(employee.sl_used, 0)));
    if requested.days > available_balance then raise exception 'Insufficient sick leave balance'; end if;
    update public.leave_employees set
      sl_used = coalesce(sl_used, 0) + requested.days,
      sl_override = case when sl_override is null then null else sl_override - requested.days end,
      updated_at = now(), updated_by = approver_name
    where id = employee.id;
  elsif requested.txn_type = 'VSC_DEBIT' then
    if employee.emp_type <> 'Teaching' then raise exception 'VSC deduction is not valid for this employee type'; end if;
    if requested.days > coalesce(employee.vsc_balance, 0) then raise exception 'Insufficient VSC balance'; end if;
    update public.leave_employees set
      vsc_used = coalesce(vsc_used, 0) + requested.days,
      vsc_balance = coalesce(vsc_balance, 0) - requested.days,
      updated_at = now(), updated_by = approver_name
    where id = employee.id;
  end if;

  insert into public.leave_transactions (
    employee_id, school_id, txn_type, leave_type, days, date_from, date_to,
    reason, remarks, with_pay, approved_by, recorded_by
  ) values (
    requested.employee_id, requested.school_id, requested.txn_type, requested.leave_type,
    case when requested.txn_type in ('VL_DEBIT', 'SL_DEBIT', 'VSC_DEBIT') then -requested.days else requested.days end,
    requested.date_from, requested.date_to, requested.reason, requested.remarks,
    requested.with_pay, approver_name, approver_name
  ) returning id into new_transaction_id;

  update public.leave_requests set
    status = 'approved', form6_confirmed = true, form6_confirmed_at = now(),
    reviewed_by = approver_name, reviewed_at = now(), transaction_id = new_transaction_id,
    updated_at = now()
  where id = requested.id;

  return new_transaction_id;
end;
$$;

create or replace function public.lcms_reject_leave_request(
  request_uuid uuid,
  rejection_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  reviewer_name text;
begin
  if not public.lcms_is_hrmo() then
    raise exception 'Only an active HRMO account can reject leave requests';
  end if;
  select p.username into reviewer_name from public."LCMS-profiles" p
  where p.id = (select auth.uid()) and p.is_active;
  update public.leave_requests set
    status = 'rejected', rejection_reason = nullif(trim(rejection_note), ''),
    reviewed_by = reviewer_name, reviewed_at = now(), updated_at = now()
  where id = request_uuid and status = 'pending';
  if not found then raise exception 'Pending leave request not found'; end if;
end;
$$;

revoke all on function public.lcms_approve_leave_request(uuid, boolean) from public;
revoke all on function public.lcms_reject_leave_request(uuid, text) from public;
grant execute on function public.lcms_approve_leave_request(uuid, boolean) to authenticated;
grant execute on function public.lcms_reject_leave_request(uuid, text) to authenticated;

drop policy if exists "accrual_select" on public.leave_accrual_log;
create policy "accrual_select" on public.leave_accrual_log for select to authenticated
using ((select public.lcms_is_hrmo()));
drop policy if exists "accrual_insert" on public.leave_accrual_log;
create policy "accrual_insert" on public.leave_accrual_log for insert to authenticated
with check ((select public.lcms_is_hrmo()));

drop policy if exists "sy_select" on public.leave_sy_config;
create policy "sy_select" on public.leave_sy_config for select to authenticated using (true);

-- Ensure the convenience view obeys the caller's table policies instead of
-- using the view owner's privileges (Postgres 15+, used by Supabase).
alter view if exists public.leave_balances set (security_invoker = true);

-- ---------------------------------------------------------------------------
-- First approved HRMO account (edit values before running this INSERT)
-- ---------------------------------------------------------------------------
-- insert into public."LCMS-allowed-users"
--   (email, last_name, first_name, middle_name, role, school_id, school_name, added_by)
-- values
--   ('replace-me@example.com', 'Dela Cruz', 'Juan', 'Santos', 'hrmo',
--    'DEFAULT', 'Default Organization', 'IECES Dashboard Manager');
