-- LCMS feature upgrade: protected VL, 30-day monetization, and expiring CTO.
-- Run after schema.sql and LCMS_SQL_EDITOR_SETUP.sql in the Supabase SQL editor.

alter table public.leave_employees
  add column if not exists protected_vl_balance numeric(6,2) not null default 0
  check (protected_vl_balance >= 0);
alter table public.leave_employees
  add column if not exists retirement_date date,
  add column if not exists retirement_notes text;
alter table public.leave_employees
  add column if not exists salary_step integer not null default 1
    check (salary_step between 1 and 8),
  add column if not exists salary_step_mode text not null default 'manual'
    check (salary_step_mode in ('manual','automatic')),
  add column if not exists salary_step_basis_date date;

alter table public.leave_requests
  add column if not exists monetization_option text,
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_by_authority boolean not null default false,
  add column if not exists cancelled_by text,
  add column if not exists vl_regular_deducted numeric(5,2) not null default 0,
  add column if not exists vl_protected_deducted numeric(5,2) not null default 0,
  add column if not exists cancelled_at timestamptz;

-- Encoded by the UI as "VL<n>SL<m>" from two independent dropdowns (see
-- lcms_record_monetization) — e.g. "VL25SL5", "VL10SL0".
alter table public.leave_requests drop constraint if exists leave_requests_monetization_option_check;
alter table public.leave_requests add constraint leave_requests_monetization_option_check
  check (monetization_option is null or monetization_option ~ '^VL([0-9]{1,2})SL([0-9])$');

alter table public.leave_transactions drop constraint if exists leave_transactions_txn_type_check;
alter table public.leave_transactions add constraint leave_transactions_txn_type_check check (txn_type in (
  'VL_DEBIT','SL_DEBIT','VSC_CREDIT','VSC_DEBIT','VL_ADJUST','SL_ADJUST',
  'MONETIZE','SPECIAL','CTO_CREDIT','CTO_DEBIT','VL_PROTECTED_CREDIT','VL_CANCELLATION_CREDIT',
  'MANDATORY_FORFEIT','MANDATORY_EXEMPT'
));

alter table public.leave_requests drop constraint if exists leave_requests_txn_type_check;
alter table public.leave_requests add constraint leave_requests_txn_type_check
  check (txn_type in ('VL_DEBIT','SL_DEBIT','VSC_DEBIT','SPECIAL','MONETIZE','CTO_DEBIT'));
alter table public.leave_requests drop constraint if exists leave_requests_status_check;
alter table public.leave_requests add constraint leave_requests_status_check
  check (status in ('pending','approved','rejected','cancelled'));

create table if not exists public.leave_cto_credits (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.leave_employees(id) on delete cascade,
  school_id text not null,
  granted_days numeric(5,2) not null check (granted_days > 0),
  remaining_days numeric(5,2) not null check (remaining_days >= 0 and remaining_days <= granted_days),
  granted_on date not null,
  expires_on date not null,
  remarks text,
  granted_by text not null,
  created_at timestamptz not null default now(),
  check (expires_on = (granted_on + interval '1 year')::date)
);
create index if not exists idx_cto_employee_expiry
  on public.leave_cto_credits(employee_id, expires_on) where remaining_days > 0;

-- Enforce the configured calendar-year limits for both direct HRMO entries and
-- leave-request approvals. Existing positive SPECIAL rows and newer negative
-- usage rows are both counted through abs(days).
create or replace function public.lcms_enforce_annual_leave_limit()
returns trigger language plpgsql set search_path = '' as $$
declare annual_limit numeric; annual_used numeric;
begin
  annual_limit := case new.leave_type
    when 'Special Privilege Leave' then 3
    when 'Wellness Leave' then 3
    else null
  end;
  if annual_limit is null or new.date_from is null then return new; end if;

  select coalesce(sum(abs(days)), 0) into annual_used
  from public.leave_transactions
  where employee_id = new.employee_id
    and leave_type = new.leave_type
    and date_from >= date_trunc('year', new.date_from)::date
    and date_from < (date_trunc('year', new.date_from) + interval '1 year')::date;
  if annual_used + abs(new.days) > annual_limit then
    raise exception '% annual entitlement exceeded: % of % day(s) remain',
      new.leave_type, greatest(0, annual_limit - annual_used), annual_limit;
  end if;
  return new;
