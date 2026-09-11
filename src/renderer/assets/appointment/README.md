The four PNGs are blank, 288-dpi renders of the user-supplied official
Appointment_PALACIO_SABIRINA59.xlsm workbook (September 2026 reference).
Excel rendered the workbook with macros disabled, without saving it.
Appointee, item, salary, date, signatory, and position-template values were
cleared before rendering. The source workbook and sample personal data are
not included in the application.

Page order and original Excel pagination:

1. Appointment 2023, rows 1–73: CS Form 33-B, Revised 2025.
2. Appointment 2023, row 74 onward: certifications, notation, acknowledgment.
3. SCCA 1 (Elem), rows 1–33: DBM-CSC Position Description Form No. 1.
4. SCCA 1 (Elem), rows 34–73: job summary, qualifications, acceptance.

These are division-specific official backgrounds, including the original
letterhead, CSC receipt box, accreditation wording, and publication venue.
If those fixed details change, regenerate the blank artwork from the approved
form. Do not redraw or resize individual sections: field coordinates in
fields.json use the artwork's 595.2 × 841.8 PDF-point coordinate system.
Editable values are rendered as text by AppointmentOfficialPages.jsx.

The print portal keeps the pages out of the application layout and prints
four A4 sheets at actual size. The assets are bundled locally for offline
Electron use. No Excel installation or macro execution is needed at runtime.
