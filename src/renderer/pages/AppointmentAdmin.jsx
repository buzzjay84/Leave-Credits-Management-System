import { useEffect, useMemo, useState } from 'react'
import ClearableSearchInput from '@/components/shared/ClearableSearchInput'
import AppointmentBuilder from '@/components/Admin/AppointmentBuilder'
import { useEmployees } from '@/hooks/useEmployees'
import { usePositionTemplates } from '@/hooks/usePositionTemplates'
import vacantItemsData from '@/data/vacantItems.json'
import { listPsipopItems, mergeVacancies } from '@/utils/psipopItems'
import { supabase } from '@/utils/supabase'
import styles from './Dashboard.module.css'

export default function AppointmentAdmin() {
  const { employees } = useEmployees()
  const { loading: templatesLoading, templateFor, saveTemplate } = usePositionTemplates()
  const [search, setSearch] = useState('')
  const [officeFilter, setOfficeFilter] = useState('')
  const [selectedItem, setSelectedItem] = useState(null)
  const [latestItems, setLatestItems] = useState([])
  const [ctiItemNumbers, setCtiItemNumbers] = useState(new Set())
  const [psipopError, setPsipopError] = useState('')

  useEffect(() => {
    let active = true
    listPsipopItems().then(data => { if (active) setLatestItems(data) }).catch(error => { if (active) setPsipopError(`Latest PSIPOP items could not be loaded: ${error.message}`) })
    supabase.from('leave_cti_items').select('item_number').then(({ data }) => { if (active && data) setCtiItemNumbers(new Set(data.map(row => row.item_number))) })
    return () => { active = false }
  }, [])

  const vacantItems = useMemo(
    () => mergeVacancies(vacantItemsData, latestItems, employees, ctiItemNumbers),
    [employees, latestItems, ctiItemNumbers]
  )
  const offices = useMemo(() => [...new Set(vacantItems.map(item => item.office).filter(Boolean))].sort(), [vacantItems])
  const query = search.trim().toLowerCase()
  const visibleItems = vacantItems.filter(item => {
    const searchable = [item.item_number, item.position, item.office].filter(Boolean).join(' ').toLowerCase()
    return (!query || searchable.includes(query)) && (!officeFilter || item.office === officeFilter)
  })

  if (selectedItem) {
    return (
      <div className={styles.card} style={{ height: '100%' }}>
        <AppointmentBuilder
          item={selectedItem}
          onBack={() => setSelectedItem(null)}
          templatesLoading={templatesLoading}
          templateFor={templateFor}
          saveTemplate={saveTemplate}
        />
      </div>
    )
  }

  return (
    <div className={styles.card}>
      {psipopError && <p role="alert">{psipopError}. Showing bundled vacancies filtered against the roster.</p>}
      <div className={styles.cardHeader}><span className={styles.cardTitle}>Generate Appointment (CS Form 33-B)</span></div>
      <p className={styles.subCell} style={{ padding: '0 16px' }}>
        Pick a vacant OSEC item to auto-fill an appointment paper and position description in the exact CS Form 33-B format. Nothing is saved to the roster from here — this only generates paperwork to print.
      </p>
      <div className={styles.toolbar}>
        <ClearableSearchInput className={styles.searchInput} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search OSEC no., position, or office…" />
        <select className={styles.schoolSelect} value={officeFilter} onChange={e => setOfficeFilter(e.target.value)}>
          <option value="">All Offices / Schools ({vacantItems.length})</option>
          {offices.map(office => <option key={office} value={office}>{office}</option>)}
        </select>
        <span className={styles.personnelCount} aria-live="polite">({visibleItems.length}) vacant</span>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>OSEC No.</th><th>Position</th><th>Salary Grade</th><th>Office / School</th><th></th></tr></thead>
          <tbody>{visibleItems.length === 0
            ? <tr><td colSpan={5} className={styles.emptyState}>No vacant items found.</td></tr>
            : visibleItems.map(item => (
                <tr key={item.item_number} className={styles.clickableRow} onClick={() => setSelectedItem(item)}
                  tabIndex={0} role="button" aria-label={`Generate appointment for ${item.item_number}`}
                  onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedItem(item) } }}>
                  <td className={styles.nameCell}>{item.item_number}</td>
                  <td>{item.position || '—'}</td>
                  <td className={styles.creditCell}>{item.salary_grade ? `SG-${item.salary_grade}` : '—'}</td>
                  <td>{item.office || '—'}</td>
                  <td><button className={styles.btnPrimarySm} onClick={event => { event.stopPropagation(); setSelectedItem(item) }}>Generate</button></td>
                </tr>
              ))}</tbody>
        </table>
      </div>
    </div>
  )
}
