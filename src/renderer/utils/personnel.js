export function normalizeTin(value) {
  const digits = String(value || '').replace(/\D/g, '')
  const core = digits.length === 12 && digits.endsWith('000') ? digits.slice(0, -3) : digits
  return /^\d{9}$/.test(core) ? core : null
}

export function formatTin(value) {
  const tin = normalizeTin(value)
  return tin ? tin.replace(/(\d{3})(\d{3})(\d{3})/, '$1-$2-$3') : '—'
}

export function formatTinInput(value) {
  const rawDigits = String(value || '').replace(/\D/g, '')
  const digits = rawDigits.length === 12 && rawDigits.endsWith('000')
    ? rawDigits.slice(0, -3)
    : rawDigits.slice(0, 9)
  return digits.match(/.{1,3}/g)?.join('-') || ''
}

export function isLegacyTinEmployeeNumber(value) {
  return /^\d{9}000$/.test(String(value || '').replace(/\D/g, ''))
}

export function employeeTin(employee) {
  return normalizeTin(employee?.tin_number)
    || (isLegacyTinEmployeeNumber(employee?.employee_no) ? normalizeTin(employee.employee_no) : null)
}

export function employeeNumber(employee) {
  return isLegacyTinEmployeeNumber(employee?.employee_no) ? '' : (employee?.employee_no || '')
}

export function titleCase(value) {
  return String(value || '').replace(/\p{L}+/gu, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
}

export function personnelFullName(employee) {
  const givenNames = [employee.first_name, employee.middle_name].filter(Boolean).join(' ')
  return [employee.last_name, givenNames].filter(Boolean).join(', ')
}

// Boilerplate lines scripts/import_psipop.mjs writes into `notes` for every
// employee it creates or refreshes — useful as an import audit trail at the
// time, but clutter once `notes` is read back as a Remarks column. Strips
// only those known auto-generated lines, leaving any manually entered
// remarks (including promotion notes) untouched.
const PSIPOP_IMPORT_NOTE_PATTERNS = [
  /Imported from PSIPOP \([^)]*\)\.?/g,
  /School not stated in division-wide PSIPOP — needs manual school assignment\.?/g,
  /Office "[^"]*" did not match a known school — needs manual school assignment\.?/g,
  /PSIPOP status code "[^"]*" — verify employment status\.?/g,
]

export function stripPsipopImportNotes(notes) {
  let stripped = String(notes || '')
  for (const pattern of PSIPOP_IMPORT_NOTE_PATTERNS) stripped = stripped.replace(pattern, '')
  return stripped.replace(/\s+/g, ' ').trim()
}

// NASH (National Assessment for School Heads) candidacy only applies to Teacher III
// and above, plus Head Teachers and Master Teachers — the ranks eligible to be
// considered for School Head / Principal positions.
const NASH_ELIGIBLE_POSITIONS = new Set([
  'Teacher III', 'Teacher IV', 'Teacher V', 'Teacher VI', 'Teacher VII',
  'Head Teacher I', 'Head Teacher II', 'Head Teacher III', 'Head Teacher IV', 'Head Teacher V', 'Head Teacher VI',
  'Master Teacher I', 'Master Teacher II', 'Master Teacher III', 'Master Teacher IV', 'Master Teacher V',
])

export function isNashEligiblePosition(position) {
  return NASH_ELIGIBLE_POSITIONS.has(String(position || '').trim())
}

export function isHeadTeacherPosition(position) {
  return /^head teacher\b/i.test(String(position || '').trim())
}

export function isMasterTeacherPosition(position) {
  return /^master teacher\b/i.test(String(position || '').trim())
}

// Head Teachers can be designated School Head outright; Master Teachers are
// classroom rank and only gain that eligibility once they clear the National
// Assessment for School Heads (NASH) — the same gate DepEd uses for NASH
// candidacy itself.
export function isSchoolHeadDesignationEligible({ position, nash_passer } = {}) {
  if (isHeadTeacherPosition(position)) return true
  return isMasterTeacherPosition(position) && !!nash_passer
}

export function isPrincipalPosition(position) {
  const normalized = String(position || '').trim().toLowerCase()
  return (normalized.includes('principal') && !normalized.includes('assistant')) || normalized.includes('school head')
}

export function isAssistantPrincipalPosition(position) {
  return /assistant (school )?principal/i.test(String(position || '').trim())
}

const ROMAN_RANK = { VII: 7, VI: 6, V: 5, IV: 4, III: 3, II: 2, I: 1 }
// Principal/Assistant Principal titles end in a roman numeral (Principal I..IV) —
// higher numeral is the more senior rank, used to pick a school's head when it
// has more than one Principal on its roster.
function positionSeniority(position) {
  const match = String(position || '').trim().match(/\b(VII|VI|IV|V|III|II|I)$/)
  return match ? ROMAN_RANK[match[1]] : 0
}

// Resolves which single employee currently acts as a school's head, given
// that school's own roster (not the whole division): an explicit HRMO
// designation takes precedence — a Head Teacher or NASH-passing Master
// Teacher named acting School Head; otherwise the most senior Principal on
// the roster (Principal III outranks Principal II, etc.); and only when the
// school has no Principal at all does its most senior Assistant Principal
// step up automatically. Any other Principal/Assistant Principal on the same
// roster who isn't picked here functions as the head's assistant.
export function resolveSchoolHeadId(employeesAtSchool) {
  const active = (employeesAtSchool || []).filter(employee => employee.is_active !== false)
  const designated = active.find(employee => employee.school_head_designate)
  if (designated) return designated.id
  const mostSenior = list => list.length
    ? [...list].sort((a, b) => positionSeniority(b.position) - positionSeniority(a.position))[0]
    : null
  const principal = mostSenior(active.filter(employee => isPrincipalPosition(employee.position)))
  if (principal) return principal.id
  const assistant = mostSenior(active.filter(employee => isAssistantPrincipalPosition(employee.position)))
  return assistant ? assistant.id : null
}

// Groups employees by school (via schoolIdOf) and resolves each school's head,
// so a filtered/searched view can check membership without that filtering
// itself changing who counts as head — the grouping always sees the full roster.
export function resolveSchoolHeadIds(employees, schoolIdOf = employee => employee.school_id) {
  const bySchool = new Map()
  for (const employee of employees || []) {
    const schoolId = schoolIdOf(employee)
    if (!schoolId || schoolId === 'DEFAULT' || schoolId === 'UNASSIGNED') continue
    if (!bySchool.has(schoolId)) bySchool.set(schoolId, [])
    bySchool.get(schoolId).push(employee)
  }
  const heads = new Set()
  for (const group of bySchool.values()) {
    const headId = resolveSchoolHeadId(group)
    if (headId) heads.add(headId)
  }
  return heads
}

// Division-office leaders sort by rank directly. School-based leadership
// sorts the resolved head first, with every other Principal/Assistant
// Principal on the same roster (i.e. not picked by resolveSchoolHeadId)
// grouped together as the head's assistants.
export function personnelLeadershipPriority(position, isDivisionOffice = false, isResolvedHead = false) {
  const normalized = String(position || '').trim().toLowerCase()
  if (isDivisionOffice) {
    if (normalized === 'schools division superintendent') return 0
    if (normalized === 'assistant schools division superintendent') return 1
    return 2
  }
  if (isResolvedHead) return 0
  if (isPrincipalPosition(position) || isAssistantPrincipalPosition(position)) return 1
  return 2
}
