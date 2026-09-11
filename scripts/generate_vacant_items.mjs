import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(scriptDir, '..')
const parsed = JSON.parse(readFileSync(path.join(scriptDir, 'psipop_parsed.json'), 'utf8'))
const vacancies = parsed.records
  .filter(record => record.vacant && record.item_number)
  .map(record => ({
    item_number: record.item_number,
    position: record.position_raw || null,
    salary_grade: record.salary_grade || null,
    office: record.office || null,
    source_file: record.file || null,
  }))
  .sort((a, b) => (a.office || '').localeCompare(b.office || '') || (a.position || '').localeCompare(b.position || '') || a.item_number.localeCompare(b.item_number))

const outputDir = path.join(projectRoot, 'src', 'renderer', 'data')
mkdirSync(outputDir, { recursive: true })
writeFileSync(path.join(outputDir, 'vacantItems.json'), `${JSON.stringify(vacancies, null, 2)}\n`, 'utf8')
console.log(`Generated ${vacancies.length} privacy-safe vacant PSIPOP items.`)
