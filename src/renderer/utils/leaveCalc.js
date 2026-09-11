// ============================================================
// DepEd / CSC Leave Computation Utilities
// CSC MC No. 41, s. 1998 (Omnibus Rules on Leave)
// DepEd Order No. 013, s. 2024 (VSC for Teachers)
// ============================================================

export const ACCRUAL_RATE = 1.25 // days per month for Non-Teaching (VL and SL separately)
export const WORKING_DAYS_PER_MONTH = 22 // per RA 6758
export const SPECIAL_PRIVILEGE_DAYS_PER_YEAR = 3
export const MANDATORY_LEAVE_DAYS_PER_YEAR = 5
export const WELLNESS_LEAVE_DAYS_PER_YEAR = 5
export const CTO_EXPIRY_WARNING_DAYS = 14

function employeeType(employee) {
  return employee?.emp_type ?? employee?.type
}

function employeeHireDate(employee) {
  return employee?.hired_date ?? employee?.hired
}

/**
 * Months of service from hire date to reference date (inclusive of hire month).
 */
export function monthsOfService(hireDate, refDate = new Date()) {
  const h = new Date(hireDate)
  const r = new Date(refDate)
  if (Number.isNaN(h.getTime()) || Number.isNaN(r.getTime())) return 0
  const months = (r.getFullYear() - h.getFullYear()) * 12 + (r.getMonth() - h.getMonth())
  return Math.max(0, months)
}

export function yearsOfService(hireDate, refDate = new Date()) {
  const hired = new Date(hireDate)
  const reference = new Date(refDate)
  if (Number.isNaN(hired.getTime()) || Number.isNaN(reference.getTime()) || reference < hired) return 0
  let years = reference.getFullYear() - hired.getFullYear()
  if (reference.getMonth() < hired.getMonth() ||
      (reference.getMonth() === hired.getMonth() && reference.getDate() < hired.getDate())) years -= 1
  return Math.max(0, years)
}

export function ageInYears(birthDate, refDate = new Date()) {
  const born = new Date(birthDate)
  const reference = new Date(refDate)
  if (Number.isNaN(born.getTime()) || Number.isNaN(reference.getTime()) || reference < born) return null
  let years = reference.getFullYear() - born.getFullYear()
  if (reference.getMonth() < born.getMonth() ||
      (reference.getMonth() === born.getMonth() && reference.getDate() < born.getDate())) years -= 1
  return Math.max(0, years)
}

// Compulsory retirement age in Philippine government service is 65 — flag
// approaching age (59–61) and the final stretch (62–65) so HRMO can plan
// ahead for succession and retirement paperwork.
export function retirementAgeColor(age) {
  if (age == null) return null
  if (age >= 62 && age <= 65) return 'var(--danger)'
  if (age >= 59 && age <= 61) return 'var(--warning)'
  return null
}

export function isNearingRetirement(employee) {
  const age = ageInYears(employee?.birth_date)
  return age != null && age >= 59 && age <= 65
}

/**
 * Non-Teaching: total earned VL or SL from hire date.
 * 1.25 days per month per leave type (CSC MC 41 s.1998).
 */
export function totalEarned(hireDate, refDate = new Date()) {
  const months = monthsOfService(hireDate, refDate)
  return +(months * ACCRUAL_RATE).toFixed(4)
}

/**
 * Non-Teaching: current VL balance.
 * If override is provided (manual HRMO correction), use that.
 */
export function regularVlBalance(employee, refDate = new Date()) {
  if (employeeType(employee) !== 'Non-Teaching') return 0
  if (employee.vl_override !== null && employee.vl_override !== undefined) {
    return +employee.vl_override
  }
  const earned = totalEarned(employeeHireDate(employee), refDate)
  return Math.max(0, +(earned - (employee.vl_used || 0)).toFixed(2))
}

/** Restored mandatory-leave days are usable leave, but never monetizable. */
export function protectedVlBalance(employee) {
  if (employeeType(employee) !== 'Non-Teaching') return 0
  return Math.max(0, +(employee?.protected_vl_balance || 0))
}

