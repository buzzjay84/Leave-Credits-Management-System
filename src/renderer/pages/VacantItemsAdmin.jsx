import { useCallback, useEffect, useMemo, useState } from 'react'
import ClearableSearchInput from '@/components/shared/ClearableSearchInput'
import EmployeeModal from '@/components/HRMO/EmployeeModal'
import { useEmployees } from '@/hooks/useEmployees'
import { fmtDate } from '@/utils/leaveCalc'
import { personnelFullName, titleCase } from '@/utils/personnel'
import { schoolIdByName, schoolOrOfficeName } from '@/utils/schools'
import { supabase } from '@/utils/supabase'
import vacantItemsData from '@/data/vacantItems.json'
import { listPsipopItems, mergeVacancies } from '@/utils/psipopItems'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import styles from './Dashboard.module.css'

function classifyEmpType(positionRaw) {
  return /TEACHER/.test(positionRaw.toUpperCase()) ? 'Teaching' : 'Non-Teaching'
}

// Builds the draft passed into EmployeeModal when HRMO fills a vacancy — the
// office named in PSIPOP is used only to preselect a school; the OSEC item
// number stays fixed regardless of where HRMO ultimately assigns the hire.
function draftEmployeeFromVacantItem(item) {
  const emp_type = classifyEmpType(item.position || '')
  const schoolId = schoolIdByName(item.office)
  const isSchoolBased = emp_type === 'Teaching' || Boolean(schoolId)
  return {
    item_number: item.item_number,
    position: titleCase(item.position || ''),
    salary_grade: item.salary_grade || '',
    salary_step: 1,
    salary_step_mode: 'manual',
    emp_type,
    emp_status: 'Permanent',
    work_assignment: emp_type === 'Non-Teaching' ? (schoolId ? 'School-Based' : 'SDO-Based') : '',
    assigned_school_id: isSchoolBased ? schoolId : '',
    hired_date: '',
    last_name: '', first_name: '', middle_name: '',
    nash_passer: false, cti_item: false,
    notes: `Filling vacant PSIPOP item ${item.item_number}${item.office ? ` (originally listed under ${item.office})` : ''}.`,
  }
}

