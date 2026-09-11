import { useEmployees } from '@/hooks/useEmployees'
import { appointmentReadyChange } from '@/utils/appointmentReadiness'

export default function AppointmentReadyNotice({ onOpen }) {
  const { employees } = useEmployees()
  const count = employees.filter(appointmentReadyChange).length
  if (!count) return null
  return <div role="status" className="appointment-ready-notice">
    <span><strong>{count} updated appointment{count === 1 ? '' : 's'} ready to prepare and print.</strong>{' '}
      PSIPOP changed an OSEC item or position. Open Personnel and select a green Reclass button to review the updated form.</span>
    <button onClick={onOpen}>View appointments</button>
  </div>
}
