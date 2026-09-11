import { useEffect, useRef, useState } from 'react'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { useAppUpdater } from './hooks/useAppUpdater'
import LoginPage from './pages/LoginPage'
import AdminLoginPage from './pages/AdminLoginPage'
import HRMODashboard from './pages/HRMODashboard'
import SchoolDashboard from './pages/SchoolDashboard'
import AdminConsole from './pages/AdminConsole'
import AppointmentsDashboard from './pages/AppointmentsDashboard'
import SplashScreen from './components/shared/SplashScreen'
import Topbar from './components/shared/Topbar'
import UpdateModal from './components/shared/UpdateModal'
import SuperadminRoleChooser from './pages/SuperadminRoleChooser'

function AppInner() {
  const { user, showSplash } = useAuth()
  // Reached only via 5 clicks on the login logo — not linked from anywhere
  // in the normal UI. Lands directly on the allowed-users admin screen.
  const [secretAccess, setSecretAccess] = useState(false)
  const [superadminAccess, setSuperadminAccess] = useState(false)
  const [showManageUsers, setShowManageUsers] = useState(false)
  const wasSignedIn = useRef(false)
  // Mounted here (not inside Topbar) so update checks — the 5s startup check,
  // periodic background checks, and any silent Windows auto-download — are
  // visible from the moment the app launches, including on the splash/login
  // screens, instead of only appearing once the user signs in and Topbar mounts.
  const updater = useAppUpdater()

  useEffect(() => {
    // Only clear the secret entry when a signed-in session actually ends
    // (logout), not on the initial render where user is still null.
    if (wasSignedIn.current && !user) {
      setSecretAccess(false)
      setSuperadminAccess(false)
      setShowManageUsers(false)
    }
    wasSignedIn.current = Boolean(user)
  }, [user])

  let screen
  if (showSplash) {
    screen = <SplashScreen />
  } else if (!user) {
    screen = superadminAccess
      ? <AdminLoginPage key="superadmin" superadmin onBack={() => setSuperadminAccess(false)} />
      : secretAccess
        ? <AdminLoginPage key="admin" onBack={() => setSecretAccess(false)} onSuperadminAccess={() => setSuperadminAccess(true)} onAdminLoggedIn={() => setShowManageUsers(true)} />
        : <LoginPage onSecretAccess={() => setSecretAccess(true)} />
  } else if (user.is_superadmin && !user.dashboard) {
    screen = <SuperadminRoleChooser />
  } else {
    const adminView = user.is_superadmin ? user.dashboard === 'admin' : user.is_admin && (showManageUsers || user.dashboard === 'admin')
    screen = (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <Topbar roleOverride={adminView ? 'ADMIN' : undefined} updater={updater} />
        <div key={`${user.dashboard}-${user.role}-${user.school_id}`} style={{ flex: 1, overflow: 'hidden' }}>
          {adminView
            ? <AdminConsole />
            : user.role === 'hrmo'
              ? <HRMODashboard />
              : user.role === 'appointments'
                ? <AppointmentsDashboard />
                : <SchoolDashboard />
          }
        </div>
      </div>
    )
  }

  return (
    <>
      {screen}
      {updater.showModal && window.electronAPI?.checkForUpdates && (
        <UpdateModal
          status={updater.status}
          onClose={() => updater.setShowModal(false)}
          onRecheck={updater.recheck}
          onInstall={() => window.electronAPI?.installUpdate()}
          onOpenRelease={() => window.electronAPI?.openUpdateRelease()}
        />
      )}
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
