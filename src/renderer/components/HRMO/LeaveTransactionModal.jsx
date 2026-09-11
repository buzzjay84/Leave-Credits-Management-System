import LeaveConditionsPanel from '@/components/shared/LeaveConditionsPanel'
import { validateLeaveConditions, conditionRemarks } from '@/utils/leaveConditions'
import { MATERNITY_OPTIONS, maternityEndDate, updateMaternityForm } from '@/utils/maternityLeave'
import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/utils/supabase'
import { createLocalId, hasLocalDatabase, recordLocalLeave, syncPendingChanges } from '@/utils/dataStore'
import { LEAVE_TYPES_TEACHING, LEAVE_TYPES_NONTEACHING, MONETIZATION_VL_OPTIONS, MONETIZATION_SL_OPTIONS, monetizationOptionKey, ctoBalance, fmt, isCtoEligible, leaveAvailability, monetizationEligibility, protectedVlBalance, regularVlBalance, slBalance, vlBalance, vscBalance } from '@/utils/leaveCalc'
import styles from './Modal.module.css'

export default function LeaveTransactionModal({ employee, onClose, onSaved, initialTransaction }) {
  const { user } = useAuth()
  const isTeaching = employee.emp_type === 'Teaching'
  const ctoEligible = isCtoEligible(employee)
  const leaveTypes = (isTeaching ? LEAVE_TYPES_TEACHING : LEAVE_TYPES_NONTEACHING)
    .filter(type => ctoEligible || type.key !== 'cto')

  const [form, setForm] = useState({
    txn_type: isTeaching ? 'VSC_DEBIT' : initialTransaction === 'CTO_CREDIT' ? 'CTO_CREDIT' : 'VL_DEBIT',
    leave_category: isTeaching ? 'vsc' : initialTransaction === 'CTO_CREDIT' ? 'cto' : 'vacation',
    days: '',
    date_from: '',
    date_to: '',
    reason: '',
    remarks: '',
    with_pay: true,
    order_no: '',
    approved_by: '',
    monetization_vl: 10,
    monetization_sl: 0,
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [success, setSuccess] = useState('')
  const selectedLeave = leaveTypes.find(type => type.key === form.leave_category)
  const availability = leaveAvailability(selectedLeave, employee, form.date_from ? new Date(`${form.date_from}T00:00:00`) : new Date())

  function set(field, val) { setForm(f => updateMaternityForm(f, field, val)) }

  function oneYearLater(dateStr) {
    if (!dateStr) return ''
    const [year, month, day] = dateStr.split('-').map(Number)
    const lastDay = new Date(year + 1, month, 0).getDate()
    return `${year + 1}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
  }

  const isCtoCredit = form.txn_type === 'CTO_CREDIT'
  const dateToValue = isCtoCredit ? oneYearLater(form.date_from) : form.date_to

  function selectLeaveCategory(category) {
    let txnType = 'SPECIAL'
    if (category === 'vsc') txnType = 'VSC_DEBIT'
    else if (category === 'vacation' || category === 'mandatory_forced') txnType = 'VL_DEBIT'
    else if (category === 'sick') txnType = 'SL_DEBIT'
    else if (category === 'monetization') txnType = 'MONETIZE'
    else if (category === 'cto') txnType = 'CTO_DEBIT'

    setForm(current => updateMaternityForm({ ...current, txn_type: txnType }, 'leave_category', category))
  }

  async function handleSave() {
    const days = form.txn_type === 'MONETIZE' ? form.monetization_vl + form.monetization_sl : +form.days
    if (!days || isNaN(days) || days <= 0) { setErr('Enter a valid number of days.'); return }
    if (form.leave_category === 'maternity' && (!MATERNITY_OPTIONS.some(option => option.days === days) || form.date_to !== maternityEndDate(form.date_from, days) || !form.with_pay)) {
      setErr('Select a valid maternity entitlement and start date. Record any extension separately.'); return
    }
    const conditionError = validateLeaveConditions({ ...form, days }, employee, { requireConfirmation: true })
    if (conditionError) return setErr(conditionError)
    if (!form.date_from) { setErr('Date from is required.'); return }
    if (form.txn_type === 'MONETIZE') {
      const eligibility = monetizationEligibility(employee, form.monetization_vl, form.monetization_sl, new Date(`${form.date_from}T00:00:00`))
      if (!eligibility.eligible) { setErr(eligibility.reason); return }
    }
    if (form.txn_type === 'CTO_DEBIT' && days > ctoBalance(employee)) { setErr('Insufficient unexpired CTO balance.'); return }
    if (form.txn_type === 'VL_DEBIT' && days > vlBalance(employee)) { setErr('Insufficient vacation leave balance.'); return }
    if (form.txn_type === 'SL_DEBIT' && days > slBalance(employee)) { setErr('Insufficient sick leave balance.'); return }
    if (form.txn_type === 'VSC_DEBIT' && days > vscBalance(employee)) { setErr('Insufficient VSC balance.'); return }
    if (availability.remaining !== null && days > availability.remaining) {
      setErr(`Only ${fmt(availability.remaining)} day(s) of ${selectedLeave.label} remain for this calendar year.`); return
    }
    setSaving(true); setErr('')
    try {
      const isDebit = ['VL_DEBIT','SL_DEBIT','VSC_DEBIT','CTO_DEBIT','MONETIZE','SPECIAL'].includes(form.txn_type)
      const successMessage = form.txn_type === 'SPECIAL'
        ? `Special leave recorded: ${days} day(s) used outside VL/SL credits.`
        : `Leave recorded: ${days} days ${isDebit ? 'deducted' : 'credited'} successfully.`
      if (form.txn_type === 'CTO_CREDIT' || form.txn_type === 'CTO_DEBIT') {
        const rpcName = form.txn_type === 'CTO_CREDIT' ? 'lcms_grant_cto' : 'lcms_use_cto'
        const rpcArgs = form.txn_type === 'CTO_CREDIT'
          ? { employee_uuid: employee.id, credit_days: days, granted_date: form.date_from, grant_note: form.remarks || form.reason || null }
          : { employee_uuid: employee.id, used_days: days, used_date: form.date_from, use_note: form.remarks || form.reason || null }
        const { error: ctoError } = await supabase.rpc(rpcName, rpcArgs)
        if (ctoError) throw ctoError
        setSuccess(form.txn_type === 'CTO_CREDIT'
          ? `${days} CTO days granted. They expire one year after ${form.date_from}.`
          : `${days} CTO days deducted from the earliest-expiring credits.`)
        await onSaved?.()
        return
      }

      if (form.txn_type === 'MONETIZE') {
        const { error: monetizationError } = await supabase.rpc('lcms_record_monetization', {
          employee_uuid: employee.id,
          deduction_option: monetizationOptionKey(form.monetization_vl, form.monetization_sl),
          monetization_date: form.date_from,
          monetization_note: form.remarks || form.reason || null
        })
        if (monetizationError) throw monetizationError
        setSuccess(form.monetization_sl > 0
          ? `${days} days monetized (${form.monetization_vl} VL + ${form.monetization_sl} SL) and documented. At least 5 regular VL days remain.`
          : `${days} VL days monetized and documented. At least 5 regular VL days remain.`)
        await onSaved?.()
        return
      }
      const transaction = {
        id: createLocalId(),
        employee_id: employee.id,
        school_id: employee.school_id,
        txn_type: form.txn_type,
        leave_type: selectedLeave?.label || form.leave_category,
        days: isDebit ? -days : days,
        date_from: form.date_from,
        date_to: form.date_to || form.date_from,
        reason: form.reason,
        remarks: conditionRemarks(form),
        with_pay: form.with_pay,
        order_no: form.order_no,
        approved_by: form.approved_by,
        recorded_by: user?.username || 'hrmo',
        created_at: new Date().toISOString()
      }

      const updates = { updated_at: new Date().toISOString() }
      if (form.txn_type === 'VL_DEBIT') {
        const regularUsed = Math.min(days, regularVlBalance(employee))
        const protectedUsed = days - regularUsed
        updates.vl_used = (employee.vl_used || 0) + regularUsed
        updates.protected_vl_balance = protectedVlBalance(employee) - protectedUsed
        if (employee.vl_override !== null && employee.vl_override !== undefined) updates.vl_override = employee.vl_override - regularUsed
      } else if (form.txn_type === 'SL_DEBIT') {
        updates.sl_used = (employee.sl_used || 0) + days
        if (employee.sl_override !== null && employee.sl_override !== undefined) updates.sl_override = employee.sl_override - days
      } else if (form.txn_type === 'VSC_DEBIT') {
        updates.vsc_used = (employee.vsc_used || 0) + days
        updates.vsc_balance = Math.max(0, (employee.vsc_balance || 0) - days)
      } else if (form.txn_type === 'VSC_CREDIT') {
        updates.vsc_balance = (employee.vsc_balance || 0) + days
        updates.vsc_earned_this_sy = (employee.vsc_earned_this_sy || 0) + days
      }

      if (hasLocalDatabase()) {
        await recordLocalLeave(transaction, { ...employee, ...updates })
        const sync = await syncPendingChanges()
        setSuccess(sync.pending > 0
          ? `Leave recorded locally. ${sync.pending} change(s) will sync when online.`
          : successMessage)
      } else {
        const { error: transactionError } = await supabase.from('leave_transactions').insert([transaction])
        if (transactionError) throw transactionError
        const { error: employeeError } = await supabase.from('leave_employees').update(updates).eq('id', employee.id)
        if (employeeError) throw employeeError
        setSuccess(successMessage)
      }
      await onSaved?.()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal} style={{ maxWidth: 480 }}>
        <div className={styles.modalHeader}>
          <h2>Record Leave — {employee.last_name}, {employee.first_name}{employee.middle_name ? ` ${employee.middle_name}` : ''}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          {/* Current balances */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${(isTeaching ? 1 : 2) + (ctoEligible ? 1 : 0)}, 1fr)`, gap: 8, marginBottom: 14 }}>
            {isTeaching
              ? <div className={styles.balCard}><div className={styles.balLabel}>VSC Balance</div><div className={styles.balVal}>{fmt(vscBalance(employee))} days</div></div>
              : <>
                  <div className={styles.balCard}><div className={styles.balLabel}>VL Balance</div><div className={styles.balVal}>{fmt(vlBalance(employee))} days</div></div>
                  <div className={styles.balCard}><div className={styles.balLabel}>SL Balance</div><div className={styles.balVal}>{fmt(slBalance(employee))} days</div></div>
                </>
            }
            {ctoEligible && <div className={styles.balCard}><div className={styles.balLabel}>Active CTO</div><div className={styles.balVal}>{fmt(ctoBalance(employee))} days</div></div>}
          </div>

          {success
            ? <div className={styles.successBox}>{success}<br /><button className={styles.btnCancel} style={{ marginTop: 10 }} onClick={onClose}>Close</button></div>
            : <>
                <div className={styles.grid2}>
                  <div className={styles.field} style={{ gridColumn: '1/-1' }}>
                    <label>Leave Type *</label>
                    <select value={form.leave_category} onChange={e => selectLeaveCategory(e.target.value)}>
                      {leaveTypes.map(type => (
                        <option key={type.key} value={type.key}>
                          {type.label} — {type.basis}
                        </option>
                      ))}
                    </select>
                  </div>
                  {(form.leave_category === 'cto' || form.leave_category === 'vsc') && <div className={styles.field} style={{ gridColumn: '1/-1' }}>
                    <label>Action</label>
                    <select value={form.txn_type} onChange={e => set('txn_type', e.target.value)}>
                      {form.leave_category === 'cto'
                        ? [
                            <option key="debit" value="CTO_DEBIT">− CTO Used</option>,
                            <option key="credit" value="CTO_CREDIT">+ CTO Credit (expires in 1 year)</option>,
                          ]
                        : [
                            <option key="debit" value="VSC_DEBIT">− VSC Used / Offset</option>,
                            <option key="credit" value="VSC_CREDIT">+ VSC Credit (HRMO Input)</option>,
                          ]}
                    </select>
                  </div>}

                  <LeaveConditionsPanel form={form} set={set} />
                  {selectedLeave?.deduction && <div className={styles.infoBox} style={{ gridColumn: '1/-1', margin: 0 }}>
                    <strong>Credit treatment:</strong> {selectedLeave.deduction}
                    {availability.remaining !== null && <>. Remaining this calendar year: <strong>{fmt(availability.remaining)} of {fmt(selectedLeave.annualEntitlement)} days</strong>.</>}
                    {availability.requirementRemaining !== undefined && <>. Mandatory requirement remaining: <strong>{fmt(availability.requirementRemaining)} day(s)</strong>.</>}
                  </div>}
                  <div className={styles.field}>
                    <label>Number of Days *</label>
                    {form.leave_category === 'maternity' && <p>Calendar days, including weekends and holidays. End date is calculated from Date From.</p>}
                    {form.leave_category === 'maternity' ? <select aria-label="Maternity leave days" value={form.days} onChange={event => set('days', Number(event.target.value))}>
                      {MATERNITY_OPTIONS.map(option => <option key={option.days} value={option.days}>{option.label}</option>)}
                    </select> : (<input type="number" min="0.5" step="0.5" value={form.txn_type === 'MONETIZE' ? form.monetization_vl + form.monetization_sl : form.days} disabled={form.txn_type === 'MONETIZE'} onChange={e => set('days', e.target.value)} placeholder="0.00" />)}
                  </div>
                  {form.txn_type === 'MONETIZE' && <div className={styles.field}>
                    <label>VL Days to Monetize *</label>
                    <select value={form.monetization_vl} onChange={e => set('monetization_vl', +e.target.value)}>
                      {MONETIZATION_VL_OPTIONS.map(days => <option key={days} value={days}>{days} VL day(s)</option>)}
                    </select>
                  </div>}
                  {form.txn_type === 'MONETIZE' && <div className={styles.field}>
                    <label>SL Days to Monetize</label>
                    <select value={form.monetization_sl} onChange={e => set('monetization_sl', +e.target.value)}>
                      {MONETIZATION_SL_OPTIONS.map(days => <option key={days} value={days}>{days} SL day(s)</option>)}
                    </select>
                  </div>}
                  <div className={styles.field}>
                    <label>With Pay?</label>
                    <select disabled={form.leave_category === 'maternity'} value={form.with_pay} onChange={e => set('with_pay', e.target.value === 'true')}>
                      <option value="true">Yes</option>
                      <option value="false">No (LWOP)</option>
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label>Date From *</label>
                    <input type="date" value={form.date_from} onChange={e => set('date_from', e.target.value)} />
                  </div>
                  <div className={styles.field}>
                    <label>Date To{isCtoCredit ? ' (expires, auto-computed)' : ''}</label>
                    <input
                      type="date"
                      value={dateToValue}
                      disabled={isCtoCredit || form.leave_category === 'maternity'}
                      onChange={e => set('date_to', e.target.value)}
                    />
                  </div>
                  <div className={styles.field} style={{ gridColumn: '1/-1' }}>
                    <label>Reason</label>
                    <input value={form.reason} onChange={e => set('reason', e.target.value)} placeholder="illness / personal / official business…" />
                  </div>
                  <div className={styles.field}>
                    <label>Approved By</label>
                    <input value={form.approved_by} onChange={e => set('approved_by', e.target.value)} placeholder="School Head / HRMO" />
                  </div>
                  <div className={styles.field}>
                    <label>Special Order No. (if VSC)</label>
                    <input value={form.order_no} onChange={e => set('order_no', e.target.value)} placeholder="SO No." />
                  </div>
                  <div className={styles.field} style={{ gridColumn: '1/-1' }}>
                    <label>Remarks</label>
                    <input value={form.remarks} onChange={e => set('remarks', e.target.value)} placeholder="VSC applied / offset VSC deduction…" />
                  </div>
                </div>
                {err && <div className={styles.errorBox}>{err}</div>}
              </>
          }
        </div>

        {!success && (
          <div className={styles.footer}>
            <button className={styles.btnCancel} onClick={onClose}>Cancel</button>
            <button className={styles.btnSave} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Record Leave'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
