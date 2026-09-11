import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './Appointment.module.css'
import dashStyles from '@/pages/Dashboard.module.css'
import { titleCase } from '@/utils/personnel'
import { formatSalaryGrade, monthlySalaryFor, parseSalaryGrade, salaryStepsForGrade, salaryGradeForPosition } from '@/utils/salarySchedule'
import { POSITIONS_TEACHING } from '@/utils/leaveCalc'
import { APPOINTMENT_NATURE_OPTIONS, APPOINTMENT_OFFICE_DEFAULTS, APPOINTMENT_STATUS_OPTIONS, BLANK_POSITION_TEMPLATE } from '@/utils/appointmentDefaults'
import AppointmentFrontPage from './AppointmentFrontPage'
import AppointmentBackPage from './AppointmentBackPage'
import { appointmentInputName } from '@/utils/appointmentNames'

function NameInput({ uppercase = false, ...props }) {
  return <input {...props} className={styles.nameInput} value={uppercase ? props.value.toUpperCase() : appointmentInputName(props.value)} />
}

function levelLabelForOffice(office) {
  if (!office) return 'DIVISION OFFICE'
  return /high school/i.test(office) ? 'SECONDARY' : 'ELEMENTARY'
}

function today() { return new Date().toISOString().slice(0, 10) }

const SIGNING_POSITIONS = {
  SDS: 'Schools Division Superintendent',
  ASDS: 'Assistant Schools Division Superintendent',
  EPS: 'Education Program Supervisor',
}

const OTHER_CHAIR_POSITIONS = {
  EPS: 'Education Program Supervisor',
  PSDS: 'Public Schools District Supervisor',
  CHIEF: 'Chief Education Supervisor',
  PRINCIPAL_IV: 'Principal IV',
}

const TEMPLATE_FIELD_LABELS = {
  workstation: 'Workstation / Place of Work',
  present_approp_act: 'Present Approp Act',
  previous_approp_act: 'Previous Approp Act',
  other_compensation: 'Other Compensation',
  immediate_supervisor: 'Immediate Supervisor (position title)',
  next_higher_supervisor: 'Next Higher Supervisor (position title)',
  directly_supervised: 'Directly Supervised (positions/items)',
  equipment_used: 'Machine / Equipment / Tools Used',
  contacts_internal: 'Contacts — Internal',
  contacts_external: 'Contacts — External',
  working_condition: 'Working Condition',
  function_of_unit: 'Function of the Unit / Section',
  function_of_position: 'Function of the Position (Job Summary)',
  qualification_education: 'Qualification — Education',
  qualification_experience: 'Qualification — Experience',
  qualification_training: 'Qualification — Training',
  qualification_eligibility: 'Qualification — Eligibility',
  core_competencies: 'Core Competencies',
  leadership_competencies: 'Leadership Competencies',
  duties: 'Statement of Duties and Responsibilities',
  supervised_items: 'Directly Supervised — Item Numbers',
  contacts_external_other: 'Other External Contacts',
  working_condition_other: 'Other Working Conditions',
  core_level: 'Core Competency Level',
  leadership_level: 'Leadership Competency Level',
  duties_level: 'Technical Competency Level',
  duties_percentage: 'Percentage of Working Time',
}
const TEMPLATE_TEXTAREA_FIELDS = new Set([
  'equipment_used', 'contacts_internal', 'contacts_external', 'function_of_unit',
  'function_of_position', 'qualification_education', 'duties',
])

