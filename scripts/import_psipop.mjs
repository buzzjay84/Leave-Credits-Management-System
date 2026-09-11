import { createRequire } from 'module'
import { readFileSync } from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, '..')

const { monthlySalaryFor, salaryStepsForGrade } = await import(
  path.join(projectRoot, 'src/renderer/utils/salarySchedule.js').replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1:').replace(/^/, 'file://')
)
const { SCHOOLS } = await import(
  path.join(projectRoot, 'src/renderer/utils/schools.js').replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1:').replace(/^/, 'file://')
)

// Mirrors Electron's own default app.getPath('userData') resolution
// (appData/<package name>) so this works on any machine/account without a
// hardcoded path. Override with LCMS_DB_PATH if the app's local DB lives
// somewhere non-default.
function defaultUserDataDir(appName) {
  const home = os.homedir()
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), appName)
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', appName)
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), appName)
}

const { name: appName } = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'))
const DB_PATH = process.env.LCMS_DB_PATH || path.join(defaultUserDataDir(appName), 'leave-credits.sqlite')
const DRY_RUN = process.argv.includes('--dry-run')

// Office (school) name -> DepEd School ID, for the files with unambiguous
// per-office PSIPOP documents (the 16 named schools + Division Proper units).
const OFFICE_TO_SCHOOL_ID = {
  'BADJAO FLOATING INTEGRATED SCHOOL': '126018',
  'BALUNO NATIONAL HIGH SCHOOL': '314603',
  'BASILAN NATIONAL HIGH SCHOOL': '303894',
  'BASILAN NATIONAL HIGH SCHOOL - NIGHT': '314602',
  'BEGANG NATIONAL HIGH SCHOOL': '303897',
  'CALVARIO PEAK NATIONAL HIGH SCHOOL': '303896',
  'CARO NATIONAL HIGH SCHOOL': '305550',
  'GERAS INTEGRATED SCHOOL': '314604',
  'ISABELA CITY NATIONAL HIGH SCHOOL': '314601',
  'ISMAEL INTEGRATED SCHOOL': '501905',
  'KUMALARANG NATIONAL HIGH SCHOOL': '303899',
  'LAMPINIGAN NATIONAL HIGH SCHOOL': '305549',
  'MALAMAWI NATIONAL HIGH SCHOOL': '303895',
  'MASULA NATIONAL HIGH SCHOOL': null, // no exact schools.js match — see note below
  'PANIGAYAN INTEGRATED SCHOOL': '126025',
  'TANDUNG AHAS NATIONAL HIGH SCHOOL': '303898',
}
// Division-proper (SDO) offices — non-teaching, SDO-based, no school.
const SDO_OFFICES = new Set([
  'DIVISION OF ISABELA CITY',
  'OFFICE OF THE SCHOOLS DIVISION SUPERINTENDENT',
  'CURRICULUM IMPLEMENTATION DIVISION',
  'SCHOOL GOVERNANCE AND OPERATION DIVISION',
])
// Division-wide consolidated files with no per-record school attribution.
const UNASSIGNED_OFFICES = new Set([
  'DIVISION OF ISABELA CITY - SENIOR HIGH SCHOOL',
  'DIVISION OF ISABELA CITY ELEMENTARY EDUCATION',
  'DIVISION OF ISABELA CITY ALTERNATIVE LEARNING SYSTEM',
  'DIVISION OF ISABELA CITY KINDERGARTEN EDUCATION',
])

function titleCase(raw) {
  return raw
    .split(' ')
    .map(word => {
      if (/^[IVXLCDM]+$/.test(word)) return word // Roman numerals stay upper
      if (/^\(.*\)$/.test(word)) return '(' + titleCase(word.slice(1, -1)) + ')'
      return word.charAt(0) + word.slice(1).toLowerCase()
    })
    .join(' ')
}

function convertYear(mmddyy, { assumeAdultBirth } = {}) {
  const [mm, dd, yy] = mmddyy.split('/')
  const yyNum = Number(yy)
  const currentYY = new Date().getFullYear() % 100
  // Birth dates: nobody working today was born after ~2008. Other dates
  // (appointment/promotion) can legitimately be recent (this decade).
  const century = assumeAdultBirth
    ? (yyNum > currentYY - 16 ? 1900 : 2000)
    : (yyNum > currentYY ? 1900 : 2000)
  const yyyy = century + yyNum
  return `${yyyy}-${mm}-${dd}`
}

function splitName(fullName) {
  const [lastPart, restPart] = fullName.split(',').map(s => s.trim())
  const restWords = restPart.split(/\s+/)
  const first_name = restWords[0] || ''
  const middle_name = restWords.slice(1).join(' ')
  return { last_name: titleCase(lastPart), first_name: titleCase(first_name), middle_name: titleCase(middle_name) }
}

