export function toCsv(rows, columns) {
  const escape = (val) => {
    const str = val === null || val === undefined ? '' : String(val)
    return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
  }
  const header = columns.map(c => escape(c.label)).join(',')
  const lines = rows.map(row => columns.map(c => escape(row[c.key])).join(','))
  return [header, ...lines].join('\r\n')
}

// Minimal RFC 4180 parser — handles quoted fields, escaped quotes, and
// CRLF/LF line endings. Returns an array of objects keyed by header row.
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  function pushField() { row.push(field); field = '' }
  function pushRow() { pushField(); rows.push(row); row = [] }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      pushField()
    } else if (ch === '\r') {
      // ignore — paired \n (if any) triggers the row push
    } else if (ch === '\n') {
      pushRow()
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length) pushRow()
  if (!rows.length) return []

  const header = rows[0].map(h => h.trim())
  return rows.slice(1)
    .filter(r => r.some(cell => cell !== ''))
    .map(r => Object.fromEntries(header.map((h, idx) => [h, (r[idx] ?? '').trim()])))
}
