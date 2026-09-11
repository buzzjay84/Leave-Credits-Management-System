import { leaveConditions } from '@/utils/leaveConditions'
import usePagination from '@/hooks/usePagination'
import Pagination from '@/components/shared/Pagination'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import CtoCreditModal from '@/components/HRMO/CtoCreditModal'
import { useEmployees } from '@/hooks/useEmployees'
import { useLeaveRequests } from '@/hooks/useLeaveRequests'
import { useMonthlyLeaveRecords, RECORDS_PER_PAGE } from '@/hooks/useMonthlyLeaveRecords'
import {
  ageInYears, ctoBalance, ctoExpiryWarnings, isCtoEligible, retirementAgeColor, vlBalance, slBalance, vscBalance, fmt, fmtDate,
  yearsOfService, requiresForcedLeave
} from '@/utils/leaveCalc'
import EmployeeModal from '@/components/HRMO/EmployeeModal'
import EmployeeDetailModal from '@/components/School/EmployeeDetailModal'
import { personnelLeadershipPriority, resolveSchoolHeadIds } from '@/utils/personnel'
import { SCHOOLS, schoolNameById } from '@/utils/schools'
import styles from './Dashboard.module.css'
import ClearableSearchInput from '@/components/shared/ClearableSearchInput'
import PromptDialog from '@/components/shared/PromptDialog'
import ConfirmDialog from '@/components/shared/ConfirmDialog'

const RECORD_MONTH_NAMES = Array.from({ length: 12 }, (_, month) =>
  new Date(2026, month, 1).toLocaleString('en', { month: 'long' }))

