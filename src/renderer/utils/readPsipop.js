import { parseCsv } from './csv.js'

export function parsePsipopLines(lines, file) {
  const records = []
  let office = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const heading = line.match(/^\d{4}\.\d{4}\s+(.+)$/)
    if (heading) { office = heading[1]; continue }
    if (!/^[A-Z0-9][A-Z0-9-]*\d{4}(?:-\d{4})?\s/.test(line)) continue
    const match = line.match(/^(\S+)\s+(.+?)\s+(?:\([A-Z]{1,6}\)\s+)?([\d,]+)\s+([\d,]+)\s+(\d)\s*(\d{3,4})\s+[A-Z]\s+[A-Z]\s+\d{6,}\s*(.*)$/)
    if (!match) { records.push({ file, office, item_number: line.split(/\s/)[0], unparsed_rest: line }); continue }
    let [, item_number, position, auth_salary, actual_salary, step, , rest] = match
    let grade = position.match(/^(.+?)\s*-\s*(\d{1,2})$/)
    if (!grade) {
      const continuation = (lines[i + 1] || '').trim().match(/^(.*?)\s*-?\s*(\d{1,2})(?:\s+([A-ZÑ .'-]+))?$/)
      if (continuation) { position = `${position.replace(/-$/, '')} ${continuation[1]}`.trim(); grade = [null, position, continuation[2]]; i++; if (continuation[3]) rest += ` ${continuation[3]}` }
    }
    const person = rest.match(/^([A-ZÑ .'-]+,\s*[A-ZÑ .'-]+?)\s+([MF])\s+(\d{2}\/\d{2}\/\d{2})\s+([\dNA/.-]+)\s+(\d{2}\/\d{2}\/\d{2})\s+(\d{2}\/\d{2}\/\d{2})\s+(\S+)\s*(.*)$/)
    const record = { file, office, item_number, position_raw: grade?.[1], salary_grade: grade?.[2], auth_salary, actual_salary, step, vacant: !rest }
    if (person && grade) Object.assign(record, { name: person[1], sex: person[2], dob: person[3], tin: person[4], appointment_date: person[5], promotion_date: person[6], status_code: person[7], eligibility: person[8] })
    else if (rest) record.unparsed_rest = rest
    records.push(record)
  }
  return records
}

export async function readPsipop(file) {
  if (file.size > 50 * 1024 * 1024) throw new Error(`${file.name}: maximum file size is 50 MB.`)
  let records
  if (/\.json$/i.test(file.name)) { const parsed = JSON.parse(await file.text()); records = Array.isArray(parsed) ? parsed : parsed.records }
  else if (/\.csv$/i.test(file.name)) records = parseCsv(await file.text())
  else if (/\.pdf$/i.test(file.name)) {
    const pdfjs = await import('pdfjs-dist')
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise
    const lines = []
    try {
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p)
        const content = await page.getTextContent()
        const groups = []
        for (const item of content.items) {
          if (!item.str?.trim()) continue
          let group = groups.find(g => Math.abs(g.y - item.transform[5]) < 2)
          if (!group) { group = { y: item.transform[5], items: [] }; groups.push(group) }
          group.items.push(item)
        }
        lines.push(...groups.sort((a, b) => b.y - a.y).map(g => g.items.sort((a, b) => a.transform[4] - b.transform[4]).map(item => item.str).join(' ')))
      }
      records = parsePsipopLines(lines, file.name)
    } finally { await pdf.destroy() }
  } else throw new Error('Use a PSIPOP PDF, parsed JSON, or CSV file.')
  if (!Array.isArray(records) || !records.length) throw new Error(`${file.name}: no readable PSIPOP rows. Scanned PDFs need text recognition before uploading.`)
  if (records.some(r => !r || typeof r !== 'object')) throw new Error('Invalid PSIPOP records.')
  return records.map(record => ({ ...record, file: record.file || file.name }))
}
