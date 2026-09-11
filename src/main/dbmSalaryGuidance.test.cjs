const test = require('node:test')
const assert = require('node:assert/strict')
const { findNewerDbmSalaryGuidance } = require('./dbmSalaryGuidance.cjs')

test('detects a newer DBM salary schedule circular', () => {
  const html = `
    <article>National Budget Circular No. 601 - Implementation of the Third Tranche of the Updated Salary Schedule</article>
    <article>National Budget Circular No. 605 - Unrelated budget guidance</article>
    <article>National Budget Circular No. 607 - Implementation of the Fourth Tranche of the Updated Salary Schedule</article>
  `
  assert.deepEqual(findNewerDbmSalaryGuidance(html), { circular: 607, tranche: 'Fourth' })
})

test('does not flag the currently bundled DBM circular', () => {
  const html = '<article>National Budget Circular No. 601 - Implementation of the Third Tranche of the Updated Salary Schedule</article>'
  assert.equal(findNewerDbmSalaryGuidance(html), null)
})

test('detects a new salary standardization issuance even without a tranche phrase', () => {
  const html = `
    <article>National Budget Circular No. 601 - Implementation of the Third Tranche of the Updated Salary Schedule</article>
    <article>National Budget Circular No. 610 - Implementing Guidelines for Salary Standardization Law VII</article>
  `
  assert.deepEqual(findNewerDbmSalaryGuidance(html), { circular: 610, tranche: null })
})
