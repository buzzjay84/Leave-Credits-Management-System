import usePagination from '@/hooks/usePagination'
import Pagination from '@/components/shared/Pagination'
import { useState } from 'react'
import { useEmployees } from '@/hooks/useEmployees'
import { ageInYears, fmtDate, isNearingRetirement, retirementAgeColor, yearsOfService } from '@/utils/leaveCalc'
import { automaticSalaryStep, formatPeso, formatSalaryGrade, parseSalaryGrade, salaryStepsForGrade } from '@/utils/salarySchedule'
import { employeeNumber, employeeTin, formatTin, personnelFullName, personnelLeadershipPriority, resolveSchoolHeadId, resolveSchoolHeadIds } from '@/utils/personnel'
import { ELEMENTARY_SCHOOLS, SECONDARY_SCHOOLS, integratedSchoolPartnerId, schoolNameById, schoolOrOfficeName } from '@/utils/schools'
import EmployeeModal from '@/components/HRMO/EmployeeModal'
import ClearableSearchInput from '@/components/shared/ClearableSearchInput'
import styles from './Dashboard.module.css'

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

function personnelPosition(employee) {
  return employee.position || 'Unspecified'
}

export default function PersonnelAdmin() {
  const { employees, loading, error, updateEmployee } = useEmployees()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [positionFilter, setPositionFilter] = useState('')
  const [schoolFilter, setSchoolFilter] = useState('')
  const [specialFilter, setSpecialFilter] = useState('')
  const [editTarget, setEditTarget] = useState(null)
  const query = search.trim().toLowerCase()
  const nashPasserCount = employees.filter(employee => employee.nash_passer).length
  const ctiItemCount = employees.filter(employee => employee.cti_item).length
  const unassignedTeachingCount = employees.filter(employee => employee.emp_type === 'Teaching' && personnelSchoolId(employee) === 'UNASSIGNED').length
  const nearingRetirementCount = employees.filter(isNearingRetirement).length
  const schoolHeadIds = resolveSchoolHeadIds(employees, personnelSchoolId)
  const personnel = employees.filter(employee => {
    const searchable = [personnelFullName(employee), employee.item_number, employeeTin(employee),
      employeeNumber(employee), employee.position, schoolOrOfficeName(personnelSchoolId(employee))]
      .filter(Boolean).join(' ').toLowerCase()
    return (!query || searchable.includes(query))
      && (!typeFilter || employee.emp_type === typeFilter)
      && (!positionFilter || personnelPosition(employee) === positionFilter)
      && (!schoolFilter || personnelSchoolId(employee) === schoolFilter)
      && (specialFilter !== 'nash' || employee.nash_passer)
      && (specialFilter !== 'cti' || employee.cti_item)
      && (specialFilter !== 'unassigned-teaching' || (employee.emp_type === 'Teaching' && personnelSchoolId(employee) === 'UNASSIGNED'))
      && (specialFilter !== 'nearing-retirement' || isNearingRetirement(employee))
  }).sort((a, b) => {
    if (schoolFilter) {
      const priorityOrder = personnelLeadershipPriority(a.position, schoolFilter === 'DEFAULT', schoolHeadIds.has(a.id))
        - personnelLeadershipPriority(b.position, schoolFilter === 'DEFAULT', schoolHeadIds.has(b.id))
      if (priorityOrder) return priorityOrder
    }
    return personnelFullName(a).localeCompare(personnelFullName(b), 'en', { sensitivity: 'base' })
  })

  const schoolCounts = employees.reduce((counts, employee) => {
    const schoolId = personnelSchoolId(employee)
    counts[schoolId] = (counts[schoolId] || 0) + 1
    return counts
  }, {})

  const positionCounts = employees.reduce((counts, employee) => {
    const position = personnelPosition(employee)
    counts[position] = (counts[position] || 0) + 1
    return counts
  }, {})
  const positions = Object.keys(positionCounts).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
  const pagination = usePagination(personnel, [search, typeFilter, positionFilter, schoolFilter])

  // An integrated school's Elementary and Secondary campuses have separate
  // DepEd School IDs (and rosters) but share one School Head — look for them
  // under either campus id so both show the same name.
  const partnerSchoolId = integratedSchoolPartnerId(schoolFilter)
  const schoolAndPartnerRoster = schoolFilter && schoolFilter !== 'DEFAULT' && schoolFilter !== 'UNASSIGNED'
    ? employees.filter(employee => {
        const sid = personnelSchoolId(employee)
        return sid === schoolFilter || sid === partnerSchoolId
      })
    : []
  const schoolHeadId = resolveSchoolHeadId(schoolAndPartnerRoster)
  const schoolHead = schoolAndPartnerRoster.find(employee => employee.id === schoolHeadId) || null

  return <>
  <div className={styles.card}>
    <div className={styles.cardHeader}><span className={styles.cardTitle}>All Personnel</span></div>
    <div className={styles.toolbar}>
      <ClearableSearchInput className={styles.searchInput} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, OSEC no., TIN, position, or school…" />
      <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
        <option value="">All types</option><option value="Teaching">Teaching</option><option value="Non-Teaching">Non-Teaching</option>
      </select>
      <select value={positionFilter} onChange={e => setPositionFilter(e.target.value)}>
        <option value="">All positions ({employees.length})</option>
        {positions.map(position => <option key={position} value={position}>{position} ({positionCounts[position]})</option>)}
      </select>
      <select className={styles.schoolSelect} value={schoolFilter} onChange={e => setSchoolFilter(e.target.value)}>
        <option value="">All Schools / Offices ({employees.length})</option>
        {schoolCounts.DEFAULT > 0 && <option value="DEFAULT">SDO / Division Office ({schoolCounts.DEFAULT})</option>}
        {schoolCounts.UNASSIGNED > 0 && <option value="UNASSIGNED">Unassigned ({schoolCounts.UNASSIGNED})</option>}
        <optgroup label="Elementary">
          {ELEMENTARY_SCHOOLS.map(school => <option key={school.id} value={school.id}>{school.name} ({schoolCounts[school.id] || 0})</option>)}
        </optgroup>
        <optgroup label="Secondary">
          {SECONDARY_SCHOOLS.map(school => <option key={school.id} value={school.id}>{school.name} ({schoolCounts[school.id] || 0})</option>)}
        </optgroup>
      </select>
      <select className={styles.personnelStatusSelect} value={specialFilter} onChange={e => setSpecialFilter(e.target.value)}>
        <option value="">All Personnel</option>
        <option value="nash">NASH Passers Only ({nashPasserCount})</option>
        <option value="cti">CTI Items Only ({ctiItemCount})</option>
        <option value="unassigned-teaching">Unassigned Teaching Personnel ({unassignedTeachingCount})</option>
        <option value="nearing-retirement">Nearing Retirement (Age 59–65) ({nearingRetirementCount})</option>
      </select>
      <span className={styles.personnelCount} aria-live="polite">({personnel.length}) personnel</span>
    </div>
    {schoolHead && (
      <div className={styles.subCell} style={{ padding: '0 16px 8px' }}>
        <strong>School Head:</strong> {personnelFullName(schoolHead)}
        {partnerSchoolId ? ` — shared with ${schoolNameById(partnerSchoolId)}` : ''}
      </div>
    )}
    {error && <div className={styles.inlineError}>Could not load personnel: {error}</div>}
    {loading && personnel.length === 0 ? <div className={styles.emptyState}>Loading…</div> : <div className={styles.tableWrap}>
      <table className={`${styles.table} ${styles.nameFirstColumn}`}>
        <thead><tr><th>Full Name</th><th>OSEC No.</th><th>Position / School</th><th>Salary Grade</th><th>Monthly Salary</th><th>Employment Status</th><th>Type</th><th>Age</th><th>Birth Date</th><th>Date Hired</th><th>Years in Service</th><th>Date Last Promoted</th><th>TIN</th></tr></thead>
        <tbody>{personnel.length === 0
          ? <tr><td colSpan={13} className={styles.emptyState}>No personnel found.</td></tr>
          : pagination.items.map(employee => {
              const teaching = employee.emp_type === 'Teaching'
              const age = employee.birth_date ? ageInYears(employee.birth_date) : null
              return <tr
                key={employee.id}
                className={styles.clickableRow}
                onClick={() => setEditTarget(employee)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setEditTarget(employee)
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`Edit ${personnelFullName(employee)}`}
              >
                <td className={styles.nameCell}>
                  <div className={styles.personnelNameLayout}>
                  <span>{personnelFullName(employee)}</span>
                  <div className={styles.personnelBadges}>
                  {employee.nash_passer && (
                    <span className={`${styles.pill} ${styles.pillOk}`} style={{ marginLeft: 6 }} title={employee.nash_batch ? `NASH Passer — ${employee.nash_batch}` : 'NASH Passer'}>NASH</span>
                  )}
                  {employee.cti_item && (
                    <span className={`${styles.pill} ${styles.pillWarn}`} style={{ marginLeft: 6 }} title="CTI Item — abolished when this employee leaves, never refilled">CTI</span>
                  )}
                  {employee.school_head_designate && (
                    <span className={`${styles.pill} ${styles.pillOk}`} style={{ marginLeft: 6 }} title="Designated as acting School Head for this school">School Head</span>
                  )}
                  {employee.is_active === false && (
                    <span className={`${styles.pill} ${styles.pillReject}`} style={{ marginLeft: 6 }} title={[employee.separation_reason, employee.separation_date ? fmtDate(employee.separation_date) : null].filter(Boolean).join(' — ') || 'Separated from service'}>Separated</span>
                  )}
                  </div>
                  </div>
                </td>
                <td className={styles.subCell}>{employee.item_number || '—'}</td>
                <td><div>{employee.position || '—'}</div><div className={styles.subCell}>{schoolOrOfficeName(personnelSchoolId(employee)) || 'Unassigned'}</div></td>
                <td className={styles.subCell}>{formatSalaryGrade(parseSalaryGrade(employee.salary_grade), currentStep(employee)) || '—'}</td>
                <td className={styles.creditCell}>{formatPeso(employee.monthly_salary) || '—'}</td>
                <td className={styles.subCell}>{employee.emp_status || '—'}</td>
                <td><span className={`${styles.pill} ${teaching ? styles.pillTeaching : styles.pillNT}`}>{employee.emp_type}</span></td>
                <td className={styles.subCell} style={retirementAgeColor(age) ? { color: retirementAgeColor(age), fontWeight: 600 } : undefined}>{age ?? '—'}</td>
                <td className={styles.subCell}>{fmtDate(employee.birth_date)}</td>
                <td className={styles.subCell}>{fmtDate(employee.hired_date)}</td>
                <td className={styles.subCell}>{yearsOfService(employee.hired_date)} year(s)</td>
                <td className={styles.subCell}>{fmtDate(employee.salary_step_basis_date)}</td>
                <td className={styles.subCell}>{formatTin(employeeTin(employee))}</td>
              </tr>
            })}</tbody>
      </table>
    </div>}

      <Pagination pagination={pagination} loading={loading} />  </div>
  {editTarget && <EmployeeModal
    employee={editTarget}
    onSave={async data => {
      // Saved from the Admin Console: lock the assignment so an AO's
      // self-service tools can no longer reassign or remove it.
      const result = await updateEmployee(editTarget.id, { ...data, assignment_locked: true })
      if (result.success && !result.pendingSync) setEditTarget(null)
      return result
    }}
    onClose={() => setEditTarget(null)}
  />}
  </>
}
