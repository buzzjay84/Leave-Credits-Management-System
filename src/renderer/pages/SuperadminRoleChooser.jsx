import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/utils/supabase'
import { SCHOOLS } from '@/utils/schools'
import styles from './DiagnosticRoleChooser.module.css'
import buzzjayLogo from '../../image/buzzzjay.png'

export default function SuperadminRoleChooser() {
  const { user, switchSuperadminRole, logout, loading } = useAuth()
  const [schoolId, setSchoolId] = useState('')
  const [switchError, setSwitchError] = useState('')
  const [adminEmails, setAdminEmails] = useState([])
  const [emailsLoading, setEmailsLoading] = useState(true)
  const [emailInput, setEmailInput] = useState('')
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [emailMessage, setEmailMessage] = useState('')

  async function fetchAdminEmails() {
    setEmailsLoading(true)
    const { data, error } = await supabase.from('lcms_admin_emails').select('email, created_at').order('created_at', { ascending: false })
    if (!error) setAdminEmails(data || [])
    setEmailsLoading(false)
  }

  useEffect(() => { fetchAdminEmails() }, [])

  async function choose(dashboard) {
    setSwitchError('')
    if (dashboard === 'aoii' && !schoolId) { setSwitchError('Select a school first.'); return }
    const result = await switchSuperadminRole(dashboard, dashboard === 'aoii' ? schoolId : null)
    if (!result.success) setSwitchError(result.error)
  }

  async function grantAccess(event) {
    event.preventDefault()
    setEmailError(''); setEmailMessage('')
    const email = emailInput.trim().toLowerCase()
    if (!email) return
    setEmailBusy(true)
    const { error } = await supabase.rpc('lcms_set_admin_email', { target_email: email, allow_access: true })
    if (error) { setEmailBusy(false); setEmailError(error.message); return }

    // Grant is now recorded — if this email has never signed in before, also
    // provision the shared admin/admin bootstrap login for their first visit.
    const { data: bootstrap, error: bootstrapError } = await supabase.functions.invoke('provision-admin-bootstrap', { body: { email } })
    setEmailBusy(false)
    setEmailInput('')
    if (bootstrapError) {
      setEmailMessage(`${email} was granted access, but the bootstrap login could not be created: ${bootstrapError.message}`)
    } else {
      setEmailMessage(bootstrap?.message || `${email} can now access the Admin console.`)
    }
    await fetchAdminEmails()
  }

  async function revokeAccess(email) {
    setEmailError(''); setEmailMessage('')
    setEmailBusy(true)
    const { error } = await supabase.rpc('lcms_set_admin_email', { target_email: email, allow_access: false })
    setEmailBusy(false)
    if (error) { setEmailError(error.message); return }
    setEmailMessage(`${email} no longer has Admin console access.`)
    await fetchAdminEmails()
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <img className={styles.mark} src={buzzjayLogo} alt="BuzzJay" />
        <h1>Superadmin</h1>
        <p>Signed in as {user?.username}. Choose which dashboard to open — your identity stays the same, and the switch is logged.</p>
        <div className={styles.choices}>
          <button onClick={() => choose('admin')} disabled={loading}>
            <strong>Admin Console</strong>
            <span>Manage personnel, vacant items, leave records, and allowed users.</span>
          </button>
          <button onClick={() => choose('hrmo')} disabled={loading}>
            <strong>HRMO Dashboard</strong>
            <span>Review and approve leave requests division-wide.</span>
          </button>
          <button onClick={() => choose('appointments')} disabled={loading}>
            <strong>Appointments Dashboard</strong>
            <span>Manage personnel reclassifications and generate CS Form 33-B appointments.</span>
          </button>
        </div>
        <div className={styles.field} style={{ marginTop: 14, textAlign: 'left' }}>
          <label htmlFor="superadmin-school" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>AOII Dashboard — choose a school</label>
          <div className={styles.actionRow}>
            <select id="superadmin-school" value={schoolId} onChange={e => setSchoolId(e.target.value)}>
              <option value="">Select a school</option>
              {SCHOOLS.map(school => <option key={school.id} value={school.id}>{school.name} ({school.id})</option>)}
            </select>
            <button onClick={() => choose('aoii')} disabled={loading || !schoolId}>Open</button>
          </div>
        </div>
        {switchError && <p style={{ color: 'var(--sdo-red-dark)', fontSize: 12, marginTop: 8 }} role="alert">{switchError}</p>}

        <hr style={{ margin: '20px 0', border: 0, borderTop: '1px solid var(--border)' }} />

        <div style={{ textAlign: 'left' }}>
          <h2 style={{ fontSize: 15, marginBottom: 6 }}>Admin Console Access</h2>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
            Grant or revoke Admin console access by email. The email must already be in Allowed Users — becoming an HRMO account alone does not grant this.
          </p>
          <form onSubmit={grantAccess} className={styles.actionRow} style={{ marginBottom: 10 }}>
            <input
              type="email"
              aria-label="Email to grant Admin console access"
              value={emailInput}
              onChange={e => setEmailInput(e.target.value)}
              placeholder="name@example.com"
              required
            />
            <button type="submit" disabled={emailBusy}>{emailBusy ? 'Working…' : 'Grant Access'}</button>
          </form>
          {emailError && <p style={{ color: 'var(--sdo-red-dark)', fontSize: 12, marginBottom: 8 }} role="alert">{emailError}</p>}
          {emailMessage && <p style={{ color: 'var(--success)', fontSize: 12, marginBottom: 8 }} role="status">{emailMessage}</p>}
          {emailsLoading ? <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</p> : (
            adminEmails.length === 0
              ? <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No emails have been granted Admin console access yet.</p>
              : <ul style={{ listStyle: 'none', padding: 0, fontSize: 13 }}>
                  {adminEmails.map(row => (
                    <li key={row.email} className={styles.emailRow}>
                      <span>{row.email}</span>
                      <button disabled={emailBusy} onClick={() => revokeAccess(row.email)} style={{ fontSize: 12, color: 'var(--sdo-red-dark)', background: 'none', border: 0, cursor: 'pointer' }}>Revoke</button>
                    </li>
                  ))}
                </ul>
          )}
        </div>

        <button className={styles.signOut} onClick={logout} style={{ marginTop: 16 }}>Sign Out</button>
      </div>
    </div>
  )
}
