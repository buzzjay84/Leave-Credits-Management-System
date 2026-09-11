import test from 'node:test'
import assert from 'node:assert/strict'

import {
  generateAccrualLog,
  LEAVE_TYPES_NONTEACHING,
  LEAVE_TYPES_TEACHING,
  monthsOfService,
  POSITIONS_NONTEACHING,
  POSITIONS_TEACHING,
  requiresForcedLeave,
  slBalance,
  vlBalance,
  vscBalance,
  yearsOfService,
} from './leaveCalc.js'

import { annualLeaveRemaining, ctoBalance, ctoExpiryWarnings, leaveAvailability, mandatoryLeaveCompliance, monetizationEligibility, protectedVlBalance, retirementLeaveMonths } from './leaveCalc.js'

test('calculates non-teaching balances using database field names', () => {
  const employee = {
    emp_type: 'Non-Teaching',
    hired_date: '2025-01-15',
    vl_used: 2,
    sl_used: 1,
  }

  assert.equal(vlBalance(employee, new Date('2026-01-15')), 13)
  assert.equal(slBalance(employee, new Date('2026-01-15')), 14)
  assert.equal(requiresForcedLeave(employee), true)
})

test('reads teaching VSC balances using the database employee type', () => {
  assert.equal(vscBalance({ emp_type: 'Teaching', vsc_balance: 12.5 }), 12.5)
})

test('protected mandatory-leave credits are usable but excluded from monetization', () => {
  const employee = { emp_type: 'Non-Teaching', hired_date: '2020-01-01', vl_override: 25, sl_override: 5, protected_vl_balance: 22 }
  assert.equal(protectedVlBalance(employee), 22)
  assert.equal(vlBalance(employee), 47)
  assert.equal(retirementLeaveMonths(employee), 1)
  assert.equal(monetizationEligibility(employee, 20, 0).eligible, true)
  assert.equal(monetizationEligibility(employee, 25, 5).eligible, false)
})

test('CTO excludes expired grants and warns within 14 days', () => {
  const employee = { cto_credits: [
    { remaining_days: 2, expires_on: '2026-03-01' },
    { remaining_days: 3, expires_on: '2026-04-29' },
    { remaining_days: 4, expires_on: '2027-01-01' },
  ] }
  const ref = new Date('2026-04-15T00:00:00')
  assert.equal(ctoBalance(employee, ref), 7)
  assert.equal(ctoExpiryWarnings(employee, ref).length, 1)
})

test('uses hired_date when generating accrual history', () => {
  const log = generateAccrualLog({ emp_type: 'Non-Teaching', hired_date: '2999-01-01' }, 1)
  assert.equal(log[0].vl, 0)
  assert.equal(log[0].sl, 0)
})

test('generates accrual history for a selected calendar year', () => {
  const log = generateAccrualLog(
    { emp_type: 'Non-Teaching', hired_date: '2020-01-01' },
    12,
    new Date(2025, 11, 1),
  )
  assert.equal(log.length, 12)
  assert.equal(log[0].month, 'January 2025')
  assert.equal(log[11].month, 'December 2025')
})

test('handles invalid dates without returning NaN', () => {
  assert.equal(monthsOfService('', new Date('2026-01-01')), 0)
  assert.equal(yearsOfService('', new Date('2026-01-01')), 0)
  assert.equal(yearsOfService('2020-01-15', new Date('2026-01-14')), 5)
  assert.equal(yearsOfService('2020-01-15', new Date('2026-01-15')), 6)
})

test('includes Wellness Leave for teaching and non-teaching personnel', () => {
  assert.ok(LEAVE_TYPES_TEACHING.some(type => type.key === 'wellness'))
  assert.ok(LEAVE_TYPES_NONTEACHING.some(type => type.key === 'wellness'))
})

test('tracks annual non-teaching special leave entitlements outside VL and SL', () => {
  const employee = {
    emp_type: 'Non-Teaching',
    leave_transactions: [
      { leave_type: 'Special Privilege Leave', days: 1, date_from: '2026-03-01' },
      { leave_type: 'Special Privilege Leave', days: 3, date_from: '2025-03-01' },
      { leave_type: 'Wellness Leave', days: 2, date_from: '2026-06-01' },
    ]
  }
  const privilege = LEAVE_TYPES_NONTEACHING.find(type => type.key === 'special_privilege')
  const wellness = LEAVE_TYPES_NONTEACHING.find(type => type.key === 'wellness')
  assert.equal(leaveAvailability(privilege, employee, new Date('2026-09-01')).remaining, 2)
  assert.equal(annualLeaveRemaining(employee, wellness.label, wellness.annualEntitlement, new Date('2026-09-01')), 3)
})

test('counts ordinary VL, authority cancellations, forfeiture, and monetization in mandatory compliance history', () => {
  const employee = {
    emp_type: 'Non-Teaching',
    vl_override: 20,
    protected_vl_balance: 2,
    leave_transactions: [
      { txn_type: 'VL_DEBIT', leave_type: 'Vacation Leave (VL)', days: -2, date_from: '2026-02-01' },
      { txn_type: 'VL_DEBIT', leave_type: 'Mandatory / Forced Leave', days: -2, date_from: '2026-04-01' },
      { txn_type: 'VL_CANCELLATION_CREDIT', leave_type: 'Authority-Cancelled Mandatory Leave (VL Restored)', days: 2, date_from: '2026-04-01' },
      { txn_type: 'MONETIZE', leave_type: 'Monetization of Leave Credits', days: -30, date_from: '2026-06-01' },
      { txn_type: 'MANDATORY_FORFEIT', leave_type: 'Mandatory Leave Year-End Forfeiture', days: -1, date_from: '2026-12-31' },
    ]
  }
  const compliance = mandatoryLeaveCompliance(employee, new Date('2026-12-31'))
  assert.equal(compliance.used, 2)
  assert.equal(compliance.authorityCancelled, 2)
  assert.equal(compliance.forfeited, 1)
  assert.equal(compliance.monetized, 30)
  assert.equal(compliance.remaining, 0)
})

test('documents retirement year as exempt from mandatory forfeiture', () => {
  const compliance = mandatoryLeaveCompliance({
    emp_type: 'Non-Teaching', vl_override: 20, retirement_date: '2026-08-01', leave_transactions: []
  }, new Date('2026-12-31'))
  assert.equal(compliance.retirementExempt, true)
  assert.equal(compliance.remaining, 0)
})

test('includes the configured teaching and non-teaching positions', () => {
  for (const position of [
    'Information Technology Officer III',
    'Public Schools Division Supervisor', 'Project Development Officer II',
    'Medical Officer III',
    'Engineer III',
    'Nurse II', 'Dentist II', 'Librarian III',
  ]) {
    assert.ok(POSITIONS_NONTEACHING.includes(position), `${position} is missing`)
  }
  assert.ok(POSITIONS_NONTEACHING.includes('Accountant III'))
  for (const position of ['Teacher VII', 'Head Teacher VI', 'Master Teacher V']) {
    assert.ok(POSITIONS_TEACHING.includes(position), `${position} is missing`)
  }
})

test('classifies principals as non-teaching and classroom/head teachers as teaching', () => {
  for (const position of ['Principal I', 'Principal IV', 'Assistant Principal I']) {
    assert.ok(POSITIONS_NONTEACHING.includes(position))
    assert.ok(!POSITIONS_TEACHING.includes(position))
  }
  for (const position of ['Teacher I', 'Special Education Teacher I', 'Head Teacher VI']) {
    assert.ok(POSITIONS_TEACHING.includes(position))
  }
})
