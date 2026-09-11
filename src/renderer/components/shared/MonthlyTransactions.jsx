import { useMemo, useState } from 'react'
import { fmt, fmtDate } from '@/utils/leaveCalc'
import styles from '@/pages/Dashboard.module.css'

const months = Array.from({ length: 12 }, (_, month) =>
  new Date(2026, month, 1).toLocaleString('en', { month: 'long' }))

export default function MonthlyTransactions({ employees, loading }) {
  const today = new Date()
  const [month, setMonth] = useState(today.getMonth())
  const [year, setYear] = useState(today.getFullYear())
  const transactions = useMemo(() => employees.flatMap(employee =>
    (employee.leave_transactions || []).map(transaction => ({ ...transaction, employee }))
  ).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)), [employees])
  const years = [...new Set([today.getFullYear(), year, ...transactions.map(t =>
    new Date(t.created_at).getFullYear()).filter(Number.isFinite)])].sort((a, b) => b - a)
  const visible = transactions.filter(transaction => {
    const date = new Date(transaction.created_at)
    return date.getFullYear() === year && date.getMonth() === month
  })

  return <section className={`${styles.card} ${styles.transactionCard}`} aria-label="Monthly transaction record">
    <div className={styles.cardHeader}>
      <div><h2 className={styles.cardTitle}>Monthly Transaction Record</h2>
        <div className={styles.subCell}>{visible.length} recorded transactions</div></div>
      <div className={styles.monthFilters}>
        <select aria-label="Transaction month" value={month} onChange={event => setMonth(Number(event.target.value))}>
          {months.map((label, index) => <option key={label} value={index}>{label}</option>)}
        </select>
        <select aria-label="Transaction year" value={year} onChange={event => setYear(Number(event.target.value))}>
          {years.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
    </div>
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead><tr><th>Date</th><th className={styles.nameCell}>Employee</th><th>Action</th><th>Leave Type</th><th>Days</th><th>Note</th></tr></thead>
        <tbody>{visible.length ? visible.map(transaction => <tr key={transaction.id}>
          <td>{fmtDate(transaction.created_at)}</td>
          <td className={styles.nameCell}>{transaction.employee.last_name}, {transaction.employee.first_name}</td>
          <td><span className={`${styles.pill} ${styles.pillInfo}`}>{transaction.txn_type?.replaceAll('_', ' ') || '—'}</span></td>
          <td>{transaction.leave_type || '—'}</td>
          <td className={styles.creditCell}>{fmt(Number(transaction.days || 0))}</td>
          <td>{transaction.remarks || transaction.reason || '—'}</td>
        </tr>) : <tr><td colSpan={6} className={styles.emptyState}>{loading ? 'Loading transactions…' : `No recorded transactions for ${months[month]} ${year}.`}</td></tr>}</tbody>
      </table>
    </div>
  </section>
}
