-- Apply after feature_leave_enhancements.sql. No historical rows are rewritten.
-- Documentary eligibility remains an HRMO check against the signed CS Form 6.
begin;

create or replace function public.lcms_check_leave_conditions(
  emp_id uuid, category text, label text, kind text, amount numeric,
  start_date date, end_date date, paid boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare emp public.leave_employees%rowtype; annual_limit numeric; used numeric;
  expected_label text; expected_kind text; month_limit integer;
begin
  select * into emp from public.leave_employees where id = emp_id for update;
  if not found then raise exception 'Employee not found'; end if;
  expected_label := case category
    when 'vacation' then 'Vacation Leave (VL)' when 'sick' then 'Sick Leave (SL)'
    when 'mandatory_forced' then 'Mandatory / Forced Leave'
    when 'vsc' then 'Vacation Service Credits (VSC)' when 'maternity' then 'Maternity Leave'
    when 'paternity' then 'Paternity Leave' when 'special_privilege' then 'Special Privilege Leave'
    when 'solo_parent' then 'Solo Parent Leave' when 'study' then 'Study Leave'
    when 'indefinite_sick' then 'Indefinite Sick Leave' when 'vawc' then '10-Day VAWC Leave'
    when 'rehabilitation' then 'Rehabilitation Privilege'
    when 'special_leave_women' then 'Special Leave Benefits for Women'
    when 'special_emergency' then 'Special Emergency (Calamity) Leave'
    when 'adoption' then 'Adoption Leave' when 'wellness' then 'Wellness Leave'
    when 'monetization' then 'Monetization of Leave Credits'
    when 'cto' then 'Compensatory Time Off (CTO)' when 'terminal' then 'Terminal Leave' end;
  if expected_label is null or label is distinct from expected_label then raise exception 'Invalid leave category or label'; end if;
  if amount is null or amount <= 0 or amount::text = 'NaN' or mod(amount, 0.5) <> 0 then raise exception 'Enter positive leave days in half-day increments'; end if;
  if start_date is null or end_date is null or end_date < start_date then raise exception 'Invalid leave dates'; end if;
  if category not in ('monetization', 'terminal') and amount > end_date - start_date + 1 then raise exception 'Leave days exceed the inclusive date range'; end if;
  if category = 'terminal' then raise exception 'Terminal leave requires a separate verified settlement, not an ordinary leave debit'; end if;
  if emp.emp_type = 'Teaching' and category in ('vacation','sick','mandatory_forced','special_privilege','monetization') then raise exception 'Leave is not available on teachers leave basis'; end if;
  if emp.emp_type <> 'Teaching' and category in ('vsc','indefinite_sick') then raise exception 'Leave requires teachers leave basis'; end if;
  expected_kind := case category when 'vacation' then 'VL_DEBIT' when 'mandatory_forced' then 'VL_DEBIT'
    when 'sick' then 'SL_DEBIT' when 'vsc' then 'VSC_DEBIT'
    when 'monetization' then 'MONETIZE' when 'cto' then 'CTO_DEBIT' else 'SPECIAL' end;
  if kind is distinct from expected_kind then raise exception 'Transaction type does not match leave category'; end if;
  if category not in ('study','indefinite_sick') and paid is distinct from true then raise exception 'Record unpaid absence separately from this paid leave or credit debit'; end if;
  if category = 'maternity' and (amount not in (60,105,120) or amount <> end_date-start_date+1) then raise exception 'Invalid maternity entitlement or calendar dates'; end if;
  if category = 'paternity' and amount > 7 then raise exception 'Paternity leave cannot exceed seven days per delivery'; end if;
  if category = 'wellness' and amount > 3 then raise exception 'Wellness leave cannot exceed three consecutive days per entry'; end if;
  month_limit := case category when 'rehabilitation' then 6 when 'special_leave_women' then 2
    when 'study' then case when emp.emp_type <> 'Teaching' then 6 end end;
  if month_limit is not null and end_date >= (start_date + make_interval(months => month_limit))::date then raise exception 'Leave exceeds the permitted calendar-month period'; end if;
  annual_limit := case category when 'special_privilege' then 3 when 'solo_parent' then 7 when 'wellness' then 5 end;
  if annual_limit is not null then
    if extract(year from start_date) <> extract(year from end_date) then raise exception 'Record annual leave separately for each calendar year'; end if;
    select coalesce(sum(abs(days)),0) into used from public.leave_transactions
      where employee_id = emp_id and leave_type = expected_label
      and date_from >= date_trunc('year',start_date)::date
      and date_from < (date_trunc('year',start_date) + interval '1 year')::date;
    if used + amount > annual_limit then raise exception 'Annual leave entitlement exceeded'; end if;
  end if;
end $$;
revoke all on function public.lcms_check_leave_conditions(uuid,text,text,text,numeric,date,date,boolean) from public;

create or replace function public.lcms_validate_leave_request_conditions()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Approval is checked before the debit by the approval RPC below.
  if new.status = 'pending' then
    perform public.lcms_check_leave_conditions(new.employee_id,new.leave_category,new.leave_type,
      new.txn_type,new.days,new.date_from,new.date_to,new.with_pay);
  end if;
  return new;
end $$;
drop trigger if exists lcms_leave_request_conditions on public.leave_requests;
create trigger lcms_leave_request_conditions before insert or update on public.leave_requests
for each row execute function public.lcms_validate_leave_request_conditions();

-- Direct HRMO recording and offline synchronization use the transaction table.
-- Validate the same limits while holding the employee row lock.
create or replace function public.lcms_validate_leave_transaction_conditions()
returns trigger language plpgsql security definer set search_path = '' as $$
declare category text;
begin
  if new.txn_type not in ('VL_DEBIT','SL_DEBIT','VSC_DEBIT','SPECIAL') then return new; end if;
  category := case new.leave_type
    when 'Vacation Leave (VL)' then 'vacation' when 'Sick Leave (SL)' then 'sick'
    when 'Mandatory / Forced Leave' then 'mandatory_forced'
    when 'Vacation Service Credits (VSC)' then 'vsc' when 'Maternity Leave' then 'maternity'
    when 'Paternity Leave' then 'paternity' when 'Special Privilege Leave' then 'special_privilege'
    when 'Solo Parent Leave' then 'solo_parent' when 'Study Leave' then 'study'
    when 'Indefinite Sick Leave' then 'indefinite_sick' when '10-Day VAWC Leave' then 'vawc'
    when 'Rehabilitation Privilege' then 'rehabilitation'
    when 'Special Leave Benefits for Women' then 'special_leave_women'
    when 'Special Emergency (Calamity) Leave' then 'special_emergency'
    when 'Adoption Leave' then 'adoption' when 'Wellness Leave' then 'wellness'
    when 'Terminal Leave' then 'terminal' end;
  if category is null then raise exception 'Unrecognized leave type for ordinary leave recording'; end if;
  if new.days >= 0 then raise exception 'Leave usage must be a negative transaction'; end if;
  perform public.lcms_check_leave_conditions(new.employee_id,category,new.leave_type,new.txn_type,
    abs(new.days),new.date_from,new.date_to,new.with_pay);
  return new;
end $$;
drop trigger if exists lcms_leave_transaction_conditions on public.leave_transactions;
create trigger lcms_leave_transaction_conditions before insert on public.leave_transactions
for each row execute function public.lcms_validate_leave_transaction_conditions();

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

  perform public.lcms_check_leave_conditions(requested.employee_id, requested.leave_category,
    requested.leave_type, requested.txn_type, requested.days, requested.date_from,
    requested.date_to, requested.with_pay);

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


commit;
