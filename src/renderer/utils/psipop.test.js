import test from 'node:test'
import assert from 'node:assert/strict'
import { comparePsipop, historyUpdate, sourceDate } from './psipop.js'
const employee = { id: 'one', last_name: 'Dela Cruz', first_name: 'Ana', middle_name: 'Reyes', tin_number: '123456789', item_number: 'OLD', position: 'Teacher I', monthly_salary: 30000, vl_used: 5, employee_no: 'MANUAL' }
const record = { name: 'DELA CRUZ, ANA REYES', tin: '123-456-789-000', item_number: 'NEW', position_raw: 'TEACHER II', actual_salary: '420,000', file: 'new.pdf' }
test('matches promotion by TIN and preserves unrelated roster fields', () => {
  const row = comparePsipop([record], [employee])[0]
  assert.equal(row.status, 'Changed')
  assert.equal(row.updates.item_number, 'NEW')
  assert.equal(row.updates.monthly_salary, 35000)
  assert.equal(row.updates.vl_used, undefined)
  assert.equal(row.updates.employee_no, undefined)
})
test('same item number cannot replace a different person', () => {
  assert.equal(comparePsipop([{ ...record, tin: '987654321', name: 'OTHER, PERSON', item_number: 'OLD' }], [employee])[0].status, 'Review')
})
test('duplicate source matches are all held for review', () => {
  assert.ok(comparePsipop([record, record], [employee]).every(row => row.status === 'Review'))
})
test('repeat import is unchanged and history records old values', () => {
  const row = comparePsipop([record], [employee])[0]
  const update = historyUpdate(row, '2026-09-01', 'admin', 'batch')
  assert.equal(update.psipop_history[0].baseline.position, 'Teacher I')
  assert.equal(update.psipop_history[0].source_file, 'new.pdf')
  assert.equal(comparePsipop([record], [{ ...employee, ...update }])[0].status, 'Unchanged')
})
test('invalid salary and dates require review', () => {
  assert.equal(comparePsipop([{ ...record, step: 9 }], [employee])[0].status, 'Review')
  assert.throws(() => sourceDate('2026-02-30'))
})
test('vacant and unreadable rows do not change personnel', () => {
  assert.equal(comparePsipop([{ vacant: true, item_number: 'X' }], [employee])[0].status, 'Vacant')
  assert.equal(comparePsipop([{ item_number: 'X', unparsed_rest: 'broken' }], [employee])[0].status, 'Review')
})
test('TIN match with different name requires explicit admin reconciliation', () => {
  const mismatch = { ...record, name: 'DELA CRUZ, ANNA REYES' }
  const review = comparePsipop([mismatch], [employee])[0]
  assert.equal(review.status, 'Review')
  assert.equal(review.possibleMatches[0].id, employee.id)
  const resolved = comparePsipop([mismatch], [employee], { 0: { employeeId: 'one', adoptName: true } })[0]
  assert.equal(resolved.status, 'Changed')
  assert.equal(resolved.updates.first_name, 'ANNA')
  assert.equal(resolved.changes.find(c => c.field === 'first_name').before, 'Ana')
})