export function vlBalance(employee, refDate = new Date()) {
  return +(regularVlBalance(employee, refDate) + protectedVlBalance(employee)).toFixed(2)
}

/**
 * Non-Teaching: current SL balance.
 */
export function slBalance(employee, refDate = new Date()) {
  if (employeeType(employee) !== 'Non-Teaching') return 0
  if (employee.sl_override !== null && employee.sl_override !== undefined) {
    return +employee.sl_override
  }
  const earned = totalEarned(employeeHireDate(employee), refDate)
  return Math.max(0, +(earned - (employee.sl_used || 0)).toFixed(2))
}

/**
 * Teaching: VSC balance (manually entered by HRMO).
 * Per DepEd Order 013, s. 2024 — teachers are not entitled to VL/SL.
 * VSC max depends on years of service:
 *   < 10 years → max 15 days
 *   10–19 years → max 30 days
 *   20+ years → max 45 days
 */
export function vscMaxDays(hireDate, refDate = new Date()) {
  const years = monthsOfService(hireDate, refDate) / 12
  if (years >= 20) return 45
  if (years >= 10) return 30
  return 15
}

export function vscBalance(employee) {
  if (employeeType(employee) !== 'Teaching') return 0
  return Math.max(0, +(((employee.vsc_balance || 0))).toFixed(2))
}

/**
 * Terminal Leave computation (CSC formula):
 * TLB = (D / 22) × Monthly Salary
 * where D = accumulated VL + SL (non-teaching) or VSC (teaching)
 */
export function terminalLeave(employee, monthlySalary) {
  let days = 0
  if (employeeType(employee) === 'Teaching') {
    days = vscBalance(employee)
  } else {
    days = vlBalance(employee) + slBalance(employee)
  }
  return +((days / WORKING_DAYS_PER_MONTH) * monthlySalary).toFixed(2)
}

export function retirementLeaveMonths(employee) {
  return +(protectedVlBalance(employee) / WORKING_DAYS_PER_MONTH).toFixed(2)
}

/**
 * Forced/mandatory leave check (CSC MC 41 s.1998, Sec. 25):
 * Employees with 10+ VL days must take at least 5 consecutive/intermittent VL days per year.
 */
export function requiresForcedLeave(employee) {
  if (employeeType(employee) !== 'Non-Teaching') return false
  return vlBalance(employee) >= 10
}

/**
 * Monetization: 50% or more of accumulated leave credits may be monetized
 * for valid reasons per CSC MC 2, s. 2016.
 * Returns max monetizable days.
 */
export function maxMonetizable(employee) {
  if (employeeType(employee) !== 'Non-Teaching') return 0
  return Math.max(0, Math.min(30, Math.floor(regularVlBalance(employee) - 5)))
}

// VL and SL are chosen from two independent dropdowns rather than one
// combined preset, so HRMO/AOII control each portion directly. The RPC
// encodes both as "VL<n>SL<m>" — see lcms_record_monetization.
export const MONETIZATION_VL_OPTIONS = Array.from({ length: 31 }, (_, days) => days) // 0..30
export const MONETIZATION_SL_OPTIONS = Array.from({ length: 6 }, (_, days) => days)  // 0..5

export function monetizationOptionKey(vlDays, slDays) {
  return `VL${Number(vlDays) || 0}SL${Number(slDays) || 0}`
}