export default function HRMODashboard() {
  const { employees, loading, fetch, addEmployee, updateEmployee } = useEmployees()
  const { requests, loading: requestsLoading, error: requestsError, approveRequest, rejectRequest } = useLeaveRequests()
  const [search, setSearch]           = useState('')
  const [typeFilter, setTypeFilter]   = useState('')
  const [schoolFilter, setSchoolFilter] = useState('')
  const [sortBy, setSortBy]           = useState('name_asc')
  const [showAdd, setShowAdd]         = useState(false)
  const [editTarget, setEditTarget]   = useState(null)
  const [ctoTarget, setCtoTarget] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const menuRef = useRef(null)
  useEffect(() => {
    if (!contextMenu) return
    menuRef.current?.querySelector('button')?.focus({ preventScroll: true })
    const dismiss = () => setContextMenu(null)
    const pointer = event => { if (!menuRef.current?.contains(event.target)) dismiss() }
    const key = event => { if (event.key === 'Escape' || event.key === 'Tab') dismiss() }
    window.addEventListener('pointerdown', pointer)
    window.addEventListener('keydown', key)
    window.addEventListener('wheel', dismiss, { passive: true })
    window.addEventListener('resize', dismiss)
    return () => { window.removeEventListener('pointerdown', pointer); window.removeEventListener('keydown', key); window.removeEventListener('wheel', dismiss); window.removeEventListener('resize', dismiss) }
  }, [contextMenu])
  function openMenu(event, employee) {
    event.preventDefault(); event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    setContextMenu({ employee, x: Math.max(8, Math.min(event.clientX || rect.left, window.innerWidth - 232)), y: Math.max(8, Math.min(event.clientY || rect.bottom, window.innerHeight - 110)) })
  }
  const [detailTarget, setDetailTarget] = useState(null)
  const [reviewingId, setReviewingId] = useState(null)
  const [reviewMessage, setReviewMessage] = useState('')
  const [rejectTarget, setRejectTarget] = useState(null)
  const [approveTarget, setApproveTarget] = useState(null)
  const monthlyRecords = useMonthlyLeaveRecords(employees, requests)
  const [recordYear, recordMonthIndex] = monthlyRecords.month.split('-').map(Number)
  const recordYears = [...new Set([
    new Date().getFullYear(), recordYear,
    ...employees.flatMap(employee => (employee.leave_transactions || []).map(txn => new Date(txn.created_at || txn.date_from).getFullYear())),
    ...requests.filter(request => request.status === 'rejected').map(request => new Date(request.reviewed_at || request.updated_at).getFullYear()),
  ].filter(Number.isFinite))].sort((a, b) => b - a)

  const pendingRequests = requests.filter(request => request.status === 'pending')
  const ctoWarnings = employees.filter(employee => employee.emp_type === 'Non-Teaching').flatMap(employee =>
    ctoExpiryWarnings(employee).map(credit => ({ employee, credit })))

  async function confirmApprove() {
    const request = approveTarget
    setApproveTarget(null)
    setReviewingId(request.id)
    setReviewMessage('')
    const result = await approveRequest(request.id)
    if (result.success) {
      setReviewMessage('Request approved and documented. Applicable leave credits were deducted; special leave stayed outside VL/SL.')
      await fetch()
    } else {
      setReviewMessage(`Approval failed: ${result.error}`)
    }
    setReviewingId(null)
  }

  async function submitReject(reason) {
    const request = rejectTarget
    setRejectTarget(null)
    setReviewingId(request.id)
    setReviewMessage('')
    const result = await rejectRequest(request.id, reason)
    setReviewMessage(result.success ? 'Request rejected. No leave credits were deducted.' : `Rejection failed: ${result.error}`)
    setReviewingId(null)
  }

  const schoolHeadIds = resolveSchoolHeadIds(employees)
  const filtered = employees.filter(e => {
    const q = search.toLowerCase()
    const name = `${e.last_name} ${e.first_name}`.toLowerCase()
    return (
      (!q || name.includes(q) || (e.employee_no || '').toLowerCase().includes(q)) &&
      (!typeFilter || e.emp_type === typeFilter) &&
      (!schoolFilter || e.school_id === schoolFilter)
    )
  }).sort((a, b) => {
    const nameA = `${a.last_name}, ${a.first_name}`
    const nameB = `${b.last_name}, ${b.first_name}`
    const leaveA = a.emp_type === 'Teaching' ? vscBalance(a) : vlBalance(a)
    const leaveB = b.emp_type === 'Teaching' ? vscBalance(b) : vlBalance(b)
    if (schoolFilter && (sortBy === 'name_asc' || sortBy === 'name_desc')) {
      const priorityOrder = personnelLeadershipPriority(a.position, schoolFilter === 'DEFAULT', schoolHeadIds.has(a.id))
        - personnelLeadershipPriority(b.position, schoolFilter === 'DEFAULT', schoolHeadIds.has(b.id))
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

  const schoolCounts = employees.reduce((counts, e) => {
    counts[e.school_id] = (counts[e.school_id] || 0) + 1
    return counts
  }, {})
  const unassignedCount = schoolCounts.UNASSIGNED || 0
  const sdoCount = schoolCounts.DEFAULT || 0

  const teaching    = employees.filter(e => e.emp_type === 'Teaching').length
  const nonTeaching = employees.filter(e => e.emp_type === 'Non-Teaching').length

  const pagination = usePagination(filtered, [search, typeFilter, schoolFilter, sortBy])
  // Only hide/reorder a credit column when the type filter narrows the list
  // to one side — "All types" still mixes Teaching and Non-Teaching rows, so
  // every column stays. VL and VSC are two different pools and are never
  // merged into one column.
  const showVl = typeFilter !== 'Teaching'
  const showVsc = typeFilter !== 'Non-Teaching'
  const teachingOnly = typeFilter === 'Teaching'
  const nonTeachingOnly = typeFilter === 'Non-Teaching'
  const creditColumnCount = (showVl ? 1 : 0) + 1 + (showVsc ? 1 : 0) + (nonTeachingOnly ? 1 : 0)
  const rosterColumnCount = 6 + creditColumnCount + 2

  return (
    <div className={styles.page}>
      {ctoWarnings.length > 0 && <div className={`${styles.infoBox} ${styles.infoBoxDanger}`} role="alert">
        <strong>CTO expires within 14 days:</strong> {ctoWarnings.map(({ employee, credit }) =>
          `${employee.last_name}, ${employee.first_name}${employee.middle_name ? ` ${employee.middle_name}` : ''}: ${fmt(credit.remaining_days)} day(s), credited ${fmtDate(credit.granted_on)}, expires ${fmtDate(credit.expires_on)}`
        ).join(' • ')}
      </div>}
      {/* Stats */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total Personnel</div>
          <div className={styles.statValue}>{employees.length}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Teaching</div>
          <div className={styles.statValue} style={{ color: 'var(--sdo-blue)' }}>{teaching}</div>
          <div className={styles.statSub}>VSC / PVP basis</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Non-Teaching</div>
          <div className={styles.statValue} style={{ color: 'var(--success)' }}>{nonTeaching}</div>
          <div className={styles.statSub}>VL + SL auto-accrual</div>
        </div>
      </div>

      <div className={styles.card} style={{ flex: 'none', maxHeight: 340 }}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>Monthly Transaction Record</span>
          <div className={styles.monthFilters}>
            <select aria-label="Transaction month" value={recordMonthIndex - 1} onChange={event => monthlyRecords.changeMonth(`${recordYear}-${String(Number(event.target.value) + 1).padStart(2, '0')}`)}>
              {RECORD_MONTH_NAMES.map((label, index) => <option key={label} value={index}>{label}</option>)}
            </select>
            <select aria-label="Transaction year" value={recordYear} onChange={event => monthlyRecords.changeMonth(`${event.target.value}-${String(recordMonthIndex).padStart(2, '0')}`)}>
              {recordYears.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Date</th><th>Employee</th><th>Action</th><th>Leave Type</th><th>Days</th><th>Note</th><th>By</th></tr></thead>
            <tbody>
              {monthlyRecords.visibleRecords.length === 0
                ? <tr><td colSpan={7} className={styles.emptyState}>No recorded actions for this month.</td></tr>
                : monthlyRecords.visibleRecords.map(entry => (
                    <tr key={entry.id}>
                      <td className={styles.subCell}>{fmtDate(entry.date)}</td>
                      <td className={styles.nameCell}>{entry.employeeName}</td>
                      <td><span className={`${styles.pill} ${entry.rejected ? styles.pillReject : styles.pillOk}`}>{entry.action}</span></td>
                      <td className={styles.subCell}>{entry.leaveType || '—'}</td>
                      <td className={styles.creditCell}>{entry.days != null ? `${entry.days > 0 ? '+' : ''}${fmt(entry.days)}` : '—'}</td>
                      <td className={styles.subCell}>{entry.note}</td>
                      <td className={styles.subCell}>{entry.actor}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {monthlyRecords.totalCount > RECORDS_PER_PAGE && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '8px 16px' }}>
            <button data-pagination-action="true" className={styles.btnPrimary} disabled={monthlyRecords.page <= 1} onClick={() => monthlyRecords.setPage(p => p - 1)}>Prev</button>
            <span className={styles.subCell}>Page {monthlyRecords.page} of {monthlyRecords.pageCount}</span>
            <button data-pagination-action="true" className={styles.btnPrimary} disabled={monthlyRecords.page >= monthlyRecords.pageCount} onClick={() => monthlyRecords.setPage(p => p + 1)}>Next</button>
          </div>
        )}
      </div>

      {(requestsLoading || requestsError || pendingRequests.length > 0) && <div className={styles.card} style={{ flex: 'none', maxHeight: 280 }}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>Pending Leave Requests</span>
          <span className={`${styles.pill} ${pendingRequests.length ? styles.pillWarn : styles.pillOk}`}>{pendingRequests.length} pending</span>
        </div>
        {reviewMessage && <div className={reviewMessage.startsWith('Approval failed') || reviewMessage.startsWith('Rejection failed') ? styles.inlineError : styles.inlineSuccess}>{reviewMessage}</div>}
        {requestsError
          ? <div className={styles.inlineError}>Could not load requests: {requestsError}</div>
          : requestsLoading
            ? <div className={styles.emptyState}>Loading requests…</div>
            : <div className={styles.tableWrap}>
                <table className={`${styles.table} ${styles.nameFirstColumn}`}>
                  <thead><tr><th>Employee / School</th><th className={styles.nameCell}>Requested By</th><th>Leave</th><th>Dates</th><th>Days</th><th>Reason</th><th>Action</th></tr></thead>
                  <tbody>
                    {pendingRequests.map(request => (
                          <tr key={request.id}>
                            <td><div className={styles.nameCell}>{request.employee?.last_name}, {request.employee?.first_name}{request.employee?.middle_name ? ` ${request.employee.middle_name}` : ''}</div><div className={styles.subCell}>{request.school_id}</div></td>
                            <td className={styles.nameCell}>{request.requested_by}</td>
                            <td><div>{request.leave_type}</div>{request.monetization_option && <div className={styles.subCell}>{request.monetization_option.replace('VL', '')} VL days</div>}</td>
                            <td>{fmtDate(request.date_from)}{request.date_to !== request.date_from ? ` – ${fmtDate(request.date_to)}` : ''}</td>
                            <td>{fmt(request.days)}</td>
                            <td>{request.reason || '—'}</td>
                            <td><div style={{ display: 'flex', gap: 4 }}><button className={styles.btnPrimarySm} disabled={reviewingId === request.id} onClick={() => setApproveTarget(request)}>Approve</button><button className={styles.btnDangerSm} disabled={reviewingId === request.id} onClick={() => setRejectTarget(request)}>Reject</button></div></td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>}
      </div>}

      {/* Table card */}
      <div className={`${styles.card} ${styles.personnelCard}`}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>Personnel Leave Records</span>
          <div className={styles.headerActions}>
            <button className={styles.btnPrimary} onClick={() => { setEditTarget(null); setShowAdd(true) }}>
              + Add Employee
            </button>
          </div>
        </div>

        <div className={styles.toolbar}>
          <ClearableSearchInput
            className={styles.searchInput}
            placeholder="Search by name or employee no…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            <option value="Teaching">Teaching</option>
            <option value="Non-Teaching">Non-Teaching</option>
          </select>
          <select className={styles.schoolSelect} value={schoolFilter} onChange={e => setSchoolFilter(e.target.value)}>
            <option value="">All Schools / Offices ({employees.length})</option>
            {sdoCount > 0 && <option value="DEFAULT">SDO / Division Office ({sdoCount})</option>}
            {unassignedCount > 0 && <option value="UNASSIGNED">⚠ Unassigned — Needs School ({unassignedCount})</option>}
            <optgroup label="Schools">
              {SCHOOLS.map(school => (
                <option key={school.id} value={school.id}>
                  {school.name} ({schoolCounts[school.id] || 0})
                </option>
              ))}
            </optgroup>
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
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
          <span className={styles.personnelCount} aria-live="polite">({filtered.length}) personnel</span>
        </div>

        {loading
          ? <div className={styles.emptyState}>Loading…</div>
          : <div className={styles.tableWrap}>
              <table className={`${styles.table} ${styles.nameFirstColumn}`}>
                <thead>
                  <tr>
                    <th>Name / Position</th>
                    <th>Type</th>
                    <th>Age</th>
                    <th>Date Hired</th>
                    <th>Date Last Promoted</th>
                    <th>Years in Service</th>
                    {showVl && <th>VL Balance</th>}
                    {teachingOnly && <th>VSC Balance</th>}
                    <th>SL Balance</th>
                    {!teachingOnly && showVsc && <th>VSC Balance</th>}
                    {nonTeachingOnly && <th>CTO Balance</th>}
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0
                    ? <tr><td colSpan={rosterColumnCount} className={styles.emptyState}>No employees found.</td></tr>
                    : pagination.items.map(emp => {
                        const teaching = emp.emp_type === 'Teaching'
                        const primaryBalance = teaching ? vscBalance(emp) : vlBalance(emp)
                        const low = primaryBalance < 5
                        const forced = requiresForcedLeave(emp)
                        const age = emp.birth_date ? ageInYears(emp.birth_date) : null
                        return (
                          <tr key={emp.id} className={styles.clickableRow} tabIndex={0} aria-label={`Edit ${emp.last_name}, ${emp.first_name}`}
                            onContextMenu={event => openMenu(event, emp)}
                            onClick={() => { setEditTarget(emp); setShowAdd(true) }}
                            onKeyDown={event => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { openMenu(event, emp); return } if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setEditTarget(emp); setShowAdd(true) } }}>
                            <td>
                              <span className={styles.nameCell}>
                                {emp.last_name}, {emp.first_name}{emp.middle_name ? ` ${emp.middle_name}` : ''}
                              </span>
                              <div className={styles.subCell}>
                                {emp.position}
                                {emp.assigned_school_id ? ` · ${schoolNameById(emp.assigned_school_id)}` : ''}
                              </div>
                            </td>
                            <td>
                              <span className={`${styles.pill} ${teaching ? styles.pillTeaching : styles.pillNT}`}>
                                {teaching ? 'Teaching' : 'Non-Teaching'}
                              </span>
                            </td>
                            <td className={styles.subCell} style={retirementAgeColor(age) ? { color: retirementAgeColor(age), fontWeight: 600 } : undefined}>{age ?? '—'}</td>
                            <td className={styles.subCell}>{fmtDate(emp.hired_date)}</td>
                            <td className={styles.subCell}>{fmtDate(emp.salary_step_basis_date)}</td>
                            <td className={styles.subCell}>{yearsOfService(emp.hired_date)} year(s)</td>
                            {showVl && <td className={styles.creditCell}>{teaching ? '—' : fmt(vlBalance(emp))}</td>}
                            {teachingOnly && <td className={styles.creditCell}>{fmt(vscBalance(emp))}</td>}
                            {/* Teaching has no separate SL pool — leave taken is recorded as
                                Sick Leave but deducted from VSC, so SL mirrors the VSC balance. */}
                            <td className={styles.creditCell}>{teaching ? fmt(vscBalance(emp)) : fmt(slBalance(emp))}</td>
                            {!teachingOnly && showVsc && <td className={styles.creditCell}>{teaching ? fmt(vscBalance(emp)) : '—'}</td>}
                            {nonTeachingOnly && <td className={styles.creditCell}>{fmt(ctoBalance(emp))}</td>}
                            <td>
                              {low && <span className={`${styles.pill} ${styles.pillWarn}`}>Low</span>}
                              {forced && <span className={`${styles.pill} ${styles.pillInfo}`}>Forced Leave</span>}
                              {!low && !forced && <span className={`${styles.pill} ${styles.pillOk}`}>OK</span>}
                            </td>
                            <td>
                              <div onClick={event => event.stopPropagation()} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                <button className={styles.btnInfoSm} onClick={() => setDetailTarget(emp)}>View</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                  }
                </tbody>
              </table>
            </div>
        }
        <Pagination pagination={pagination} loading={loading} />
      </div>

      {contextMenu && createPortal(<div ref={menuRef} className={styles.contextMenu} role="menu" aria-label="Personnel actions" onContextMenu={event => event.preventDefault()} style={{ left: contextMenu.x, top: contextMenu.y }}>
        <button role="menuitem" onClick={() => { setEditTarget(contextMenu.employee); setShowAdd(true); setContextMenu(null) }}>Edit personnel</button>
        {isCtoEligible(contextMenu.employee) && <button role="menuitem" onClick={() => { setCtoTarget(contextMenu.employee); setContextMenu(null) }}>Add CTO</button>}
      </div>, document.body)}
      {ctoTarget && <CtoCreditModal employee={ctoTarget} onSaved={fetch} onClose={() => setCtoTarget(null)} />}
      {showAdd && (
        <EmployeeModal
          employee={editTarget}
          onSave={async (data) => {
            const result = editTarget
              ? await updateEmployee(editTarget.id, data)
              : await addEmployee(data)
            if (result.success && !result.pendingSync) setShowAdd(false)
            return result
          }}
          onClose={() => setShowAdd(false)}
        />
      )}

      {detailTarget && <EmployeeDetailModal employee={detailTarget} onClose={() => setDetailTarget(null)} />}
      {approveTarget && (
        <ConfirmDialog
          title="Approve leave request?"
          message={
            `Approve ${approveTarget.leave_type} for ${approveTarget.employee?.first_name} ${approveTarget.employee?.last_name}? ` +
            'Confirm only if the employee and authorizing official have signed and approved CS Form 6. ' +
            'Approval will immediately deduct applicable leave credits.\n\nVerify these conditions:\n- ' +
            leaveConditions(approveTarget.leave_category).join('\n- ') + '\n\nRecorded notes: ' + (approveTarget.remarks || 'None')
          }
          confirmLabel="Approve"
          onCancel={() => setApproveTarget(null)}
          onConfirm={confirmApprove}
        />
      )}
      {rejectTarget && (
        <PromptDialog
          title="Reject Leave Request"
          message={`Reason for rejecting this request from ${rejectTarget.employee?.first_name} ${rejectTarget.employee?.last_name}:`}
          placeholder="Not approved"
          confirmLabel="Reject"
          onSubmit={submitReject}
          onCancel={() => setRejectTarget(null)}
        />
      )}
    </div>
  )
}
