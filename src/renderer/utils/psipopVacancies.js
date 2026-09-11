export function mergeVacancies(seed, latest, employees, excluded) {
  const items = new Map(seed.map(item => [item.item_number, { ...item, vacant: true }]))
  for (const item of latest) items.set(item.item_number, item)
  const occupied = new Set(employees.filter(e => e.is_active !== false).map(e => e.item_number))
  return [...items.values()].filter(item => item.vacant && !occupied.has(item.item_number) && !excluded.has(item.item_number))
}
