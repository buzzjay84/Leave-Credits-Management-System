const DBM_SALARY_GUIDANCE_URL = 'https://www.dbm.gov.ph/index.php/dbm-issuances/national-budget-circulars'
const CURRENT_DBM_SALARY_CIRCULAR = 601

function findNewerDbmSalaryGuidance(html, currentCircular = CURRENT_DBM_SALARY_CIRCULAR) {
  const text = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
  const matches = text
    .split(/(?=National Budget Circular No\.?\s*\d+)/gi)
    .map(entry => {
      const circular = Number(entry.match(/^National Budget Circular No\.?\s*(\d+)/i)?.[1])
      if (!Number.isFinite(circular)) return null
      const releaseText = entry.slice(0, 1200)
      const isSalaryStandardization = /salary standardi[sz]ation|(?:updated|modified|monthly) salary schedule|salary adjustment[\s\S]{0,160}civilian government personnel/i.test(releaseText)
      if (!isSalaryStandardization) return null
      const tranche = releaseText.match(/(?:the\s+)?([A-Za-z0-9-]+) Tranche/i)?.[1] || null
      return { circular, tranche }
    })
    .filter(Boolean)
    .filter(item => Number.isFinite(item.circular))
    .sort((a, b) => b.circular - a.circular)
  return matches.find(item => item.circular > currentCircular) || null
}

module.exports = { DBM_SALARY_GUIDANCE_URL, CURRENT_DBM_SALARY_CIRCULAR, findNewerDbmSalaryGuidance }
