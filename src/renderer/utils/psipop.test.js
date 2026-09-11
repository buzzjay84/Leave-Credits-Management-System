import test from 'node:test'
import assert from 'node:assert/strict'
import { comparePsipop, draftEmployeeFromPsipopRecord, historyUpdate, sourceDate } from './psipop.js'
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
test('a PSIPOP row with no roster match drafts a new-personnel form instead of being lost', () => {
  const noMatch = { name: 'ARANZA, ANNA LUNA', tin: '730-581-115', item_number: 'TCH1-570091-2026',
    position_raw: 'TEACHER I', salary_grade: '11', step: '1', actual_salary: '274,164',
    appointment_date: '08/15/21', status_code: 'P', office: 'Badjao Floating Integrated School', file: 'psipop.pdf' }
  assert.equal(comparePsipop([noMatch], [employee])[0].status, 'Review')
  const draft = draftEmployeeFromPsipopRecord(noMatch)
  assert.equal(draft.last_name, 'Aranza')
  assert.equal(draft.first_name, 'Anna')
  assert.equal(draft.middle_name, 'Luna')
  assert.equal(draft.emp_type, 'Teaching')
  assert.equal(draft.position, 'Teacher I')
  assert.equal(draft.item_number, 'TCH1-570091-2026')
  assert.equal(draft.tin_number, '730581115')
  assert.equal(draft.salary_grade, '11')
  assert.equal(draft.emp_status, 'Permanent')
  assert.equal(draft.hired_date, '2021-08-15')
  assert.equal(draft.monthly_salary, 22847)
  assert.equal(draft.assigned_school_id, '126018')
})
test('draftEmployeeFromPsipopRecord tolerates missing or unparseable fields', () => {
  const draft = draftEmployeeFromPsipopRecord({ name: 'ONE, NAME', item_number: 'X', position_raw: 'NURSE II', file: 'a.pdf', appointment_date: 'not-a-date' })
  assert.equal(draft.emp_type, 'Non-Teaching')
  assert.equal(draft.hired_date, '')
  assert.equal(draft.salary_grade, '')
  assert.equal(draft.monthly_salary, '')
  assert.equal(draft.middle_name, '')
})