export default function AppointmentBuilder({
  item, onBack, templatesLoading, templateFor, saveTemplate,
  initialAppointee, initialNature, promotionContext, onSaveToRoster,
}) {
  const [selectedPosition, setSelectedPosition] = useState(item.position || '')
  const positionTitle = titleCase(selectedPosition)
  const grade = onSaveToRoster ? salaryGradeForPosition(selectedPosition) : parseSalaryGrade(item.salary_grade)
  const [noscaOnFile, setNoscaOnFile] = useState(false)

  const [itemNumber, setItemNumber] = useState(item.item_number || '')
  const [lastName, setLastName] = useState(initialAppointee?.lastName || '')
  const [firstName, setFirstName] = useState(initialAppointee?.firstName || '')
  const [middleName, setMiddleName] = useState(initialAppointee?.middleName || '')
  const [salaryStep, setSalaryStep] = useState(initialAppointee?.salaryStep || 1)
  const [status, setStatus] = useState('PERMANENT')
  const [natureOfAppointment, setNatureOfAppointment] = useState(initialNature || 'ORIGINAL')
  const [remarks, setRemarks] = useState('')
  const [rosterSaving, setRosterSaving] = useState(false)
  const [rosterErr, setRosterErr] = useState('')
  const [rosterMessage, setRosterMessage] = useState('')
  const [vice, setVice] = useState('')
  const [viceReason, setViceReason] = useState('')
  const [receivedDate, setReceivedDate] = useState('')
  const [signingOfficerName, setSigningOfficerName] = useState(APPOINTMENT_OFFICE_DEFAULTS.appointingOfficerName)
  const [signingPosition, setSigningPosition] = useState('ASDS')
  const [signingOic, setSigningOic] = useState(true)
  const [hrmoName, setHrmoName] = useState(APPOINTMENT_OFFICE_DEFAULTS.hrmoName)
  const [hrmoTitle, setHrmoTitle] = useState(APPOINTMENT_OFFICE_DEFAULTS.hrmoTitle)
  const [chairName, setChairName] = useState(APPOINTMENT_OFFICE_DEFAULTS.hrmpsbChairName)
  const [chairPosition, setChairPosition] = useState('OTHER')
  const [otherChairPosition, setOtherChairPosition] = useState('EPS')
  const chairTitle = chairPosition === 'ASDS'
    ? SIGNING_POSITIONS.ASDS
    : `OIC-${SIGNING_POSITIONS.ASDS}`
  const [printError, setPrintError] = useState('')
  const [printRoot, setPrintRoot] = useState(null)
  useEffect(() => {
    const root = document.createElement('div')
    root.id = 'appointment-print-root'
    root.className = styles.printRoot
    document.body.appendChild(root)
    setPrintRoot(root)
    return () => root.remove()
  }, [])

  async function printAppointment() {
    setPrintError('')
    if (document.querySelector('[data-appointment-invalid-contact]')) {
      setPrintError('Convert the previous contact notes to the form selections before printing.')
      return
    }
    if (document.querySelector('[data-overflow="true"]')) {
      setPrintError('Some text is too long for the official form. Shorten the highlighted fields before printing.')
      return
    }
    try {
      await Promise.all([...printRoot.querySelectorAll('img')].map(img => img.decode()))
      await document.fonts.ready
      window.print()
    } catch {
      setPrintError('The official form images could not load. Reopen this view before printing.')
    }
  }
  const [levelLabel, setLevelLabel] = useState(levelLabelForOffice(item.office))
  const [pageRef, setPageRef] = useState('')
  const [dateOfSigning, setDateOfSigning] = useState(today())
  const [publishedFrom, setPublishedFrom] = useState('')
  const [publishedTo, setPublishedTo] = useState('')
  const [postedFrom, setPostedFrom] = useState('')
  const [postedTo, setPostedTo] = useState('')
  const [hrmpsbStartDate, setHrmpsbStartDate] = useState('')
  const [hrmpsbDeliberationDate, setHrmpsbDeliberationDate] = useState('')
  const [supervisorSignatureName, setSupervisorSignatureName] = useState('')
  const [supervisorSignatureTitle, setSupervisorSignatureTitle] = useState('')
  const [template, setTemplate] = useState(BLANK_POSITION_TEMPLATE)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [templateMessage, setTemplateMessage] = useState('')

  // The saved template loads asynchronously (fetched once for the whole
  // Appointment tab, not per builder), so sync it in once it's ready rather
  // than reading it in useState's initializer, which would only ever see the
  // pre-fetch blank default.
  useEffect(() => {
    if (!templatesLoading) setTemplate(templateFor(positionTitle))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templatesLoading, positionTitle])

  function setTemplateField(field, value) {
    setTemplate(current => ({ ...current, [field]: value }))
    setTemplateMessage('')
  }

  async function handleSaveTemplate() {
    setTemplateSaving(true)
    setTemplateMessage('')
    const result = await saveTemplate(positionTitle, template)
    setTemplateSaving(false)
    setTemplateMessage(result.success ? 'Template saved for this position.' : result.error)
  }

  const employeeName = [firstName, middleName, lastName].filter(Boolean).map(s => s.trim().toUpperCase()).join(' ')
  const monthlySalary = grade ? monthlySalaryFor(grade, salaryStep) : null
  const recordedMonthYear = dateOfSigning
    ? new Date(`${dateOfSigning}T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()
    : ''

  const doc = useMemo(() => ({
    employeeName: employeeName || '(APPOINTEE NAME)',
    positionTitle,
    itemNumber,
    sgStep: formatSalaryGrade(grade, salaryStep) || item.salary_grade,
    monthlySalary,
    status, natureOfAppointment, vice, viceReason, receivedDate, levelLabel, pageRef, dateOfSigning,
    publishedFrom, publishedTo, postedFrom, postedTo, hrmpsbStartDate, hrmpsbDeliberationDate,
    recordedMonthYear,
    officeUnit: APPOINTMENT_OFFICE_DEFAULTS.officeUnit,
    supervisorSignatureName, supervisorSignatureTitle,
    office: {
      ...APPOINTMENT_OFFICE_DEFAULTS,
      appointingOfficerName: signingOfficerName.trim(),
      appointingOfficerTitle: SIGNING_POSITIONS[signingPosition],
      appointingOfficerDesignation: signingPosition !== 'SDS' && signingOic ? 'Officer-In-Charge' : '',
      appointingOfficerOffice: signingPosition !== 'SDS' && signingOic ? 'Office of the Schools Division Superintendent' : '',
      hrmoName: hrmoName.trim(),
      hrmoTitle: hrmoTitle.trim(),
      hrmpsbChairName: chairName.trim(),
      hrmpsbChairTitle: chairTitle,
    },
    template,
  }), [
    employeeName, positionTitle, item, itemNumber, grade, salaryStep, monthlySalary, status, natureOfAppointment, vice, viceReason, receivedDate,
    levelLabel, pageRef, dateOfSigning, publishedFrom, publishedTo, postedFrom, postedTo,
    hrmpsbStartDate, hrmpsbDeliberationDate, recordedMonthYear, supervisorSignatureName, supervisorSignatureTitle, template,
    signingOfficerName, signingPosition, signingOic,
    hrmoName, hrmoTitle,
    chairName, chairTitle,
  ])

  async function handleSaveToRoster() {
    if (!noscaOnFile) { setRosterErr('Confirm the NOSCA is on file before saving this reclassification.'); return }
    if (!selectedPosition || !grade || !itemNumber.trim() || !dateOfSigning) { setRosterErr('Enter a valid position, OSEC item number, and signing date.'); return }
    setRosterSaving(true)
    setRosterErr('')
    setRosterMessage('')
    const note = `${natureOfAppointment === 'PROMOTION' ? 'Promoted' : 'Reclassified'} to ${positionTitle} (Item ${itemNumber || '—'}) effective ${dateOfSigning}${remarks.trim() ? ` — ${remarks.trim()}` : ''}.`
    const result = await onSaveToRoster({
      position: selectedPosition,
      item_number: itemNumber.trim(),
      salary_grade: formatSalaryGrade(grade, salaryStep),
      salary_step: salaryStep,
      salary_step_mode: 'manual',
      salary_step_basis_date: dateOfSigning,
      monthly_salary: monthlySalary,
      note,
    })
    setRosterSaving(false)
    if (result?.error) {
      setRosterErr(result.error)
    } else if (result?.pendingSync) {
      setRosterErr('Saved on this device, but could not reach the server yet — this change has NOT synced to Supabase and other dashboards will not see it. It will retry automatically.')
    } else {
      setRosterMessage('Reclassification saved to the roster.')
    }
  }

  return (
    <div className={styles.layout}>
      <div className={styles.formPanel}>
        <button className={dashStyles.btnOutline} style={{ marginBottom: 10 }} onClick={onBack}>← Back to {onSaveToRoster ? 'Personnel' : 'Vacant Items'}</button>

        {promotionContext && (
          <div className={styles.section}>
            <p className={styles.sectionTitle}>Reclassifying From</p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
              {promotionContext.fromPosition || 'Unspecified'} · Item {promotionContext.fromItemNumber || '—'}
            </p>
          </div>
        )}

        <div className={styles.section}>
          <p className={styles.sectionTitle}>Position</p>
          {onSaveToRoster ? <div className={styles.field}>
            <label htmlFor="reclass-position">New Position</label>
            <select id="reclass-position" value={selectedPosition} onChange={e => { setSelectedPosition(e.target.value); setRosterMessage('') }}>
              {[...new Set([item.position, ...POSITIONS_TEACHING].filter(Boolean))].map(position => <option key={position} value={position}>{position}</option>)}
            </select>
          </div> : <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600 }}>{positionTitle}</p>}
          <div className={styles.field}>
            <label>OSEC Item No.</label>
            <input value={itemNumber} onChange={e => setItemNumber(e.target.value)} placeholder="Item number" />
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>{item.office || 'Division Office'} · {grade ? `SG-${grade}` : '—'}</p>
        </div>

        <div className={styles.section}>
          <p className={styles.sectionTitle}>Appointee</p>
          <div className={styles.fieldGrid}>
            <div className={styles.field}><label>Family Name</label><NameInput value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Dela Cruz" /></div>
            <div className={styles.field}><label>First Name</label><NameInput value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Juan" /></div>
            <div className={styles.field}><label>Middle Name</label><NameInput value={middleName} onChange={e => setMiddleName(e.target.value)} placeholder="Santos" /></div>
            <div className={styles.field}>
              <label>Salary Step</label>
              <select value={salaryStep} onChange={e => setSalaryStep(Number(e.target.value))}>
                {(salaryStepsForGrade(grade).length ? salaryStepsForGrade(grade) : [1]).map(step => <option key={step} value={step}>{step}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <p className={styles.sectionTitle}>Appointing Officer / Authority</p>
          <div className={styles.fieldGrid}>
            <div className={`${styles.field} ${styles.fullRow}`}>
              <label htmlFor="signing-officer-name">Name (including credentials)</label>
              <NameInput uppercase id="signing-officer-name" value={signingOfficerName} onChange={e => setSigningOfficerName(e.target.value)} />
            </div>
            <div className={`${styles.field} ${styles.fullRow}`}>
              <label htmlFor="signing-officer-position">Position</label>
              <select id="signing-officer-position" value={signingPosition} onChange={e => setSigningPosition(e.target.value)}>
                {Object.entries(SIGNING_POSITIONS).map(([key, title]) => <option key={key} value={key}>{key} — {title}</option>)}
              </select>
            </div>
            {signingPosition !== 'SDS' && <label className={`${styles.fullRow} ${styles.oicOption}`}>
              <input type="checkbox" checked={signingOic} onChange={e => setSigningOic(e.target.checked)} />
              <span><strong>Officer-in-Charge</strong><small>Office of the Schools Division Superintendent</small></span>
            </label>}
          </div>
        </div>

        <div className={styles.section}>
          <p className={styles.sectionTitle}>HRMO Certification</p>
          <div className={styles.fieldGrid}>
            <div className={`${styles.field} ${styles.fullRow}`}>
              <label htmlFor="appointment-hrmo-name">HRMO Name (including credentials)</label>
              <NameInput uppercase id="appointment-hrmo-name" value={hrmoName} onChange={e => setHrmoName(e.target.value)} />
            </div>
            <div className={`${styles.field} ${styles.fullRow}`}>
              <label htmlFor="appointment-hrmo-title">HRMO Position / Title</label>
              <input id="appointment-hrmo-title" value={hrmoTitle} onChange={e => setHrmoTitle(e.target.value)} placeholder="HRMO" />
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <p className={styles.sectionTitle}>HRMPSB Chairperson</p>
          <div className={styles.fieldGrid}>
            <div className={`${styles.field} ${styles.fullRow}`}>
              <label htmlFor="appointment-chair-name">Chairperson Name (including credentials)</label>
              <NameInput uppercase id="appointment-chair-name" value={chairName} onChange={e => setChairName(e.target.value)} />
            </div>
            <div className={`${styles.field} ${styles.fullRow}`}>
              <label htmlFor="appointment-chair-position">Position</label>
              <select id="appointment-chair-position" value={chairPosition} onChange={e => setChairPosition(e.target.value)}>
                <option value="ASDS">ASDS — Assistant Schools Division Superintendent</option>
                <option value="OTHER">Other position</option>
              </select>
            </div>
            {chairPosition === 'OTHER' && <div className={`${styles.field} ${styles.fullRow}`}>
              <label htmlFor="appointment-chair-other-position">Other Position</label>
              <select id="appointment-chair-other-position" value={otherChairPosition} onChange={e => setOtherChairPosition(e.target.value)}>
                {Object.entries(OTHER_CHAIR_POSITIONS).map(([key, title]) => (
                  <option key={key} value={key}>{key === 'EPS' || key === 'PSDS' ? `${key} — ${title}` : title}</option>
                ))}
              </select>
            </div>}
            <div className={styles.fullRow} style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
              {chairPosition === 'OTHER' && <p style={{ marginBottom: 6 }}>
                {OTHER_CHAIR_POSITIONS[otherChairPosition]} serving as Officer-in-Charge of the ASDS office.
              </p>}
              {chairTitle}<br />
              {APPOINTMENT_OFFICE_DEFAULTS.hrmpsbChairRole}
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <p className={styles.sectionTitle}>Appointment Details</p>
          <div className={styles.fieldGrid}>
            <div className={styles.field}><label>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}>
                {APPOINTMENT_STATUS_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
            <div className={styles.field}><label>Nature of Appointment</label>
              <select value={natureOfAppointment} onChange={e => setNatureOfAppointment(e.target.value)}>
                {APPOINTMENT_NATURE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
            <div className={styles.field}><label>Vice (who is being replaced)</label><NameInput value={vice} onChange={e => setVice(e.target.value)} placeholder="N/A" /></div>
            <div className={styles.field}><label>Former Incumbent — Transferred, Retired, etc.</label><input value={viceReason} onChange={e => setViceReason(e.target.value)} /></div>
            <div className={styles.field}><label>Appointment Received On</label><input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} /></div>
            <div className={styles.field}><label>School Level</label>
              <select value={levelLabel} onChange={e => setLevelLabel(e.target.value)}>
                <option value="ELEMENTARY">ELEMENTARY</option>
                <option value="SECONDARY">SECONDARY</option>
                <option value="DIVISION OFFICE">DIVISION OFFICE</option>
              </select>
            </div>
            <div className={styles.field}><label>Page Reference</label><input value={pageRef} onChange={e => setPageRef(e.target.value)} placeholder="e.g. 69/79" /></div>
            <div className={styles.field}><label>Date of Signing</label><input type="date" value={dateOfSigning} onChange={e => setDateOfSigning(e.target.value)} /></div>
          </div>
        </div>

        <div className={styles.section}>
          <p className={styles.sectionTitle}>Publication &amp; HRMPSB Dates</p>
          <div className={styles.fieldGrid}>
            <div className={styles.field}><label>Published From</label><input type="date" value={publishedFrom} onChange={e => setPublishedFrom(e.target.value)} /></div>
            <div className={styles.field}><label>Published To</label><input type="date" value={publishedTo} onChange={e => setPublishedTo(e.target.value)} /></div>
            <div className={styles.field}><label>Posted From</label><input type="date" value={postedFrom} onChange={e => setPostedFrom(e.target.value)} /></div>
            <div className={styles.field}><label>Posted To</label><input type="date" value={postedTo} onChange={e => setPostedTo(e.target.value)} /></div>
            <div className={styles.field}><label>HRMPSB Assessment Started</label><input type="date" value={hrmpsbStartDate} onChange={e => setHrmpsbStartDate(e.target.value)} /></div>
            <div className={styles.field}><label>HRMPSB Deliberation Held</label><input type="date" value={hrmpsbDeliberationDate} onChange={e => setHrmpsbDeliberationDate(e.target.value)} /></div>
          </div>
        </div>

        <div className={styles.section}>
          <p className={styles.sectionTitle}>Immediate Supervisor (signature block)</p>
          <div className={styles.fieldGrid}>
            <div className={styles.field}><label>Name</label><NameInput value={supervisorSignatureName} onChange={e => setSupervisorSignatureName(e.target.value)} placeholder="e.g. Abdel Raffi S. Edris" /></div>
            <div className={styles.field}><label>Title</label><input value={supervisorSignatureTitle} onChange={e => setSupervisorSignatureTitle(e.target.value)} placeholder="e.g. School Principal II" /></div>
          </div>
        </div>

        <div className={styles.section}>
          <p className={styles.sectionTitle}>Position Description — {positionTitle} <span style={{ fontWeight: 400, textTransform: 'none' }}>(reused next time this position is filled)</span></p>
          <div className={styles.fieldGrid}>
            {Object.keys(BLANK_POSITION_TEMPLATE).map(field => (
              <div key={field} className={`${styles.field} ${TEMPLATE_TEXTAREA_FIELDS.has(field) ? styles.fullRow : ''}`}>
                <label>{TEMPLATE_FIELD_LABELS[field]}</label>
                {field === 'contacts_internal' || field === 'contacts_external'
                  ? <ContactInputs field={field} value={template[field] || ''} onChange={value => setTemplateField(field, value)} />
                  : TEMPLATE_TEXTAREA_FIELDS.has(field)
                  ? <textarea rows={2} value={template[field] || ''} onChange={e => setTemplateField(field, e.target.value)} />
                  : <input value={template[field] || ''} onChange={e => setTemplateField(field, e.target.value)} />}
              </div>
            ))}
          </div>
          <button className={dashStyles.btnOutline} style={{ marginTop: 10 }} disabled={templateSaving} onClick={handleSaveTemplate}>
            {templateSaving ? 'Saving…' : 'Save as Template for This Position'}
          </button>
          {templateMessage && <p style={{ fontSize: 12, marginTop: 6 }}>{templateMessage}</p>}
        </div>

        {onSaveToRoster && (
          <div className={styles.section}>
            <p className={styles.sectionTitle}>Save to Roster</p>
            <div className={styles.field}>
              <label>Remarks</label>
              <textarea rows={2} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional notes about this reclassification…" />
            </div>
            <label className={styles.oicOption}>
              <input type="checkbox" checked={noscaOnFile} onChange={e => setNoscaOnFile(e.target.checked)} />
              <span>NOSCA on file for this reclassification</span>
            </label>
            {rosterErr && <p role="alert" className={styles.printError}>{rosterErr}</p>}
            {rosterMessage && <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{rosterMessage}</p>}
            <button className={dashStyles.btnPrimary} style={{ width: '100%', marginTop: 6 }} disabled={rosterSaving || !noscaOnFile} onClick={handleSaveToRoster}>
              {rosterSaving ? 'Saving…' : 'Save Reclass to Roster'}
            </button>
          </div>
        )}

        <p style={{ fontSize: 12 }}>Official form: 4 A4 pages. Print at actual size (100%).</p>
        {printError && <p role="alert" className={styles.printError}>{printError}</p>}
        <button className={dashStyles.btnPrimary} style={{ width: '100%' }} disabled={!printRoot} onClick={printAppointment}>Print Appointment (4 pages)</button>
      </div>

      <div className={styles.previewPanel}>
        <AppointmentFrontPage doc={doc} />
        <AppointmentBackPage doc={doc} />
      </div>
      {printRoot && createPortal(<><AppointmentFrontPage doc={doc} /><AppointmentBackPage doc={doc} /></>, printRoot)}
    </div>
  )
}

function ContactInputs({ field, value, onChange }) {
  const labels = field === 'contacts_internal'
    ? ['Executive / Managerial', 'Supervisors', 'Non-Supervisors', 'Staff']
    : ['General Public', 'Other Agencies']
  const lines = value.split('\n').filter(Boolean)
  const choices = Object.fromEntries(lines.map(line => line.split(':').map(part => part.trim())))
  const legacy = lines.some(line => !labels.includes(line.split(':')[0].trim()) || !['Occasional', 'Frequent'].includes(line.split(':')[1]?.trim()))
  return <div>
    {legacy && <p data-appointment-invalid-contact className={styles.printError}>Previous contact notes: {value}. Select the corresponding form checkboxes below.</p>}
    {labels.map(label => <label key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 4, marginBottom: 4 }}>
      {label}<select aria-label={label} value={choices[label] || ''} onChange={e => {
        const next = { ...choices, [label]: e.target.value }
        onChange(labels.filter(key => next[key]).map(key => `${key}: ${next[key]}`).join('\n'))
      }}><option value="">Not selected</option><option>Occasional</option><option>Frequent</option></select>
    </label>)}
  </div>
}
