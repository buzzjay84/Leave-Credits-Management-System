import { lazy, Suspense, useState, useEffect } from 'react'
import AppointmentsPersonnelView from './AppointmentsPersonnelView'
import styles from './Dashboard.module.css'

const AppointmentAdmin = lazy(() => import('./AppointmentAdmin'))

const TABS = [
  { key: 'personnel', label: 'Personnel' },
  { key: 'vacant', label: 'Vacant Positions' },
]

// Shared Personnel / Vacant Positions tab pair for Appointments, used both
// by the standalone 'appointments' role dashboard and by the
// Admin Console's Appointment tab (canEdit — reclassifications save to the roster).
export default function AppointmentsSection({ canEdit = false }) {
  const [tab, setTab] = useState('personnel')
  useEffect(() => {
    const open = () => setTab('personnel')
    window.addEventListener('lcms:open-appointment-personnel', open)
    return () => window.removeEventListener('lcms:open-appointment-personnel', open)
  }, [])
  return (
    <div className={styles.adminConsole}>
      <div className={styles.adminTabs} role="tablist" aria-label="Appointments sections">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            className={tab === key ? styles.adminTabActive : styles.adminTab}
            onClick={() => setTab(key)}
            role="tab"
            aria-selected={tab === key}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={styles.adminTabPanel} role="tabpanel">
        {tab === 'personnel' && <AppointmentsPersonnelView canEdit={canEdit} />}
        {tab === 'vacant' && (
          <Suspense fallback={<div className={styles.emptyState}>Loading appointment tools…</div>}><AppointmentAdmin /></Suspense>
        )}
      </div>
    </div>
  )
}