function classify(positionRawUpper) {
  return /TEACHER/.test(positionRawUpper) ? 'Teaching' : 'Non-Teaching'
}

function resolveSchoolPlacement(office) {
  if (SDO_OFFICES.has(office)) {
    return { school_id: 'DEFAULT', assigned_school_id: null, placement: 'sdo' }
  }
  if (UNASSIGNED_OFFICES.has(office)) {
    return { school_id: 'UNASSIGNED', assigned_school_id: null, placement: 'unassigned' }
  }
  const schoolId = OFFICE_TO_SCHOOL_ID[office]
  if (schoolId) {
    return { school_id: schoolId, assigned_school_id: schoolId, placement: 'school' }
  }
  return { school_id: 'UNASSIGNED', assigned_school_id: null, placement: 'unmatched' }
}

function mapStatus(code) {
  return code === 'T' ? 'Temporary' : 'Permanent'
}

function normalizeTin(value) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.length === 12 && digits.endsWith('000') ? digits.slice(0, -3) : (/^\d{9}$/.test(digits) ? digits : null)
}

function psipopPeriod(filename) {
  const match = String(filename || '').match(/\b([A-Z]+)\s+(\d{4})\s+PSIPOP\.pdf$/i)
  if (!match) return 'latest source'
  const month = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase()
  return `${month} ${match[2]}`
}

function buildEmployee(record) {
  const { last_name, first_name, middle_name } = splitName(record.name)
  const positionRawUpper = record.position_raw.toUpperCase()
  const emp_type = classify(positionRawUpper)
  const placement = resolveSchoolPlacement(record.office)
  const isSchoolBased = emp_type === 'Teaching' || placement.placement === 'school' || placement.placement === 'unassigned'
  const work_assignment = emp_type === 'Non-Teaching'
    ? (placement.placement === 'sdo' ? 'SDO-Based' : 'School-Based')
    : null

  const grade = Number(record.salary_grade)
  const validSteps = salaryStepsForGrade(grade)
  const step = validSteps.includes(Number(record.step)) ? Number(record.step) : 1
  const monthly_salary = monthlySalaryFor(grade, step)

  const hired_date = convertYear(record.appointment_date)
  const salary_step_basis_date = record.promotion_date ? convertYear(record.promotion_date) : hired_date
  const birth_date = convertYear(record.dob, { assumeAdultBirth: true })

  const notes = [`Imported from PSIPOP (${psipopPeriod(record.file)})`]
  if (placement.placement === 'unassigned') notes.push('School not stated in division-wide PSIPOP — needs manual school assignment.')
  if (placement.placement === 'unmatched') notes.push(`Office "${record.office}" did not match a known school — needs manual school assignment.`)
  if (!['P', 'T'].includes(record.status_code)) notes.push(`PSIPOP status code "${record.status_code}" — verify employment status.`)

  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    school_id: placement.school_id,
    last_name, first_name, middle_name,
    employee_no: null, // Manual entry only — never derive an employee number from TIN.
    item_number: record.item_number,
    tin_number: normalizeTin(record.tin),
    position: titleCase(record.position_raw),
    emp_type,
    emp_status: mapStatus(record.status_code),
    work_assignment,
    assigned_school_id: isSchoolBased ? placement.assigned_school_id : null,
    hired_date,
    salary_grade: String(grade),
    monthly_salary,
    salary_step: step,
    salary_step_mode: 'manual',
    salary_step_basis_date,
    birth_date,
    retirement_date: null,
    retirement_notes: null,
    vl_used: 0, sl_used: 0, vl_override: null, sl_override: null, protected_vl_balance: 0,
    vsc_balance: 0, vsc_used: 0, vsc_earned_this_sy: 0, vsc_max: 15,
    is_active: true,
    notes: notes.join(' '),
    created_by: null, updated_by: null,
    created_at: now, updated_at: now,
  }
}

const PSIPOP_REFRESH_FIELDS = [
  'last_name', 'first_name', 'middle_name', 'item_number', 'tin_number',
  'position', 'emp_type', 'emp_status', 'work_assignment', 'hired_date',
  'salary_grade', 'monthly_salary', 'salary_step', 'salary_step_mode',
  'salary_step_basis_date', 'birth_date',
]

function refreshEmployee(existing, record) {
  const source = buildEmployee(record)
  const legacyEmployeeNumber = /^\d{9}000$/.test(String(existing.employee_no || '').replace(/\D/g, ''))
  const refreshed = { ...existing, employee_no: legacyEmployeeNumber ? null : existing.employee_no }
  for (const field of PSIPOP_REFRESH_FIELDS) refreshed[field] = source[field]
  refreshed.notes = existing.notes
    ? existing.notes.replace(/Imported from PSIPOP \([^)]+\)/, source.notes.split('. ')[0])
    : source.notes

  // Keep a manually resolved school when a division-wide PSIPOP page cannot
  // identify the employee's specific school. Otherwise the latest PSIPOP wins.
  if (source.school_id !== 'UNASSIGNED') {
    refreshed.school_id = source.school_id
    refreshed.assigned_school_id = source.assigned_school_id
  }

  const comparableFields = [...PSIPOP_REFRESH_FIELDS, 'employee_no', 'school_id', 'assigned_school_id']
  const changed = comparableFields.some(field => (existing[field] ?? null) !== (refreshed[field] ?? null))
  return changed ? { ...refreshed, updated_at: new Date().toISOString() } : null
}

