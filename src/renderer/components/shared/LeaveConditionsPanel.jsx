import { leaveConditions } from '@/utils/leaveConditions'
import styles from '@/components/HRMO/Modal.module.css'

export default function LeaveConditionsPanel({ form, set }) {
  return <div className={styles.infoBox} style={{ gridColumn: '1/-1', margin: 0 }}>
    <strong>Eligibility and requirements</strong>
    <ul style={{ paddingLeft: 20 }}>{leaveConditions(form.leave_category).map(condition => <li key={condition}>{condition}</li>)}</ul>
    {form.leave_category === 'study' && <label className={styles.field}>Study purpose
      <select value={form.study_purpose || 'examination'} onChange={event => set('study_purpose', event.target.value)}>
        <option value="examination">Bar / board examination or teacher study leave</option>
        <option value="masters">Complete a masters degree</option>
      </select>
    </label>}
    {['study', 'indefinite_sick', 'adoption', 'vawc', 'special_emergency'].includes(form.leave_category) && <label className={styles.field}>
      Authority reference (required for approved duration/pay or an extension)
      <input value={form.condition_reference || ''} onChange={event => set('condition_reference', event.target.value)} placeholder="Order or certification reference; omit medical/case details" />
    </label>}
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10 }}>
      <input type="checkbox" style={{ width: 'auto', marginTop: 3 }} checked={!!form.conditions_confirmed} onChange={event => set('conditions_confirmed', event.target.checked)} />
      <span>I have checked the applicable eligibility, supporting documents, approved dates/pay and prior usage for this entitlement. HRMO must verify these before approval.</span>
    </label>
  </div>
}
