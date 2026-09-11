import usePagination from '@/hooks/usePagination'
import Pagination from '@/components/shared/Pagination'
import { useState } from 'react'
import { useEmployees } from '@/hooks/useEmployees'
import { ageInYears, fmtDate, retirementAgeColor, yearsOfService } from '@/utils/leaveCalc'
import { automaticSalaryStep, formatPeso, formatSalaryGrade, parseSalaryGrade, salaryStepsForGrade } from '@/utils/salarySchedule'
import { employeeTin, formatTin, personnelFullName, stripPsipopImportNotes } from '@/utils/personnel'
import { ELEMENTARY_SCHOOLS, SECONDARY_SCHOOLS, schoolOrOfficeName } from '@/utils/schools'
import AppointmentBuilder from '@/components/Admin/AppointmentBuilder'
import { usePositionTemplates } from '@/hooks/usePositionTemplates'
import ClearableSearchInput from '@/components/shared/ClearableSearchInput'
import styles from './Dashboard.module.css'
import { appointmentReadyChange } from '@/utils/appointmentReadiness'

// The teaching career ladder, in promotion order — Teacher I-VII, then the
// SPED Teacher tier, then Master Teacher and Head Teacher. Positions outside
// this list sort to the end. Assistant Principal / Principal are
// Non-Teaching in this roster, so they never appear on the Teaching tab —
// they sit outside this ladder under DepEd's Expanded Career Progression
// system.
const TEACHING_LADDER_ORDER = [
  'Teacher I', 'Teacher II', 'Teacher III', 'Teacher IV', 'Teacher V', 'Teacher VI', 'Teacher VII',
  'Special Education Teacher I', 'Special Education Teacher II', 'Special Education Teacher III',
  'Master Teacher I', 'Master Teacher II', 'Master Teacher III', 'Master Teacher IV', 'Master Teacher V',
  'Head Teacher I', 'Head Teacher II', 'Head Teacher III', 'Head Teacher IV', 'Head Teacher V', 'Head Teacher VI',
]

function ladderRank(position) {
  const index = TEACHING_LADDER_ORDER.indexOf(position)
  return index === -1 ? TEACHING_LADDER_ORDER.length : index
}

function currentStep(employee) {
  const recordedStep = Number(employee.salary_step) || 1
  if (employee.salary_step_mode !== 'automatic') return recordedStep
  const grade = parseSalaryGrade(employee.salary_grade)
  return automaticSalaryStep(
    employee.salary_step_basis_date || employee.hired_date,
    new Date(),
    salaryStepsForGrade(grade).length || 8,
  )
}

function personnelSchoolId(employee) {
  return employee.assigned_school_id || employee.school_id || 'UNASSIGNED'
}

const SUB_TABS = [
  { key: 'teaching', label: 'Teaching' },
  { key: 'non-teaching', label: 'Non-Teaching' },
]

