import { supabase } from './supabase'

export function itemUpdates(records, effectiveDate) {
  const counts = new Map()
  for (const r of records) counts.set(r.item_number, (counts.get(r.item_number) || 0) + 1)
  return records.filter(r => r.item_number && counts.get(r.item_number) === 1 && r.position_raw && r.salary_grade && !r.unparsed_rest && (r.vacant === true || r.vacant === 'true' || r.name)).map(r => ({
    item_number: r.item_number, position: r.position_raw, salary_grade: String(r.salary_grade), office: r.office || null,
    vacant: r.vacant === true || r.vacant === 'true', source_file: r.file, effective_date: effectiveDate, updated_at: new Date().toISOString()
  }))
}
export async function listPsipopItems() {
  const rows = []
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase.from('leave_psipop_items').select('*').order('item_number').range(start, start + 999)
    if (error) throw error
    rows.push(...data)
    if (data.length < 1000) return rows
  }
}
export async function savePsipopItems(items) {
  for (let start = 0; start < items.length; start += 200) {
    const { error } = await supabase.from('leave_psipop_items').upsert(items.slice(start, start + 200), { onConflict: 'item_number' })
    if (error) throw error
  }
}
export { mergeVacancies } from './psipopVacancies.js'
