const normalize = value => String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase()

// Only applied PSIPOP changes signal readiness; salary-only updates do not.
export function appointmentReadyChange(employee) {
  const entries = Array.isArray(employee.psipop_history) ? employee.psipop_history : []
  const relevant = entries.filter(entry => entry.changes?.some(change =>
    ['position', 'item_number'].includes(change.field)
      && normalize(change.before) !== normalize(change.after)))
    .sort((a, b) => String(b.recorded_at || '').localeCompare(String(a.recorded_at || '')))
  const latest = relevant[0]
  if (!latest) return null
  // Do not offer obsolete paperwork after another roster edit.
  const matches = latest.changes.filter(change => ['position', 'item_number'].includes(change.field))
    .every(change => normalize(employee[change.field]) === normalize(change.after))
  return matches ? latest : null
}
