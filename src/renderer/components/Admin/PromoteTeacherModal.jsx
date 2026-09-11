import { useState } from 'react'
import { POSITIONS_TEACHING } from '@/utils/leaveCalc'
import { formatPeso, formatSalaryGrade, monthlySalaryFor, salaryGradeForPosition, salaryStepsForGrade } from '@/utils/salarySchedule'
import modalStyles from '@/components/HRMO/Modal.module.css'

function today() { return new Date().toISOString().slice(0, 10) }

// Writes a promotion/reclassification straight to the employee's roster
// record — position, OSEC item number, and salary grade/step all change
// together, gated behind confirming the NOSCA is on file. Reuses the plain
// `notes` column for a dated remarks trail since there's no dedicated
// promotion-history table.
export default function PromoteTeacherModal({ employee, onSave, onClose }) {
  const [position, setPosition] = useState(employee.position || '')
  const [itemNumber, setItemNumber] = useState(employee.item_number || '')
  const [step, setStep] = useState(Number(employee.salary_step) || 1)
  const [effectiveDate, setEffectiveDate] = useState(today())
  const [noscaOnFile, setNoscaOnFile] = useState(false)
  const [remarks, setRemarks] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const grade = salaryGradeForPosition(position)
  const steps = salaryStepsForGrade(grade)
  const monthlySalary = grade ? monthlySalaryFor(grade, step) : null

  async function handleSave() {
    if (!noscaOnFile) { setErr('Confirm the NOSCA is on file before saving this reclassification.'); return }
    if (!position) { setErr('Select the new position.'); return }
    if (!itemNumber.trim()) { setErr('Enter the new OSEC item number.'); return }
    if (!effectiveDate) { setErr('Enter the effective date.'); return }
    setSaving(true)
    setErr('')
    const note = `Reclassified to ${position} (Item ${itemNumber.trim()}) effective ${effectiveDate}${remarks.trim() ? ` — ${remarks.trim()}` : ''}.`
    const updatedNotes = [employee.notes, note].filter(Boolean).join('\n')
    const result = await onSave({
      position,
      item_number: itemNumber.trim(),
      salary_grade: formatSalaryGrade(grade, step),
      salary_step: step,
      salary_step_mode: 'manual',
      salary_step_basis_date: effectiveDate,
      monthly_salary: monthlySalary,
      notes: updatedNotes,
    })
    setSaving(false)
    if (result?.error) {
      setErr(result.error)
    } else if (result?.pendingSync) {
      setErr('Saved on this device, but could not reach the server yet — this change has NOT synced to Supabase and other dashboards will not see it. It will retry automatically.')
    } else {
      onClose()
    }
  }

  return (
    <div className={modalStyles.overlay}>
      <div className={modalStyles.modal}>
        <div className={modalStyles.modalHeader}>
          <h2>Reclass — {employee.last_name}, {employee.first_name}{employee.middle_name ? ` ${employee.middle_name}` : ''}</h2>
          <button className={modalStyles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={modalStyles.body}>
          <div className={modalStyles.infoBox}>
            Current: {employee.position || 'Unspecified'} · Item {employee.item_number || '—'}
          </div>
          <div className={modalStyles.field}>
            <label>New Position *</label>
            <select value={position} onChange={e => setPosition(e.target.value)}>
              <option value="">Select a position</option>
              {POSITIONS_TEACHING.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className={modalStyles.grid2}>
            <div className={modalStyles.field}>
              <label>New OSEC Item No. *</label>
              <input value={itemNumber} onChange={e => setItemNumber(e.target.value)} placeholder="Item number from the NOSCA" />
            </div>
            <div className={modalStyles.field}>
              <label>Salary Step</label>
              <select value={step} onChange={e => setStep(Number(e.target.value))} disabled={!grade}>
                {(steps.length ? steps : [1]).map(s => <option key={s} value={s}>Step {s}</option>)}
              </select>
            </div>
          </div>
          <div className={modalStyles.grid2}>
            <div className={modalStyles.field}>
              <label>Effective Date *</label>
              <input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} />
            </div>
            <div className={modalStyles.field}>
              <label>New Salary Grade / Monthly Salary</label>
              <input type="text" readOnly value={grade ? `${formatSalaryGrade(grade, step)} · ${formatPeso(monthlySalary) || '—'}` : '—'} />
            </div>
          </div>
          <div className={modalStyles.field}>
            <label>
              <input type="checkbox" checked={noscaOnFile} onChange={e => setNoscaOnFile(e.target.checked)} style={{ marginRight: 6 }} />
              NOSCA on file for this reclassification
            </label>
            <div className={modalStyles.fieldHint}>
              Confirm the DBM Notice of Organization, Staffing and Compensation Action (NOSCA) approving this reclassification has been received. This must be checked before the reclassification can be saved.
            </div>
          </div>
          <div className={modalStyles.field}>
            <label>Remarks</label>
            <textarea rows={2} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional notes about this reclassification…" />
          </div>
          {err && <div className={modalStyles.errorBox}>{err}</div>}
        </div>
        <div className={modalStyles.footer}>
          <button className={modalStyles.btnCancel} onClick={onClose}>Cancel</button>
          <button className={modalStyles.btnSave} onClick={handleSave} disabled={saving || !noscaOnFile}>
            {saving ? 'Saving…' : 'Save Reclass'}
          </button>
        </div>
      </div>
    </div>
  )
}
