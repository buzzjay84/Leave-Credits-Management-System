import { useState } from 'react'
import { supabase } from '@/utils/supabase'
import { toCsv, parseCsv } from '@/utils/csv'
import { personnelFullName } from '@/utils/personnel'
import { schoolNameById } from '@/utils/schools'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import styles from '@/pages/Dashboard.module.css'

const CSV_COLUMNS = [
  { key: 'last_name', label: 'Family Name' },
  { key: 'first_name', label: 'First Name' },
  { key: 'middle_name', label: 'Middle Name or Initial' },
]

export default function StaffAssignmentPanel({ schoolId, onAssigned }) {
  const refetchEmployees = onAssigned
  const [mode, setMode] = useState('manual')
  const [templateBusy, setTemplateBusy] = useState(false)
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkMessage, setLinkMessage] = useState('')
  const [linkError, setLinkError] = useState('')
  const [name, setName] = useState({ last_name: '', first_name: '', middle_name: '' })
  const [results, setResults] = useState(null)
  const [reassignTarget, setReassignTarget] = useState(null)
  async function handleDownloadTemplate() {
    setLinkError(''); setLinkMessage('')
    if (!window.electronAPI?.saveTextFile) {
      setLinkError('File saving is unavailable — restart the app (fully quit, not just reload) and try again.')
      return
    }
    setTemplateBusy(true)
    try {
      const { data, error } = await supabase.rpc('lcms_list_unassigned_employees')
      if (error) throw error
      const csv = toCsv(data || [], CSV_COLUMNS)
      const result = await window.electronAPI.saveTextFile({
        defaultFilename: 'Staff Name Template.csv',
        content: csv
      })
      if (result?.canceled) return
      if (!result?.success) { setLinkError('Could not save the file.'); return }
      setLinkMessage(`Template saved to ${result.filePath}, pre-filled with ${(data || []).length} unassigned staff name(s) from the whole division. Delete any rows that aren't from your school, then use "Upload & Link" to submit it.`)
    } catch (err) {
      setLinkError(err.message || 'Something went wrong while downloading the file.')
    } finally {
      setTemplateBusy(false)
    }
  }

  async function handleUploadLink() {
    setLinkError(''); setLinkMessage('')
    if (!window.electronAPI?.openTextFile) {
      setLinkError('File opening is unavailable — restart the app (fully quit, not just reload) and try again.')
      return
    }
    try {
      const result = await window.electronAPI.openTextFile({})
      if (!result || result.canceled) return
      const parsed = parseCsv(result.content)
      const rows = parsed
        .map(r => ({
          last_name: r['Family Name'] || '',
          first_name: r['First Name'] || '',
          middle_name: r['Middle Name or Initial'] || '',
        }))
        .filter(r => r.last_name || r.first_name)
      if (!rows.length) {
        setLinkError('No staff rows found in that file. Fill in the Family Name / First Name / Middle Name or Initial columns of the downloaded template, then upload it.')
        return
      }
      setLinkBusy(true)
      const { data, error } = await supabase.rpc('lcms_link_unassigned_employees_by_name', { rows })
      setLinkBusy(false)
      if (error) { setLinkError(error.message); return }
      const linked = (data || []).filter(r => r.linked)
      const skipped = (data || []).filter(r => !r.linked)
      setLinkMessage(
        `${linked.length} of ${rows.length} employee(s) linked to your school.` +
        (skipped.length ? ` Not linked: ${skipped.map(s => `${s.last_name}, ${s.first_name} (${s.reason})`).join('; ')}.` : '')
      )
      if (linked.length) await refetchEmployees()
    } catch (err) {
      setLinkBusy(false)
      setLinkError(err.message || 'Something went wrong while linking employees.')
    }
  }


  async function searchNames(event) {
    event.preventDefault()
    setLinkBusy(true); setLinkError(''); setLinkMessage(''); setResults(null)
    try {
      const { data, error } = await supabase.rpc('lcms_search_teachers_by_name', {
        family_name: name.last_name.trim(), given_name: name.first_name.trim(), middle: name.middle_name.trim()
      })
      if (error) throw error
      setResults(data || [])
    } catch (error) { setLinkError(error.message) }
    finally { setLinkBusy(false) }
  }

  async function addTeacher(teacher) {
    if (linkBusy || teacher.school_id === schoolId || teacher.assignment_locked) return
    if (teacher.school_id !== 'UNASSIGNED' && teacher.school_id !== 'DEFAULT' && teacher.school_id !== schoolId) {
      setReassignTarget(teacher)
      return
    }
    await assignTeacher(teacher)
  }

  async function assignTeacher(teacher) {
    setLinkBusy(true); setLinkError(''); setLinkMessage('')
    try {
      const { error } = await supabase.rpc('lcms_assign_teacher_to_school', {
        personnel_id: teacher.id, expected_school_id: teacher.school_id, remove_assignment: false
      })
      if (error) throw error
      setResults(current => current?.map(row => row.id === teacher.id ? { ...row, school_id: schoolId, assignment_locked: true } : row))
      setLinkMessage(personnelFullName(teacher) + ' assigned to your school.')
      await onAssigned()
    } catch (error) { setLinkError(error.message) }
    finally { setLinkBusy(false) }
  }

  return <section className={styles.staffPanel} aria-label="Add staff to your school">
    <div className={styles.cardHeader}>
      <h2 className={styles.cardTitle}>Add staff to your school</h2>
      <div className={styles.headerActions}>
        <button className={mode === 'csv' ? styles.btnPrimary : styles.btnOutline} aria-pressed={mode === 'csv'} disabled={linkBusy} onClick={() => setMode('csv')}>1. CSV upload</button>
        <button className={mode === 'manual' ? styles.btnPrimary : styles.btnOutline} aria-pressed={mode === 'manual'} disabled={linkBusy} onClick={() => setMode('manual')}>2. Search by name</button>
      </div>
    </div>
    <div className={styles.staffPanelBody}>
      {mode === 'csv' ? <>
        <p>Link unassigned staff in bulk. Download the template — pre-filled with every unassigned staff name division-wide — delete any rows that aren't from your school, then upload it.</p>
        <div className={styles.headerActions}>
          <button className={styles.btnOutline} disabled={linkBusy || templateBusy} onClick={handleDownloadTemplate}>{templateBusy ? 'Preparing…' : 'Download CSV Template'}</button>
          <button className={styles.btnPrimary} disabled={linkBusy || templateBusy} onClick={handleUploadLink}>{linkBusy ? 'Linking…' : 'Upload & Link'}</button>
        </div>
      </> : <>
        <p>Find a teacher by full name. Teachers already assigned by another AO must be removed from that school before you can add them.</p>
        <form className={styles.staffSearch} onSubmit={searchNames}>
          {CSV_COLUMNS.map(field => <label key={field.key}>{field.label}
            <input required={field.key !== 'middle_name'} autoCapitalize="words" maxLength={100} disabled={linkBusy} value={name[field.key]} onChange={event => { setName({ ...name, [field.key]: event.target.value.replace(/(^|[\s.'’\-])\p{L}/gu, letter => letter.toLocaleUpperCase()) }); setResults(null) }} placeholder={field.key === 'middle_name' ? 'Optional if unknown' : field.label} />
          </label>)}
          <button className={styles.btnPrimary} disabled={linkBusy || !name.last_name.trim() || !name.first_name.trim()}>{linkBusy ? 'Please wait?' : 'Search'}</button>
        </form>
        {results !== null && <div className={styles.staffResults} aria-live="polite">
          {!results.length && <p>No matching teacher found. Check the spelling or try their middle initial.</p>}
          {results.map(teacher => <div className={styles.staffResult} key={teacher.id}>
            <div><strong>{personnelFullName(teacher)}</strong><div className={styles.subCell}>{teacher.position} ? {schoolNameById(teacher.school_id) || teacher.school_id}{teacher.item_number ? ' ? Item ' + teacher.item_number : ''}</div></div>
            {teacher.school_id === schoolId
              ? <span className={styles.pill + ' ' + styles.pillOk}>Already in your school</span>
              : teacher.assignment_locked
                ? <span className={styles.pill + ' ' + styles.pillWarn}>{teacher.admin_locked ? 'Assigned by Administrator' : 'Assigned by another AO'}</span>
                : <button className={styles.btnSuccessSm} disabled={linkBusy} aria-label={'Add ' + personnelFullName(teacher) + ' to your school'} onClick={() => addTeacher(teacher)}>+ Add</button>}
          </div>)}
        </div>}
      </>}
      <p className={styles.subCell}>School heads, principals, and assistant principals are assigned by HRMO and can't be linked this way — as is any Head Teacher or Master Teacher designated as acting School Head.</p>
    </div>
    {linkError && <div className={styles.inlineError} role="alert">{linkError}</div>}
    {linkMessage && <div className={styles.inlineSuccess} role="status">{linkMessage}</div>}
    {reassignTarget && (
      <ConfirmDialog
        title="Reassign teacher?"
        message={`Assign ${personnelFullName(reassignTarget)} to your school? This moves their working assignment from ${schoolNameById(reassignTarget.school_id) || reassignTarget.school_id}.`}
        confirmLabel="Assign"
        onCancel={() => setReassignTarget(null)}
        onConfirm={() => { const teacher = reassignTarget; setReassignTarget(null); assignTeacher(teacher) }}
      />
    )}
  </section>
}
