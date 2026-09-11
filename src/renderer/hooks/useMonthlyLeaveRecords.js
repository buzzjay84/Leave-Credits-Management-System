import { useState } from 'react'

export const TXN_ACTION_LABELS = {
  VL_DEBIT: 'VL Used', SL_DEBIT: 'SL Used', VSC_DEBIT: 'VSC Used/Offset', VSC_CREDIT: 'VSC Credited',
  VL_ADJUST: 'VL Adjustment', SL_ADJUST: 'SL Adjustment', MONETIZE: 'Monetization',
  CTO_CREDIT: 'CTO Credited', CTO_DEBIT: 'CTO Used', SPECIAL: 'Special Leave',
}

export const RECORDS_PER_PAGE = 10

// Every credit-affecting action (approvals, monetization, CTO grants/uses)
// already lands in leave_transactions via the approval RPCs. Rejections
// never touch a balance, so they have no transaction row — pull those in
// separately from leave_requests so a rejection still shows up as a
// recorded action, not just a silently vanished request. Nothing is ever
// deleted between months — the month picker only changes which slice of
// this same live data is shown.
export function useMonthlyLeaveRecords(employees, requests) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [page, setPage] = useState(1)
  const [search, setSearchState] = useState('')
  const [schoolFilter, setSchoolFilterState] = useState('')

  const monthRecords = [
    ...employees.flatMap(employee => (employee.leave_transactions || []).map(txn => ({
      id: `t-${txn.id}`,
      date: txn.created_at || txn.date_from,
      employeeName: `${employee.last_name}, ${employee.first_name}`,
      schoolId: txn.school_id || employee.assigned_school_id || employee.school_id,
      action: TXN_ACTION_LABELS[txn.txn_type] || txn.txn_type,
      leaveType: txn.leave_type,
      days: txn.days,
      note: txn.remarks || txn.reason || '—',
      actor: txn.approved_by || txn.recorded_by || '—',
      rejected: false,
    }))),
    ...requests.filter(request => request.status === 'rejected').map(request => ({
      id: `r-${request.id}`,
      date: request.reviewed_at || request.updated_at,
      employeeName: request.employee ? `${request.employee.last_name}, ${request.employee.first_name}` : '—',
      schoolId: request.school_id || request.employee?.school_id,
      action: 'Rejected',
      leaveType: request.leave_type,
      days: request.days,
      note: request.rejection_reason || '—',
      actor: request.reviewed_by || '—',
      rejected: true,
    })),
  ]
    .filter(entry => String(entry.date || '').slice(0, 7) === month)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))

  const schoolCounts = monthRecords.reduce((counts, entry) => {
    const key = entry.schoolId || 'UNASSIGNED'
    counts[key] = (counts[key] || 0) + 1
    return counts
  }, {})

  const query = search.trim().toLowerCase()
  const records = monthRecords.filter(entry =>
    (!query || entry.employeeName.toLowerCase().includes(query))
    && (!schoolFilter || (entry.schoolId || 'UNASSIGNED') === schoolFilter)
  )

  const pageCount = Math.max(1, Math.ceil(records.length / RECORDS_PER_PAGE))
  const clampedPage = Math.min(page, pageCount)
  const visibleRecords = records.slice((clampedPage - 1) * RECORDS_PER_PAGE, clampedPage * RECORDS_PER_PAGE)

  function changeMonth(nextMonth) {
    setMonth(nextMonth)
    setPage(1)
  }

  function setSearch(value) {
    setSearchState(value)
    setPage(1)
  }

  function setSchoolFilter(value) {
    setSchoolFilterState(value)
    setPage(1)
  }

  return {
    month, changeMonth,
    search, setSearch,
    schoolFilter, setSchoolFilter, schoolCounts,
    page: clampedPage, setPage, pageCount,
    totalCount: records.length,
    monthTotalCount: monthRecords.length,
    visibleRecords,
  }
}
