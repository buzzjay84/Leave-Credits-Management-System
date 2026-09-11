import { LEAVE_TYPES_NONTEACHING, LEAVE_TYPES_TEACHING, annualLeaveUsed, ctoBalance, isCtoEligible, monetizationEligibility, slBalance, vlBalance, vscBalance } from './leaveCalc.js'
import { maternityEndDate, MATERNITY_OPTIONS } from './maternityLeave.js'

// Documentary eligibility is explicitly reviewed; personnel data does not contain
// complete service history, civil status, medical findings or event entitlements.
export const LEAVE_CONDITIONS = {
  vacation: { conditions: ['Non-teaching personnel on the vacation/sick leave system; sufficient VL credits for paid leave.', 'Application filed at least five days ahead whenever possible; dates and service requirements approved.'] },
  mandatory_forced: { conditions: ['Non-teaching personnel on the VL/SL system. Five days annual mandatory leave applies when the employee has at least ten VL days; check retirement/separation exemptions.', 'Charge approved usage to VL. Five days is an annual requirement, not a maximum on ordinary VL.'] },
  sick: { conditions: ['Illness of the employee or a qualifying immediate family member; notice and application comply with CSC rules.', 'Medical certificate for more than five successive days, or when required by the approving authority; sufficient SL for paid leave.'] },
  vsc: { conditions: ['Teaching personnel on the teachers leave basis; absence is eligible for a VSC offset under DepEd Order 013, s. 2024.', 'For a credit grant, approved authority and certification of actual eligible service are on file; do not double-credit paid service.'] },
  maternity: { paid: true, conditions: ['Pregnancy/childbirth or miscarriage/emergency termination is supported by the required medical documents; dates cover the approved continuous maternity period.', '105 calendar days for live childbirth; 120 only with verified solo-parent qualification; 60 for miscarriage/emergency termination. Verify earlier usage and any allocation to another caregiver for the same pregnancy.', 'Any extension must be approved and recorded separately as unpaid leave or eligible earned sick leave; no automatic credit deduction after day 105.'] },
  paternity: { paid: true, maxDays: 7, conditions: ['Married male employee cohabiting with his lawful spouse; this is one of her first four qualifying deliveries, including miscarriage.', 'Required marriage and birth/medical documentation and notification are on file. Total usage for this delivery, including previous entries, must not exceed seven days.'] },
  special_privilege: { paid: true, annual: 3, conditions: ['Personnel are covered by the VL/SL leave system; teachers on teachers leave basis do not receive this privilege.', 'A qualifying personal milestone, parental/filial obligation, domestic emergency or similar approved occasion; three days per calendar year, not cumulative or convertible to cash.'] },
  solo_parent: { paid: true, annual: 7, maxDays: 7, conditions: ['Valid solo-parent identification/status and a qualifying parental responsibility requiring personal presence.', 'At least six months of service, including qualifying aggregate service, verified from service records under RA 11861; seven working days yearly, noncumulative.'] },
  study: { conditions: ['Teaching: verify seven years of service, approved study plan and RA 4670 requirements. Up to one school year initially; compensation is at least 60%, subject to the statutory study requirements. Additional study may be authorized without compensation.', 'Non-teaching: verify appointment eligibility, at least two years of service, very satisfactory ratings for the last two periods, degree/examination requirements and return-service contract under CSC MC 21, s. 2004. Up to six months for bar/board review or four months to complete a masters degree.', 'Record only the period and pay treatment in the approved study-leave authority; payroll must apply the approved compensation rate.'] },
  indefinite_sick: { conditions: ['Teachers only: medical findings establish an illness requiring treatment expected to exceed at least one year (RA 4670, section 25).', 'Approved duration, supporting medical certification and pay/credit treatment must be reviewed by HRMO; this entry alone does not establish salary entitlement.'] },
  vawc: { paid: true, conditions: ['Employee is a qualified woman victim-survivor under RA 9262; required certification from an authorized barangay official, prosecutor or court is on file.', 'Up to ten days, continuous or intermittent; verify previous usage. Any longer period requires the applicable court authority. Keep case and medical details out of general remarks.'] },
  rehabilitation: { paid: true, maxMonths: 6, conditions: ['Injury was sustained in the performance of official duties; medical evidence and agency-head approval under CSC-DBM Joint Circular 1, s. 2006 are on file.', 'Approved rehabilitation period, including previous portions for the injury, does not exceed six months; this is outside earned VL/SL.'] },
  special_leave_women: { paid: true, maxMonths: 2, conditions: ['Female employee has undergone surgery for a gynecological disorder; medical certification states the required recovery period.', 'At least six months aggregate government service during the twelve months before surgery, verified from service records; maximum two months under CSC MC 25, s. 2010, including earlier portions.'] },
  special_emergency: { paid: true, conditions: ['Employee is directly affected by a natural calamity/disaster; verify location, declaration or applicable agency-head authority and supporting evidence.', 'Normally up to five working days in a year, taken within thirty days of the applicable calamity declaration. Any extension or exception requires documented agency-head authority.'] },
  adoption: { paid: true, conditions: ['Verify qualifying adoptive-parent status, placement/adoption documents and the applicable entitlement under RA 11642 and current CSC/NACC rules.', 'No adult adoption or child already in the adoptive parents care for at least three years before the order. Verify the applicable filing window and prior usage.', 'HRMO must establish the applicable maternity/paternity-equivalent duration in the adoption authority; do not assume the former 60-day rule applies to every adoption.'] },
  wellness: { paid: true, annual: 5, maxDays: 3, conditions: ['Eligible DepEd personnel under DO 002, s. 2026; up to five days per calendar year, maximum three consecutive days at a time, including adjacent approved entries.', 'File at least five days ahead except emergencies; approval and continuity of service arranged. Unused days cannot accumulate or be converted to cash. No diagnosis is required in remarks.'] },
  monetization: { paid: true, conditions: ['Non-teaching employee with eligible earned VL/SL; standard monetization totals 10-30 days and at most 30 days per year, retaining at least five regular VL days.', 'Required application and approving authority are on file. Protected leave is not monetizable; other statutory monetization schemes require a separate authorized computation.'] },
  cto: { paid: true, conditions: ['Employee is eligible for compensatory time off; classroom teachers without an eligible administrative designation cannot use CTO.', 'Overtime authority and actual service certified; use only unexpired grants, subject to approval and service requirements. Grants expire one year after grant.'] },
  terminal: { conditions: ['Retirement, resignation or other qualifying separation and clearance must be established.', 'Terminal leave requires a verified settlement of accumulated VL and SL, with the applicable conversion rules for teachers. Use an approved terminal-benefit computation; do not debit the full settlement from VL or VSC alone.'] },
}

