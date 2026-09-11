import AppointmentsSection from './AppointmentsSection'
import styles from './Dashboard.module.css'
import AppointmentReadyNotice from '@/components/shared/AppointmentReadyNotice'

// Dashboard for the 'appointments' role — editable personnel plus the CS
// Form 33-B appointment generator, nothing else.
export default function AppointmentsDashboard() {
  return (
    <div className={styles.adminConsole}>
      <AppointmentReadyNotice onOpen={() => window.dispatchEvent(new Event('lcms:open-appointment-personnel'))} />
      <div className={styles.adminTabPanel}>
        <AppointmentsSection canEdit />
      </div>
    </div>
  )
}
