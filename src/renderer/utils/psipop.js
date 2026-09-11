import { SCHOOLS } from './schools.js'

const norm = value => String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
const tin = value => { const digits = String(value || '').replace(/\D/g, ''); return /^\d{9}(000)?$/.test(digits) ? digits.slice(0, 9) : '' }
const nameOf = e => norm(`${e.last_name}, ${e.first_name} ${e.middle_name || ''}`)
export function sourceDate(value, birth = false) {
  if (!value) return null
  let result = String(value)
  if (/^\d{2}\/\d{2}\/\d{2}$/.test(result)) {
    const [m, d, y] = result.split('/').map(Number)
    const cutoff = new Date().getFullYear() % 100 - (birth ? 16 : 0)
    result = `${(y > cutoff ? 1900 : 2000) + y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result) throw new Error(`Invalid source date: ${value}`)
  return result
}

export function comparePsipop(records, employees, resolutions = {}) {
  const rows = records.map((record, index) => {
    if (record.vacant === true || record.vacant === 'true') return { record, status: 'Vacant', reason: 'No personnel update.' }
    if (!record.name || !record.item_number || record.unparsed_rest) return { record, status: 'Review', reason: 'Incomplete or unreadable personnel row.' }
    const byTin = tin(record.tin) ? employees.filter(e => tin(e.tin_number) === tin(record.tin)) : []
    const byName = employees.filter(e => nameOf(e) === norm(record.name))
    const resolution = resolutions[index]
    const candidates = resolution?.employeeId ? employees.filter(e => e.id === resolution.employeeId) : byTin.length ? byTin : byName
    const possibleMatches = employees.filter(e => byTin.includes(e) || byName.includes(e) || norm(e.item_number) === norm(record.item_number))
    if (candidates.length !== 1) return { record, possibleMatches, status: 'Review', reason: candidates.length ? 'Multiple personnel matches.' : 'No reliable existing match; reconcile this person or add them in Personnel.' }
    const employee = candidates[0]
    if (!resolution?.employeeId && nameOf(employee) !== norm(record.name)) return { record, possibleMatches, status: 'Review', reason: `Name mismatch. Roster: ${nameOf(employee)}. PSIPOP: ${record.name}. Admin reconciliation required.` }
    if (!resolution?.employeeId && !byTin.length && tin(record.tin) && tin(employee.tin_number) && tin(record.tin) !== tin(employee.tin_number)) return { record, possibleMatches, status: 'Review', reason: 'Name matches but TIN differs.' }
    try {
      const updates = {}
      if (resolution?.adoptName) {
        const [last, rest] = record.name.split(',').map(part => part.trim())
        if (!last || !rest) throw new Error('Name must use LAST NAME, FIRST NAME MIDDLE NAME format.')
        const [first, ...middle] = rest.split(/\s+/)
        updates.last_name = last; updates.first_name = first; updates.middle_name = middle.join(' ')
      }
      if (record.position_raw) updates.position = record.position_raw.trim()
      updates.item_number = record.item_number.trim()
      if (tin(record.tin)) updates.tin_number = tin(record.tin)
      if (record.salary_grade != null && record.salary_grade !== '') {
        const grade = Number(record.salary_grade)
        if (!Number.isInteger(grade) || grade < 1 || grade > 33) throw new Error('Invalid salary grade.')
        updates.salary_grade = String(grade)
      }
      if (record.step != null && record.step !== '') {
        const step = Number(record.step)
        if (!Number.isInteger(step) || step < 1 || step > 8) throw new Error('Invalid salary step.')
        updates.salary_step = step
        updates.salary_step_mode = 'manual'
      }
      if (record.actual_salary != null && record.actual_salary !== '') {
        const annual = Number(String(record.actual_salary).replace(/,/g, ''))
        if (!Number.isFinite(annual) || annual <= 0) throw new Error('Invalid actual annual salary.')
        updates.monthly_salary = Math.round(annual / 12 * 100) / 100
      }
      if (record.status_code) {
        if (!['P', 'T'].includes(record.status_code)) throw new Error(`Verify employment status code ${record.status_code}.`)
        updates.emp_status = record.status_code === 'P' ? 'Permanent' : 'Temporary'
      }
      if (record.appointment_date) updates.hired_date = sourceDate(record.appointment_date)
      if (record.promotion_date) updates.salary_step_basis_date = sourceDate(record.promotion_date)
      if (record.dob) updates.birth_date = sourceDate(record.dob, true)
      const school = SCHOOLS.find(s => norm(s.name) === norm(record.office))
      if (school) { updates.school_id = school.id; updates.assigned_school_id = school.id }
      const changes = Object.entries(updates).filter(([key, value]) => norm(employee[key]) !== norm(value)).map(([field, after]) => ({ field, before: employee[field] ?? null, after }))
      return { record, employee, reconciliation: resolution || null, updates: Object.fromEntries(changes.map(c => [c.field, c.after])), changes, status: changes.length ? 'Changed' : 'Unchanged' }
    } catch (error) { return { record, status: 'Review', reason: error.message } }
  })
  const counts = new Map()
  for (const row of rows) if (row.employee) counts.set(row.employee.id, (counts.get(row.employee.id) || 0) + 1)
  const items = new Map()
  for (const row of rows) if (row.record.item_number) items.set(norm(row.record.item_number), (items.get(norm(row.record.item_number)) || 0) + 1)
  return rows.map(row => row.employee && (counts.get(row.employee.id) > 1 || items.get(norm(row.record.item_number)) > 1)
    ? { ...row, status: 'Review', reason: 'Duplicate person or item in uploaded files.' } : row)
}

export function historyUpdate(row, effectiveDate, actor, batchId) {
  sourceDate(effectiveDate)
  if (!effectiveDate) throw new Error('A PSIPOP as-of date is required.')
  return { ...row.updates, psipop_history: [...(row.employee.psipop_history || []), {
    id: crypto.randomUUID(), batch_id: batchId, recorded_at: new Date().toISOString(),
    effective_date: effectiveDate, recorded_by: actor, source_file: row.record.file,
    changes: row.changes, source: row.record, reconciliation: row.reconciliation,
    baseline: Object.fromEntries(['position', 'item_number', 'emp_status', 'school_id', 'assigned_school_id', 'hired_date', 'salary_grade', 'salary_step', 'monthly_salary', 'salary_step_basis_date'].map(key => [key, row.employee[key] ?? null]))
  }] }
}
