import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePsipopLines } from './readPsipop.js'
import { mergeVacancies } from './psipopVacancies.js'
test('PDF lines parse filled and vacant PSIPOP positions', () => {
  const rows = parsePsipopLines([
    '0001.0001 SAMPLE SCHOOL',
    'OSEC-TCH1-123-2026 TEACHER I - 11 360,000 360,000 1 3552 A P 123456 DELA CRUZ, ANA REYES F 01/02/90 123456789000 06/01/20 06/01/23 P RA 1080',
    'OSEC-TCH1-124-2026 TEACHER I - 11 360,000 0 1 3552 A P 123456'
  ], 'source.pdf')
  assert.equal(rows.length, 2)
  assert.equal(rows[0].name, 'DELA CRUZ, ANA REYES')
  assert.equal(rows[0].salary_grade, '11')
  assert.equal(rows[1].vacant, true)
})
test('vacancy refresh adds new vacancies, removes filled items, preserves unrelated items and CTI exclusion', () => {
  const seed = [{ item_number: 'A' }, { item_number: 'B' }]
  const latest = [{ item_number: 'A', vacant: false }, { item_number: 'C', vacant: true }, { item_number: 'D', vacant: true }]
  assert.deepEqual(mergeVacancies(seed, latest, [], new Set(['D'])).map(i => i.item_number), ['B', 'C'])
  assert.deepEqual(mergeVacancies(seed, latest, [{ item_number: 'C' }], new Set(['D'])).map(i => i.item_number), ['B'])
})
