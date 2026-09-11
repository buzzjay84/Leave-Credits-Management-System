import usePagination from '@/hooks/usePagination'
import Pagination from '@/components/shared/Pagination'
import MonthlyTransactions from '@/components/shared/MonthlyTransactions'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEmployees } from '@/hooks/useEmployees'
import { useLeaveRequests } from '@/hooks/useLeaveRequests'
import { supabase } from '@/utils/supabase'
import StaffAssignmentPanel from '@/components/School/StaffAssignmentPanel'
import { useAuth } from '@/hooks/useAuth'
import { ageInYears, ctoBalance, ctoExpiryWarnings, retirementAgeColor, vlBalance, slBalance, vscBalance, fmt, fmtDate, yearsOfService } from '@/utils/leaveCalc'
import { personnelFullName, personnelLeadershipPriority, resolveSchoolHeadId } from '@/utils/personnel'
import { integratedSchoolPartnerId } from '@/utils/schools'
import EmployeeDetailModal from '@/components/School/EmployeeDetailModal'
import LeaveRequestModal from '@/components/School/LeaveRequestModal'
import styles from './Dashboard.module.css'
import ClearableSearchInput from '@/components/shared/ClearableSearchInput'
import PromptDialog from '@/components/shared/PromptDialog'
import ConfirmDialog from '@/components/shared/ConfirmDialog'

