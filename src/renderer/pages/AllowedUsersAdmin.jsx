import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useOnlineUsers } from '@/hooks/useOnlineUsers'
import { fmtDate } from '@/utils/leaveCalc'
import { supabase } from '@/utils/supabase'
import { SCHOOLS } from '@/utils/schools'
import { titleCase } from '@/utils/personnel'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import styles from './Dashboard.module.css'

const BLANK_FORM = { email: '', last_name: '', first_name: '', middle_name: '', role: 'aoii', school_id: '' }
const SDO_SCHOOL_ID = 'DEFAULT'
const SDO_SCHOOL_NAME = 'Default Organization'
const DIVISION_OFFICE_ID = 'SDO-ISABELA'
const DIVISION_OFFICE_NAME = 'Isabela City SDO'
const SCHOOL_OR_DIVISION_OPTIONS = [...SCHOOLS, { id: DIVISION_OFFICE_ID, name: DIVISION_OFFICE_NAME }]

export default function AllowedUsersAdmin({ embedded = false }) {
  const { user } = useAuth()
  const onlineIds = useOnlineUsers()
  const [rows, setRows] = useState([])
  const [superadminIds, setSuperadminIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(BLANK_FORM)
  const [saving, setSaving] = useState(false)
  const [resettingId, setResettingId] = useState(null)
  const [resetMessage, setResetMessage] = useState('')
  const [resetTarget, setResetTarget] = useState(null)
  const [removeTarget, setRemoveTarget] = useState(null)

  async function load() {
    setLoading(true)
    setError('')
    const [{ data, error: fetchErr }, { data: superadmins }] = await Promise.all([
      supabase.from('LCMS-allowed-users').select('*').order('created_at', { ascending: false }),
      supabase.rpc('lcms_superadmin_user_ids'),
    ])
    if (fetchErr) setError(fetchErr.message)
    else setRows(data || [])
    setSuperadminIds(superadmins || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // The superadmin's own row is only meaningful to the superadmin — a
  // regular admin can neither manage it nor needs to see it here.
  const visibleRows = user?.is_superadmin
    ? rows
    : rows.filter(row => !row.registered_user_id || !superadminIds.includes(row.registered_user_id))

  async function resetPassword() {
    const row = resetTarget
    setResetTarget(null)
    setResettingId(row.id)
    setResetMessage('')
    setError('')
    const { data, error: fnError } = await supabase.functions.invoke('reset-user-password', { body: { allowed_user_id: row.id } })
    setResettingId(null)
    if (fnError || data?.error) { setError(data?.error || fnError.message); return }
    setResetMessage(data.message)
  }

  function set(field, val) {
    setForm(current => ({ ...current, [field]: val }))
  }

  function selectRole(role) {
    setForm(current => ({
      ...current,
      role,
      school_id: role === 'sdo_admin' ? DIVISION_OFFICE_ID : role === 'aoii' ? current.school_id : ''
    }))
  }

  async function handleAdd(e) {
    e.preventDefault()
    setError('')
    if (!form.email.trim() || !form.last_name.trim() || !form.first_name.trim()) {
      setError('DepEd email, family name, and first name are required.')
      return
    }
    if (form.role === 'aoii' && !form.school_id) {
      setError('Select the school for an AOII account.')
      return
    }
    const needsSchoolOrDivision = form.role === 'aoii' || form.role === 'sdo_admin'
    const school = SCHOOL_OR_DIVISION_OPTIONS.find(s => s.id === form.school_id)
    setSaving(true)
    const { error: insertErr } = await supabase.from('LCMS-allowed-users').insert({
      email: form.email.trim().toLowerCase(),
      last_name: form.last_name.trim(),
      first_name: form.first_name.trim(),
      middle_name: form.middle_name.trim() || null,
      role: form.role === 'sdo_admin' ? 'aoii' : form.role,
      school_id: needsSchoolOrDivision ? form.school_id : SDO_SCHOOL_ID,
      school_name: needsSchoolOrDivision ? (school?.name || null) : SDO_SCHOOL_NAME,
      is_active: true,
      added_by: user?.username || null,
    })
    setSaving(false)
    if (insertErr) { setError(insertErr.message); return }
    setForm(BLANK_FORM)
    load()
  }

  async function toggleActive(row) {
    const { error: updateErr } = await supabase
      .from('LCMS-allowed-users')
      .update({ is_active: !row.is_active })
      .eq('id', row.id)
    if (updateErr) { setError(updateErr.message); return }
    load()
  }

  async function removeRow() {
    const row = removeTarget
    setRemoveTarget(null)
    const { error: deleteErr } = await supabase.from('LCMS-allowed-users').delete().eq('id', row.id)
    if (deleteErr) { setError(deleteErr.message); return }
    load()
  }

  function fullName(row) {
    return [row.first_name, row.middle_name, row.last_name].filter(Boolean).map(titleCase).join(' ')
  }

  return (
    <div className={embedded ? styles.embeddedAdminPage : styles.page}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>Allowed Users</span>
          <button className={styles.btnOutline} onClick={load} disabled={loading}>{loading ? 'Refreshing…' : '⟳ Refresh'}</button>
        </div>

        <form onSubmit={handleAdd} className={styles.toolbar} style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>DepEd Email</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="name@deped.gov.ph" style={{ height: 32, fontSize: 12, width: 190 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Family Name</label>
            <input value={form.last_name} onChange={e => set('last_name', titleCase(e.target.value))} placeholder="Dela Cruz" style={{ height: 32, fontSize: 12 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>First Name</label>
            <input value={form.first_name} onChange={e => set('first_name', titleCase(e.target.value))} placeholder="Juan" style={{ height: 32, fontSize: 12 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Middle Name or Initial</label>
            <input value={form.middle_name} onChange={e => set('middle_name', titleCase(e.target.value))} placeholder="Santos or S" style={{ height: 32, fontSize: 12 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Role</label>
            <select value={form.role} onChange={e => selectRole(e.target.value)} style={{ height: 32, fontSize: 12 }}>
              <option value="aoii">School (AOII)</option>
              <option value="sdo_admin">SDO (Admin)</option>
              <option value="hrmo">SDO (HRMO)</option>
              <option value="appointments">Appointments</option>
            </select>
          </div>
          {form.role === 'aoii' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>School/Division Office</label>
              <select className={styles.schoolSelect} value={form.school_id} onChange={e => set('school_id', e.target.value)} style={{ height: 32, fontSize: 12 }}>
                <option value="">Select a school</option>
                {SCHOOLS.map(school => <option key={school.id} value={school.id}>{school.name} ({school.id})</option>)}
              </select>
            </div>
          )}
          {form.role === 'sdo_admin' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)' }}>School/Division Office</label>
              <select className={styles.schoolSelect} value={form.school_id} onChange={e => set('school_id', e.target.value)} style={{ height: 32, fontSize: 12 }}>
                <option value={DIVISION_OFFICE_ID}>{DIVISION_OFFICE_NAME}</option>
              </select>
            </div>
          )}
          <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving ? 'Adding…' : '+ Allow'}</button>
        </form>

        {error && <div className={styles.inlineError}>{error}</div>}
        {resetMessage && <div className={styles.inlineSuccess}>{resetMessage}</div>}

        {loading
          ? <div className={styles.emptyState}>Loading…</div>
          : <div className={styles.tableWrap}>
              <table className={`${styles.table} ${styles.nameFirstColumn}`}>
                <thead>
                  <tr>
                    <th>Full Name</th><th>Email</th><th>Role</th><th>School/Division Office</th>
                    <th>Status</th><th>Online</th><th>Active</th><th>Password</th><th>Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length === 0
                    ? <tr><td colSpan={9} className={styles.emptyState}>No allowed users yet.</td></tr>
                    : visibleRows.map(row => (
                        <tr key={row.id}>
                          <td className={styles.nameCell}>{fullName(row) || '—'}</td>
                          <td className={styles.subCell}>{row.email}</td>
                          <td>
                            <span
                              className={styles.pill}
                              style={row.role === 'hrmo' || row.role === 'appointments'
                                ? { background: 'var(--sdo-blue)', color: '#fff' }
                                : { background: 'var(--info-bg)', color: 'var(--info-text)' }}
                            >
                              {row.role === 'hrmo' ? 'SDO (HRMO)' : row.role === 'appointments' ? 'Appointments' : row.school_id === DIVISION_OFFICE_ID ? 'SDO (Admin)' : 'School (AOII)'}
                            </span>
                          </td>
                          <td className={styles.subCell}>{row.school_name || '—'}</td>
                          <td>
                            <span className={`${styles.pill} ${row.registered_user_id ? styles.pillOk : styles.pillWarn}`}>
                              {row.registered_user_id ? 'Registered' : 'Pending'}
                            </span>
                          </td>
                          <td>
                            {row.registered_user_id
                              ? <span className={`${styles.pill} ${onlineIds.has(row.registered_user_id) ? styles.pillOk : styles.pillMuted}`}>
                                  {onlineIds.has(row.registered_user_id) ? '● Online' : 'Offline'}
                                </span>
                              : <span className={styles.subCell}>—</span>}
                          </td>
                          <td>
                            <button className={row.is_active ? styles.btnSuccessSm : styles.btnDangerSm} onClick={() => toggleActive(row)}>
                              {row.is_active ? 'Active' : 'Inactive'}
                            </button>
                          </td>
                          <td>
                            {row.registered_user_id && <button className={styles.btnOutline} disabled={resettingId === row.id} onClick={() => setResetTarget(row)}>
                              {resettingId === row.id ? 'Resetting…' : 'Reset Password'}
                            </button>}
                            {row.password_reset_at && (
                              <div
                                className={`${styles.pill} ${styles.pillWarn}`}
                                style={{ marginTop: 4, display: 'inline-block' }}
                                title={`Reset on ${fmtDate(row.password_reset_at)}. This clears automatically once they change their own password in Account Settings.`}
                              >
                                Using default since {fmtDate(row.password_reset_at)}
                              </div>
                            )}
                          </td>
                          <td>
                            <button className={styles.btnDangerSm} onClick={() => setRemoveTarget(row)}>Remove</button>
                          </td>
                        </tr>
                      ))
                  }
                </tbody>
              </table>
            </div>
        }
      </div>
      {resetTarget && (
        <ConfirmDialog
          title="Reset password?"
          message={`Reset ${fullName(resetTarget) || resetTarget.email}'s password to the default ("adminofficerII")? They should sign in and change it right away.`}
          confirmLabel="Reset"
          onCancel={() => setResetTarget(null)}
          onConfirm={resetPassword}
        />
      )}
      {removeTarget && (
        <ConfirmDialog
          title="Remove allowed user?"
          message={removeTarget.registered_user_id
            ? `${fullName(removeTarget) || removeTarget.email} has already registered. Removing this entry only revokes future re-registration — it does NOT delete their account. Continue?`
            : `Remove the pending allowance for ${fullName(removeTarget) || removeTarget.email}?`}
          confirmLabel="Remove"
          onCancel={() => setRemoveTarget(null)}
          onConfirm={removeRow}
        />
      )}
    </div>
  )
}
