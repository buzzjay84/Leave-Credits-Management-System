import { useLayoutEffect, useRef, useState } from 'react'
import fields from '@/assets/appointment/fields.json'
import page1 from '@/assets/appointment/page-1.png'
import page2 from '@/assets/appointment/page-2.png'
import page3 from '@/assets/appointment/page-3.png'
import page4 from '@/assets/appointment/page-4.png'
import { pesoAmountInWords } from '@/utils/numberToWords'
import styles from './Appointment.module.css'
import { appointmentPrintedName } from '@/utils/appointmentNames'

const backgrounds = [page1, page2, page3, page4]
const titles = ['Appointment', 'Certifications and CSC/HRMO notation', 'Position description', 'Qualifications and acceptance']

function date(value, long = false) {
  if (!value) return ''
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', long
    ? { month: 'long', day: 'numeric', year: 'numeric' }
    : { month: '2-digit', day: '2-digit', year: 'numeric' })
}

function valuesFor(doc) {
  const o = doc.office
  const t = doc.template
  return {
    ...t, ...doc,
    salary: doc.monthlySalary == null ? '' : `₱ ${Number(doc.monthlySalary).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    salaryWords: doc.monthlySalary == null ? '' : pesoAmountInWords(doc.monthlySalary),
    sgStep: String(doc.sgStep || '').replace(/^SG-?/i, '').replace(/\s*Step\s*/i, '/'),
    pdGrade: doc.sgStep,
    officerName: appointmentPrintedName(o.appointingOfficerName), officerTitle: o.appointingOfficerTitle,
    officerDesignation: o.appointingOfficerDesignation, officerOffice: o.appointingOfficerOffice,
    hrmoName: appointmentPrintedName(o.hrmoName), hrmoTitle: o.hrmoTitle,
    chairName: appointmentPrintedName(o.hrmpsbChairName), chairTitle: o.hrmpsbChairTitle, chairRole: o.hrmpsbChairRole,
    employeeName: appointmentPrintedName(doc.employeeName),
    vice: appointmentPrintedName(doc.vice),
    department: o.department,
    division: `${o.department}-${o.division.replace(/^Schools Division of\s*/i, '')} Division`,
    appropriation: [t.present_approp_act, t.previous_approp_act].filter(Boolean).join(' / '),
    working_condition_other: /^(office work|field work|office work\s*[/,]\s*field work)$/i.test((t.working_condition || '').trim())
      ? t.working_condition_other : t.working_condition || t.working_condition_other,
    supervisor: [appointmentPrintedName(doc.supervisorSignatureName), doc.supervisorSignatureTitle].filter(Boolean).join('\n'),
    ...Object.fromEntries(['publishedFrom', 'publishedTo', 'postedFrom', 'postedTo', 'hrmpsbStartDate', 'hrmpsbDeliberationDate', 'receivedDate'].map(key => [key, date(doc[key])])),
    dateOfSigning: date(doc.dateOfSigning, true),
  }
}

// Measure actual font metrics so variable names and descriptions fit the form.
function Field({ field, value, page }) {
  const ref = useRef(null)
  const [tooLong, setTooLong] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    let size = field.size
    el.style.fontSize = `${size}pt`
    while ((el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) && size > 6) {
      size = Math.max(6, size - .25)
      el.style.fontSize = `${size}pt`
    }
    setTooLong(el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)
  }, [value, field])
  return <div className={styles.officialField} style={{
    left: `${field.x}pt`, top: `${field.y}pt`, width: `${field.width}pt`, height: `${field.height}pt`,
    alignItems: field.valign === -4160 ? 'flex-start' : field.valign === -4108 ? 'center' : 'flex-end',
  }}>
    <div ref={ref} data-appointment-field={field.key} data-overflow={tooLong || undefined}
      title={tooLong ? `Shorten ${field.key} to fit the official form.` : undefined}
      className={styles.officialValue} style={{
        fontFamily: field.font?.includes('Arial') ? 'Arial, sans-serif' : '"Times New Roman", serif',
        fontSize: `${field.size}pt`, fontWeight: field.bold || ['employeeName', 'officerName', 'hrmoName', 'chairName', 'supervisor', 'vice'].includes(field.key) ? 700 : 400,
        textDecoration: ['officerName', 'chairName'].includes(field.key) ? 'underline' : undefined,
        textAlign: field.align === -4108 ? 'center' : 'left',
      }}>{page === 0 && field.key === 'positionTitle' ? String(value || '').toUpperCase() : value || ''}</div>
  </div>
}

function ContactMarks({ template }) {
  const mark = (key, x, y) => <span key={key} className={styles.contactMark} style={{ left: `${x}pt`, top: `${y}pt` }}>✓</span>
  const marks = []
  for (const [kind, labels, xs] of [
    ['internal', ['Executive / Managerial', 'Supervisors', 'Non-Supervisors', 'Staff'], [191, 265]],
    ['external', ['General Public', 'Other Agencies'], [450, 520]],
  ]) {
    const text = template[`contacts_${kind}`] || ''
    labels.forEach((label, i) => {
      const line = text.split('\n').find(line => line.split(':')[0].trim().toLowerCase() === label.toLowerCase())
      const frequency = line?.split(':')[1]?.trim().toLowerCase()
      if (frequency === 'occasional' || frequency === 'frequent') marks.push(mark(label, xs[frequency === 'frequent' ? 1 : 0], 621 + i * 11))
    })
  }
  for (const [i, label] of ['Office Work', 'Field Work'].entries()) {
    if ((template.working_condition || '').toLowerCase().includes(label.toLowerCase())) marks.push(mark(label, 191, 678 + i * 11))
  }
  return marks
}

export default function AppointmentOfficialPages({ doc, pages = [0, 1, 2, 3] }) {
  const values = valuesFor(doc)
  return pages.map(page => <section key={page} className={styles.officialPage} aria-label={`${titles[page]} — page ${page + 1} of 4`}>
    <img className={styles.officialBackground} src={backgrounds[page]} alt="" aria-hidden="true" />
    {fields.filter(field => field.page === page).map(field => <Field key={field.key} field={field} value={values[field.key]} page={page} />)}
    {page === 2 && <ContactMarks template={doc.template} />}
  </section>)
}