export default function SchoolDashboard() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('personnel')
  const [contextMenu, setContextMenu] = useState(null)
  const [partnerSchoolHead, setPartnerSchoolHead] = useState(null)
  const menuRef = useRef(null)
  useEffect(() => {
    if (!contextMenu) return
    menuRef.current?.querySelector('button')?.focus({ preventScroll: true })
    const dismiss = () => setContextMenu(null)
    const onPointer = event => { if (!menuRef.current?.contains(event.target)) dismiss() }
    const onKey = event => { if (event.key === 'Escape' || event.key === 'Tab') dismiss() }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', dismiss, { passive: true })
    window.addEventListener('resize', dismiss)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', dismiss)
      window.removeEventListener('resize', dismiss)
    }
  }, [contextMenu])
  function openPersonnelMenu(event, employee) {
    event.preventDefault()
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    setContextMenu({ employee, x: Math.max(8, Math.min(event.clientX || rect.left, window.innerWidth - 232)), y: Math.max(8, Math.min(event.clientY || rect.bottom, window.innerHeight - 200)) })
  }
  const [removingId, setRemovingId] = useState(null)
  const [removeTarget, setRemoveTarget] = useState(null)
  const { employees, loading, fetch: refetchEmployees } = useEmployees()
  const { requests, error: requestError, submitRequest, cancelMandatoryRequest } = useLeaveRequests()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [sortBy, setSortBy] = useState('name_asc')
  const [detail, setDetail] = useState(null)
  const [requestTarget, setRequestTarget] = useState(null)
  const [actionMessage, setActionMessage] = useState('')
  const [cancelTarget, setCancelTarget] = useState(null)

  // This school's own roster covers the School Head in most cases; an
  // integrated school's Elementary/Secondary campuses share one School Head
  // but keep separate rosters, so fall back to the partner campus's roster
  // (RLS-scoped away from this account) via a name-only lookup.
  const partnerSchoolId = integratedSchoolPartnerId(user?.school_id)
  useEffect(() => {
    if (!partnerSchoolId) { setPartnerSchoolHead(null); return }
    let active = true
    supabase.rpc('lcms_get_school_head', { target_school_id: partnerSchoolId }).then(({ data }) => {
      if (active) setPartnerSchoolHead(data?.[0] || null)
    })
    return () => { active = false }
  }, [partnerSchoolId])
  const ownSchoolHeadId = resolveSchoolHeadId(employees)
  const ownSchoolHead = employees.find(employee => employee.id === ownSchoolHeadId)
  const schoolHead = ownSchoolHead || partnerSchoolHead

  async function removeTeacher() {
    const employee = removeTarget
    setRemoveTarget(null)
    setRemovingId(employee.id)
    setActionMessage('')
    try {
      const { error } = await supabase.rpc('lcms_assign_teacher_to_school', {
        personnel_id: employee.id, expected_school_id: employee.school_id, remove_assignment: true
      })
      if (error) throw error
      setActionMessage('Teacher removed from your school. Personnel and leave records retained.')
      await refetchEmployees()
    } catch (error) { setActionMessage('Removal failed: ' + error.message) }
    finally { setRemovingId(null) }
  }

  const ctoWarnings = employees.flatMap(employee =>
    ctoExpiryWarnings(employee).map(credit => ({ employee, credit })))

  async function submitCancelMandatory(reason) {
    const request = cancelTarget
    setCancelTarget(null)
    const result = await cancelMandatoryRequest(request.id, reason)
    setActionMessage(result.success
      ? 'Authority cancellation documented. The exact VL deduction was restored and the scheduled days will not be forfeited at year-end.'
      : `Cancellation failed: ${result.error}`)
  }

  let list = employees.filter(employee => {
    const query = search.toLowerCase()
    const name = `${employee.last_name} ${employee.first_name}`.toLowerCase()
    return (!query || name.includes(query) || (employee.employee_no || '').toLowerCase().includes(query)) &&
      (!typeFilter || employee.emp_type === typeFilter)
  })

  list = [...list].sort((a, b) => {
    const nameA = `${a.last_name}, ${a.first_name}`
    const nameB = `${b.last_name}, ${b.first_name}`
    const leaveA = a.emp_type === 'Teaching' ? vscBalance(a) : vlBalance(a)
    const leaveB = b.emp_type === 'Teaching' ? vscBalance(b) : vlBalance(b)
    if (sortBy === 'name_asc' || sortBy === 'name_desc') {
      const priorityOrder = personnelLeadershipPriority(a.position, false, a.id === ownSchoolHeadId)
        - personnelLeadershipPriority(b.position, false, b.id === ownSchoolHeadId)
      if (priorityOrder) return priorityOrder
    }
    if (sortBy === 'name_desc') return nameB.localeCompare(nameA, 'en', { sensitivity: 'base' })
    if (sortBy === 'service_desc') return yearsOfService(b.hired_date) - yearsOfService(a.hired_date) || nameA.localeCompare(nameB)
    if (sortBy === 'service_asc') return yearsOfService(a.hired_date) - yearsOfService(b.hired_date) || nameA.localeCompare(nameB)
    if (sortBy === 'leave_desc') return leaveB - leaveA || nameA.localeCompare(nameB)
    if (sortBy === 'leave_asc') return leaveA - leaveB || nameA.localeCompare(nameB)
    if (sortBy === 'sl_desc') return slBalance(b) - slBalance(a) || nameA.localeCompare(nameB)
    if (sortBy === 'cto_desc') return ctoBalance(b) - ctoBalance(a) || nameA.localeCompare(nameB)
    if (sortBy === 'type') return a.emp_type.localeCompare(b.emp_type) || nameA.localeCompare(nameB)
    return nameA.localeCompare(nameB, 'en', { sensitivity: 'base' })
  })

  const pagination = usePagination(list, [search, typeFilter, sortBy])
  // Only hide/reorder a credit column when the type filter narrows the list
  // to one side — "All types" still mixes Teaching and Non-Teaching rows, so
  // every column stays. VL and VSC are two different pools and are never
  // merged into one column.
  const showVl = typeFilter !== 'Teaching'
  const showVsc = typeFilter !== 'Non-Teaching'
  const teachingOnly = typeFilter === 'Teaching'
  const nonTeachingOnly = typeFilter === 'Non-Teaching'
  const creditColumnCount = (showVl ? 1 : 0) + 1 + (showVsc ? 1 : 0) + (nonTeachingOnly ? 1 : 0)
  const ledgerColumnCount = 6 + creditColumnCount + 1

  return (
    <div className={styles.page}>
      {user?.school_name && <h1 style={{ fontSize: 18, fontWeight: 650, margin: '0 0 4px' }}>{user.school_name}</h1>}
      {schoolHead && (
        <div className={styles.subCell} style={{ margin: '0 0 12px' }}>
          <strong>School Head:</strong> {personnelFullName(schoolHead)}
        </div>
      )}
      <div className={styles.dashboardTabs} role="tablist" aria-label="School dashboard">
        {[
          ['personnel', 'Personnel Ledger'],
          ['transactions', 'Monthly Transaction Record'],
          ['service', 'Service Record'],
        ].map(([id, label], index) => <button key={id} id={'tab-' + id} role="tab" aria-selected={activeTab === id} aria-controls={'panel-' + id} tabIndex={activeTab === id ? 0 : -1} className={activeTab === id ? styles.dashboardTabActive : styles.dashboardTab} onClick={() => { setActiveTab(id); setContextMenu(null) }} onKeyDown={event => {
          const ids = ['personnel', 'transactions', 'service']
          const next = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : null
          if (next === null) return
          event.preventDefault(); setActiveTab(ids[next]); setContextMenu(null)
          document.getElementById('tab-' + ids[next])?.focus()
        }}>{label}</button>)}
      </div>
      <section id="panel-personnel" role="tabpanel" aria-labelledby="tab-personnel" hidden={activeTab !== 'personnel'} className={styles.ledgerPanel}>
      <div className={`${styles.infoBox} ${styles.infoBoxBlue}`}>
        <strong>School AOII View.</strong> Submit an employee leave request here. Credits are not deducted until
        HRMO confirms that the signed CS Form 6 is approved and approves the request.
      </div>

      {ctoWarnings.length > 0 && <div className={`${styles.infoBox} ${styles.infoBoxDanger}`} role="alert">
        <strong>CTO expires within 14 days:</strong> {ctoWarnings.map(({ employee, credit }) =>
          `${employee.last_name}, ${employee.first_name}${employee.middle_name ? ` ${employee.middle_name}` : ''}: ${fmt(credit.remaining_days)} day(s), credited ${fmtDate(credit.granted_on)}, expires ${fmtDate(credit.expires_on)}`
        ).join(' • ')}
      </div>}

      <StaffAssignmentPanel schoolId={user?.school_id} onAssigned={refetchEmployees} />

      {(requestError || requests.length > 0) && <div className={styles.card} style={{ flex: 'none', maxHeight: 230 }}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>Leave Requests</span>
          <span className={`${styles.pill} ${styles.pillWarn}`}>{requests.filter(request => request.status === 'pending').length} pending</span>
        </div>
        {requestError
          ? <div className={styles.inlineError}>Requests require an online Supabase connection: {requestError}</div>
          : <div className={styles.tableWrap}>
              <table className={`${styles.table} ${styles.nameFirstColumn}`}>
                <thead><tr><th>Employee</th><th>Leave</th><th>Dates</th><th>Days</th><th>Status</th><th>HRMO Note</th><th>Action</th></tr></thead>
                <tbody>
                  {requests.slice(0, 20).map(request => (
                        <tr key={request.id}>
                          <td>{request.employee?.last_name}, {request.employee?.first_name}{request.employee?.middle_name ? ` ${request.employee.middle_name}` : ''}</td>
                          <td>{request.leave_type}</td>
                          <td>{fmtDate(request.date_from)}{request.date_to !== request.date_from ? ` – ${fmtDate(request.date_to)}` : ''}</td>
                          <td>{fmt(request.days)}</td>
                          <td><span className={`${styles.pill} ${request.status === 'approved' ? styles.pillOk : ['rejected', 'cancelled'].includes(request.status) ? styles.pillReject : styles.pillWarn}`}>{request.status}</span></td>
                          <td className={styles.subCell}>{request.cancellation_reason || request.rejection_reason || (request.form6_confirmed ? 'CS Form 6 confirmed' : 'Awaiting review')}</td>
                          <td>{request.status === 'approved' && request.leave_category === 'mandatory_forced'
                            ? <button className={styles.btnDangerSm} onClick={() => setCancelTarget(request)}>Record authority cancellation</button>
                            : '—'}</td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>}
      </div>}

      {actionMessage && <div className={/failed:/i.test(actionMessage) ? styles.inlineError : styles.inlineSuccess}>{actionMessage}</div>}

      <div className={`${styles.card} ${styles.personnelCard}`}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>Employee Leave Credit Ledger</span>
        </div>
        <div className={styles.toolbar}>
          <ClearableSearchInput className={styles.searchInput} placeholder="Search by name or employee no…" value={search} onChange={event => setSearch(event.target.value)} />
          <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}>
            <option value="">All types</option><option value="Teaching">Teaching</option><option value="Non-Teaching">Non-Teaching</option>
          </select>
          <select value={sortBy} onChange={event => setSortBy(event.target.value)}>
            <option value="name_asc">Name: A–Z</option>
            <option value="name_desc">Name: Z–A</option>
            <option value="service_desc">Service: Longest First</option>
            <option value="service_asc">Service: Newest First</option>
            <option value="leave_desc">VL/VSC: Highest First</option>
            <option value="leave_asc">VL/VSC: Lowest First</option>
            <option value="sl_desc">SL: Highest First</option>
            <option value="cto_desc">CTO: Highest First</option>
            <option value="type">Employee Type</option>
          </select>
          <span className={styles.personnelCount} aria-live="polite">({list.length}) personnel</span>
        </div>

        {loading
          ? <div className={styles.emptyState}>Loading…</div>
          : <div className={styles.tableWrap}>
              <table className={`${styles.table} ${styles.nameFirstColumn}`}>
                <thead><tr>
                  <th>Employee</th><th>Type</th><th>Age</th><th>Date Hired</th><th>Date Last Promoted</th><th>Years in Service</th>
                  {showVl && <th>VL Balance</th>}
                  {teachingOnly && <th>VSC Balance</th>}
                  <th>SL Balance</th>
                  {!teachingOnly && showVsc && <th>VSC Balance</th>}
                  {nonTeachingOnly && <th>CTO Balance</th>}
                  <th>Actions</th>
                </tr></thead>
                <tbody>
                  {list.length === 0
                    ? <tr><td colSpan={ledgerColumnCount} className={styles.emptyState}>No employees found.</td></tr>
                    : pagination.items.map(employee => {
                        const teaching = employee.emp_type === 'Teaching'
                        const age = employee.birth_date ? ageInYears(employee.birth_date) : null
                        return (
                          <tr key={employee.id} tabIndex={0} onContextMenu={event => openPersonnelMenu(event, employee)} onKeyDown={event => {
                            if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) openPersonnelMenu(event, employee)
                          }}>
                            <td><button className={styles.nameButton} onClick={() => setDetail(employee)}>{employee.last_name}, {employee.first_name}{employee.middle_name ? ` ${employee.middle_name}` : ''}</button><div className={styles.subCell}>{employee.position}</div></td>
                            <td><span className={`${styles.pill} ${employee.emp_type === 'Teaching' ? styles.pillTeaching : styles.pillNT}`}>{employee.emp_type === 'Teaching' ? 'VSC/PVP' : 'VL+SL'}</span></td>
                            <td className={styles.subCell} style={retirementAgeColor(age) ? { color: retirementAgeColor(age), fontWeight: 600 } : undefined}>{age ?? '—'}</td>
                            <td className={styles.subCell}>{fmtDate(employee.hired_date)}</td>
                            <td className={styles.subCell}>{fmtDate(employee.salary_step_basis_date)}</td>
                            <td className={styles.subCell}>{yearsOfService(employee.hired_date)} year(s)</td>
                            {showVl && <td className={`${styles.creditCell} ${styles.maroon}`}>{teaching ? '—' : fmt(vlBalance(employee))}</td>}
                            {teachingOnly && <td className={`${styles.creditCell} ${styles.maroon}`}>{fmt(vscBalance(employee))}</td>}
                            {/* Teaching has no separate SL pool — leave taken is recorded as
                                Sick Leave but deducted from VSC, so SL mirrors the VSC balance. */}
                            <td className={styles.creditCell}>{teaching ? fmt(vscBalance(employee)) : fmt(slBalance(employee))}</td>
                            {!teachingOnly && showVsc && <td className={styles.creditCell}>{teaching ? fmt(vscBalance(employee)) : '—'}</td>}
                            {nonTeachingOnly && <td className={styles.creditCell}>{fmt(ctoBalance(employee))}</td>}
                            <td>
                              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                <button className={styles.btnInfoSm} onClick={() => setDetail(employee)}>View</button>
                                <button className={styles.btnSuccessSm} onClick={() => setRequestTarget(employee)}>Request Leave</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                </tbody>
              </table>
            </div>}

      <Pagination pagination={pagination} loading={loading} />      </div>

      </section>
      <section id="panel-transactions" role="tabpanel" aria-labelledby="tab-transactions" hidden={activeTab !== 'transactions'}>
        <MonthlyTransactions employees={employees} loading={loading} />
      </section>
      <section id="panel-service" role="tabpanel" aria-labelledby="tab-service" hidden={activeTab !== 'service'}>
        <div className={styles.comingSoon}><h2 className={styles.cardTitle}>Service Record</h2><p>Coming soon</p></div>
      </section>
      {contextMenu && createPortal(<div ref={menuRef} className={styles.contextMenu} role="menu" aria-label="Personnel actions" onContextMenu={event => event.preventDefault()} style={{ left: contextMenu.x, top: contextMenu.y }}>
        <button role="menuitem" style={{ color: 'var(--text-primary)' }} onClick={() => { setDetail(contextMenu.employee); setContextMenu(null) }}>View personnel</button>
        <button role="menuitem" style={{ color: 'var(--text-primary)' }} onClick={() => { setRequestTarget(contextMenu.employee); setContextMenu(null) }}>Request Leave</button>
        {contextMenu.employee.emp_type === 'Teaching' && !/principal|head teacher|school head/i.test(contextMenu.employee.position || '') && !contextMenu.employee.assignment_locked
          ? <button role="menuitem" disabled={removingId !== null} onClick={() => { const employee = contextMenu.employee; setContextMenu(null); setRemoveTarget(employee) }}>Remove from school</button>
          : <button role="menuitem" disabled>{contextMenu.employee.assignment_locked ? 'Assigned by Administrator — managed in Admin Console' : 'Removal managed by HRMO'}</button>}
      </div>, document.body)}
      {detail && <EmployeeDetailModal employee={detail} onClose={() => setDetail(null)} onSaved={refetchEmployees} />}
      {requestTarget && <LeaveRequestModal employee={requestTarget} onSubmit={submitRequest} onClose={() => setRequestTarget(null)} />}
      {removeTarget && (
        <ConfirmDialog
          title="Remove from school?"
          message={`Remove ${removeTarget.last_name}, ${removeTarget.first_name} from your school? Their personnel and leave records will be retained.`}
          confirmLabel="Remove"
          onCancel={() => setRemoveTarget(null)}
          onConfirm={removeTeacher}
        />
      )}
      {cancelTarget && (
        <PromptDialog
          title="Record Authority Cancellation"
          message="Document why the signing authority cancelled this scheduled mandatory/forced leave due to exigency of service:"
          placeholder="Cancelled by signing authority due to exigency of service"
          confirmLabel="Record Cancellation"
          onSubmit={submitCancelMandatory}
          onCancel={() => setCancelTarget(null)}
        />
      )}
    </div>
  )
}
