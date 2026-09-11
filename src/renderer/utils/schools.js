// Official DepEd School IDs — Schools Division Office of Isabela City, Basilan.
// Sourced from https://www.depedisabelacity.org/ district pages (Sep 2026).
export const SCHOOLS = [
  { id: '126018', name: 'Badjao Floating Integrated School' },
  { id: '314603', name: 'Baluno National High School' },
  { id: '303894', name: 'Basilan National High School' },
  { id: '314602', name: 'Basilan National High School - Night' },
  { id: '126006', name: 'Simeon & Josefa Obsequio Elementary School' },
  { id: '126005', name: 'Begang Central Elementary School' },
  { id: '303897', name: 'Begang National High School' },
  { id: '198006', name: 'Bishop Querexeta Elementary School' },
  { id: '126027', name: 'Busay Elementary School' },
  { id: '126028', name: 'Cabunbata Elementary School' },
  { id: '126029', name: 'Calvario Elementary School' },
  { id: '126007', name: 'Calvario Peak Elementary School' },
  { id: '303896', name: 'Calvario Peak National High School' },
  { id: '126030', name: 'Campo Barn Elementary School' },
  { id: '133031', name: 'Caro Elementary School' },
  { id: '305550', name: 'Caro National High School' },
  { id: '126019', name: 'Diki Elementary School' },
  { id: '500243', name: 'Geras Integrated School - Elementary' },
  { id: '314604', name: 'Geras Integrated School - Secondary' },
  { id: '112765', name: 'Hadji Camlani Elementary School' },
  { id: '198014', name: 'Hadji Maulana Primary School' },
  { id: '198007', name: 'Hadji Amilhamja Lahaba Memorial Elementary School' },
  { id: '126001', name: 'Isabela East Central Elementary School' },
  { id: '126000', name: 'Isabela Bliss Elementary School' },
  { id: '126002', name: 'Isabela Central Pilot Elementary School' },
  { id: '198010', name: 'Isabela Central Pilot Elementary School - Night' },
  { id: '314601', name: 'Isabela City National High School' },
  { id: '198015', name: 'Ismael Integrated School - Elementary' },
  { id: '501905', name: 'Ismael Integrated School - Secondary' },
  { id: '126020', name: 'Kaumpurnah Elementary School' },
  { id: '126009', name: 'Kauman Ekka Elementary School' },
  { id: '126008', name: 'Kapatagan Diutay Elementary School' },
  { id: '126010', name: 'Kawa-Kawa Elementary School' },
  { id: '126031', name: 'Kumalarang Elementary School' },
  { id: '303899', name: 'Kumalarang National High School' },
  { id: '126021', name: 'Lampinigan Elementary School' },
  { id: '305549', name: 'Lampinigan National High School' },
  { id: '126032', name: 'Lanote Elementary School' },
  { id: '126011', name: 'Latuan Elementary School' },
  { id: '126012', name: 'Look-Jambangan Elementary School' },
  { id: '126022', name: 'Lukbuton Elementary School' },
  { id: '126033', name: 'Lunot Elementary School' },
  { id: '126034', name: 'Maligue Elementary School' },
  { id: '126023', name: 'Malamawi Central Elementary School' },
  { id: '303895', name: 'Malamawi National High School' },
  { id: '126024', name: 'Marang-Marang Elementary School' },
  { id: '198009', name: 'Masola Elementary School' },
  { id: '198013', name: 'NR Hugo Elementary School' },
  { id: '126035', name: 'Old Camp Elementary School' },
  { id: '126013', name: 'Palasanan Primary School' },
  { id: '126025', name: 'Panigayan Integrated School' },
  { id: '126014', name: 'Panunsulan Elementary School' },
  { id: '198016', name: 'Ustadz Wahab Akbar Elementary School' },
  { id: '126016', name: 'Spillway Elementary School' },
  { id: '126036', name: 'Sumagdang Elementary School' },
  { id: '126003', name: 'Sunset Elementary School' },
  { id: '126017', name: 'Tabiawan Elementary School' },
  { id: '126026', name: 'Tampalan Elementary School' },
  { id: '303898', name: 'Tandung Ahas National High School' },
  { id: '198001', name: 'Menzi Elementary School' },
  { id: '198002', name: 'Balatanay Elementary School' },
  { id: '198003', name: 'Makiri Elementary School' },
  { id: '198004', name: 'Ajibon Elementary School' },
  { id: '198005', name: 'Balawatin Elementary School' },
  { id: '198008', name: 'MS Bernardo Elementary School' },
  { id: '126004', name: 'Westside Elementary School' },
  // Newly established (validated Aug 2025); no DepEd School ID published yet — update once assigned.
  { id: 'PENDING-CAMP-SALAMAT', name: 'Camp Salamat Primary School' },
].sort((a, b) => {
  const levelOf = name => /high school|secondary/i.test(name) ? 1 : 0
  const levelDiff = levelOf(a.name) - levelOf(b.name)
  return levelDiff !== 0 ? levelDiff : a.name.localeCompare(b.name)
})

// Integrated schools tag their secondary campus explicitly ("- Secondary");
// everything else without "High School" in the name is elementary/primary.
function isSecondary(name) {
  return /high school|- secondary\b/i.test(name)
}

export const ELEMENTARY_SCHOOLS = SCHOOLS.filter(school => !isSecondary(school.name))
export const SECONDARY_SCHOOLS = SCHOOLS.filter(school => isSecondary(school.name))

// A handful of integrated schools (e.g. "Geras Integrated School - Elementary"
// / "- Secondary") get separate DepEd School IDs for their elementary and
// secondary campuses, but share one School Head across both. Pair those IDs
// up so a School Head assigned to only one campus's roster can still be
// surfaced on the other campus's page.
const INTEGRATED_CAMPUS_SUFFIX = /\s*-\s*(Elementary|Secondary)$/i
const INTEGRATED_SCHOOL_PARTNERS = (() => {
  const byBaseName = new Map()
  for (const school of SCHOOLS) {
    if (!INTEGRATED_CAMPUS_SUFFIX.test(school.name)) continue
    const base = school.name.replace(INTEGRATED_CAMPUS_SUFFIX, '').trim()
    if (!byBaseName.has(base)) byBaseName.set(base, [])
    byBaseName.get(base).push(school.id)
  }
  const partners = new Map()
  for (const ids of byBaseName.values()) {
    if (ids.length !== 2) continue
    partners.set(ids[0], ids[1])
    partners.set(ids[1], ids[0])
  }
  return partners
})()

export function integratedSchoolPartnerId(schoolId) {
  return INTEGRATED_SCHOOL_PARTNERS.get(schoolId) || null
}

export function schoolNameById(schoolId) {
  return SCHOOLS.find(school => school.id === schoolId)?.name || ''
}

// SDO-based personnel legitimately work at the Division Office, not a school —
// 'DEFAULT' isn't in SCHOOLS, so schoolNameById() alone would leave them
// looking indistinguishable from a genuinely unassigned record. Only the
// 'UNASSIGNED' sentinel should ever fall through to that label.
export function schoolOrOfficeName(schoolId) {
  if (schoolId === 'DEFAULT') return 'SDO / Division Office'
  return schoolNameById(schoolId)
}

// Matches a PSIPOP "office" string (case-insensitive) to its DepEd School ID,
// for prefilling a vacant item's default school before HRMO confirms or reassigns it.
export function schoolIdByName(officeName) {
  if (!officeName) return ''
  const normalized = officeName.trim().toUpperCase()
  return SCHOOLS.find(school => school.name.trim().toUpperCase() === normalized)?.id || ''
}
