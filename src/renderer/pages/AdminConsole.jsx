import { lazy, Suspense, useState } from 'react'
import AllowedUsersAdmin from './AllowedUsersAdmin'
import PersonnelAdmin from './PersonnelAdmin'
import LeaveRecordsAdmin from './LeaveRecordsAdmin'
import styles from './Dashboard.module.css'
import AppointmentReadyNotice from '@/components/shared/AppointmentReadyNotice'

const VacantItemsAdmin = lazy(() => import('./VacantItemsAdmin'))
const PsipopAdmin = lazy(() => import('./PsipopAdmin'))
const AppointmentsSection = lazy(() => import('./AppointmentsSection'))

const TABS = [
  { key: 'personnel', label: 'Personnel' },
  { key: 'update-psipop', label: 'Update PSIPOP' },
  { key: 'vacant-items', label: 'Vacant Items' },
  { key: 'appointment', label: 'Appointment' },
  { key: 'leave-records', label: 'Leave Records' },
  { key: 'allowed-users', label: 'Allowed Users' },
]

export default function AdminConsole() {
  const [tab, setTab] = useState('personnel')
  return <div className={styles.adminConsole}>
    <AppointmentReadyNotice onOpen={() => { setTab('appointment'); window.dispatchEvent(new Event('lcms:open-appointment-personnel')) }} />
    <div className={styles.adminTabs} role="tablist" aria-label="Administrator sections">
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
      {tab === 'personnel' && <PersonnelAdmin />}
      {tab === 'update-psipop' && <Suspense fallback={<div>Loading PSIPOP tools…</div>}><PsipopAdmin /></Suspense>}
      {tab === 'vacant-items' && (
        <Suspense fallback={<div className={styles.emptyState}>Loading vacant items…</div>}><VacantItemsAdmin /></Suspense>
      )}
      {tab === 'appointment' && (
        <Suspense fallback={<div className={styles.emptyState}>Loading appointment tools…</div>}><AppointmentsSection canEdit /></Suspense>
      )}
      {tab === 'leave-records' && <LeaveRecordsAdmin />}
      {tab === 'allowed-users' && <AllowedUsersAdmin embedded />}
    </div>
  </div>
}