export function monetizationEligibility(employee, vlDays, slDays, refDate = new Date()) {
  if (employeeType(employee) !== 'Non-Teaching') return { eligible: false, reason: 'Only non-teaching employees may use this monetization.' }
  const vlDaysNum = Number(vlDays) || 0
  const slDaysNum = Number(slDays) || 0
  if (!Number.isInteger(vlDaysNum) || !Number.isInteger(slDaysNum) || vlDaysNum < 0 || vlDaysNum > 30 || slDaysNum < 0 || slDaysNum > 5) return { eligible: false, reason: 'Choose 0-30 whole VL days and 0-5 whole SL days.' }
  const total = vlDaysNum + slDaysNum
  if (total < 10) return { eligible: false, reason: 'Monetization must total at least 10 days (VL + SL combined).' }
  if (total > 30) return { eligible: false, reason: 'Monetization cannot exceed 30 days (VL + SL combined).' }
  const vl = regularVlBalance(employee)
  const sl = slBalance(employee)
  const alreadyMonetized = annualLeaveUsed(employee, 'Monetization of Leave Credits', refDate)
  if (alreadyMonetized + total > 30) return { eligible: false, reason: `Only ${Math.max(0, 30 - alreadyMonetized)} monetization day(s) remain for this calendar year.` }
  if (vl - vlDaysNum < 5) return { eligible: false, reason: `Monetization must retain at least 5 regular VL days. Current monetizable VL is ${fmt(vl)}.` }
  if (slDaysNum > 0 && sl - slDaysNum < 0) return { eligible: false, reason: `Insufficient sick leave balance for the SL portion of this monetization. Current SL balance is ${fmt(sl)}.` }
  return { eligible: true, vl: vlDaysNum, sl: slDaysNum, total }
}

function localDate(value) {
  if (!value) return null
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

// Classroom teachers render no overtime/office hours and so earn no CTO.
// Head Teachers, anyone HRMO has assigned as School Head or Assistant School
// Head, and any Master Teacher designated as acting School Head, are
// Teaching-type by plantilla item but act in an administrative capacity with
// office hours, so they remain CTO-eligible.
export function isCtoEligible(employee) {
  return employeeType(employee) !== 'Teaching'
    || !!employee?.school_head_designate
    || /^(head teacher|school head|assistant school head)\b/i.test(String(employee?.position || '').trim())
}

export function ctoCredits(employee, refDate = new Date()) {
  const today = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate())
  return (employee?.cto_credits || []).map(credit => {
    const expiry = localDate(credit.expires_on)
    const remaining = +(credit.remaining_days || 0)
    const daysUntilExpiry = expiry ? Math.ceil((expiry - today) / 86400000) : -1
    return { ...credit, remaining_days: remaining, daysUntilExpiry, expired: !expiry || daysUntilExpiry <= 0 }
  })
}

export function ctoBalance(employee, refDate = new Date()) {
  return +ctoCredits(employee, refDate)
    .filter(credit => !credit.expired)
    .reduce((sum, credit) => sum + credit.remaining_days, 0)
    .toFixed(2)
}

export function ctoExpiryWarnings(employee, refDate = new Date()) {
  return ctoCredits(employee, refDate)
    .filter(credit => !credit.expired && credit.remaining_days > 0 && credit.daysUntilExpiry <= CTO_EXPIRY_WARNING_DAYS)
    .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry)
}

/**
 * Generate accrual log for the past N months for a Non-Teaching employee.
 */
export function generateAccrualLog(employee, months = 12, refDate = new Date()) {
  const log = []
  const today = refDate
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const hired = new Date(employeeHireDate(employee))
    const earned = !Number.isNaN(hired.getTime()) && d >= new Date(hired.getFullYear(), hired.getMonth(), 1)
    log.push({
      month: d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }),
      vl: earned ? ACCRUAL_RATE : 0,
      sl: earned ? ACCRUAL_RATE : 0,
      date: d
    })
  }
  return log
}

/**
 * Format a number as leave days string.
 */
export function fmt(n) {
  if (n === null || n === undefined || n === '—') return '—'
  return (+n).toFixed(2)
}