end $$;

drop trigger if exists lcms_enforce_annual_leave_limit on public.leave_transactions;
create trigger lcms_enforce_annual_leave_limit
before insert on public.leave_transactions
for each row execute function public.lcms_enforce_annual_leave_limit();
alter table public.leave_cto_credits enable row level security;
grant select on table public.leave_cto_credits to authenticated;
drop policy if exists "cto_select" on public.leave_cto_credits;
create policy "cto_select" on public.leave_cto_credits for select to authenticated
using ((select public.lcms_is_hrmo()) or school_id = (select public.lcms_current_school_id()));

drop policy if exists "requests_insert_aoii" on public.leave_requests;
create policy "requests_insert_aoii" on public.leave_requests for insert to authenticated
with check (
  requested_by_user = (select auth.uid()) and status = 'pending' and not form6_confirmed
  and school_id = (select public.lcms_current_school_id())
  and exists (select 1 from public."LCMS-profiles" p where p.id = (select auth.uid()) and p.role = 'aoii' and p.is_active)
  and exists (select 1 from public.leave_employees e where e.id = leave_requests.employee_id
    and e.school_id = leave_requests.school_id and e.is_active
    and ((e.emp_type = 'Teaching' and leave_requests.txn_type in ('VSC_DEBIT','CTO_DEBIT','SPECIAL'))
      or (e.emp_type = 'Non-Teaching' and leave_requests.txn_type in ('VL_DEBIT','SL_DEBIT','MONETIZE','CTO_DEBIT','SPECIAL'))))
);

