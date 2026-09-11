import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { SCHOOLS } from '@/utils/schools'
import styles from './Topbar.module.css'
import ThemeSelector from './ThemeSelector'
import ConfirmDialog from './ConfirmDialog'
import AlertDialog from './AlertDialog'
import AccountSettings from './AccountSettings'
import lcmsLogo from '../../../image/LCMS.png'

export default function Topbar({ roleOverride, updater } = {}) {
  const { user, logout, isHRMO, isAppointments, switchSuperadminRole } = useAuth()
  const [databaseBusy, setDatabaseBusy] = useState(false)
  const [switchBusy, setSwitchBusy] = useState(false)
  const [salaryGuidanceStatus, setSalaryGuidanceStatus] = useState({ state: 'idle', message: 'Check official DBM releases' })
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)
  const [alert, setAlert] = useState(null) // { title, message }
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return
    api.getDbmSalaryGuidanceStatus?.().then(status => status && setSalaryGuidanceStatus(status))
    api.onDbmSalaryGuidanceStatus?.(setSalaryGuidanceStatus)
    api.getAppVersion?.().then(version => version && setAppVersion(version))
    return () => api.removeDbmSalaryGuidanceListeners?.()
  }, [])

  const updateStatus = updater?.status || { state: 'idle', message: 'Check for updates' }
  const updateBusy = ['checking', 'downloading'].includes(updateStatus.state)
  const updateLabel = updateStatus.state === 'downloaded'
    ? 'Update Ready'
    : updateStatus.state === 'available'
      ? 'Update Available'
    : updateStatus.state === 'downloading'
      ? `Updating ${updateStatus.percent || 0}%`
      : updateStatus.state === 'checking'
        ? 'Checking…'
        : 'Check Updates'

  async function handleBackup() {
    setDatabaseBusy(true)
    try {
      const result = await window.electronAPI?.backupDatabase()
      if (result?.success) setAlert({ title: 'Backup complete', message: `Backup created successfully:\n${result.filePath}` })
    } catch (error) {
      setAlert({ title: 'Backup failed', message: error.message })
    } finally {
      setDatabaseBusy(false)
    }
  }

  async function handleSuperadminSwitch(value) {
    if (!value || switchBusy) return
    setSwitchBusy(true)
    const [dashboard, schoolId] = value.startsWith('aoii:') ? ['aoii', value.slice(5)] : [value, null]
    const result = await switchSuperadminRole(dashboard, schoolId)
    setSwitchBusy(false)
    if (!result.success) setAlert({ title: 'Switch failed', message: result.error })
  }

  async function confirmRestore() {
    setShowRestoreConfirm(false)
    setDatabaseBusy(true)
    try {
      const result = await window.electronAPI?.restoreDatabase()
      if (result?.success) setAlert({ title: 'Restore complete', message: 'Database restored successfully. The application will now restart.' })
    } catch (error) {
      setAlert({ title: 'Restore failed', message: error.message })
      setDatabaseBusy(false)
    }
  }

  return (
    <div className={styles.bar}>
      <div className={styles.brand}>
        <img
          className={styles.logo}
          src={lcmsLogo}
          alt="LCMS — Leave Credits Management System"
        />
        {appVersion && <span className={styles.version}>v{appVersion}</span>}
      </div>

      <div className={styles.right}>
        <ThemeSelector compact />
        {window.electronAPI?.checkForUpdates && (
          <button
            className={updateStatus.state === 'downloaded' || updateStatus.state === 'available' ? styles.updateReadyBtn : styles.dataBtn}
            onClick={() => updater?.setShowModal(true)}
            disabled={updateBusy}
            title={updateStatus.message}
          >
            {updateLabel}
          </button>
        )}
        {salaryGuidanceStatus.state === 'review' && (
          <button
            className={styles.salaryAlertBtn}
            onClick={() => window.electronAPI?.openDbmSalaryGuidance?.()}
            title={salaryGuidanceStatus.message}
          >
            DBM Salary Update
          </button>
        )}
        {user?.is_superadmin && (
          <select
            className={styles.dataBtn}
            style={{ width: 'auto', flexShrink: 0, maxWidth: 160 }}
            value={user.dashboard === 'aoii' ? `aoii:${user.school_id}` : (user.dashboard || '')}
            disabled={switchBusy}
            onChange={e => handleSuperadminSwitch(e.target.value)}
            title="Switch dashboard — your identity stays the same, and the switch is logged."
          >
            <option value="admin">Admin Console</option>
            <option value="hrmo">HRMO Dashboard</option>
            <option value="appointments">Appointments Dashboard</option>
            <optgroup label="AOII Dashboard">
              {SCHOOLS.map(school => <option key={school.id} value={`aoii:${school.id}`}>{school.name}</option>)}
            </optgroup>
          </select>
        )}
        {isHRMO && window.electronAPI?.backupDatabase && (
          <div className={styles.databaseActions}>
            <button className={styles.dataBtn} onClick={handleBackup} disabled={databaseBusy}>Backup</button>
            <button className={styles.dataBtn} onClick={() => setShowRestoreConfirm(true)} disabled={databaseBusy}>Restore</button>
          </div>
        )}
        <div className={styles.userInfo}>
          <span
            className={styles.roleBadge}
            style={roleOverride || isHRMO || isAppointments
              ? { background: 'var(--sdo-blue)', color: '#fff' }
              : { background: '#EBF3FC', color: '#0c447c' }}
          >
            {roleOverride || (isHRMO ? 'HRMO' : isAppointments ? 'Appointments' : 'AOII')}
          </span>
          <span className={styles.username}>{user?.full_name || user?.username}</span>
        </div>
        <button className={styles.logoutBtn} onClick={() => setShowLogoutConfirm(true)}>
          Sign Out
        </button>
        {(user?.role === 'aoii' || user?.role === 'appointments' || user?.is_admin) && <button className={styles.logoutBtn} onClick={() => setShowSettings(true)}>Settings</button>}
      </div>
      {showSettings && <AccountSettings user={user} onClose={() => setShowSettings(false)} />}

      {showLogoutConfirm && (
        <ConfirmDialog
          title="Sign out?"
          message="Are you sure you want to sign out?"
          confirmLabel="Sign Out"
          onCancel={() => setShowLogoutConfirm(false)}
          onConfirm={() => {
            setShowLogoutConfirm(false)
            requestAnimationFrame(() => logout())
          }}
        />
      )}
      {showRestoreConfirm && (
        <ConfirmDialog
          title="Restore backup?"
          message="Restore a database backup? The current local database will be saved automatically, then the app will restart."
          confirmLabel="Restore"
          onCancel={() => setShowRestoreConfirm(false)}
          onConfirm={confirmRestore}
        />
      )}
      {alert && <AlertDialog title={alert.title} message={alert.message} onClose={() => setAlert(null)} />}
    </div>
  )
}
