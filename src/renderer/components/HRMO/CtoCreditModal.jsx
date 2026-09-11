import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/utils/supabase'
import { fmt, fmtDate, ctoCredits } from '@/utils/leaveCalc'
import styles from '@/components/shared/AccountSettings.module.css'

export default function CtoCreditModal({ employee, onSaved, onClose }) {
  const today = new Date()
  const [date, setDate] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`)
  const [kind, setKind] = useState('')
  const [days, setDays] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const panel = useRef(null)
  const [year, month, day] = date.split('-').map(Number)
  const expiry = date ? `${year + 1}-${String(month).padStart(2, '0')}-${String(Math.min(day, new Date(year + 1, month, 0).getDate())).padStart(2, '0')}` : ''
  useEffect(() => { panel.current?.querySelector('input, button')?.focus() }, [saved])
  async function save(event) {
    event.preventDefault()
    if (saving.current) return
    if (!kind.trim() || !date || !Number.isFinite(Number(days)) || Number(days) <= 0) { setError('Enter the CTO kind, a valid date, and days greater than zero.'); return }
    saving.current = true; setBusy(true); setError('')
    try {
      const { error: failure } = await supabase.rpc('lcms_grant_cto', { employee_uuid: employee.id, credit_days: Number(days), granted_date: date, grant_note: kind.trim() })
      if (failure) throw failure
      setSaved(true)
      await onSaved()
    } catch (failure) { setError(failure.message) }
    finally { saving.current = false; setBusy(false) }
  }
  return createPortal(<div className={styles.overlay} onKeyDown={event => {
    if (event.key === 'Escape' && !saving.current) onClose()
    if (event.key === 'Tab') {
      const controls = [...panel.current.querySelectorAll('input:not(:disabled), button:not(:disabled)')]
      const first = controls[0], last = controls[controls.length - 1]
      if (!first) event.preventDefault()
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
  }}><div ref={panel} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="cto-title">
    <h2 id="cto-title">{saved ? 'CTO saved' : 'Add CTO'}</h2>
    <p>{employee.last_name}, {employee.first_name}</p>
    {saved ? <><p>{fmt(Number(days))} days credited for {kind}. Expires {fmtDate(expiry)}. Any unused balance is forfeited on that date.</p><div className={styles.actions}><button onClick={onClose}>Done</button></div></> : <form onSubmit={save}>
      <label>Kind of CTO / work performed<input required maxLength={500} value={kind} disabled={busy} placeholder="Describe the work that earned this CTO" onChange={event => setKind(event.target.value)} /></label>
      <label>Days earned<input type="number" min="0.01" step="0.01" required value={days} disabled={busy} onChange={event => setDays(event.target.value)} /></label>
      <label>Date credited<input type="date" required value={date} disabled={busy} onChange={event => setDate(event.target.value)} /></label>
      <label>Automatic expiration<input type="date" readOnly value={expiry} /></label>
      <p className={styles.hint}>Valid for one year from the credited date. Approved CTO usage deducts the oldest unexpired credit first.</p>
      {ctoCredits(employee).length > 0 && <div style={{ marginTop: 16 }}><strong>Previous CTO credits</strong>{ctoCredits(employee).sort((a, b) => a.granted_on.localeCompare(b.granted_on)).map(credit => <p key={credit.id} style={{ marginTop: 8 }}>{credit.remarks || 'CTO credit'} · {fmt(credit.remaining_days)} days · {credit.expired ? 'Forfeited' : `Expires ${fmtDate(credit.expires_on)}`}</p>)}</div>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.actions}><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button className={styles.save} disabled={busy}>{busy ? 'Saving…' : 'Save CTO'}</button></div>
    </form>}
  </div></div>, document.body)
}
