import test from 'node:test'
import assert from 'node:assert/strict'
import { maternityEndDate, updateMaternityForm } from './maternityLeave.js'

test('maternity dates include the first day, weekends and leap day', () => {
  assert.equal(maternityEndDate('2024-02-01', 60), '2024-03-31')
  assert.equal(maternityEndDate('2026-01-01', 105), '2026-04-15')
  assert.equal(maternityEndDate('2026-01-01', 120), '2026-04-30')
  assert.equal(maternityEndDate('2026-01-01', 90), '')
})

test('selecting maternity resets previous leave duration and recomputes on changes', () => {
  const form = updateMaternityForm({ days: 2, date_from: '2026-01-01', with_pay: false }, 'leave_category', 'maternity')
  assert.equal(form.days, 105)
  assert.equal(form.with_pay, true)
  assert.equal(form.date_to, '2026-04-15')
  assert.equal(updateMaternityForm(form, 'days', 120).date_to, '2026-04-30')
  assert.equal(updateMaternityForm(form, 'date_from', '').date_to, '')
})
