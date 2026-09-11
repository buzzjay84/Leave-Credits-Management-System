// Philippine legal/CSC-document style number-to-words, e.g. 31705 -> "THIRTY-ONE
// THOUSAND SEVEN HUNDRED FIVE". Used to spell out the compensation rate on the
// CS Form 33-B appointment paper, matching how DepEd Isabela City types it.

const ONES = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
  'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN']
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY']
const SCALES = ['', ' THOUSAND', ' MILLION', ' BILLION']

function threeDigitsToWords(n) {
  const hundreds = Math.floor(n / 100)
  const remainder = n % 100
  const parts = []
  if (hundreds) parts.push(`${ONES[hundreds]} HUNDRED`)
  if (remainder) {
    if (remainder < 20) parts.push(ONES[remainder])
    else {
      const tens = TENS[Math.floor(remainder / 10)]
      const ones = remainder % 10
      parts.push(ones ? `${tens}-${ONES[ones]}` : tens)
    }
  }
  return parts.join(' ')
}

// Whole numbers only (0 to 999,999,999,999). Returns '' for 0.
export function numberToWords(value) {
  let n = Math.floor(Math.abs(Number(value) || 0))
  if (n === 0) return 'ZERO'
  const groups = []
  let scale = 0
  while (n > 0) {
    const group = n % 1000
    if (group) groups.unshift(threeDigitsToWords(group) + SCALES[scale])
    n = Math.floor(n / 1000)
    scale += 1
  }
  return groups.join(' ')
}

// Government-document style peso amount in words, e.g. 31705 -> "THIRTY-ONE
// THOUSAND SEVEN HUNDRED FIVE PESOS", 1500.50 -> "ONE THOUSAND FIVE HUNDRED
// PESOS AND 50/100".
export function pesoAmountInWords(amount) {
  const value = Number(amount)
  if (!Number.isFinite(value)) return ''
  const pesos = Math.floor(Math.abs(value))
  const centavos = Math.round((Math.abs(value) - pesos) * 100)
  const pesosWords = `${numberToWords(pesos)} PESOS`
  return centavos ? `${pesosWords} AND ${String(centavos).padStart(2, '0')}/100` : pesosWords
}