export function leaveConditions(category) { return LEAVE_CONDITIONS[category]?.conditions || [] }

export function calendarDays(from, to) {
  const parse = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return NaN
    const time = Date.parse(`${value}T00:00:00Z`)
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN
  }
  return (parse(to) - parse(from)) / 86400000 + 1
}

function monthsLimit(from, months) {
  const date = new Date(`${from}T00:00:00Z`)
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + months)
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(day, last))
  return calendarDays(from, date.toISOString().slice(0, 10)) - 1
}

export function validateLeaveConditions(form, employee, { requireConfirmation = false } = {}) {
  const category = form.leave_category
  const rule = LEAVE_CONDITIONS[category]
  if (!rule) return 'Select a recognized leave type.'
  const teaching = employee?.emp_type === 'Teaching'
  const types = teaching ? LEAVE_TYPES_TEACHING : LEAVE_TYPES_NONTEACHING
  const type = types.find(item => item.key === category)
  if (!type || (category === 'cto' && !isCtoEligible(employee))) return 'This leave type is not available for this employee.'
  const days = Number(form.days)
  if (!Number.isFinite(days) || days <= 0 || days * 2 !== Math.round(days * 2)) return 'Enter a positive number of days in half-day increments.'
  const end = form.date_to || form.date_from
  const span = calendarDays(form.date_from, end)
  if (!Number.isFinite(span) || span < 1) return 'Enter valid start and end dates in chronological order.'
  const credit = ['CTO_CREDIT', 'VSC_CREDIT'].includes(form.txn_type)
  if (!credit && category !== 'monetization' && category !== 'terminal' && days > span) return 'Leave days cannot exceed the inclusive date range. Enter the end date for a multi-day leave.'
  if (category === 'terminal') return 'Terminal leave needs a separate verified VL/SL settlement. This ordinary leave form cannot safely record a terminal-benefit payout.'
  if (category === 'special_privilege' && teaching) return 'Special Privilege Leave is not available to teachers on teachers leave basis.'
  if (rule.paid && form.with_pay === false) return 'This statutory benefit is paid. Record any approved unpaid extension separately.'
  if (rule.maxDays && days > rule.maxDays) return `This leave permits at most ${rule.maxDays} day(s) per entry. Check previous usage for the same entitlement.`
  if (rule.maxMonths && (span > monthsLimit(form.date_from, rule.maxMonths) || days > monthsLimit(form.date_from, rule.maxMonths))) return `The approved period cannot exceed ${rule.maxMonths} calendar month(s).`
  if (category === 'study' && !teaching && span > monthsLimit(form.date_from, (form.study_purpose === 'masters' || form.remarks?.includes('Study purpose: masters.')) ? 4 : 6)) return 'Non-teaching study leave exceeds the permitted period for the selected purpose.'
  if (category === 'maternity' && (!MATERNITY_OPTIONS.some(option => option.days === days) || maternityEndDate(form.date_from, days) !== end)) return 'Select the applicable maternity entitlement and its complete calendar-date period.'
  if (rule.annual) {
    if (form.date_from.slice(0, 4) !== end.slice(0, 4)) return 'Record annual leave entitlements separately for each calendar year.'
    const used = annualLeaveUsed(employee, type.label, new Date(`${form.date_from}T00:00:00`))
    if (used + days > rule.annual) return `Only ${Math.max(0, rule.annual - used)} day(s) remain for this calendar year.`
  }
  if (category === 'monetization') {
    const parts = /^VL(\d+)SL(\d+)$/.exec(form.monetization_option || '')
    const vl = form.monetization_vl ?? (parts ? Number(parts[1]) : NaN)
    const sl = form.monetization_sl ?? (parts ? Number(parts[2]) : NaN)
    if (!Number.isFinite(vl) || !Number.isFinite(sl) || vl + sl !== days) return 'Monetization days must match the VL and SL portions.'
    const result = monetizationEligibility(employee, vl, sl, new Date(`${form.date_from}T00:00:00`))
    if (!result.eligible) return result.reason
  }
  if (!credit) {
    if (['vacation', 'mandatory_forced'].includes(category) && days > vlBalance(employee)) return 'Insufficient vacation leave balance. Record any approved unpaid absence separately.'
    if (category === 'sick' && days > slBalance(employee)) return 'Insufficient sick leave balance. Record any approved alternative credit treatment separately.'
    if (category === 'vsc' && days > vscBalance(employee)) return 'Insufficient VSC balance.'
    if (category === 'cto' && days > ctoBalance(employee)) return 'Insufficient unexpired CTO balance.'
    if (['vacation', 'mandatory_forced', 'sick', 'vsc'].includes(category) && form.with_pay === false) return 'This entry deducts earned credits. Do not label it unpaid; approved LWOP must be recorded separately.'
  }
  if (requireConfirmation && !form.conditions_confirmed) return 'Confirm the eligibility and documentary conditions before continuing.'
  if (requireConfirmation && ['study', 'indefinite_sick', 'adoption'].includes(category) && !form.condition_reference?.trim()) return 'Enter the reference for the approved duration and pay treatment.'
  if (requireConfirmation && ((category === 'vawc' && days > 10) || (category === 'special_emergency' && annualLeaveUsed(employee, type.label, new Date(`${form.date_from}T00:00:00`)) + days > 5)) && !form.condition_reference?.trim()) return 'Enter the authority reference for this extended leave.'
  return ''
}

export function conditionRemarks(form) {
  const lines = [form.remarks?.trim(), form.leave_category === 'study' && `Study purpose: ${form.study_purpose || 'examination'}.`, `Eligibility and documentary conditions reviewed: ${form.leave_category}.`, form.condition_reference?.trim() && `Leave authority reference: ${form.condition_reference.trim()}`]
  return lines.filter(Boolean).join('\n')
}
