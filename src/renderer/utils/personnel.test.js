import test from 'node:test'
import assert from 'node:assert/strict'
import { employeeNumber, employeeTin, formatTin, formatTinInput, normalizeTin, personnelFullName, personnelLeadershipPriority, resolveSchoolHeadId, resolveSchoolHeadIds } from './personnel.js'

test('formats a PSIPOP TIN without its trailing branch code', () => {
  assert.equal(formatTin('950882949000'), '950-882-949')
  assert.equal(formatTin('950-882-949'), '950-882-949')
  assert.equal(normalizeTin('950882949000'), '950882949')
  assert.equal(normalizeTin('950-882-949'), '950882949')
  assert.equal(formatTin('N/A'), '—')
})

test('formats TIN progressively during input', () => {
  assert.equal(formatTinInput('9508'), '950-8')
  assert.equal(formatTinInput('950882949'), '950-882-949')
  assert.equal(formatTinInput('950882949000'), '950-882-949')
})

test('separates a legacy PSIPOP TIN from employee number', () => {
  const employee = { employee_no: '921731907000', tin_number: null }
  assert.equal(employeeNumber(employee), '')
  assert.equal(employeeTin(employee), '921731907')
  assert.equal(formatTin(employeeTin(employee)), '921-731-907')
  assert.equal(employeeNumber({ employee_no: '6450497' }), '6450497')
})

test('formats a complete personnel name', () => {
  assert.equal(personnelFullName({ last_name: 'Bazan', first_name: 'Jonybhee', middle_name: 'Alabat' }), 'Bazan, Jonybhee Alabat')
})

test('prioritizes school and division leaders correctly', () => {
  assert.equal(personnelLeadershipPriority('School Principal I', false, true), 0)
  assert.equal(personnelLeadershipPriority('School Principal I', false, false), 1)
  assert.equal(personnelLeadershipPriority('Assistant Principal I'), 1)
  assert.equal(personnelLeadershipPriority('Head Teacher VI'), 2)
  assert.equal(personnelLeadershipPriority('Schools Division Superintendent', true), 0)
  assert.equal(personnelLeadershipPriority('Assistant Schools Division Superintendent', true), 1)
  assert.equal(personnelLeadershipPriority('Administrative Officer V', true), 2)
})

test('resolves the most senior Principal as school head when several are on the roster', () => {
  const p2 = { id: 'p2', position: 'Principal II' }
  const p3 = { id: 'p3', position: 'Principal III' }
  const teacher = { id: 't1', position: 'Teacher I' }
  assert.equal(resolveSchoolHeadId([p2, p3, teacher]), 'p3')
})

test('an Assistant Principal automatically becomes head when the school has no Principal', () => {
  const ap1 = { id: 'ap1', position: 'Assistant Principal I' }
  const teacher = { id: 't1', position: 'Teacher I' }
  assert.equal(resolveSchoolHeadId([ap1, teacher]), 'ap1')
})

test('an explicit school_head_designate flag still overrides Principal seniority', () => {
  const p2 = { id: 'p2', position: 'Principal II' }
  const designated = { id: 'ht1', position: 'Head Teacher III', school_head_designate: true }
  assert.equal(resolveSchoolHeadId([p2, designated]), 'ht1')
})

test('resolveSchoolHeadId ignores inactive personnel and returns null with no leadership candidates', () => {
  const separatedPrincipal = { id: 'p1', position: 'Principal I', is_active: false }
  const teacher = { id: 't1', position: 'Teacher I' }
  assert.equal(resolveSchoolHeadId([separatedPrincipal, teacher]), null)
})

test('resolveSchoolHeadIds resolves one head per school without cross-school ties', () => {
  const schoolA = [{ id: 'a-p1', position: 'Principal I', school_id: 'A' }, { id: 'a-ap1', position: 'Assistant Principal I', school_id: 'A' }]
  const schoolB = [{ id: 'b-ap2', position: 'Assistant Principal II', school_id: 'B' }]
  const heads = resolveSchoolHeadIds([...schoolA, ...schoolB])
  assert.equal(heads.has('a-p1'), true)
  assert.equal(heads.has('b-ap2'), true)
  assert.equal(heads.size, 2)
})
