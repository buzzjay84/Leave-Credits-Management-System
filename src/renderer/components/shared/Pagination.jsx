import styles from '@/pages/Dashboard.module.css'

export default function Pagination({ pagination, loading }) {
  const { page, pageCount, total, setPage } = pagination
  return <nav className={styles.pagination} aria-label="Personnel pages">
    <span aria-live="polite">{total ? `${(page - 1) * 15 + 1}–${Math.min(page * 15, total)} of ${total} personnel` : '0 personnel'}</span>
    <div className={styles.headerActions}>
      <button data-pagination-action="true" className={styles.btnPrimary} disabled={loading || page === 1} onClick={() => setPage(page - 1)}>Previous</button>
      <label>Page <select aria-label="Personnel page" value={page} disabled={loading || pageCount === 1} onChange={event => setPage(Number(event.target.value))}>
        {Array.from({ length: pageCount }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
      </select> of {pageCount}</label>
      <button data-pagination-action="true" className={styles.btnPrimary} disabled={loading || page === pageCount} onClick={() => setPage(page + 1)}>Next</button>
    </div>
  </nav>
}
