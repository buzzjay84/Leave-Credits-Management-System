-- Run after feature_leave_enhancements.sql. Applies to direct HRMO usage and request approval.
begin;
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
revoke all on function public.lcms_use_cto(uuid, numeric, date, text) from public;
grant execute on function public.lcms_use_cto(uuid, numeric, date, text) to authenticated;
commit;
