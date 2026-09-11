import test from 'node:test'
import assert from 'node:assert/strict'
import { LEAVE_TYPES_NONTEACHING, LEAVE_TYPES_TEACHING } from './leaveCalc.js'
import { LEAVE_CONDITIONS, validateLeaveConditions, calendarDays, conditionRemarks } from './leaveConditions.js'
import { updateMaternityForm } from './maternityLeave.js'

const employee = { emp_type: 'Non-Teaching', hired_date: '2010-01-01', vl_override: 30, sl_override: 30, leave_transactions: [] }
const form = (category, overrides = {}) => ({ leave_category: category, days: 1, date_from: '2026-09-01', date_to: '2026-09-01', with_pay: true, conditions_confirmed: true, ...overrides })
const check = (input, emp = employee) => validateLeaveConditions(input, emp, { requireConfirmation: true })

test('every offered leave has a documentary checklist', () => {
  for (const type of [...LEAVE_TYPES_NONTEACHING, ...LEAVE_TYPES_TEACHING]) assert.ok(LEAVE_CONDITIONS[type.key]?.conditions.length, type.key)
})

test('validates dates and half-day amounts without silently rolling invalid dates', () => {
  assert.ok(Number.isNaN(calendarDays('2026-02-30', '2026-03-02')))
  assert.match(check(form('vacation', { days: Infinity })), /positive/)
  assert.match(check(form('vacation', { days: 0.2 })), /half-day/)
  assert.match(check(form('vacation', { days: 2 })), /date range/)
  assert.match(check(form('vacation', { date_to: '2026-08-31' })), /chronological/)
  assert.equal(check(form('vacation', { days: 0.5 })), '')
})

test('checks balances, employee type, and refuses unpaid credit deductions', () => {
  assert.match(check(form('sick'), { ...employee, sl_override: 0 }), /Insufficient sick/)
  assert.match(check(form('vacation'), { ...employee, vl_override: 0 }), /Insufficient vacation/)
  assert.match(check(form('sick', { with_pay: false })), /unpaid/)
  assert.match(check(form('special_privilege'), { emp_type: 'Teaching' }), /not available/)
  assert.match(check(form('cto'), { emp_type: 'Teaching', position: 'Teacher I' }), /not available/)
  assert.match(check(form('vsc'), { emp_type: 'Teaching', vsc_balance: 0 }), /Insufficient VSC/)
})

test('annual caps apply to both personnel groups and reset by leave year', () => {
  const used = { ...employee, leave_transactions: [{ leave_type: 'Solo Parent Leave', days: -7, date_from: '2026-01-01' }] }
  assert.match(check(form('solo_parent'), used), /Only 0/)
  assert.equal(check(form('solo_parent', { date_from: '2027-01-01', date_to: '2027-01-01' }), used), '')
  assert.match(check(form('wellness', { date_from: '2026-12-31', date_to: '2027-01-01', days: 2 })), /separately/)
  assert.match(check(form('wellness', { days: 4, date_to: '2026-09-04' })), /at most 3/)
  const teacher = { emp_type: 'Teaching', leave_transactions: [{ leave_type: 'Wellness Leave', days: -4, date_from: '2026-01-01' }] }
  assert.equal(check(form('wellness'), teacher), '')
  assert.match(check(form('wellness', { days: 2, date_to: '2026-09-02' }), teacher), /Only 1/)
})

test('maternity and paternity validate limits, dates, and full pay', () => {
  assert.equal(check(form('maternity', { days: 105, date_from: '2026-01-01', date_to: '2026-04-15' })), '')
  assert.match(check(form('maternity', { days: 90, date_from: '2026-01-01', date_to: '2026-04-15' })), /maternity/)
  assert.match(check(form('maternity', { days: 105, date_from: '2026-01-01', date_to: '2026-04-16' })), /maternity/)
  assert.match(check(form('paternity', { days: 8, date_to: '2026-09-08' })), /at most 7/)
  assert.match(check(form('maternity', { with_pay: false })), /paid/)
})

test('calendar-month caps account for varying month lengths', () => {
  assert.equal(check(form('rehabilitation', { days: 181, date_from: '2026-01-01', date_to: '2026-06-30' })), '')
  assert.match(check(form('rehabilitation', { days: 182, date_from: '2026-01-01', date_to: '2026-07-01' })), /6 calendar/)
  assert.match(check(form('special_leave_women', { days: 60, date_from: '2026-01-01', date_to: '2026-03-01' })), /2 calendar/)
})

test('requires documented review and specific authority for discretionary durations', () => {
  assert.match(check(form('vacation', { conditions_confirmed: false })), /Confirm/)
  for (const category of ['study', 'adoption', 'indefinite_sick']) {
    const emp = category === 'indefinite_sick' ? { emp_type: 'Teaching' } : employee
    assert.match(check(form(category), emp), /reference/)
    assert.equal(check(form(category, { condition_reference: 'Approved order 123' }), emp), '')
  }
  assert.match(check(form('vawc', { days: 11, date_to: '2026-09-11' })), /authority reference/)
  assert.equal(check(form('vawc', { days: 11, date_to: '2026-09-11', condition_reference: 'Court authority 123' })), '')
  assert.match(check(form('special_emergency', { days: 6, date_to: '2026-09-06' })), /authority reference/)
  assert.match(check(form('terminal')), /settlement/)
})

test('masters duration survives request storage in remarks', () => {
  const input = form('study', { study_purpose: 'masters', days: 130, date_from: '2026-01-01', date_to: '2026-05-10', condition_reference: 'Order 123' })
  assert.match(check(input), /study leave exceeds/)
  const stored = { ...input, study_purpose: undefined, remarks: conditionRemarks(input) }
  assert.match(validateLeaveConditions(stored, employee), /study leave exceeds/)
})

test('editing material details invalidates documentary confirmation', () => {
  const input = form('paternity')
  assert.equal(updateMaternityForm(input, 'days', 2).conditions_confirmed, false)
  assert.equal(updateMaternityForm(input, 'date_from', '2026-09-02').conditions_confirmed, false)
  assert.equal(updateMaternityForm(input, 'leave_category', 'solo_parent').conditions_confirmed, false)
})