// Personnel view for the Appointments section, split into Teaching and
// Non-Teaching sub-tabs. Teaching sorts along the career ladder and, when
// canEdit is set (Admin Console or Appointments role), offers a Reclass action that opens
// the appointment editor to prepare and record a NOSCA-backed reclassification
// onto the roster. Non-Teaching is a plain, read-only roster — promotion
// here isn't tied to the teaching ladder/NOSCA flow.
export default function AppointmentsPersonnelView({ canEdit = false }) {
  const { employees, loading, error, updateEmployee } = useEmployees()
  const { loading: templatesLoading, templateFor, saveTemplate } = usePositionTemplates()
  const [subTab, setSubTab] = useState('teaching')
  const [search, setSearch] = useState('')
  const [positionFilter, setPositionFilter] = useState('')
  const [schoolFilter, setSchoolFilter] = useState('')
  const [reclassOnly, setReclassOnly] = useState(false)
  const [promoteTarget, setPromoteTarget] = useState(null)
  const query = search.trim().toLowerCase()
  const teaching = subTab === 'teaching'

  function selectSubTab(key) {
    setSubTab(key)
    setSearch('')
    setPositionFilter('')
    setSchoolFilter('')
    setReclassOnly(false)
  }

  const scoped = employees.filter(employee => employee.emp_type === (teaching ? 'Teaching' : 'Non-Teaching'))
  // Reclassification rides the teaching career ladder/NOSCA flow — Non-Teaching
  // promotion isn't tied to it, so the filter only applies on the Teaching tab.
  const reclassCount = teaching ? scoped.filter(appointmentReadyChange).length : 0

  const personnel = scoped.filter(employee => {
    const searchable = [personnelFullName(employee), employee.item_number, employeeTin(employee),
      employee.position, schoolOrOfficeName(personnelSchoolId(employee))]
      .filter(Boolean).join(' ').toLowerCase()
    return (!query || searchable.includes(query))
      && (!positionFilter || employee.position === positionFilter)
      && (!schoolFilter || personnelSchoolId(employee) === schoolFilter)
      && (!reclassOnly || appointmentReadyChange(employee))
  }).sort((a, b) => (teaching ? ladderRank(a.position) - ladderRank(b.position) : 0)
    || personnelFullName(a).localeCompare(personnelFullName(b), 'en', { sensitivity: 'base' }))

  const schoolCounts = scoped.reduce((counts, employee) => {
    const schoolId = personnelSchoolId(employee)
    counts[schoolId] = (counts[schoolId] || 0) + 1
    return counts
  }, {})
  const positionCounts = scoped.reduce((counts, employee) => {
    counts[employee.position] = (counts[employee.position] || 0) + 1
    return counts
  }, {})
  const positions = Object.keys(positionCounts).sort((a, b) => teaching
    ? ladderRank(a) - ladderRank(b)
    : a.localeCompare(b, 'en', { sensitivity: 'base' }))
  const pagination = usePagination(personnel, [subTab, search, positionFilter, schoolFilter, reclassOnly])
  const showActions = teaching || personnel.some(appointmentReadyChange)

  async function handlePromote({ note, ...payload }) {
    const current = employees.find(employee => employee.id === promoteTarget.id) || promoteTarget
    return updateEmployee(promoteTarget.id, {
      ...payload,
      notes: [current.notes, note].filter(Boolean).join('\n'),
    })
  }

  if (promoteTarget && canEdit) return (
    <div className={styles.card} style={{ height: '100%' }}>
      <AppointmentBuilder
        key={promoteTarget.id}
        item={{ position: promoteTarget.position, item_number: promoteTarget.item_number, salary_grade: parseSalaryGrade(promoteTarget.salary_grade), office: schoolOrOfficeName(personnelSchoolId(promoteTarget)) }}
        initialAppointee={{ lastName: promoteTarget.last_name || '', firstName: promoteTarget.first_name || '', middleName: promoteTarget.middle_name || '', salaryStep: currentStep(promoteTarget) }}
        initialNature="RECLASSIFICATION"
        promotionContext={{ fromPosition: promoteTarget.position, fromItemNumber: promoteTarget.item_number }}
        onBack={() => setPromoteTarget(null)}
        templatesLoading={templatesLoading}
        templateFor={templateFor}
        saveTemplate={saveTemplate}
        onSaveToRoster={handlePromote}
      />
    </div>
  )

  return (
    <div className={styles.card}>
      <div className={styles.adminTabs} role="tablist" aria-label="Personnel sub-sections" style={{ padding: 0 }}>
        {SUB_TABS.map(({ key, label }) => (
          <button key={key} className={subTab === key ? styles.adminTabActive : styles.adminTab} role="tab" aria-selected={subTab === key} onClick={() => selectSubTab(key)}>{label}</button>
        ))}
      </div>
      <div className={styles.toolbar}>
        <ClearableSearchInput className={styles.searchInput} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, OSEC no., TIN, or position…" />
        <select value={positionFilter} onChange={e => setPositionFilter(e.target.value)}>
          <option value="">All positions ({scoped.length})</option>
          {positions.map(position => <option key={position} value={position}>{position} ({positionCounts[position]})</option>)}
        </select>
        <select className={styles.schoolSelect} value={schoolFilter} onChange={e => setSchoolFilter(e.target.value)}>
          <option value="">All Schools ({scoped.length})</option>
          {schoolCounts.DEFAULT > 0 && <option value="DEFAULT">SDO / Division Office ({schoolCounts.DEFAULT})</option>}
          {schoolCounts.UNASSIGNED > 0 && <option value="UNASSIGNED">Unassigned ({schoolCounts.UNASSIGNED})</option>}
          <optgroup label="Elementary">
            {ELEMENTARY_SCHOOLS.map(school => <option key={school.id} value={school.id}>{school.name} ({schoolCounts[school.id] || 0})</option>)}
          </optgroup>
          <optgroup label="Secondary">
            {SECONDARY_SCHOOLS.map(school => <option key={school.id} value={school.id}>{school.name} ({schoolCounts[school.id] || 0})</option>)}
          </optgroup>
        </select>
        {reclassCount > 0 && <button type="button" className={reclassOnly ? styles.btnPrimary : styles.btnOutline} aria-pressed={reclassOnly} onClick={() => setReclassOnly(v => !v)}>Reclass ({reclassCount})</button>}
        <span className={styles.personnelCount} aria-live="polite">({personnel.length}) personnel</span>
      </div>
      {error && <div className={styles.inlineError}>Could not load personnel: {error}</div>}
      {loading && personnel.length === 0 ? <div className={styles.emptyState}>Loading…</div> : <div className={styles.tableWrap}>
        <table className={`${styles.table} ${styles.nameFirstColumn}`}>
          <thead><tr>
            <th>Full Name</th><th>OSEC Item No.</th><th>Position / School</th><th>Salary Grade</th><th>Monthly Salary</th>
            <th>Age</th><th>Date Hired</th><th>Years in Service</th><th>Date Last Promoted</th><th>TIN</th><th>Remarks</th>
            {showActions && <th></th>}
          </tr></thead>
          <tbody>{personnel.length === 0
            ? <tr><td colSpan={showActions ? 12 : 11} className={styles.emptyState}>No {teaching ? 'teaching' : 'non-teaching'} personnel found.</td></tr>
            : pagination.items.map(employee => {
                const remarks = stripPsipopImportNotes(employee.notes)
                const ready = appointmentReadyChange(employee)
                const age = employee.birth_date ? ageInYears(employee.birth_date) : null
                return <tr key={employee.id}>
                  <td className={styles.nameCell}>{personnelFullName(employee)}</td>
                  <td className={styles.subCell}>{employee.item_number || '—'}</td>
                  <td><div>{employee.position || '—'}</div><div className={styles.subCell}>{schoolOrOfficeName(personnelSchoolId(employee)) || 'Unassigned'}</div></td>
                  <td className={styles.subCell}>{formatSalaryGrade(parseSalaryGrade(employee.salary_grade), currentStep(employee)) || '—'}</td>
                  <td className={styles.creditCell}>{formatPeso(employee.monthly_salary) || '—'}</td>
                  <td className={styles.subCell} style={retirementAgeColor(age) ? { color: retirementAgeColor(age), fontWeight: 600 } : undefined}>{age ?? '—'}</td>
                  <td className={styles.subCell}>{fmtDate(employee.hired_date)}</td>
                  <td className={styles.subCell}>{yearsOfService(employee.hired_date)} year(s)</td>
                  <td className={styles.subCell}>{fmtDate(employee.salary_step_basis_date)}</td>
                  <td className={styles.subCell}>{formatTin(employeeTin(employee))}</td>
                  <td className={styles.remarksCell} title={remarks}>{remarks}</td>
                  {showActions && <td>{(teaching || ready) && <button className={styles.btnPrimarySm} data-appointment-ready={ready ? 'true' : undefined} disabled={!canEdit} title={ready ? `PSIPOP updated ${ready.effective_date || ''}: appointment ready to review and print` : !canEdit ? 'Editing access is required to reclassify personnel.' : undefined} onClick={() => setPromoteTarget(employee)}>{ready ? 'Reclass — Ready to print' : 'Reclass'}</button>}</td>}
                </tr>
              })}</tbody>
        </table>
      </div>}
      <Pagination pagination={pagination} loading={loading} />
    </div>
  )
}
