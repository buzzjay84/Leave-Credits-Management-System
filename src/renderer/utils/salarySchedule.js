export const CURRENT_SALARY_SCHEDULE = {
  year: 2026,
  tranche: 3,
  circular: 'DBM National Budget Circular No. 601',
  effectiveDate: '2026-01-01',
  sourceUrl: 'https://www.dbm.gov.ph/wp-content/uploads/Issuances/2026/National-Budget-Circular/NATIONAL-BUDGET-CIRCULAR-NO.-601_NEW.pdf',
}

// Annex A of DBM NBC No. 601. Array index + 1 is the salary grade.
// Each row contains the authorized monthly rates for Steps 1-8. SG 33 has two steps.
export const SALARY_SCHEDULE_2026 = [
  [14634, 14730, 14849, 14968, 15089, 15211, 15333, 15456],
  [15522, 15636, 15752, 15869, 15986, 16103, 16223, 16342],
  [16486, 16610, 16732, 16856, 16982, 17106, 17234, 17360],
  [17506, 17636, 17767, 17898, 18031, 18163, 18298, 18433],
  [18581, 18720, 18858, 18998, 19137, 19280, 19423, 19565],
  [19716, 19862, 20009, 20158, 20307, 20456, 20609, 20761],
  [20914, 21069, 21224, 21382, 21539, 21699, 21859, 22022],
  [22423, 22627, 22832, 23038, 23246, 23456, 23668, 23883],
  [24329, 24523, 24720, 24917, 25117, 25318, 25521, 25725],
  [26917, 27131, 27347, 27565, 27786, 28007, 28230, 28456],
  [31705, 31820, 32109, 32401, 32697, 32998, 33302, 33611],
  [33947, 34069, 34357, 34648, 34943, 35242, 35544, 35850],
  [36125, 36283, 36599, 36919, 37244, 37572, 37904, 38241],
  [38764, 39141, 39523, 39910, 40300, 40696, 41097, 41503],
  [42178, 42594, 43015, 43442, 43874, 44310, 44753, 45202],
  [45694, 46152, 46615, 47084, 47559, 48040, 48528, 49020],
  [49562, 50066, 50576, 51092, 51614, 52144, 52678, 53221],
  [53818, 54371, 54933, 55499, 56075, 56657, 57246, 57842],
  [59153, 59966, 60793, 61632, 62486, 63353, 64236, 65132],
  [66052, 66970, 67904, 68853, 69818, 70772, 71727, 72671],
  [73303, 74337, 75388, 76456, 77542, 78645, 79692, 80831],
  [81796, 82963, 84151, 85356, 86582, 87746, 89011, 90295],
  [91306, 92622, 93962, 95330, 96823, 98341, 99883, 101318],
  [102603, 104209, 105841, 107500, 109185, 110898, 112533, 114301],
  [116643, 118469, 120326, 122212, 124131, 126079, 128061, 130073],
  [131807, 133870, 135968, 138100, 140268, 142469, 144707, 146983],
  [148940, 151273, 153644, 155906, 158353, 160235, 162752, 165310],
  [167129, 169752, 172418, 174797, 177545, 180339, 182660, 185537],
  [187531, 190482, 193480, 196528, 199624, 202005, 205191, 208430],
  [210718, 214038, 217207, 220425, 223691, 227224, 230595, 234240],
  [300961, 306691, 312532, 318182, 323938, 329989, 336092, 342310],
  [356237, 363257, 370418, 377359, 384805, 392400, 400150, 408055],
  [449157, 462329],
]

export const SALARY_GRADES = SALARY_SCHEDULE_2026.map((_, index) => index + 1)