create or replace function public.lcms_grant_cto(
  employee_uuid uuid, credit_days numeric, granted_date date, grant_note text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare employee public.leave_employees%rowtype; actor text; credit_id uuid;
begin
  if not public.lcms_is_hrmo() then raise exception 'Only an active HRMO account can grant CTO'; end if;
  if credit_days <= 0 then raise exception 'CTO days must be greater than zero'; end if;
  select * into employee from public.leave_employees where id = employee_uuid for update;
  if not found then raise exception 'Employee not found'; end if;
  select username into actor from public."LCMS-profiles" where id = (select auth.uid()) and is_active;
  insert into public.leave_cto_credits
    (employee_id, school_id, granted_days, remaining_days, granted_on, expires_on, remarks, granted_by)
  values (employee.id, employee.school_id, credit_days, credit_days, granted_date,
          (granted_date + interval '1 year')::date, grant_note, actor)
  returning id into credit_id;
  insert into public.leave_transactions
    (employee_id, school_id, txn_type, leave_type, days, date_from, date_to, remarks, recorded_by)
  values (employee.id, employee.school_id, 'CTO_CREDIT', 'Compensatory Time Off (CTO)', credit_days,
          granted_date, granted_date, grant_note, actor);
  return credit_id;
end $$;

create or replace function public.lcms_use_cto(
  employee_uuid uuid, used_days numeric, used_date date, use_note text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare employee public.leave_employees%rowtype; actor text; available numeric; remaining numeric; take_days numeric;
  credit record; transaction_uuid uuid;
begin
  if not public.lcms_is_hrmo() then raise exception 'Only an active HRMO account can deduct CTO'; end if;
  if used_date is null then raise exception 'CTO usage date is required'; end if;
  if used_days is null or used_days <= 0 then raise exception 'CTO days must be greater than zero'; end if;
  select * into employee from public.leave_employees where id = employee_uuid for update;
  if not found then raise exception 'Employee not found'; end if;
  select coalesce(sum(remaining_days), 0) into available from public.leave_cto_credits
    where employee_id = employee.id and remaining_days > 0 and granted_on <= used_date and expires_on > used_date;
  if used_days > available then raise exception 'Insufficient unexpired CTO balance'; end if;
  remaining := used_days;
  for credit in select id, remaining_days from public.leave_cto_credits
    where employee_id = employee.id and remaining_days > 0 and granted_on <= used_date and expires_on > used_date
    order by granted_on, expires_on, id for update
  loop
    exit when remaining <= 0;
    take_days := least(remaining, credit.remaining_days);
    update public.leave_cto_credits set remaining_days = remaining_days - take_days where id = credit.id;
    remaining := remaining - take_days;
  end loop;
  select username into actor from public."LCMS-profiles" where id = (select auth.uid()) and is_active;
  insert into public.leave_transactions
    (employee_id, school_id, txn_type, leave_type, days, date_from, date_to, remarks, recorded_by)
  values (employee.id, employee.school_id, 'CTO_DEBIT', 'Compensatory Time Off (CTO)', -used_days,
          used_date, used_date, use_note, actor) returning id into transaction_uuid;
  return transaction_uuid;
end $$;

create or replace function public.lcms_record_monetization(
  employee_uuid uuid, deduction_option text, monetization_date date, monetization_note text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare employee public.leave_employees%rowtype; actor text; vl_days numeric; sl_days numeric;
  regular_vl numeric; available_sl numeric; transaction_uuid uuid; monetized_this_year numeric; total_days numeric;
  parts text[];
begin
  if not public.lcms_is_hrmo() then raise exception 'Only an active HRMO account can record monetization'; end if;
  -- deduction_option is built by the UI as "VL<n>SL<m>" from two independent
  -- dropdowns (HRMO picks VL and SL days separately), not folded together.
  parts := regexp_match(deduction_option, '^VL([0-9]{1,2})SL([0-9])$');
  if parts is null then raise exception 'Invalid monetization selection'; end if;
  vl_days := parts[1]::numeric;
  sl_days := parts[2]::numeric;
  total_days := vl_days + sl_days;
  if total_days < 10 or total_days > 30 then
    raise exception 'Monetization must total between 10 and 30 days (VL + SL combined)';
  end if;
  select * into employee from public.leave_employees where id = employee_uuid for update;
  if not found or employee.emp_type <> 'Non-Teaching' then raise exception 'Monetization is only for non-teaching employees'; end if;
  regular_vl := coalesce(employee.vl_override,
    greatest(0, public.months_of_service(employee.hired_date) * 1.25 - coalesce(employee.vl_used, 0)));
  available_sl := coalesce(employee.sl_override,
    greatest(0, public.months_of_service(employee.hired_date) * 1.25 - coalesce(employee.sl_used, 0)));
  select coalesce(sum(abs(days)), 0) into monetized_this_year
  from public.leave_transactions where employee_id = employee.id and txn_type = 'MONETIZE'
    and date_from >= date_trunc('year', monetization_date)::date
    and date_from < (date_trunc('year', monetization_date) + interval '1 year')::date;
  if monetized_this_year + vl_days + sl_days > 30 then raise exception 'The annual 30-day monetization maximum would be exceeded'; end if;
  if regular_vl - vl_days < 5 then raise exception 'At least 5 regular VL days must remain after monetization'; end if;
  if sl_days > 0 and available_sl - sl_days < 0 then raise exception 'Insufficient sick leave balance for the SL portion of this monetization'; end if;
  select username into actor from public."LCMS-profiles" where id = (select auth.uid()) and is_active;
  update public.leave_employees set
    vl_used = coalesce(vl_used, 0) + vl_days, sl_used = coalesce(sl_used, 0) + sl_days,
    vl_override = case when vl_override is null then null else vl_override - vl_days end,
    sl_override = case when sl_override is null then null else sl_override - sl_days end,
    updated_at = now(), updated_by = actor where id = employee.id;
  insert into public.leave_transactions
    (employee_id, school_id, txn_type, leave_type, days, date_from, date_to, remarks, recorded_by)
  values (employee.id, employee.school_id, 'MONETIZE', 'Monetization of Leave Credits', -vl_days,
          monetization_date, monetization_date,
          concat('CSC Sec. 22 monetization: ', vl_days, ' VL day(s)',
            case when sl_days > 0 then concat(' + ', sl_days, ' SL day(s)') else '' end,
            case when monetization_note is null then '' else ': ' || monetization_note end), actor)
  returning id into transaction_uuid;
  if sl_days > 0 then
    insert into public.leave_transactions
      (employee_id, school_id, txn_type, leave_type, days, date_from, date_to, remarks, recorded_by)
    values (employee.id, employee.school_id, 'MONETIZE', 'Monetization of Leave Credits', -sl_days,
            monetization_date, monetization_date,
            concat('CSC Sec. 22 monetization (SL portion): ', vl_days, ' VL day(s) + ', sl_days, ' SL day(s)',
              case when monetization_note is null then '' else ': ' || monetization_note end), actor);
  end if;
  return transaction_uuid;
end $$;

-- Replace request approval so monetization, protected VL, and CTO are enforced atomically.
create or replace function public.lcms_approve_leave_request(
  request_uuid uuid, form6_is_confirmed boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare requested public.leave_requests%rowtype; employee public.leave_employees%rowtype;
  regular_balance numeric; protected_used numeric; regular_used numeric;
  new_transaction_id uuid; approver_name text; remaining numeric; take_days numeric; credit record;
  annual_used numeric; annual_limit numeric; mon_parts text[];
begin
  if not public.lcms_is_hrmo() then raise exception 'Only an active HRMO account can approve leave requests'; end if;
  if not coalesce(form6_is_confirmed, false) then raise exception 'Approval requires confirmation of the signed and approved CS Form 6'; end if;
  select username into approver_name from public."LCMS-profiles" where id = (select auth.uid()) and is_active;
  select * into requested from public.leave_requests where id = request_uuid for update;
  if not found then raise exception 'Leave request not found'; end if;
  if requested.status <> 'pending' then raise exception 'Leave request has already been reviewed'; end if;
  select * into employee from public.leave_employees where id = requested.employee_id for update;
  if not found or employee.school_id <> requested.school_id then raise exception 'Employee and request school do not match'; end if;

  -- Calendar-year entitlements: mandatory leave is charged to VL; Special
  -- Privilege and Wellness Leave are recorded outside accumulated VL/SL.
  annual_limit := case requested.leave_category
    when 'special_privilege' then 3
    when 'wellness' then 5
    when 'solo_parent' then 7
    else null
  end;
  if annual_limit is not null then
    select coalesce(sum(abs(days)), 0) into annual_used
    from public.leave_transactions
    where employee_id = employee.id
      and leave_type = requested.leave_type
      and date_from >= date_trunc('year', requested.date_from)::date
      and date_from < (date_trunc('year', requested.date_from) + interval '1 year')::date;
    if annual_used + requested.days > annual_limit then
      raise exception '% annual entitlement exceeded: % of % day(s) remain',
        requested.leave_type, greatest(0, annual_limit - annual_used), annual_limit;
    end if;
  end if;

  if requested.txn_type = 'MONETIZE' then
    mon_parts := regexp_match(requested.monetization_option, '^VL([0-9]{1,2})SL([0-9])$');
    if mon_parts is null or requested.days <> (mon_parts[1]::numeric + mon_parts[2]::numeric) then
      raise exception 'Requested monetization days do not match the selected VL/SL deduction';
    end if;
    select public.lcms_record_monetization(employee.id, requested.monetization_option,
      requested.date_from, requested.remarks) into new_transaction_id;
  elsif requested.txn_type = 'CTO_DEBIT' then
    select public.lcms_use_cto(employee.id, requested.days, requested.date_from,
      requested.remarks) into new_transaction_id;
  else
    if requested.txn_type = 'VL_DEBIT' then
      if employee.emp_type <> 'Non-Teaching' then raise exception 'VL deduction is not valid for this employee type'; end if;
      regular_balance := coalesce(employee.vl_override,
        greatest(0, public.months_of_service(employee.hired_date) * 1.25 - coalesce(employee.vl_used, 0)));
      if requested.days > regular_balance + employee.protected_vl_balance then raise exception 'Insufficient vacation leave balance'; end if;
      regular_used := least(requested.days, regular_balance);
      protected_used := requested.days - regular_used;
      update public.leave_employees set vl_used = coalesce(vl_used, 0) + regular_used,
        vl_override = case when vl_override is null then null else vl_override - regular_used end,
        protected_vl_balance = protected_vl_balance - protected_used,
        updated_at = now(), updated_by = approver_name where id = employee.id;
    elsif requested.txn_type = 'SL_DEBIT' then
      if employee.emp_type <> 'Non-Teaching' then raise exception 'SL deduction is not valid for this employee type'; end if;
      regular_balance := coalesce(employee.sl_override,
        greatest(0, public.months_of_service(employee.hired_date) * 1.25 - coalesce(employee.sl_used, 0)));
      if requested.days > regular_balance then raise exception 'Insufficient sick leave balance'; end if;
      update public.leave_employees set sl_used = coalesce(sl_used, 0) + requested.days,
        sl_override = case when sl_override is null then null else sl_override - requested.days end,
        updated_at = now(), updated_by = approver_name where id = employee.id;
    elsif requested.txn_type = 'VSC_DEBIT' then
      if employee.emp_type <> 'Teaching' or requested.days > coalesce(employee.vsc_balance, 0) then
        raise exception 'Insufficient or invalid VSC balance';
      end if;
      update public.leave_employees set vsc_used = coalesce(vsc_used, 0) + requested.days,
        vsc_balance = vsc_balance - requested.days, updated_at = now(), updated_by = approver_name
        where id = employee.id;
    end if;
    insert into public.leave_transactions
      (employee_id, school_id, txn_type, leave_type, days, date_from, date_to,
       reason, remarks, with_pay, approved_by, recorded_by)
    values (employee.id, employee.school_id, requested.txn_type, requested.leave_type,
      case when requested.txn_type in ('VL_DEBIT','SL_DEBIT','VSC_DEBIT','SPECIAL') then -requested.days else requested.days end,
      requested.date_from, requested.date_to, requested.reason, requested.remarks,
      requested.with_pay, approver_name, approver_name) returning id into new_transaction_id;
  end if;
  update public.leave_requests set status = 'approved', form6_confirmed = true,
    form6_confirmed_at = now(), reviewed_by = approver_name, reviewed_at = now(),
    vl_regular_deducted = case when requested.txn_type = 'VL_DEBIT' then coalesce(regular_used, 0) else 0 end,
    vl_protected_deducted = case when requested.txn_type = 'VL_DEBIT' then coalesce(protected_used, 0) else 0 end,
    transaction_id = new_transaction_id, updated_at = now() where id = requested.id;
  return new_transaction_id;
end $$;

create or replace function public.lcms_cancel_mandatory_leave(
  request_uuid uuid, cancellation_note text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare requested public.leave_requests%rowtype; employee public.leave_employees%rowtype; actor text; transaction_uuid uuid;
  regular_to_restore numeric; protected_to_restore numeric;
begin
  select * into requested from public.leave_requests where id = request_uuid for update;
  if not found or requested.status <> 'approved' or requested.leave_category <> 'mandatory_forced' then
    raise exception 'An approved mandatory/forced leave request is required';
  end if;
  if not (public.lcms_is_hrmo() or
    (requested.school_id = public.lcms_current_school_id() and requested.requested_by_user = (select auth.uid()))) then
    raise exception 'You cannot cancel this mandatory leave';
  end if;
  select * into employee from public.leave_employees where id = requested.employee_id for update;
  select username into actor from public."LCMS-profiles" where id = (select auth.uid()) and is_active;
  regular_to_restore := coalesce(requested.vl_regular_deducted, 0);
  protected_to_restore := coalesce(requested.vl_protected_deducted, 0);
  -- Legacy approvals did not store the split; those deductions came from
  -- regular VL first, so restore them there for backward compatibility.
  if regular_to_restore + protected_to_restore = 0 then regular_to_restore := requested.days; end if;
  update public.leave_employees set
    vl_used = greatest(0, coalesce(vl_used, 0) - regular_to_restore),
    vl_override = case when vl_override is null then null else vl_override + regular_to_restore end,
    protected_vl_balance = protected_vl_balance + protected_to_restore,
    updated_at = now(), updated_by = actor where id = employee.id;
  insert into public.leave_transactions
    (employee_id, school_id, txn_type, leave_type, days, date_from, date_to, remarks, recorded_by)
  values (employee.id, employee.school_id, 'VL_CANCELLATION_CREDIT', 'Authority-Cancelled Mandatory Leave (VL Restored)',
          requested.days, requested.date_from, requested.date_to,
          concat('Cancelled by signing authority due to exigency of service',
            '; regular VL restored: ', regular_to_restore,
            '; protected VL restored: ', protected_to_restore,
            case when cancellation_note is null then '' else ': ' || cancellation_note end), actor)
  returning id into transaction_uuid;
  update public.leave_requests set status = 'cancelled', cancellation_reason = cancellation_note,
    cancellation_by_authority = true, cancelled_by = actor,
    cancelled_at = now(), updated_at = now() where id = requested.id;
  return transaction_uuid;
end $$;

-- Apply the CSC year-end rule after a calendar year closes. Ordinary VL and
-- Mandatory/Forced Leave both count toward the five-day requirement.
-- Authority-cancelled scheduled days count as excused and their exact original
-- VL deduction is restored. Retirement/separation
-- during the year creates an audit entry and skips forfeiture.
create or replace function public.lcms_process_mandatory_year_end(compliance_year integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  employee public.leave_employees%rowtype;
  year_start date := make_date(compliance_year, 1, 1);
  year_end date := make_date(compliance_year, 12, 31);
  vl_applications numeric;
  authority_cancelled numeric;
  actual_vl_used numeric;
  monetized numeric;
  regular_balance numeric;
  eligibility_balance numeric;
  requirement_remaining numeric;
  forfeiture numeric;
  processed integer := 0;
begin
  if compliance_year >= extract(year from current_date)::integer then
    raise exception 'Mandatory-leave forfeiture can only process a completed calendar year';
  end if;

  for employee in
    select * from public.leave_employees
    where emp_type = 'Non-Teaching'
    for update
  loop
    if exists (
      select 1 from public.leave_transactions
      where employee_id = employee.id
        and txn_type in ('MANDATORY_FORFEIT', 'MANDATORY_EXEMPT')
        and date_from = year_end
    ) then continue; end if;

    if employee.retirement_date >= year_start and employee.retirement_date < year_end then
      insert into public.leave_transactions
        (employee_id, school_id, txn_type, leave_type, days, date_from, date_to, remarks, recorded_by)
      values
        (employee.id, employee.school_id, 'MANDATORY_EXEMPT', 'Mandatory Leave Retirement/Separation Exemption',
         0, year_end, year_end,
         concat('No year-end forfeiture: retirement/separation dated ', employee.retirement_date,
           case when employee.retirement_notes is null then '' else ' · ' || employee.retirement_notes end),
         'LCMS YEAR-END');
      processed := processed + 1;
      continue;
    end if;

    select coalesce(sum(abs(days)), 0) into vl_applications
    from public.leave_transactions
    where employee_id = employee.id and txn_type = 'VL_DEBIT'
      and leave_type in ('Vacation Leave (VL)', 'Mandatory / Forced Leave')
      and date_from between year_start and year_end;

    select coalesce(sum(abs(days)), 0) into authority_cancelled
    from public.leave_transactions
    where employee_id = employee.id and txn_type in ('VL_CANCELLATION_CREDIT', 'VL_PROTECTED_CREDIT')
      and date_from between year_start and year_end;

    select coalesce(sum(abs(days)), 0) into monetized
    from public.leave_transactions
    where employee_id = employee.id and txn_type = 'MONETIZE'
      and date_from between year_start and year_end;

    actual_vl_used := greatest(0, vl_applications - authority_cancelled);
    regular_balance := coalesce(employee.vl_override,
      greatest(0, public.months_of_service(employee.hired_date, year_end) * 1.25 - coalesce(employee.vl_used, 0)));
    eligibility_balance := regular_balance + coalesce(employee.protected_vl_balance, 0) + actual_vl_used;

    -- Fewer than 10 VL days makes forced leave optional, except when the
    -- employee monetized leave during the year.
    if eligibility_balance < 10 and monetized = 0 then continue; end if;

    requirement_remaining := greatest(0, 5 - least(5, actual_vl_used + authority_cancelled));
    forfeiture := least(requirement_remaining, regular_balance);

    update public.leave_employees set
      vl_used = coalesce(vl_used, 0) + forfeiture,
      vl_override = case when vl_override is null then null else greatest(0, vl_override - forfeiture) end,
      updated_at = now(), updated_by = 'LCMS YEAR-END'
    where id = employee.id;

    insert into public.leave_transactions
      (employee_id, school_id, txn_type, leave_type, days, date_from, date_to, remarks, recorded_by)
    values
      (employee.id, employee.school_id, 'MANDATORY_FORFEIT', 'Mandatory Leave Year-End Forfeiture',
       -forfeiture, year_end, year_end,
       concat('Calendar year ', compliance_year, ': ', actual_vl_used,
         ' VL day(s) taken; ', authority_cancelled,
         ' day(s) cancelled by signing authority; ', monetized,
         ' day(s) monetized; ', forfeiture, ' day(s) forfeited.'),
       'LCMS YEAR-END');
    processed := processed + 1;
  end loop;
  return processed;
end $$;

revoke all on function public.lcms_process_mandatory_year_end(integer) from public;

-- Supabase Cron runs shortly after midnight UTC every January 1 and processes
-- the calendar year that just ended. Re-running this migration replaces the job.
create extension if not exists pg_cron;
do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'lcms-mandatory-year-end';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'lcms-mandatory-year-end',
    '5 0 1 1 *',
    $job$select public.lcms_process_mandatory_year_end(extract(year from current_date)::integer - 1);$job$
  );
end $$;

revoke all on function public.lcms_grant_cto(uuid,numeric,date,text) from public;
revoke all on function public.lcms_use_cto(uuid,numeric,date,text) from public;
revoke all on function public.lcms_record_monetization(uuid,text,date,text) from public;
revoke all on function public.lcms_cancel_mandatory_leave(uuid,text) from public;
grant execute on function public.lcms_grant_cto(uuid,numeric,date,text) to authenticated;
grant execute on function public.lcms_use_cto(uuid,numeric,date,text) to authenticated;
grant execute on function public.lcms_record_monetization(uuid,text,date,text) to authenticated;
grant execute on function public.lcms_cancel_mandatory_leave(uuid,text) to authenticated;

-- ---------------------------------------------------------------------------
-- School self-service linking for the unassigned-employee pool.
-- Division-wide PSIPOP files (Elementary, SHS, ALS, Kinder) carry no
-- per-record school attribution, so those employees land with
-- school_id = 'UNASSIGNED'. Rather than wait on HRMO to reassign each one by
-- hand, a school downloads a blank CSV template, types in their own staff's
-- Family/First/Middle name, and uploads it. Each row is matched by name
-- against the unassigned pool. Ambiguous matches (more than one unassigned
-- employee sharing that name) are reported, not guessed at. School head,
-- principal, assistant principal, and head teacher positions are excluded
-- on purpose — those designations must still be assigned by HRMO.
-- ---------------------------------------------------------------------------
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
  where p.id = (select auth.uid()) and p.is_active;

  if caller_school_id is null or caller_school_id in ('DEFAULT', 'UNASSIGNED') then
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

    select count(*), max(e.id) into match_count, matched_id
    from public.leave_employees e
    where e.school_id = 'UNASSIGNED'
      and e.position !~* 'principal|head teacher'
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
        school_id = caller_school_id,
        assigned_school_id = caller_school_id,
        work_assignment = case when emp_type = 'Non-Teaching' then 'School-Based' else work_assignment end,
        updated_at = now(), updated_by = actor
      where id = matched_id;
      linked := true; reason := caller_school_name;
    end if;
    return next;
  end loop;
end;
$$;

revoke all on function public.lcms_link_unassigned_employees_by_name(jsonb) from public;
grant execute on function public.lcms_link_unassigned_employees_by_name(jsonb) to authenticated;
