import { useState } from 'react'
import usePagination from '@/hooks/usePagination'
import Pagination from '@/components/shared/Pagination'
import { useEmployees } from '@/hooks/useEmployees'
import { useLeaveRequests } from '@/hooks/useLeaveRequests'
import { useMonthlyLeaveRecords, RECORDS_PER_PAGE } from '@/hooks/useMonthlyLeaveRecords'
import { ctoBalance, fmt, fmtDate, slBalance, vlBalance, vscBalance } from '@/utils/leaveCalc'
import { employeeTin, formatTin, personnelFullName } from '@/utils/personnel'
import { ELEMENTARY_SCHOOLS, SECONDARY_SCHOOLS, schoolNameById } from '@/utils/schools'
import { supabase } from '@/utils/supabase'
import ClearableSearchInput from '@/components/shared/ClearableSearchInput'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import AlertDialog from '@/components/shared/AlertDialog'
import EmployeeDetailModal from '@/components/School/EmployeeDetailModal'
import styles from './Dashboard.module.css'

function schoolLabel(schoolId) {
  if (!schoolId) return '—'
  if (schoolId === 'DEFAULT') return 'SDO / Division Office'
  if (schoolId === 'UNASSIGNED') return 'Unassigned'
  return schoolNameById(schoolId) || '—'
}

function personnelSchoolId(employee) {
  return employee.assigned_school_id || employee.school_id || 'UNASSIGNED'
}