// DBM IOS, DepEd staffing issuances, and the Expanded Career Progression system.
// Aliases retained by LCMS intentionally resolve to the same authorized grade.
export const POSITION_SALARY_GRADES = {
  'Teacher I': 11, 'Teacher II': 12, 'Teacher III': 13, 'Teacher IV': 14,
  'Teacher V': 15, 'Teacher VI': 16, 'Teacher VII': 17,
  'Special Education Teacher I': 14, 'Special Education Teacher II': 15, 'Special Education Teacher III': 16,
  'Head Teacher I': 14, 'Head Teacher II': 15, 'Head Teacher III': 16,
  'Head Teacher IV': 17, 'Head Teacher V': 18, 'Head Teacher VI': 19,
  'Master Teacher I': 18, 'Master Teacher II': 19, 'Master Teacher III': 20,
  'Master Teacher IV': 21, 'Master Teacher V': 22,
  'Principal I': 19, 'Principal II': 20, 'Principal III': 21, 'Principal IV': 22,
  'School Principal I': 19, 'School Principal II': 20, 'School Principal III': 21, 'School Principal IV': 22,
  'Assistant School Principal I': 18, 'Assistant School Principal II': 19,
  'Assistant Principal I': 18, 'Assistant Principal II': 19,
  'Schools Division Superintendent': 26, 'Assistant Schools Division Superintendent': 25,
  'Chief Education Supervisor': 24, 'Education Program Supervisor': 22,
  'Public Schools District Supervisor (PSDS)': 22, 'Public Schools Division Supervisor': 22,
  'Education Program Specialist I': 12, 'Education Program Specialist II': 16,
  'Senior Education Program Specialist': 19,
  'Administrative Officer I': 10, 'Administrative Officer II': 11, 'Administrative Officer III': 14,
  'Administrative Officer IV': 15, 'Administrative Officer V': 18,
  'Administrative Assistant I': 7, 'Administrative Assistant II': 8,
  'Administrative Assistant III (Senior Bookkeeper)': 9, 'Administrative Assistant III': 9,
  'Administrative Assistant IV': 10, 'Administrative Assistant V': 11,
  'Administrative Aide I': 1, 'Administrative Aide II': 2, 'Administrative Aide III': 3,
  'Administrative Aide IV': 4, 'Administrative Aide V': 5, 'Administrative Aide VI': 6,
  'Project Development Officer I': 11, 'Project Development Officer II': 15,
  'Project Development Officer III': 18, 'Project Development Officer IV': 22,
  'Planning Officer I': 11, 'Planning Officer II': 15, 'Planning Officer III': 18,
  'Human Resource Management Officer I': 11, 'Human Resource Management Officer II': 15,
  'Records Officer I': 10, 'Records Officer II': 14,
  'Supply Officer I': 10, 'Supply Officer II': 14,
  'Budget Officer I': 11, 'Budget Officer II': 15, 'Budget Officer III': 18,
  'Accountant I': 12, 'Accountant II': 16, 'Accountant III': 19,
  'Bookkeeper I': 8, 'Cashier I': 10, 'Cashier II': 14,
  'Disbursing Officer I': 6, 'Disbursing Officer II': 8,
  'Attorney III': 21, 'Legal Officer III': 21, 'Legal Assistant I': 10, 'Legal Assistant II': 12,
  'Information Technology Officer I': 19, 'Information Technology Officer III': 24, 'Statistician I': 11,
  'Architect II': 16, 'Engineer II': 16, 'Engineer III': 19,
  'Medical Officer III': 21, 'Dentist I': 14, 'Dentist II': 17, 'Dental Aide': 4,
  'Nurse I': 15, 'Nurse II': 16, 'School Nurse I': 15, 'School Nurse II': 15,
  'Nutritionist-Dietitian I': 11, 'Nutritionist-Dietitian II': 15,
  'Psychologist I': 11, 'Psychologist II': 15, 'Psychometrician I': 11,
  'School Counselor Associate I': 11,
  'Guidance Counselor I': 11, 'Guidance Counselor II': 12,
  'Guidance Services Specialist I': 16, 'Guidance Services Specialist II': 18,
  'Librarian I': 11, 'Librarian II': 15, 'Librarian III': 18, 'Registrar I': 11,
  'Driver I': 3, 'Driver II': 4, 'Security Guard I': 3, 'Security Guard II': 5,
  'Utility Worker I': 1, 'Utility Worker II': 3,
}

export function salaryGradeForPosition(position) {
  return POSITION_SALARY_GRADES[String(position || '').trim()] ?? null
}

export function automaticSalaryStep(basisDate, asOf = new Date(), maximumStep = 8) {
  if (!basisDate) return 1
  const start = new Date(`${basisDate}T00:00:00`)
  const end = asOf instanceof Date ? asOf : new Date(`${asOf}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 1
  let completedYears = end.getFullYear() - start.getFullYear()
  const anniversaryNotReached = end.getMonth() < start.getMonth()
    || (end.getMonth() === start.getMonth() && end.getDate() < start.getDate())
  if (anniversaryNotReached) completedYears -= 1
  return Math.min(Math.max(1, Number(maximumStep) || 8), Math.floor(completedYears / 3) + 1)
}

export function parseSalaryGrade(value) {
  const match = String(value || '').match(/(?:sg\s*[-:]?\s*)?(\d{1,2})/i)
  const grade = Number(match?.[1])
  return grade >= 1 && grade <= SALARY_SCHEDULE_2026.length ? grade : null
}

export function parseSalaryStep(value) {
  const match = String(value || '').match(/step\s*[-:]?\s*(\d)/i)
  const step = Number(match?.[1])
  return step >= 1 && step <= 8 ? step : null
}

export function salaryStepsForGrade(grade) {
  return SALARY_SCHEDULE_2026[Number(grade) - 1]?.map((_, index) => index + 1) || []
}

export function monthlySalaryFor(grade, step = 1) {
  return SALARY_SCHEDULE_2026[Number(grade) - 1]?.[Number(step) - 1] ?? null
}

export function findSalaryStep(grade, monthlySalary) {
  const salary = Number(monthlySalary)
  if (!Number.isFinite(salary)) return null
  const index = SALARY_SCHEDULE_2026[Number(grade) - 1]?.indexOf(salary) ?? -1
  return index >= 0 ? index + 1 : null
}

export function formatSalaryGrade(grade, step) {
  return grade ? `SG-${grade} Step ${step || 1}` : ''
}

export function formatPeso(value) {
  if (value === null || value === undefined || value === '') return ''
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(Number(value))
}
