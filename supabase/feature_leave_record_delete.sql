-- LCMS feature: HRMO can delete a leave record (transaction or rejected
-- request) from the Leave Records Admin table, with balances reversed so
-- the employee's stored balance never drifts from their visible history.
-- Run after schema.sql, LCMS_SQL_EDITOR_SETUP.sql, and feature_leave_enhancements.sql.

create or replace function public.lcms_delete_leave_transaction(p_transaction_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  txn public.leave_transactions%rowtype;
  employee public.leave_employees%rowtype;
  actor text;
  linked_request public.leave_requests%rowtype;
  regular_to_restore numeric;
  protected_to_restore numeric;
  is_sl_portion boolean;
  credit_batch public.leave_cto_credits%rowtype;
  credit_count int;
begin
  if not public.lcms_is_hrmo() then
    raise exception 'Only an active HRMO account can delete a leave record';
  end if;

  select * into txn from public.leave_transactions where id = p_transaction_id for update;
  if not found then raise exception 'Leave record not found'; end if;

  select * into employee from public.leave_employees where id = txn.employee_id for update;
  if not found then raise exception 'Employee for this record was not found'; end if;

  select username into actor from public."LCMS-profiles" where id = (select auth.uid()) and is_active;

  -- A request that was approved into this transaction carries the exact
  -- regular/protected VL split used at approval time (see
  -- lcms_approve_leave_request) — reuse it here instead of guessing.
  select * into linked_request from public.leave_requests where transaction_id = txn.id for update;

  if txn.txn_type = 'VL_DEBIT' then
    if found then
      regular_to_restore := coalesce(linked_request.vl_regular_deducted, 0);
      protected_to_restore := coalesce(linked_request.vl_protected_deducted, 0);
      if regular_to_restore + protected_to_restore = 0 then regular_to_restore := abs(txn.days); end if;
    else
      -- Directly-recorded entries don't store the split, so restore into
      -- regular VL first and only spill into protected VL for whatever
      -- regular can't absorb — mirrors how the deduction was computed.
      regular_to_restore := least(abs(txn.days), greatest(0, coalesce(employee.vl_used, 0)));
      protected_to_restore := abs(txn.days) - regular_to_restore;
    end if;
    update public.leave_employees set
      vl_used = greatest(0, coalesce(vl_used, 0) - regular_to_restore),
      vl_override = case when vl_override is null then null else vl_override + regular_to_restore end,
      protected_vl_balance = protected_vl_balance + protected_to_restore,
      updated_at = now(), updated_by = actor where id = employee.id;

  elsif txn.txn_type = 'SL_DEBIT' then
    update public.leave_employees set
      sl_used = greatest(0, coalesce(sl_used, 0) - abs(txn.days)),
      sl_override = case when sl_override is null then null else sl_override + abs(txn.days) end,
      updated_at = now(), updated_by = actor where id = employee.id;

  elsif txn.txn_type = 'VSC_DEBIT' then
    update public.leave_employees set
      vsc_used = greatest(0, coalesce(vsc_used, 0) - abs(txn.days)),
      vsc_balance = coalesce(vsc_balance, 0) + abs(txn.days),
      updated_at = now(), updated_by = actor where id = employee.id;

  elsif txn.txn_type = 'VSC_CREDIT' then
    update public.leave_employees set
      vsc_balance = greatest(0, coalesce(vsc_balance, 0) - abs(txn.days)),
      vsc_earned_this_sy = greatest(0, coalesce(vsc_earned_this_sy, 0) - abs(txn.days)),
      updated_at = now(), updated_by = actor where id = employee.id;

  elsif txn.txn_type = 'MONETIZE' then
    -- Monetize records up to two rows (a VL-portion row and, when an SL
    -- amount was chosen, a second row tagged "(SL portion)" in its
    -- remarks) — see lcms_record_monetization. Reverse only the portion
    -- this specific row represents.
    is_sl_portion := coalesce(txn.remarks, '') ilike '%SL portion%';
    if is_sl_portion then
      update public.leave_employees set
        sl_used = greatest(0, coalesce(sl_used, 0) - abs(txn.days)),
        sl_override = case when sl_override is null then null else sl_override + abs(txn.days) end,
        updated_at = now(), updated_by = actor where id = employee.id;
    else
      update public.leave_employees set
        vl_used = greatest(0, coalesce(vl_used, 0) - abs(txn.days)),
        vl_override = case when vl_override is null then null else vl_override + abs(txn.days) end,
        updated_at = now(), updated_by = actor where id = employee.id;
    end if;

  elsif txn.txn_type in ('VL_ADJUST', 'SL_ADJUST', 'SPECIAL') then
    null; -- these never touch a balance field when recorded, so deleting is balance-neutral

  elsif txn.txn_type = 'CTO_CREDIT' then
    select count(*) into credit_count from public.leave_cto_credits
      where employee_id = employee.id and granted_on = txn.date_from and granted_days = txn.days;
    if credit_count <> 1 then
      raise exception 'Cannot automatically match this CTO credit to its grant batch — delete it from CTO records directly if needed';
    end if;
    select * into credit_batch from public.leave_cto_credits
      where employee_id = employee.id and granted_on = txn.date_from and granted_days = txn.days for update;
    if credit_batch.remaining_days <> credit_batch.granted_days then
      raise exception 'This CTO credit has already been partly or fully used and cannot be safely deleted — record a correcting entry instead';
    end if;
    delete from public.leave_cto_credits where id = credit_batch.id;

  elsif txn.txn_type = 'CTO_DEBIT' then
    raise exception 'CTO usage cannot be safely undone automatically because it does not record which grant it drew from — record a correcting CTO credit instead';

  elsif txn.txn_type in ('VL_CANCELLATION_CREDIT', 'MANDATORY_FORFEIT', 'MANDATORY_EXEMPT', 'VL_PROTECTED_CREDIT') then
    raise exception '% entries are system-generated and cannot be deleted from here', txn.txn_type;

  else
    raise exception 'Unrecognized transaction type: %', txn.txn_type;
  end if;

  -- The transaction being deleted was the approval outcome of a request —
  -- put that request back to pending rather than leaving it "approved"
  -- with a dangling transaction reference.
  if linked_request.id is not null and txn.txn_type in ('VL_DEBIT','SL_DEBIT','VSC_DEBIT','MONETIZE') then
    update public.leave_requests set
      status = 'pending', transaction_id = null, form6_confirmed = false, form6_confirmed_at = null,
      reviewed_by = null, reviewed_at = null, vl_regular_deducted = 0, vl_protected_deducted = 0,
      updated_at = now()
    where id = linked_request.id;
  end if;

  delete from public.leave_transactions where id = txn.id;
end $$;

revoke all on function public.lcms_delete_leave_transaction(uuid) from public;
grant execute on function public.lcms_delete_leave_transaction(uuid) to authenticated;

create or replace function public.lcms_delete_rejected_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare requested public.leave_requests%rowtype;
begin
  if not public.lcms_is_hrmo() then
    raise exception 'Only an active HRMO account can delete a leave record';
  end if;
  select * into requested from public.leave_requests where id = p_request_id for update;
  if not found then raise exception 'Leave request not found'; end if;
  if requested.status <> 'rejected' then
    raise exception 'Only a rejected request can be deleted this way';
  end if;
  delete from public.leave_requests where id = requested.id;
end $$;

revoke all on function public.lcms_delete_rejected_request(uuid) from public;
grant execute on function public.lcms_delete_rejected_request(uuid) to authenticated;
