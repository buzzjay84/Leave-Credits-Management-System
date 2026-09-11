import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/utils/supabase'
import styles from './AccountSettings.module.css'

export default function AccountSettings({ user, onClose }) {
  const { updateSessionUsername } = useAuth()
  const [username, setUsername] = useState(user?.username || '')
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const dialog = useRef(null)
  const saving = useRef(false)
  const canChangeUsername = Boolean(user?.is_admin)

  useEffect(() => {
    const previous = document.activeElement
    dialog.current?.querySelector('input, button')?.focus()
    return () => previous?.focus?.({ preventScroll: true })
  }, [success])

  function keyboard(event) {
    if (event.key === 'Escape' && !saving.current) onClose()
    if (event.key !== 'Tab') return
    const controls = [...dialog.current.querySelectorAll('input:not(:disabled), button:not(:disabled)')]
    if (!controls.length) { event.preventDefault(); return }
    const first = controls[0], last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  async function save(event) {
    event.preventDefault()
    if (saving.current) return
    setError('')
    const trimmedUsername = username.trim()
    const wantsUsernameChange = canChangeUsername && trimmedUsername && trimmedUsername !== user.username
    const wantsPasswordChange = Boolean(current || password || confirm)
    if (!wantsUsernameChange && !wantsPasswordChange) return setError('Nothing to save.')
    if (wantsPasswordChange) {
      if (!current) return setError('Enter your current password.')
      if (password !== confirm) return setError('New passwords do not match.')
      if (password === current) return setError('Choose a password different from your current password.')
    }
    saving.current = true; setBusy(true)
    try {
      if (wantsUsernameChange) {
        const { data: newUsername, error: usernameError } = await supabase.rpc('lcms_update_own_username', { new_username: trimmedUsername })
        if (usernameError) throw usernameError
        updateSessionUsername(newUsername)
      }
      if (wantsPasswordChange) {
        const { data, error: accountError } = await supabase.auth.getUser()
        if (accountError || !data.user?.email || data.user.id !== user.id) throw new Error('Your session has expired. Sign in again.')
        const { data: verified, error: verifyError } = await supabase.auth.signInWithPassword({ email: data.user.email, password: current })
        if (verifyError) throw new Error(verifyError.code === 'invalid_credentials' ? 'Your current password is incorrect.' : verifyError.message)
        if (verified.user?.id !== user.id) throw new Error('Account verification failed. Sign in again.')
        const { error: updateError } = await supabase.auth.updateUser({ password, current_password: current })
        if (updateError) throw updateError
        // Best-effort: clears the "using default password" hint an admin
        // sees in Allowed Users once this account sets its own password.
        supabase.rpc('lcms_clear_password_reset_flag').catch(() => {})
      }
      setCurrent(''); setPassword(''); setConfirm(''); setSuccess(true)
    } catch (err) { setError(err.message || 'Could not save your changes. Please try again.') }
    finally { saving.current = false; setBusy(false) }
  }

  return createPortal(<div className={styles.overlay} onKeyDown={keyboard}>
    <div ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="account-settings-title" aria-busy={busy}>
      {success ? <>
        <div className={styles.successIcon} aria-hidden="true">✓</div>
        <h2 id="account-settings-title">Saved successfully</h2>
        <p>Your account settings have been updated.</p>
        <div className={styles.actions}><button className={styles.save} onClick={onClose}>Done</button></div>
      </> : <form onSubmit={save}>
        <h2 id="account-settings-title">Account settings</h2>
        {canChangeUsername && <>
          <p>Username</p>
          <label>Username<input type="text" autoComplete="username" disabled={busy} value={username} onChange={event => setUsername(event.target.value)} /></label>
          <p className={styles.hint}>3–50 letters, numbers, dots, underscores or hyphens. Changing this replaces any shared bootstrap login for this account.</p>
        </>}
        <p>Change your password</p>
        <label>Current password<input type="password" autoComplete="current-password" disabled={busy} value={current} onChange={event => setCurrent(event.target.value)} /></label>
        <label>New password<input type="password" autoComplete="new-password" minLength={8} disabled={busy} value={password} onChange={event => setPassword(event.target.value)} aria-describedby="password-guidance" /></label>
        <p id="password-guidance" className={styles.hint}>Use at least 8 characters. Leave password fields blank to change only your username.</p>
        <label>Confirm new password<input type="password" autoComplete="new-password" minLength={8} disabled={busy} value={confirm} onChange={event => setConfirm(event.target.value)} /></label>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button className={styles.save} type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
      </form>}
    </div>
  </div>, document.body)
}
