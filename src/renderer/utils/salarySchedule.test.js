import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SALARY_GRADES,
  automaticSalaryStep,
  findSalaryStep,
  formatPeso,
  formatSalaryGrade,
  monthlySalaryFor,
  parseSalaryGrade,
  parseSalaryStep,
  salaryGradeForPosition,
  salaryStepsForGrade,
} from './salarySchedule.js'
import {
  POSITIONS_NONTEACHING_SCHOOL,
  POSITIONS_NONTEACHING_SDO,
  POSITIONS_TEACHING,
} from './leaveCalc.js'

test('contains the complete 2026 DBM NBC 601 salary schedule', () => {
  assert.equal(SALARY_GRADES.length, 33)
  assert.equal(monthlySalaryFor(1, 1), 14634)
  assert.equal(monthlySalaryFor(24, 8), 114301)
  assert.equal(monthlySalaryFor(32, 8), 408055)
  assert.equal(monthlySalaryFor(33, 2), 462329)
  assert.equal(monthlySalaryFor(33, 3), null)
})

test('parses legacy and step-aware salary grade values', () => {
  assert.equal(parseSalaryGrade('SG-11'), 11)
  assert.equal(parseSalaryGrade('11'), 11)
  assert.equal(parseSalaryStep('SG-11 Step 4'), 4)
  assert.equal(findSalaryStep(11, 32998), 6)
  assert.equal(formatSalaryGrade(11, 6), 'SG-11 Step 6')
  assert.deepEqual(salaryStepsForGrade(33), [1, 2])
})

test('maps every built-in personnel position to a salary grade', () => {
  const positions = [...new Set([
    ...POSITIONS_TEACHING,
    ...POSITIONS_NONTEACHING_SCHOOL,
    ...POSITIONS_NONTEACHING_SDO,
  ])]
  assert.deepEqual(positions.filter(position => !salaryGradeForPosition(position)), [])
  assert.equal(salaryGradeForPosition('Teacher I'), 11)
  assert.equal(salaryGradeForPosition('School Principal IV'), 22)
  assert.equal(salaryGradeForPosition('Schools Division Superintendent'), 26)
})

test('calculates one automatic step for every three completed years', () => {
  assert.equal(automaticSalaryStep('2023-09-03', '2026-09-02'), 1)
  assert.equal(automaticSalaryStep('2023-09-03', '2026-09-03'), 2)
  assert.equal(automaticSalaryStep('2014-09-03', '2026-09-03'), 5)
  assert.equal(automaticSalaryStep('1990-01-01', '2026-09-03'), 8)
  assert.equal(automaticSalaryStep('1990-01-01', '2026-09-03', 2), 2)
})

test('formats monthly salaries as Philippine pesos', () => {
  assert.match(formatPeso(31705), /₱31,705\.00/)
})