function monthLabel(month) {
  const [year, m] = month.split('-').map(Number)
  return new Date(year, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// Flat list of selectable months, most recent first — a plain dropdown
// instead of the browser's native calendar-grid month picker.
function recentMonths(currentMonth, count = 36) {
  const [year, m] = currentMonth.split('-').map(Number)
  const months = []
  for (let i = 0; i < count; i++) {
    const date = new Date(year, m - 1 - i, 1)
    months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

// Leave credit balances per employee — the VL/SL/VSC view that used to live
// as extra columns on the Admin Personnel table, now its own tab here since
// this page is where leave-credit detail belongs.
function LeaveCreditsPersonnelTab({ employees, loading, error, fetch }) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [schoolFilter, setSchoolFilter] = useState('')
  const [detailTarget, setDetailTarget] = useState(null)
  const query = search.trim().toLowerCase()

  const personnel = employees.filter(employee => {
    const searchable = [personnelFullName(employee), employee.item_number, employeeTin(employee), employee.position, schoolLabel(personnelSchoolId(employee))]
      .filter(Boolean).join(' ').toLowerCase()
    return (!query || searchable.includes(query))
      && (!typeFilter || employee.emp_type === typeFilter)
      && (!schoolFilter || personnelSchoolId(employee) === schoolFilter)
  }).sort((a, b) => personnelFullName(a).localeCompare(personnelFullName(b), 'en', { sensitivity: 'base' }))

  const schoolCounts = employees.reduce((counts, employee) => {
    const schoolId = personnelSchoolId(employee)
    counts[schoolId] = (counts[schoolId] || 0) + 1
    return counts
  }, {})
  const pagination = usePagination(personnel, [search, typeFilter, schoolFilter])
  // Only hide a credit column when the type filter narrows the list to one
  // side — "All types" still mixes Teaching and Non-Teaching rows, so every
  // column stays since each side needs a different one.
  const showVl = typeFilter !== 'Teaching'
  const showVsc = typeFilter !== 'Non-Teaching'
  // Viewing Teaching only: VSC leads since that's the actual pool, with SL
  // right after it (leave taken is recorded as SL but deducted from VSC).
  const teachingOnly = typeFilter === 'Teaching'
  // Viewing Non-Teaching only: VSC doesn't apply, so CTO takes its place.
  const nonTeachingOnly = typeFilter === 'Non-Teaching'
  const creditColumnCount = 5 + (showVl ? 1 : 0) + 1 + (showVsc ? 1 : 0) + (nonTeachingOnly ? 1 : 0)

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}><span className={styles.cardTitle}>Personnel — Leave Credit Balances</span></div>
      <div className={styles.toolbar}>
        <ClearableSearchInput className={styles.searchInput} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, OSEC no., TIN, position, or school…" />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All types</option><option value="Teaching">Teaching</option><option value="Non-Teaching">Non-Teaching</option>
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
        <span className={styles.personnelCount} aria-live="polite">({personnel.length}) personnel</span>
      </div>
      {error && <div className={styles.inlineError}>Could not load personnel: {error}</div>}
      {loading && personnel.length === 0 ? <div className={styles.emptyState}>Loading…</div> : <div className={styles.tableWrap}>
        <table className={`${styles.table} ${styles.nameFirstColumn}`}>
          <thead><tr><th>Full Name</th><th>OSEC No.</th><th>Position / School</th><th>Type</th><th>TIN</th>{showVl && <th>VL</th>}{teachingOnly && <th>VSC</th>}<th>SL</th>{!teachingOnly && showVsc && <th>VSC</th>}{nonTeachingOnly && <th>CTO</th>}</tr></thead>
          <tbody>{personnel.length === 0
            ? <tr><td colSpan={creditColumnCount} className={styles.emptyState}>No personnel found.</td></tr>
            : pagination.items.map(employee => {
                const teaching = employee.emp_type === 'Teaching'
                return <tr
                  key={employee.id}
                  className={styles.clickableRow}
                  onClick={() => setDetailTarget(employee)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setDetailTarget(employee)
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`View leave details for ${personnelFullName(employee)}`}
                >
                  <td className={styles.nameCell}>{personnelFullName(employee)}</td>
                  <td className={styles.subCell}>{employee.item_number || '—'}</td>
                  <td><div>{employee.position || '—'}</div><div className={styles.subCell}>{schoolLabel(personnelSchoolId(employee))}</div></td>
                  <td><span className={`${styles.pill} ${teaching ? styles.pillTeaching : styles.pillNT}`}>{employee.emp_type}</span></td>
                  <td className={styles.subCell}>{formatTin(employeeTin(employee))}</td>
                  {showVl && <td className={styles.creditCell}>{teaching ? '—' : fmt(vlBalance(employee))}</td>}
                  {teachingOnly && <td className={styles.creditCell}>{fmt(vscBalance(employee))}</td>}
                  {/* Teaching has no separate SL pool — leave taken is recorded as
                      Sick Leave but deducted from VSC, so SL mirrors the VSC balance. */}
                  <td className={styles.creditCell}>{teaching ? fmt(vscBalance(employee)) : fmt(slBalance(employee))}</td>
                  {!teachingOnly && showVsc && <td className={styles.creditCell}>{teaching ? fmt(vscBalance(employee)) : '—'}</td>}
                  {nonTeachingOnly && <td className={styles.creditCell}>{fmt(ctoBalance(employee))}</td>}
                </tr>
              })}</tbody>
        </table>
      </div>}
      <Pagination pagination={pagination} loading={loading} />
      {detailTarget && <EmployeeDetailModal employee={detailTarget} onClose={() => setDetailTarget(null)} onSaved={fetch} />}
    </div>
  )
}

export default function LeaveRecordsAdmin() {
  const [tab, setTab] = useState('log')
  const { employees, loading: employeesLoading, error: employeesError, fetch: refetchEmployees } = useEmployees()
  const { requests, loading: requestsLoading, fetchRequests } = useLeaveRequests()
  const records = useMonthlyLeaveRecords(employees, requests)
  const loading = employeesLoading || requestsLoading
  const [menu, setMenu] = useState(null) // { x, y, entry }
  const [deletingId, setDeletingId] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState('')

  function openMenu(event, entry) {
    event.preventDefault()
    setMenu({ x: event.clientX, y: event.clientY, entry })
  }

  function closeMenu() { setMenu(null) }

  function requestDelete(entry) {
    closeMenu()
    setDeleteTarget(entry)
  }

  async function deleteRecord() {
    const entry = deleteTarget
    setDeleteTarget(null)
    setDeletingId(entry.id)
    const rawId = entry.id.slice(2)
    const { error } = entry.rejected
      ? await supabase.rpc('lcms_delete_rejected_request', { p_request_id: rawId })
      : await supabase.rpc('lcms_delete_leave_transaction', { p_transaction_id: rawId })
    setDeletingId(null)
    if (error) { setDeleteError(error.message); return }
    await Promise.all([refetchEmployees(), fetchRequests()])
  }

  return (
    <div className={styles.page}>
      <div className={styles.adminTabs} role="tablist" aria-label="Leave Records sections" style={{ padding: 0 }}>
        <button className={tab === 'personnel' ? styles.adminTabActive : styles.adminTab} role="tab" aria-selected={tab === 'personnel'} onClick={() => setTab('personnel')}>Personnel</button>
        <button className={tab === 'log' ? styles.adminTabActive : styles.adminTab} role="tab" aria-selected={tab === 'log'} onClick={() => setTab('log')}>Leave Records Log</button>
      </div>
      {tab === 'personnel' && <LeaveCreditsPersonnelTab employees={employees} loading={employeesLoading} error={employeesError} fetch={refetchEmployees} />}
      {tab === 'log' && <>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>Leave Records — {monthLabel(records.month)}</span>
          <select
            value={records.month}
            onChange={event => records.changeMonth(event.target.value)}
            style={{ height: 32, fontSize: 12, padding: '0 8px', width: 'auto', flex: '0 0 auto' }}
          >
            {recentMonths(records.month).map(month => (
              <option key={month} value={month}>{monthLabel(month)}</option>
            ))}
          </select>
        </div>
        <div className={styles.toolbar}>
          <ClearableSearchInput
            className={styles.searchInput}
            value={records.search}
            onChange={e => records.setSearch(e.target.value)}
            placeholder="Search employee name…"
          />
          <select className={styles.schoolSelect} value={records.schoolFilter} onChange={e => records.setSchoolFilter(e.target.value)}>
            <option value="">All Schools / Offices ({records.monthTotalCount})</option>
            {records.schoolCounts.DEFAULT > 0 && <option value="DEFAULT">SDO / Division Office ({records.schoolCounts.DEFAULT})</option>}
            {records.schoolCounts.UNASSIGNED > 0 && <option value="UNASSIGNED">Unassigned ({records.schoolCounts.UNASSIGNED})</option>}
            <optgroup label="Elementary">
              {ELEMENTARY_SCHOOLS.map(school => <option key={school.id} value={school.id}>{school.name} ({records.schoolCounts[school.id] || 0})</option>)}
            </optgroup>
            <optgroup label="Secondary">
              {SECONDARY_SCHOOLS.map(school => <option key={school.id} value={school.id}>{school.name} ({records.schoolCounts[school.id] || 0})</option>)}
            </optgroup>
          </select>
          <span className={styles.personnelCount} aria-live="polite">({records.totalCount}) record(s)</span>
        </div>
        {loading
          ? <div className={styles.emptyState}>Loading…</div>
          : <div className={styles.tableWrap}>
              <table className={`${styles.table} ${styles.centeredHeaders}`}>
                <thead><tr><th>Date</th><th>Employee</th><th>School</th><th>Action</th><th>Leave Type</th><th>Days</th><th>Note</th><th>By</th></tr></thead>
                <tbody>
                  {records.visibleRecords.length === 0
                    ? <tr><td colSpan={8} className={styles.emptyState}>No recorded actions for {monthLabel(records.month)}.</td></tr>
                    : records.visibleRecords.map(entry => (
                        <tr key={entry.id} onContextMenu={event => openMenu(event, entry)} style={{ opacity: deletingId === entry.id ? 0.5 : 1 }}>
                          <td className={styles.subCell}>{fmtDate(entry.date)}</td>
                          <td className={styles.nameCell}>{entry.employeeName}</td>
                          <td className={styles.subCell}>{schoolLabel(entry.schoolId)}</td>
                          <td><span className={`${styles.pill} ${entry.rejected ? styles.pillReject : styles.pillOk}`}>{entry.action}</span></td>
                          <td className={styles.subCell}>{entry.leaveType || '—'}</td>
                          <td className={styles.creditCell}>{entry.days != null ? `${entry.days > 0 ? '+' : ''}${fmt(entry.days)}` : '—'}</td>
                          <td className={styles.subCell}>{entry.note}</td>
                          <td className={styles.subCell}>{entry.actor}</td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>}
        {records.totalCount > RECORDS_PER_PAGE && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '10px 16px' }}>
            <button data-pagination-action="true" className={styles.btnPrimary} disabled={records.page <= 1} onClick={() => records.setPage(p => p - 1)}>Prev</button>
            <span className={styles.subCell}>Page {records.page} of {records.pageCount} · {records.totalCount} record(s)</span>
            <button data-pagination-action="true" className={styles.btnPrimary} disabled={records.page >= records.pageCount} onClick={() => records.setPage(p => p + 1)}>Next</button>
          </div>
        )}
      </div>
      {menu && (
        <>
          <div onClick={closeMenu} onContextMenu={event => { event.preventDefault(); closeMenu() }} style={{ position: 'fixed', inset: 0, zIndex: 100 }} />
          <div style={{
            position: 'fixed', top: menu.y, left: menu.x, zIndex: 101,
            background: '#fff', border: '1px solid #d5d5d5', borderRadius: 6,
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)', minWidth: 160, overflow: 'hidden'
          }}>
            <button
              onClick={() => requestDelete(menu.entry)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px',
                background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#b3261e'
              }}
            >
              Delete record…
            </button>
          </div>
        </>
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete record?"
          message={deleteTarget.rejected
            ? `Delete this rejected request for ${deleteTarget.employeeName}? This cannot be undone.`
            : `Delete this ${deleteTarget.action} record for ${deleteTarget.employeeName}? The employee's balance will be reversed to what it was before this entry, where that can be done safely. This cannot be undone.`}
          confirmLabel="Delete"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={deleteRecord}
        />
      )}
      {deleteError && <AlertDialog title="Delete failed" message={deleteError} onClose={() => setDeleteError('')} />}
      </>}
    </div>
  )
}
