// Appointment-only display rules; personnel records are not modified.
const credentials = { edd: 'EdD', phd: 'PhD', ceso: 'CESO', cese: 'CESE', ii: 'II', iii: 'III', iv: 'IV', vi: 'VI', vii: 'VII', viii: 'VIII', ix: 'IX' }

export function appointmentInputName(value = '') {
  return value.replace(/\p{L}+/gu, word => credentials[word.toLowerCase()] || word[0].toUpperCase() + word.slice(1).toLowerCase())
}

export function appointmentPrintedName(value = '') {
  const [name, ...suffixes] = value.trim().split(',')
  return [name.toUpperCase(), ...suffixes.map(suffix => appointmentInputName(suffix.trim()))].join(', ')
}