/** Formats an ISO (YYYY-MM-DD) or other parseable date string as MM/DD/YYYY for display. */
export function fmtDate(value) {
  if (!value) return '—'
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (isoMatch) {
    const [, y, m, d] = isoMatch
    return `${m}/${d}/${y}`
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  const m = String(parsed.getMonth() + 1).padStart(2, '0')
  const d = String(parsed.getDate()).padStart(2, '0')
  return `${m}/${d}/${parsed.getFullYear()}`
}

/** Approved/recorded usage of a leave type in the calendar year containing refDate. */
export function annualLeaveUsed(employee, leaveType, refDate = new Date()) {
  const year = new Date(refDate).getFullYear()
  if (!Number.isFinite(year)) return 0
  return +((employee?.leave_transactions || [])
    .filter(transaction => transaction.leave_type === leaveType)
    .filter(transaction => {
      const date = new Date(`${String(transaction.date_from || '').slice(0, 10)}T00:00:00`)
      return !Number.isNaN(date.getTime()) && date.getFullYear() === year
    })
    .reduce((total, transaction) => total + Math.abs(Number(transaction.days) || 0), 0)
    .toFixed(2))
}

function transactionsForYear(employee, refDate = new Date()) {
  const year = new Date(refDate).getFullYear()
  if (!Number.isFinite(year)) return []
  return (employee?.leave_transactions || []).filter(transaction => {
    const date = new Date(`${String(transaction.date_from || '').slice(0, 10)}T00:00:00`)
    return !Number.isNaN(date.getTime()) && date.getFullYear() === year
  })
}

export function mandatoryLeaveCompliance(employee, refDate = new Date()) {
  const year = new Date(refDate).getFullYear()
  const transactions = transactionsForYear(employee, refDate)
  const vlApplications = transactions
    .filter(transaction => transaction.txn_type === 'VL_DEBIT')
    .filter(transaction => ['Vacation Leave (VL)', 'Mandatory / Forced Leave'].includes(transaction.leave_type))
    .reduce((total, transaction) => total + Math.abs(Number(transaction.days) || 0), 0)
  const authorityCancelled = transactions
    .filter(transaction => ['VL_CANCELLATION_CREDIT', 'VL_PROTECTED_CREDIT'].includes(transaction.txn_type))
    .reduce((total, transaction) => total + Math.abs(Number(transaction.days) || 0), 0)
  const forfeited = transactions
    .filter(transaction => transaction.txn_type === 'MANDATORY_FORFEIT')
    .reduce((total, transaction) => total + Math.abs(Number(transaction.days) || 0), 0)
  const monetized = transactions
    .filter(transaction => transaction.txn_type === 'MONETIZE')
    .reduce((total, transaction) => total + Math.abs(Number(transaction.days) || 0), 0)
  const retirementDate = employee?.retirement_date ? new Date(`${employee.retirement_date}T00:00:00`) : null
  const retirementExempt = Boolean(retirementDate && !Number.isNaN(retirementDate.getTime()) && retirementDate.getFullYear() === year)
  const recordedExemption = transactions.some(transaction => transaction.txn_type === 'MANDATORY_EXEMPT')
  const actualVlUsed = Math.max(0, vlApplications - authorityCancelled)
  const requirementApplies = retirementExempt || recordedExemption || vlBalance(employee, refDate) >= 10 || actualVlUsed > 0 || authorityCancelled > 0 || monetized > 0 || forfeited > 0
  const creditedTowardRequirement = Math.min(MANDATORY_LEAVE_DAYS_PER_YEAR, actualVlUsed + authorityCancelled + forfeited)
  const remaining = retirementExempt || recordedExemption || !requirementApplies
    ? 0
    : Math.max(0, MANDATORY_LEAVE_DAYS_PER_YEAR - creditedTowardRequirement)
  return {
    year,
    required: requirementApplies ? MANDATORY_LEAVE_DAYS_PER_YEAR : 0,
    used: +actualVlUsed.toFixed(2),
    authorityCancelled: +authorityCancelled.toFixed(2),
    forfeited: +forfeited.toFixed(2),
    monetized: +monetized.toFixed(2),
    remaining: +remaining.toFixed(2),
    retirementExempt: retirementExempt || recordedExemption,
  }
}

export function annualLeaveRemaining(employee, leaveType, entitlementDays, refDate = new Date()) {
  if (entitlementDays === null || entitlementDays === undefined) return null
  return Math.max(0, +(entitlementDays - annualLeaveUsed(employee, leaveType, refDate)).toFixed(2))
}

export function leaveAvailability(type, employee, refDate = new Date()) {
  if (!type) return { used: 0, remaining: null }
  if (type.key === 'mandatory_forced') {
    const compliance = mandatoryLeaveCompliance(employee, refDate)
    return { used: compliance.used, remaining: null, requirementRemaining: compliance.remaining, compliance }
  }
  const used = annualLeaveUsed(employee, type.label, refDate)
  const remaining = annualLeaveRemaining(employee, type.label, type.annualEntitlement, refDate)
  return { used, remaining }
}

export const LEAVE_TYPES_NONTEACHING = [
  { key: 'vacation', label: 'Vacation Leave (VL)', basis: 'EO 292, Rule XVI, Sec. 51', deduction: 'Deducts from VL balance' },
  { key: 'mandatory_forced', label: 'Mandatory / Forced Leave', basis: 'EO 292, Rule XVI, Sec. 25', annualRequirement: MANDATORY_LEAVE_DAYS_PER_YEAR, deduction: 'VL usage counts toward the 5-day annual requirement; any untaken balance is forfeited at year-end' },
  { key: 'sick', label: 'Sick Leave (SL)', basis: 'EO 292, Rule XVI, Sec. 43', deduction: 'Deducts from SL balance' },
  { key: 'maternity', label: 'Maternity Leave', basis: 'RA 11210', deduction: 'Outside VL/SL credits' },
  { key: 'paternity', label: 'Paternity Leave', basis: 'RA 8187', deduction: 'Outside VL/SL credits' },
  { key: 'special_privilege', label: 'Special Privilege Leave', basis: 'EO 292, Rule XVI, Sec. 21', annualEntitlement: SPECIAL_PRIVILEGE_DAYS_PER_YEAR, deduction: '3 days/year; outside VL/SL credits' },
  { key: 'solo_parent', label: 'Solo Parent Leave', basis: 'RA 8972, as amended by RA 11861', annualEntitlement: 7, deduction: 'Outside VL/SL credits' },
  { key: 'study', label: 'Study Leave', basis: 'EO 292, Rule XVI, Sec. 68', deduction: 'Outside VL/SL credits' },
  { key: 'vawc', label: '10-Day VAWC Leave', basis: 'RA 9262 / CSC MC 15, s. 2005', deduction: 'Outside VL/SL credits' },
  { key: 'rehabilitation', label: 'Rehabilitation Privilege', basis: 'EO 292, Rule XVI, Sec. 55', deduction: 'Outside VL/SL credits' },
  { key: 'special_leave_women', label: 'Special Leave Benefits for Women', basis: 'RA 9710 / CSC MC 25, s. 2010', deduction: 'Outside VL/SL credits' },
  { key: 'special_emergency', label: 'Special Emergency (Calamity) Leave', basis: 'CSC MC 2, s. 2012', deduction: 'Outside VL/SL credits' },
  { key: 'adoption', label: 'Adoption Leave', basis: 'RA 11642', deduction: 'Outside VL/SL credits' },
  { key: 'wellness', label: 'Wellness Leave', basis: 'CSC MC 1, s. 2026 / DepEd DO 2, s. 2026', annualEntitlement: WELLNESS_LEAVE_DAYS_PER_YEAR, deduction: '5 days/year; outside VL/SL credits' },
  { key: 'monetization', label: 'Monetization of Leave Credits', basis: 'CSC MC 41, s. 1998, Sec. 22', deduction: 'Standard monetization deducts 10–30 VL days/year and must retain at least 5 VL days' },
  { key: 'cto', label: 'Compensatory Time Off (CTO)', basis: 'Expires one year after grant', deduction: 'Deducts from active CTO grants' },
  { key: 'terminal', label: 'Terminal Leave', basis: 'EO 292 / CSC leave rules', deduction: 'Paid from accumulated VL/SL credits' },
]

export const LEAVE_TYPES_TEACHING = [
  { key: 'vsc', label: 'Vacation Service Credits (VSC)', basis: 'DepEd Order 013 s.2024' },
  { key: 'maternity', label: 'Maternity Leave', basis: 'RA 11210' },
  { key: 'paternity', label: 'Paternity Leave', basis: 'RA 8187' },
  { key: 'special_privilege', label: 'Special Privilege Leave', basis: 'EO 292, Rule XVI, Sec. 21' },
  { key: 'solo_parent', label: 'Solo Parent Leave', basis: 'RA 8972, as amended by RA 11861', annualEntitlement: 7 },
  { key: 'study', label: 'Study Leave', basis: 'RA 4670 Sec. 24' },
  { key: 'indefinite_sick', label: 'Indefinite Sick Leave', basis: 'RA 4670 Sec. 25' },
  { key: 'vawc', label: '10-Day VAWC Leave', basis: 'RA 9262 / CSC MC 15, s. 2005' },
  { key: 'rehabilitation', label: 'Rehabilitation Privilege', basis: 'EO 292, Rule XVI, Sec. 55' },
  { key: 'special_leave_women', label: 'Special Leave Benefits for Women', basis: 'RA 9710 / CSC MC 25, s. 2010' },
  { key: 'special_emergency', label: 'Special Emergency (Calamity) Leave', basis: 'CSC MC 2, s. 2012' },
  { key: 'adoption', label: 'Adoption Leave', basis: 'RA 11642' },
  { key: 'wellness', label: 'Wellness Leave', basis: 'CSC MC 1, s. 2026 / DepEd DO 2, s. 2026', annualEntitlement: WELLNESS_LEAVE_DAYS_PER_YEAR },
  { key: 'terminal', label: 'Terminal Leave', basis: 'EO 292 / CSC leave rules' },
]

export const POSITIONS_TEACHING = [
  'Teacher I',
  'Teacher II',
  'Teacher III',
  'Teacher IV',
  'Teacher V',
  'Teacher VI',
  'Teacher VII',
  'Special Education Teacher I',
  'Special Education Teacher II',
  'Special Education Teacher III',
  'Head Teacher I',
  'Head Teacher II',
  'Head Teacher III',
  'Head Teacher IV',
  'Head Teacher V',
  'Head Teacher VI',
  'Master Teacher I',
  'Master Teacher II',
  'Master Teacher III',
  'Master Teacher IV',
  'Master Teacher V',
]

export const POSITIONS_NONTEACHING_SCHOOL = [
  'Principal I',
  'Principal II',
  'Principal III',
  'Principal IV',
  'Assistant Principal I',
  'Assistant Principal II',
  'Administrative Officer I',
  'Administrative Officer II',
  'Project Development Officer I',
  'Administrative Assistant II',
  'Administrative Assistant III (Senior Bookkeeper)',
  'Administrative Aide I',
  'Administrative Aide II',
  'Administrative Aide III',
  'Administrative Aide IV',
  'Administrative Aide V',
  'Administrative Aide VI',
  'Guidance Counselor I',

]

export const POSITIONS_NONTEACHING_SDO = [
  'Schools Division Superintendent',
  'Assistant Schools Division Superintendent',
  'Chief Education Supervisor',
  'Education Program Supervisor',
  'Public Schools Division Supervisor',
  'Senior Education Program Specialist',
  'Education Program Specialist II',
  'Project Development Officer II',
  'Project Development Officer I',
  'Planning Officer III',
  'Engineer III',
  'Information Technology Officer III',
  'Legal Officer III',
  'Legal Assistant I',
  'Medical Officer III',
  'Nurse II',
  'Dentist II',
  'Accountant III',
  'Librarian III',
  'Administrative Officer V',
  'Administrative Officer IV',
  'Administrative Officer III',
  'Administrative Officer II',
  'Administrative Assistant III',
  'Administrative Assistant II',
  'Administrative Aide VI',
  'Administrative Aide IV',
]

export const POSITIONS_NONTEACHING = [
  ...new Set([...POSITIONS_NONTEACHING_SDO, ...POSITIONS_NONTEACHING_SCHOOL])
]
