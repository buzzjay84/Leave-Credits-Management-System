// Defaults for the CS Form No. 33-B appointment paper and its position
// description page. The signing-authority block is the same for every
// appointment in this division — kept here as a single editable source
// instead of retyped on each form. Update these when the officers change.
export const APPOINTMENT_OFFICE_DEFAULTS = {
  republic: 'Republic of the Philippines',
  department: 'Department of Education',
  region: 'Region IX- Zamboanga Peninsula',
  division: 'Schools Division of Isabela City',
  officeUnit: 'DepEd Schools Division of Isabela City',

  cscResolutionNo: '2400077',
  cscResolutionDate: '29 January 2024',

  appointingOfficerName: 'MA. LAARNI T. VILLANUEVA, EdD, CESO VI',
  appointingOfficerTitle: 'Assistant Schools Division Superintendent',
  appointingOfficerDesignation: 'Officer-In-Charge',
  appointingOfficerOffice: 'Office of the Schools Division Superintendent',

  hrmoName: 'ANABELLE R. BARANDINO',
  hrmoTitle: 'HRMO',

  hrmpsbChairName: 'LYNA H. BASRI, EdD',
  hrmpsbChairTitle: 'OIC-Assistant Schools Division Superintendent',
  hrmpsbChairRole: 'Chairperson, HRMPSB/Placement Committee',

  positionPublishedAt: 'CSC Website',
  positionPublicationLawNote: 'in consonance with Republic Act No. 7041',
}

// Reusable DBM-CSC Position Description Form content. Contact frequencies
// retain the existing text storage: one "Category: Frequency" line per row.
export const BLANK_POSITION_TEMPLATE = {
  workstation: 'SCHOOL',
  present_approp_act: 'N/A',
  previous_approp_act: '',
  other_compensation: '',
  immediate_supervisor: 'School Principal',
  next_higher_supervisor: 'Schools District Supervisor',
  directly_supervised: 'N/A',
  supervised_items: 'N/A',
  equipment_used: '',
  contacts_internal: '',
  contacts_external: '',
  contacts_external_other: 'N/A',
  working_condition: 'Office Work',
  working_condition_other: 'N/A',
  function_of_unit: '',
  function_of_position: '',
  qualification_education: '',
  qualification_experience: 'None Required',
  qualification_training: 'None Required',
  qualification_eligibility: '',
  core_competencies: 'N/A',
  core_level: 'N/A',
  leadership_competencies: 'N/A',
  leadership_level: 'N/A',
  duties: 'N/A',
  duties_percentage: '',
  duties_level: 'N/A',
}

export const APPOINTMENT_NATURE_OPTIONS = [
  'ORIGINAL', 'PROMOTION', 'RECLASSIFICATION', 'TRANSFER', 'REAPPOINTMENT', 'REEMPLOYMENT', 'REASSIGNMENT', 'REINSTATEMENT',
]

export const APPOINTMENT_STATUS_OPTIONS = ['PERMANENT', 'TEMPORARY', 'PROVISIONAL', 'SUBSTITUTE', 'CASUAL', 'COTERMINOUS']
