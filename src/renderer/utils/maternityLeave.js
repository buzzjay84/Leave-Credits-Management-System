export const MATERNITY_OPTIONS = [
  { days: 105, label: '105 days - Live childbirth' },
  { days: 120, label: '120 days - Live childbirth, qualified solo parent' },
  { days: 60, label: '60 days - Miscarriage / emergency termination of pregnancy' },
]

export function maternityEndDate(start, days) {
  if (!start || !MATERNITY_OPTIONS.some(option => option.days === Number(days))) return ''
  const date = new Date(`${start}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return ''
  date.setUTCDate(date.getUTCDate() + Number(days) - 1)
  return date.toISOString().slice(0, 10)
}

export function updateMaternityForm(current, field, value) {
  const next = { ...current, [field]: value }
  if (!['conditions_confirmed', 'remarks', 'reason', 'approved_by', 'order_no'].includes(field)) next.conditions_confirmed = false
  if (field === 'leave_category') {
    next.condition_reference = ''
    next.study_purpose = 'examination'
    next.with_pay = true
  }
  if (next.leave_category === 'maternity') {
    if (field === 'leave_category') next.days = 105
    next.with_pay = true
    next.date_to = maternityEndDate(next.date_from, next.days)
  }
  return next
}
