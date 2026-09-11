import test from 'node:test'
import assert from 'node:assert/strict'
import { comparePsipop, historyUpdate } from './psipop.js'
import { appointmentReadyChange } from './appointmentReadiness.js'

const employee = { id: '1', last_name: 'Cruz', first_name: 'Ana', position: 'Teacher I', item_number: 'OLD' }
test('applied OSEC and reclassification changes signal appointment readiness', () => {
  const row = comparePsipop([{ name: 'CRUZ, ANA', item_number: 'NEW', position_raw: 'Teacher II' }], [employee])[0]
  assert.equal(appointmentReadyChange(employee), null)
  const updated = { ...employee, ...historyUpdate(row, '2026-09-11', 'admin', 'batch') }
  assert.ok(appointmentReadyChange(updated))
  assert.equal(appointmentReadyChange({ ...updated, item_number: 'LATER' }), null)
})
test('salary-only PSIPOP updates do not signal new appointments', () => {
  const row = comparePsipop([{ name: 'CRUZ, ANA', item_number: 'OLD', actual_salary: 420000 }], [employee])[0]
  assert.equal(appointmentReadyChange({ ...employee, ...historyUpdate(row, '2026-09-11', 'admin', 'batch') }), null)
})
test('later unrelated history does not hide an OSEC change', () => {
  const change = { recorded_at: '2026-09-10', changes: [{ field: 'item_number', before: 'OLD', after: 'NEW' }] }
  assert.equal(appointmentReadyChange({ ...employee, item_number: 'NEW', psipop_history: [change, { recorded_at: '2026-09-11', changes: [{ field: 'salary_step', before: 1, after: 2 }] }] }), change)
})