function main() {
  const parsed = JSON.parse(readFileSync(path.join(__dirname, 'psipop_parsed.json'), 'utf-8'))
  const filled = parsed.records.filter(r => !r.vacant)
  console.log(`Parsed filled records: ${filled.length}`)

  const db = new Database(DB_PATH)
  const existing = db.prepare('SELECT payload FROM employees').all().map(row => JSON.parse(row.payload))
  const existingByItemNumber = new Map(existing.filter(e => e.item_number).map(e => [e.item_number, e]))
  console.log(`Existing employees in local DB: ${existing.length} (item_numbers=${existingByItemNumber.size})`)

  const seenInBatch = new Set()
  const toInsert = []
  const toUpdate = []
  const unchanged = []
  const sourceDuplicates = []
  const skippedNoName = []

  for (const record of filled) {
    if (!record.name) { skippedNoName.push(record); continue }
    if (seenInBatch.has(record.item_number)) { sourceDuplicates.push(record.item_number); continue }
    seenInBatch.add(record.item_number)
    const current = existingByItemNumber.get(record.item_number)
    if (!current) toInsert.push(buildEmployee(record))
    else {
      const refreshed = refreshEmployee(current, record)
      if (refreshed) toUpdate.push(refreshed)
      else unchanged.push(record.item_number)
    }
  }

  console.log(`To insert: ${toInsert.length}`)
  console.log(`To refresh from latest PSIPOP: ${toUpdate.length}`)
  console.log(`Already current: ${unchanged.length}`)
  console.log(`Duplicate OSEC items in source: ${sourceDuplicates.length}`)
  console.log(`Skipped (no name / unparsed): ${skippedNoName.length}`)

  const placementCounts = {}
  for (const emp of toInsert) {
    placementCounts[emp.school_id === 'DEFAULT' ? 'SDO-office' : emp.school_id === 'UNASSIGNED' ? 'Unassigned-pool' : 'School-matched'] =
      (placementCounts[emp.school_id === 'DEFAULT' ? 'SDO-office' : emp.school_id === 'UNASSIGNED' ? 'Unassigned-pool' : 'School-matched'] || 0) + 1
  }
  console.log('Placement breakdown:', placementCounts)

  const unmatchedOffices = new Set(
    filled.filter(r => resolveSchoolPlacement(r.office).placement === 'unmatched').map(r => r.office)
  )
  if (unmatchedOffices.size) console.log('WARNING unmatched offices:', [...unmatchedOffices])

  if (DRY_RUN) {
    console.log('\n--dry-run: no writes performed. Sample of first 5 records to refresh:')
    console.log(JSON.stringify(toUpdate.slice(0, 5), null, 2))
    console.log('\nSample of first 5 records to insert:')
    console.log(JSON.stringify(toInsert.slice(0, 5), null, 2))
    db.close()
    return
  }

  const insertEmployee = db.prepare(`
    INSERT INTO employees (id, school_id, last_name, updated_at, payload)
    VALUES (@id, @school_id, @last_name, @updated_at, @payload)
  `)
  const queueChange = db.prepare(`
    INSERT INTO sync_queue (entity_type, entity_id, operation, payload)
    VALUES ('employee', @entity_id, 'upsert', @payload)
  `)
  const updateEmployee = db.prepare(`
    UPDATE employees SET school_id = @school_id, last_name = @last_name,
      updated_at = @updated_at, payload = @payload WHERE id = @id
  `)
  const tx = db.transaction((records, updates) => {
    for (const emp of updates) {
      const payload = JSON.stringify(emp)
      updateEmployee.run({ id: emp.id, school_id: emp.school_id, last_name: emp.last_name, updated_at: emp.updated_at, payload })
      queueChange.run({ entity_id: emp.id, payload })
    }
    for (const emp of records) {
      const payload = JSON.stringify(emp)
      insertEmployee.run({ id: emp.id, school_id: emp.school_id, last_name: emp.last_name, updated_at: emp.updated_at, payload })
      queueChange.run({ entity_id: emp.id, payload })
    }
  })
  tx(toInsert, toUpdate)
  console.log(`\nInserted ${toInsert.length} and refreshed ${toUpdate.length} employees from the latest PSIPOP; queued changes for Supabase sync.`)
  db.close()
}

main()
