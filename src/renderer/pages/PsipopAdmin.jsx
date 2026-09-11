import { useMemo, useRef, useState } from 'react'
import { useEmployees } from '@/hooks/useEmployees'
import { useAuth } from '@/hooks/useAuth'
import { comparePsipop, draftEmployeeFromPsipopRecord, historyUpdate } from '@/utils/psipop'
import { readPsipop } from '@/utils/readPsipop'
import { itemUpdates, listPsipopItems, savePsipopItems } from '@/utils/psipopItems'
import { stripPsipopImportNotes } from '@/utils/personnel'
import { supabase } from '@/utils/supabase'
import EmployeeModal from '@/components/HRMO/EmployeeModal'
import styles from './PsipopAdmin.module.css'

export default function PsipopAdmin() {
  const { employees, loading, error, addEmployee, updateEmployee, fetch } = useEmployees()
  const { user } = useAuth()
  const [records, setRecords] = useState([])
  const [resolutions, setResolutions] = useState({})
  const [choices, setChoices] = useState({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [search, setSearch] = useState('')
  const [dragging, setDragging] = useState(false)
  const [cleanupBusy, setCleanupBusy] = useState(false)
  const [cleanupMessage, setCleanupMessage] = useState('')
  const [addTarget, setAddTarget] = useState(null)
  const input = useRef(null)
  const lock = useRef(false)
  const rows = useMemo(() => comparePsipop(records, employees, resolutions), [records, employees, resolutions])
  const changed = rows.filter(row => row.status === 'Changed')
  const items = itemUpdates(records, effectiveDate)
  const history = employees.flatMap(employee => (employee.psipop_history || []).map(entry => ({ ...entry, name: `${employee.last_name}, ${employee.first_name} ${employee.middle_name || ''}` })))
    .filter(entry => `${entry.name} ${entry.source_file}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))

  async function scan(files) {
    if (lock.current || loading) return
    lock.current = true; setBusy(true); setMessage('Reading PSIPOP files…'); setRecords([]); setResolutions({}); setChoices({})
    try {
      const parsed = []
      for (const file of Array.from(files)) parsed.push(...await readPsipop(file))
      setRecords(parsed); setMessage(`Scanned ${parsed.length} rows. Review the comparison, then apply the changes.`)
    } catch (err) { setMessage(err.message) }
    finally { lock.current = false; setBusy(false); if (input.current) input.current.value = '' }
  }

  async function apply() {
    if (lock.current || !effectiveDate || (!changed.length && !items.length)) return
    lock.current = true; setBusy(true)
    let count = 0; let pending = false
    const batchId = crypto.randomUUID()
    try {
      const latestItems = await listPsipopItems()
      const { error: schemaError } = await supabase.from('leave_employees').select('psipop_history').limit(1)
      if (schemaError) throw schemaError
      if (items.some(item => latestItems.some(old => old.item_number === item.item_number && old.effective_date > effectiveDate))) throw new Error('A newer PSIPOP is already saved for these items. Use the latest source.')
      for (const row of changed) {
        const result = await updateEmployee(row.employee.id, historyUpdate(row, effectiveDate, user?.username || user?.id, batchId))
        if (!result.success) throw new Error(result.error)
        pending ||= result.pendingSync
        count++
        setMessage(`Updating roster: ${count} of ${changed.length}…`)
      }
      await savePsipopItems(items)
      window.dispatchEvent(new Event('lcms:personnel-updated'))
      // Keep unresolved "Review" rows on screen instead of discarding the
      // whole scan — those are the ones with no reliable existing match
      // (new hires, reclassified items, name/TIN mismatches) and were
      // otherwise silently lost the moment you clicked Update roster, with
      // no record anywhere that they still needed manual reconciliation or
      // a new Personnel entry.
      let nextIndex = 0
      const reviewRecords = []
      const reviewResolutions = {}
      rows.forEach((row, index) => {
        if (row.status !== 'Review') return
        reviewRecords.push(records[index])
        if (resolutions[index]) reviewResolutions[nextIndex] = resolutions[index]
        nextIndex++
      })
      setRecords(reviewRecords)
      setResolutions(reviewResolutions)
      setChoices({})
      setMessage(`Updated ${count} personnel with history and refreshed ${items.length} PSIPOP item statuses.${pending ? ' Personnel changes are saved locally; cloud synchronization is pending.' : ''}${reviewRecords.length ? ` ${reviewRecords.length} row(s) still need review below — reconcile them or add them in Personnel.` : ''}`)
      await fetch()
    } catch (err) { setRecords([]); setMessage(`${count} personnel updated with history. Stopped: ${err.message}. Scan again to compare the remaining changes.`) }
    finally { lock.current = false; setBusy(false) }
  }

  // One-time division-wide cleanup: strips the "Imported from PSIPOP (...)"
  // style boilerplate scripts/import_psipop.mjs writes into notes, leaving
  // any manually entered remarks (including promotion notes) untouched.
  async function cleanupImportNotes() {
    if (lock.current || cleanupBusy) return
    const targets = employees.filter(employee => stripPsipopImportNotes(employee.notes) !== String(employee.notes || '').trim())
    if (!targets.length) { setCleanupMessage('No import boilerplate found in notes — nothing to clean up.'); return }
    lock.current = true; setCleanupBusy(true)
    let count = 0
    try {
      for (const employee of targets) {
        const result = await updateEmployee(employee.id, { notes: stripPsipopImportNotes(employee.notes) || null })
        if (!result.success) throw new Error(result.error)
        count++
        setCleanupMessage(`Cleaning up import remarks: ${count} of ${targets.length}…`)
      }
      setCleanupMessage(`Cleared PSIPOP import boilerplate from ${count} personnel record(s).`)
    } catch (err) { setCleanupMessage(`${count} of ${targets.length} cleaned. Stopped: ${err.message}. Run again to retry the rest.`) }
    finally { lock.current = false; setCleanupBusy(false) }
  }

  return <section className={styles.page} aria-busy={busy}>
    <div><h2>Update PSIPOP</h2><p>Upload the latest PSIPOP to compare existing personnel and update the roster. Previous values are retained for service-record preparation.</p></div>
    <button type="button" className={`${styles.drop} ${dragging ? styles.dragging : ''}`} disabled={busy || loading || Boolean(error)}
      onClick={() => input.current.click()}
      onDragEnter={event => { console.log('[psipop] dragenter', event.dataTransfer?.types); event.preventDefault(); setDragging(true) }}
      onDragOver={event => { console.log('[psipop] dragover', event.dataTransfer?.types); event.preventDefault(); setDragging(true) }}
      onDragLeave={() => { console.log('[psipop] dragleave'); setDragging(false) }}
      onDrop={event => { console.log('[psipop] drop', event.dataTransfer?.files?.length, [...(event.dataTransfer?.files || [])].map(f => f.name)); event.preventDefault(); setDragging(false); if (!busy && !loading && !error) scan(event.dataTransfer.files) }}>
      <strong>{busy ? 'Processing PSIPOP…' : 'Drop new PSIPOP files here'}</strong><span>or click to browse · PDF, JSON or CSV · up to 50 MB per file</span>
    </button>
    <input ref={input} type="file" accept=".pdf,.json,.csv" multiple hidden onChange={event => scan(event.target.files)} />
    <p className={styles.help}>Only reliable existing personnel matches are updated. Unmatched, duplicate or unreadable rows require review. Personnel absent from the file stay on the roster. Leave balances and manually entered employee numbers are preserved.</p>
    {error && <p role="alert">Unable to load roster: {error}</p>}
    <p role="status" aria-live="polite">{loading ? 'Loading personnel…' : message}</p>
    <div className={styles.actions}>
      <button disabled={busy || cleanupBusy || loading || Boolean(error)} onClick={cleanupImportNotes}>
        {cleanupBusy ? 'Cleaning up…' : 'Clean Up Import Remarks'}
      </button>
      <span className={styles.help}>Strips the auto-generated "Imported from PSIPOP…" boilerplate out of notes division-wide, keeping any other remarks already there.</span>
    </div>
    {cleanupMessage && <p role="status" aria-live="polite">{cleanupMessage}</p>}
    {rows.length > 0 && <>
      <div className={styles.summary}>{['Changed', 'Unchanged', 'Review', 'Vacant'].map(status => <span key={status}><b>{rows.filter(r => r.status === status).length}</b> {status}</span>)}</div>
      <div className={styles.actions}><label>PSIPOP as-of date <input type="date" value={effectiveDate} disabled={busy} onChange={event => setEffectiveDate(event.target.value)} /></label>
        <button disabled={busy || loading || !effectiveDate || (!changed.length && !items.length)} onClick={apply}>Update roster ({changed.length}) and items ({items.length})</button></div>
      <p className={styles.help}>The as-of date describes this source snapshot. Verify appointment and promotion dates against supporting documents when preparing the service record.</p>
      <div className={styles.scroll}><table><thead><tr><th>Personnel / Item</th><th>Result</th><th>Changes: previous → new</th></tr></thead><tbody>
        {rows.map((row, index) => <tr key={index}><td>{row.record.name || 'Vacant / unreadable'}<small>{row.record.item_number} · {row.record.file}</small></td><td>{row.status}{row.reconciliation && <small>Reconciled by admin</small>}</td><td>
          {row.reason || (row.changes.length ? row.changes.map(c => <div key={c.field}>{c.field.replaceAll('_', ' ')}: {String(c.before ?? '—')} → {String(c.after ?? '—')}</div>) : 'Already current')}
          {row.status === 'Review' && row.possibleMatches && <div className={styles.reconcile}>
            {row.possibleMatches.map(e => <small key={e.id}>Possible match: {e.last_name}, {e.first_name} {e.middle_name} · {e.item_number}</small>)}
            {row.possibleMatches.length === 0 && (
              <button disabled={busy} onClick={() => setAddTarget(draftEmployeeFromPsipopRecord(row.record))}>+ Add as new personnel</button>
            )}
            <label>Link to existing personnel<select aria-label={`Reconcile ${row.record.name}`} disabled={busy} value={choices[index]?.employeeId || ''} onChange={event => setChoices(previous => ({ ...previous, [index]: { ...previous[index], employeeId: event.target.value } }))}>
              <option value="">Leave unresolved</option>{employees.map(e => <option key={e.id} value={e.id}>{e.last_name}, {e.first_name} {e.middle_name} · {e.employee_no || e.item_number}</option>)}
            </select></label>
            <label><input type="checkbox" disabled={busy} checked={Boolean(choices[index]?.adoptName)} onChange={event => setChoices(previous => ({ ...previous, [index]: { ...previous[index], adoptName: event.target.checked } }))} /> Adopt the PSIPOP name (first word after comma as first name; remaining words as middle name)</label>
            <button disabled={busy || !choices[index]?.employeeId} onClick={() => setResolutions(previous => ({ ...previous, [index]: { ...choices[index], confirmed_by: user?.username, confirmed_at: new Date().toISOString() } }))}>Confirm match for preview</button>
          </div>}
          {row.reconciliation && <button disabled={busy} onClick={() => setResolutions(previous => { const next = { ...previous }; delete next[index]; return next })}>Undo reconciliation</button>}
        </td></tr>)}
      </tbody></table></div>
    </>}
    <div className={styles.actions}><h3>Personnel update history</h3><input aria-label="Search update history" placeholder="Search personnel or source file" value={search} onChange={event => setSearch(event.target.value)} /></div>
    <div className={styles.scroll}><table><thead><tr><th>Personnel</th><th>Source / dates</th><th>Recorded changes</th></tr></thead><tbody>
      {history.map(entry => <tr key={entry.id}><td>{entry.name}</td><td>{entry.source_file}<small>PSIPOP as of {entry.effective_date}</small><small>Recorded {new Date(entry.recorded_at).toLocaleString()} by {entry.recorded_by}</small></td><td>{entry.changes.map(c => <div key={c.field}>{c.field.replaceAll('_', ' ')}: {String(c.before ?? '—')} → {String(c.after ?? '—')}</div>)}</td></tr>)}
      {!history.length && <tr><td colSpan="3">No matching PSIPOP update history yet.</td></tr>}
    </tbody></table></div>
    {addTarget && <EmployeeModal
      employee={addTarget}
      onSave={async data => {
        const result = await addEmployee(data)
        if (result.success && !result.pendingSync) setAddTarget(null)
        return result
      }}
      onClose={() => setAddTarget(null)}
    />}
  </section>
}