export default function VacantItemsAdmin() {
  const { employees, addEmployee } = useEmployees()
  const [search, setSearch] = useState('')
  const [officeFilter, setOfficeFilter] = useState('')
  const [subTab, setSubTab] = useState('vacant')
  const [fillTarget, setFillTarget] = useState(null)
  const [ctiItems, setCtiItems] = useState([])
  const [ctiError, setCtiError] = useState('')
  const [ctiBusyId, setCtiBusyId] = useState(null)
  const [ctiDeleteTarget, setCtiDeleteTarget] = useState(null)
  const [latestItems, setLatestItems] = useState([])
  const [psipopError, setPsipopError] = useState('')
  useEffect(() => {
    let active = true
    listPsipopItems().then(data => { if (active) setLatestItems(data) }).catch(error => { if (active) setPsipopError(`Latest PSIPOP items could not be loaded: ${error.message}`) })
    return () => { active = false }
  }, [])

  // CTI (Co-Terminus with the Incumbent) items are permanently excluded once
  // flagged — they stay out of Vacant Items even after the employee who held
  // them is removed.
  const fetchCtiItems = useCallback(async () => {
    const { data, error } = await supabase.from('leave_cti_items').select('item_number, marked_by, marked_at').order('marked_at', { ascending: false })
    if (error) { setCtiError(error.message); return }
    setCtiItems(data || [])
  }, [])
  useEffect(() => { fetchCtiItems() }, [fetchCtiItems])

  async function deleteCtiItem() {
    const itemNumber = ctiDeleteTarget
    setCtiDeleteTarget(null)
    setCtiBusyId(itemNumber)
    setCtiError('')
    const { error } = await supabase.from('leave_cti_items').delete().eq('item_number', itemNumber)
    setCtiBusyId(null)
    if (error) { setCtiError(error.message); return }
    setCtiItems(current => current.filter(row => row.item_number !== itemNumber))
  }

  const ctiItemNumbers = useMemo(() => new Set(ctiItems.map(row => row.item_number)), [ctiItems])
  // A CTI item is flagged the moment cti_item is checked, not only once the
  // incumbent leaves — so most entries here still have someone actively
  // holding the item. Surface that personnel record inline.
  const employeeByItemNumber = useMemo(() => {
    const map = new Map()
    for (const person of employees) if (person.item_number) map.set(person.item_number, person)
    return map
  }, [employees])
  const vacantItems = useMemo(
    () => mergeVacancies(vacantItemsData, latestItems, employees, ctiItemNumbers),
    [employees, latestItems, ctiItemNumbers]
  )
  const vacancyConflicts = latestItems.filter(item => item.vacant && employees.some(employee => employee.is_active !== false && employee.item_number === item.item_number))
  const offices = useMemo(() => [...new Set(vacantItems.map(item => item.office).filter(Boolean))].sort(), [vacantItems])
  const query = search.trim().toLowerCase()
  const visibleItems = vacantItems.filter(item => {
    const searchable = [item.item_number, item.position, item.office].filter(Boolean).join(' ').toLowerCase()
    return (!query || searchable.includes(query)) && (!officeFilter || item.office === officeFilter)
  })

  return <div className={styles.card}>
    {psipopError && <p role="alert">{psipopError}. Showing bundled vacancies filtered against the roster.</p>}
    {subTab === 'vacant' && vacancyConflicts.length > 0 && <p role="alert">PSIPOP lists {vacancyConflicts.length} item(s) as vacant but active personnel still hold them: {vacancyConflicts.map(item => item.item_number).join(', ')}. Reconcile their assignments in Personnel before filling these items.</p>}
    <div className={styles.cardHeader}><span className={styles.cardTitle}>{subTab === 'vacant' ? 'Vacant PSIPOP Items' : 'CTI (Co-Terminus) Items'}</span></div>
    <div className={styles.toolbar}>
      <ClearableSearchInput className={styles.searchInput} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search OSEC no., position, or office…" />
      <select className={styles.schoolSelect} value={officeFilter} onChange={e => setOfficeFilter(e.target.value)}>
        <option value="">All Offices / Schools ({vacantItems.length})</option>
        {offices.map(office => <option key={office} value={office}>{office}</option>)}
      </select>
      <button className={subTab === 'vacant' ? styles.btnPrimary : styles.btnOutline} aria-pressed={subTab === 'vacant'} onClick={() => setSubTab('vacant')}>Vacant Items ({vacantItems.length})</button>
      <button className={subTab === 'cti' ? styles.btnPrimary : styles.btnOutline} aria-pressed={subTab === 'cti'} onClick={() => setSubTab('cti')}>CTI Items ({ctiItems.length})</button>
      {subTab === 'vacant' && <span className={styles.personnelCount} aria-live="polite">({visibleItems.length}) vacant</span>}
    </div>

    {subTab === 'vacant' ? <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead><tr><th>OSEC No.</th><th>Position</th><th>Salary Grade</th><th>Office / School</th><th>Source</th></tr></thead>
        <tbody>{visibleItems.length === 0
          ? <tr><td colSpan={5} className={styles.emptyState}>No vacant items found.</td></tr>
          : visibleItems.map(item => <tr
              key={item.item_number}
              className={styles.clickableRow}
              onClick={() => setFillTarget(item)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setFillTarget(item)
                }
              }}
              tabIndex={0}
              role="button"
              aria-label={`Fill vacancy ${item.item_number}`}
            >
              <td className={styles.nameCell}>{item.item_number}</td>
              <td>{item.position || '—'}</td>
              <td className={styles.creditCell}>{item.salary_grade ? `SG-${item.salary_grade}` : '—'}</td>
              <td>{item.office || '—'}</td>
              <td className={styles.subCell}>{item.source_file || '—'}</td>
            </tr>)}</tbody>
      </table>
    </div> : <>
      <p className={styles.subCell}>
        These OSEC items are permanently excluded from Vacant Items once their co-terminus incumbent leaves. Remove an entry
        here if it no longer belongs on this list — most commonly once PSIPOP itself stops listing that item number in a later upload.
      </p>
      {ctiError && <div className={styles.inlineError}>{ctiError}</div>}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>OSEC No.</th><th>Current Personnel</th><th>Position</th><th>School / Office</th><th>Status</th><th>Marked By</th><th>Marked On</th><th>Still in Latest PSIPOP?</th><th></th></tr></thead>
          <tbody>{ctiItems.length === 0
            ? <tr><td colSpan={9} className={styles.emptyState}>No CTI items recorded.</td></tr>
            : ctiItems.map(row => {
                const stillListed = latestItems.some(item => item.item_number === row.item_number)
                const holder = employeeByItemNumber.get(row.item_number)
                const holderActive = holder && holder.is_active !== false
                return <tr key={row.item_number}>
                  <td className={styles.nameCell}>{row.item_number}</td>
                  <td className={styles.subCell}>{holder ? personnelFullName(holder) : '—'}</td>
                  <td className={styles.subCell}>{holder?.position || '—'}</td>
                  <td className={styles.subCell}>{holder ? (schoolOrOfficeName(holder.assigned_school_id || holder.school_id) || holder.school_id) : '—'}</td>
                  <td>{!holder
                    ? <span className={`${styles.pill} ${styles.pillMuted}`}>No personnel record</span>
                    : holderActive
                      ? <span className={`${styles.pill} ${styles.pillOk}`}>Still in Service</span>
                      : <span className={`${styles.pill} ${styles.pillReject}`}>Separated</span>}</td>
                  <td className={styles.subCell}>{row.marked_by || '—'}</td>
                  <td className={styles.subCell}>{fmtDate(row.marked_at)}</td>
                  <td>{stillListed
                    ? <span className={`${styles.pill} ${styles.pillOk}`}>Yes</span>
                    : <span className={`${styles.pill} ${styles.pillWarn}`}>No longer listed</span>}</td>
                  <td><button className={styles.btnDangerSm} disabled={ctiBusyId === row.item_number} onClick={() => setCtiDeleteTarget(row.item_number)}>
                    {ctiBusyId === row.item_number ? 'Removing…' : 'Remove'}
                  </button></td>
                </tr>
              })}</tbody>
        </table>
      </div>
    </>}

    {fillTarget && <EmployeeModal
      employee={draftEmployeeFromVacantItem(fillTarget)}
      onSave={async data => {
        // Hired from the Admin Console: lock the assignment so an AO's
        // self-service tools can no longer reassign or remove it.
        const result = await addEmployee({ ...data, assignment_locked: true })
        if (result.success && !result.pendingSync) setFillTarget(null)
        return result
      }}
      onClose={() => setFillTarget(null)}
    />}
    {ctiDeleteTarget && (
      <ConfirmDialog
        title="Remove CTI item?"
        message={`Remove OSEC item ${ctiDeleteTarget} from the CTI list? If it is still vacant in PSIPOP, it will reappear in Vacant Items.`}
        confirmLabel="Remove"
        onCancel={() => setCtiDeleteTarget(null)}
        onConfirm={deleteCtiItem}
      />
    )}
  </div>
}
