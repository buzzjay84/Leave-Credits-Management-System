import { useState, useEffect, createContext, useContext, useRef } from 'react'
import { supabase } from '@/utils/supabase'
import { PRESENCE_CHANNEL } from '@/utils/presence'

// Roles:
//   'hrmo'         → HRMO / administrator — full access (input, edit, delete)
//   'aoii'         → Administrative Officer II / School-based — view, search, print only
//   'appointments' → division-wide personnel reclassification + CS Form 33-B appointment generator

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)      // { id, username, full_name, role, school_id }
  const [loading, setLoading] = useState(false)
  const [showSplash, setShowSplash] = useState(false)
  const [error, setError] = useState(null)
  const [onlineIds, setOnlineIds] = useState(new Set())
  const splashTimer = useRef(null)

  function openAuthenticatedSession(sessionUser) {
    if (splashTimer.current) clearTimeout(splashTimer.current)
    setShowSplash(true)
    setUser(sessionUser)
    splashTimer.current = setTimeout(() => {
      setShowSplash(false)
      splashTimer.current = null
    }, 1800)
  }

  // A fresh renderer always starts signed out; credentials must be confirmed
  // on every application launch or reload.
  useEffect(() => {
    sessionStorage.removeItem('leave_session')
    return () => { if (splashTimer.current) clearTimeout(splashTimer.current) }
  }, [])

  // Announce this session as online for as long as an account is signed in,
  // and track who else is online via the same channel.
  // Supabase's realtime-js client keys channels by topic name and reuses the
  // same underlying channel object for repeat calls with that topic — a
  // second, independent supabase.channel(PRESENCE_CHANNEL) call elsewhere
  // (e.g. a separate read-only hook) would throw synchronously the moment it
  // tried to register a presence callback on an already-subscribed channel.
  // So this is the one and only place that opens this channel; anything else
  // that needs the online set reads it from context instead.
  useEffect(() => {
    if (!user?.id) return
    const channel = supabase.channel(PRESENCE_CHANNEL, { config: { presence: { key: user.id } } })
    channel.on('presence', { event: 'sync' }, () => {
      setOnlineIds(new Set(Object.keys(channel.presenceState())))
    })
    channel.subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ username: user.username, full_name: user.full_name, online_at: new Date().toISOString() })
      }
    })
    return () => {
      supabase.removeChannel(channel)
      setOnlineIds(new Set())
    }
  }, [user?.id])

  async function login(username, password, { entrance = 'normal' } = {}) {
    setLoading(true)
    setError(null)
    try {
      const normalizedUsername = username.trim()

      // Resolve only the login email through a restricted RPC. The profiles
      // table itself is never exposed to anonymous users.
      const { data: email, error: emailErr } = await supabase.rpc('lcms_get_login_email', {
        uname: normalizedUsername
      })

      if (emailErr || !email) throw new Error('Username not found or access is not approved.')

      // 2. Authenticate before querying tables restricted to authenticated users.
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email,
        password
      })
      if (authErr) throw new Error('Incorrect password.')

      // Confirm that the signed-in account is still active in the LCMS
      // allowlist, then load its own profile through RLS.
      const { data: allowed, error: allowedErr } = await supabase.rpc('lcms_is_current_user_allowed')

      if (allowedErr || !allowed) {
        await supabase.auth.signOut()
        throw new Error('Access not authorized. Contact the dashboard manager.')
      }

      const { data: profile, error: profileErr } = await supabase
        .from('LCMS-profiles')
        .select('id, username, full_name, role, school_id, school_name')
        .eq('id', authData.user.id)
        .single()

      if (profileErr || !profile) {
        await supabase.auth.signOut()
        throw new Error('LCMS profile is missing or inactive. Contact the dashboard manager.')
      }

      const { data: superadminAccount, error: superadminError } = await supabase.rpc('lcms_is_superadmin')
      if (entrance === 'superadmin' && (superadminError || !superadminAccount)) {
        await supabase.auth.signOut()
        throw new Error(superadminError ? 'Superadmin access is not configured. Apply the account settings migration.' : 'This entrance is for the superadmin only.')
      }
      const { data: adminAccess } = await supabase.rpc('lcms_is_admin')
      if (entrance === 'admin' && !adminAccess) {
        await supabase.auth.signOut()
        throw new Error('This entrance is for administrator accounts only.')
      }

      // Being the superadmin account only grants superadmin *mode* when signed
      // in through the dedicated superadmin entrance — otherwise the same
      // account behaves as a plain admin/HRMO login, matching whichever
      // entrance was actually used.
      const grantSuperadminMode = entrance === 'superadmin' && superadminAccount === true

      const sessionUser = {
        id: authData.user.id,
        username: profile.username,
        full_name: profile.full_name,
        role: profile.role,          // 'hrmo' | 'aoii' | 'appointments'
        school_id: profile.school_id,
        school_name: profile.school_name,
        is_superadmin: grantSuperadminMode,
        is_admin: adminAccess === true,
        dashboard: grantSuperadminMode ? null : entrance === 'admin' ? 'admin' : profile.role
      }

      openAuthenticatedSession(sessionUser)
      return { success: true, role: sessionUser.role }
    } catch (err) {
      setError(err.message)
      return { success: false, error: err.message }
    } finally {
      setLoading(false)
    }
  }

  // Eligibility is matched on email + name (not username — nobody pre-assigns
  // that anymore, the registrant picks their own). Returns which part failed
  // so the caller can show a specific reason instead of a generic rejection.
  async function checkRegistration({ email, lastName, firstName, middleName }) {
    const normalizedEmail = (email || '').trim().toLowerCase()
    if (!normalizedEmail || !lastName?.trim() || !firstName?.trim()) return null
    const { data, error: checkErr } = await supabase.rpc('lcms_check_registration', {
      user_email: normalizedEmail,
      family_name: lastName.trim(),
      given_name: firstName.trim(),
      middle_name: middleName?.trim() || null
    })
    if (checkErr || !data || data.length === 0) return null
    return data[0] // { email_matched, name_matched, already_registered, role, school_name }
  }

  async function register({ username, email, password, lastName, firstName, middleName }) {
    setLoading(true)
    setError(null)
    try {
      const normalizedUsername = username.trim()
      const normalizedEmail = email.trim().toLowerCase()

      const check = await checkRegistration({ email: normalizedEmail, lastName, firstName, middleName })
      if (!check || !check.email_matched) {
        throw new Error('This email is not on the approved list. Contact the dashboard manager.')
      }
      if (check.already_registered) {
        throw new Error('This email has already been registered. Please sign in instead.')
      }
      if (!check.name_matched) {
        throw new Error('Your name does not match our records for this email. Check the spelling of your family, first, and middle name, or contact the dashboard manager to correct it.')
      }

      const { data, error: signUpErr } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            app_id: 'LCMS',
            username: normalizedUsername,
            last_name: lastName.trim(),
            first_name: firstName.trim(),
            middle_name: middleName?.trim() || ''
          }
        }
      })

      if (signUpErr) throw signUpErr
      if (data.session) await supabase.auth.signOut()

      return {
        success: true,
        requiresEmailConfirmation: !data.session
      }
    } catch (err) {
      const message = err.message || 'Registration failed.'
      setError(message)
      return { success: false, error: message }
    } finally {
      setLoading(false)
    }
  }

  // Desktop app, no web page to land a reset link on — so this sends a
  // 6-digit code by email instead of a link, and the whole reset happens
  // inside the login screen. Accepts a username (resolved to its email via
  // the same lookup login uses) or an email address directly.
  async function requestPasswordReset(usernameOrEmail) {
    setLoading(true)
    setError(null)
    try {
      const raw = usernameOrEmail.trim()
      let targetEmail = raw
      if (!raw.includes('@')) {
        const { data: resolvedEmail, error: resolveErr } = await supabase.rpc('lcms_get_login_email', { uname: raw })
        if (resolveErr || !resolvedEmail) throw new Error('Username not found or access is not approved.')
        targetEmail = resolvedEmail
      }
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(targetEmail.trim().toLowerCase())
      if (resetErr) throw resetErr
      return { success: true, email: targetEmail }
    } catch (err) {
      const message = err.message || 'Unable to send a reset code.'
      setError(message)
      return { success: false, error: message }
    } finally {
      setLoading(false)
    }
  }

  async function confirmPasswordReset({ email, code, newPassword }) {
    setLoading(true)
    setError(null)
    try {
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.trim(),
        type: 'recovery'
      })
      if (verifyErr) throw new Error('That code is invalid or has expired. Request a new one.')

      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword })
      if (updateErr) throw updateErr

      await supabase.auth.signOut()
      return { success: true }
    } catch (err) {
      const message = err.message || 'Unable to reset the password.'
      setError(message)
      return { success: false, error: message }
    } finally {
      setLoading(false)
    }
  }

  function logout() {
    supabase.auth.signOut()
    if (splashTimer.current) clearTimeout(splashTimer.current)
    splashTimer.current = null
    setShowSplash(false)
    setUser(null)
    sessionStorage.removeItem('leave_session')
  }

  function clearError() {
    setError(null)
  }

  async function switchSuperadminRole(dashboard, schoolId) {
    if (!user?.is_superadmin) return { success: false, error: 'Superadmin access required.' }
    setLoading(true)
    try {
      const { data, error: switchError } = await supabase.rpc('lcms_switch_superadmin_role', {
        target_dashboard: dashboard, target_school_id: schoolId || null
      })
      if (switchError) throw switchError
      setUser(previous => ({ ...previous, role: data.role, school_id: data.school_id, school_name: data.school_name, dashboard }))
      return { success: true }
    } catch (err) { return { success: false, error: err.message } }
    finally { setLoading(false) }
  }

  function updateSessionUsername(username) {
    setUser(previous => previous ? { ...previous, username } : previous)
  }

  const isHRMO = user?.role === 'hrmo'
  const isAOII = user?.role === 'aoii'
  const isAppointments = user?.role === 'appointments'
  const canEdit = isHRMO

  return (
    <AuthContext.Provider value={{ user, loading, showSplash, error, onlineIds, login, register, checkRegistration, requestPasswordReset, confirmPasswordReset, logout, clearError, switchSuperadminRole, updateSessionUsername, isHRMO, isAOII, isAppointments, canEdit }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
