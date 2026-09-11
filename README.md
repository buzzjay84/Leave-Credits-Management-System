# Leave Credits Management System (LCMS)

Personnel leave records and credit management for HRMO and school-based users.

---

## Stack
- **Electron** + **React** + **Vite**
- **Supabase** (auth + database)
- **electron-updater** (auto-updates via GitHub Releases)

## Roles
| Role | Access |
|------|--------|
| `hrmo` | HRMO / administrator — full access: add/edit employees and input leave |
| `aoii` | Administrative Officer II / school-based — view, search, print only |

---

## Setup

### 1. Clone & install
```bash
git clone https://github.com/depedICSDO/lcms.git
cd lcms
npm install
```

### 2. Configure the IECES Dashboard Manager Supabase project
1. Use the existing IECES Dashboard Manager Supabase project.
2. Run `supabase/schema.sql` in the SQL Editor to create the operational tables.
3. Run `supabase/LCMS_SQL_EDITOR_SETUP.sql` to create `LCMS-profiles`,
   `LCMS-allowed-users`, the registration functions, trigger, grants, and RLS policies.
4. Run `supabase/feature_leave_enhancements.sql` to enable protected VL,
   fixed 30-day monetization choices, one-year CTO expiry, and cancellation handling.
5. Run `supabase/feature_school_directory.sql`, then
   `supabase/feature_staff_assignment.sql` for AO name search, school assignment,
   removal, and assignment history. Existing installations also need this new
   staff-assignment migration before using the new controls.
6. Keep the shared project's existing Auth/email-confirmation setting; LCMS
   supports either confirmed-email or immediate-session registration.

AO staff assignment offers CSV linking for unassigned personnel and manual full-name
search for active teachers, including teachers assigned to another school. Manual
assignment updates the working school and retains the prior school reference in
`item_school_id`. Removing a teacher returns them to `UNASSIGNED`; it does not delete
the employee or leave records. Leadership assignments remain with HRMO. Pending
leave requests must be resolved before reassignment. Assignment changes require an
online connection and an active AO account with a school; the server derives the
destination school from the signed-in profile. Historical leave records keep their
original school attribution. HRMO can read the assignment audit log.

### 3. Create `.env`
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### 4. Approve and register users

Before a person can use the Register tab, the IECES dashboard manager must add
their username and email to the allowlist:

```sql
INSERT INTO public."LCMS-allowed-users" (
  username, email, full_name, role, school_id, school_name, added_by
) VALUES (
  'hrmo_admin', 'hrmo@example.com', 'HRMO Staff', 'hrmo',
  'DEFAULT', 'Default Organization', 'dashboard-manager'
);
```

The approved person can then open the app, select **Register**, and enter the
same username and email. Registration is checked and enforced by Supabase; the
database creates the corresponding profile automatically. Depending on the
Supabase Auth settings, the person may need to confirm their email before login.

The trigger is tagged with `app_id = LCMS`, so it does not interfere with Auth
registrations made by the IECES Dashboard Manager or other apps in the same
Supabase project. Keep the Supabase service-role key out of this Electron app;
only the public anon key belongs in `.env`.

### Leave request and approval workflow

1. An AOII selects an employee and submits a leave request. No balance changes
   while the request is pending.
2. HRMO receives the request in the Pending Leave Requests panel.
3. After the employee and authorizing official have signed and approved CS Form
   6, HRMO clicks **Approve** and confirms the warning prompt.
4. Supabase atomically checks the balance, deducts VL/SL/VSC/CTO when applicable,
   creates the leave transaction, and marks the request approved. Rejecting a
   request never changes the employee balance.

This cross-user workflow requires an online Supabase connection. For an existing
project, run `supabase/feature_leave_enhancements.sql` once after deploying this version.

### 5. Run in dev
```bash
npm run dev
```

Development builds provide a local diagnostic HRMO login (`admin` / `admin`)
for UI and offline bug checks. It is compiled out of production builds and does
not authenticate to Supabase.

### 6. Build for Windows
```bash
npm run dist
```

---

## Leave Rules Implemented
| Type | Rule | Basis |
|------|------|-------|
| Non-Teaching VL | 1.25 days/month (15 days/year) | CSC MC 41, s. 1998 |
| Non-Teaching SL | 1.25 days/month (15 days/year) | CSC MC 41, s. 1998 |
| Teaching VSC | HRMO-encoded; max 15/30/45 days by years of service | DepEd Order 013, s. 2024 |
| Teaching VL/SL | NOT entitled | CSC MC 41 s.1998 / RA 4670 |
| Mandatory / Forced Leave | Any VL usage counts toward the 5-day annual minimum; untaken required days are forfeited at year-end | CSC MC 41 s.1998 Sec. 25 |
| Special Privilege Leave | 3 days/year, outside accumulated VL/SL | EO 292, Rule XVI, Sec. 21 |
| Standard Monetization | 10–30 VL days/year; retain at least 5 VL days | CSC MC 41, s. 1998, Sec. 22 |
| Wellness Leave | 3 days/year, outside accumulated VL/SL | DepEd wellness leave policy |

The year-end mandatory-leave job runs through Supabase Cron every January 1.
A signing-authority cancellation due to exigency of service is documented and
the exact original VL deduction is restored. A documented retirement/resignation
date exempts the employee from that calendar year's automatic forfeiture and
creates an audit-history entry. Monetization remains visible in the same leave
transaction history and does not count as mandatory leave taken.

---

## Local SQLite and Backup

The Electron application keeps a local SQLite copy of employee and leave
transaction records. Changes made while Supabase is unavailable are queued and
retried automatically when the computer reconnects.

HRMO users can use **Backup** and **Restore** in the top bar:

- **Backup** exports the complete local SQLite database, including pending sync
  operations, to a `.sqlite` file selected by the user.
- **Restore** validates a selected backup, saves a safety copy of the active
  database, restores the selected file, and restarts the application.

Copy the exported `.sqlite` file to the new computer and use **Restore** after
installing and configuring the application. Supabase login credentials and the
`.env` configuration are intentionally not included in database backups.

SQLite backup files contain personnel information and are not encrypted. Store
them only in an access-controlled location or encrypted drive.

---

## Release
The installed app checks GitHub automatically after startup and every four
hours. **Check Updates** is also available in the dashboard. On Windows, when
an update has downloaded, pressing **OK** closes LCMS, installs the update, and
restarts the app automatically. On macOS, the update prompt opens the matching
GitHub Release page so the user can download the Intel or Apple Silicon DMG.

Before publishing, update the version in `package.json` and `package-lock.json`,
commit and push that change, then create a matching `v*` tag. For example:

```bash
npm version 1.0.1 --no-git-tag-version
git add package.json package-lock.json
git commit -m "Release v1.0.1"
git push origin main
git tag v1.0.1
git push origin v1.0.1
```

The release workflow verifies that the tag matches the package version, runs
the tests, builds the Windows NSIS installer and both macOS DMGs, and creates
one GitHub Release after both builds succeed. The release contains the Windows
installer, blockmap, `latest.yml` updater metadata, and the Intel and Apple
Silicon macOS installers. Configure the repository Actions secrets
`VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` before creating a release tag.

GitHub-based automatic updates require the release assets to be accessible to
the installed clients. Keep the repository/releases public, or configure a
separate authenticated update provider for a private deployment.

### Update PSIPOP

Run `supabase/feature_psipop_history.sql` in your Supabase SQL editor before using the new administrator tab. It adds personnel history and the current PSIPOP item registry, with HRMO access policies. Applying imports requires a working cloud connection; desktop personnel changes still use the existing offline sync queue and report pending synchronization.

In **Update PSIPOP**, drop text-based PSIPOP PDFs, the existing parser's JSON output, or CSV with those same record keys (`name`, `item_number`, `position_raw`, `salary_grade`, `actual_salary`, `step`, `tin`, `appointment_date`, `promotion_date`, `status_code`, `office`, `vacant`). Actual salary is the source annual salary, converted to monthly salary. Set the source as-of date, review old/new values, reconcile flagged identities, then apply. Unmatched personnel must be linked or added in Personnel; they are never silently created from an uncertain name. Unreadable/scanned PDFs need text recognition first.

The personnel roster and HRMO/AO dashboards read the updated employee records. Open dashboards refresh through Realtime, window focus, and a 60-second visible-page fallback; AO school restrictions still apply. History retains source rows, baseline employment values, individual before/after changes, admin reconciliation decisions, actor, source as-of date and actual recording timestamp. These are reference snapshots for later service-record preparation, not certified effective dates of appointments.

Vacant Items merges uploaded item statuses with the bundled list. Explicit filled rows remove vacancies; explicit vacant rows add them; omitted items are preserved for partial-school uploads. CTI items and items still assigned to active personnel remain excluded. Resolve a stale personnel assignment in Personnel before filling such an item. Imports older than an existing item snapshot are rejected. A failed multi-person import reports completed personnel updates; re-scan to safely retry remaining differences.

### Leave conditions (September 2026)

Run `supabase/feature_leave_conditions.sql` **after** `feature_leave_enhancements.sql`
for existing and fresh installations. It adds request/transaction validation and
updates approval to use the same core limits. No historical records are rewritten.
The migration must be installed for server-side enforcement; client checks alone
cannot serialize approvals or prevent an older client from bypassing new rules.

Both leave forms show eligibility/document requirements and require confirmation.
Numerical checks cover dates, paid-credit treatment, applicable employee type,
balances, maternity periods, seven-day paternity, annual SPL/solo-parent/wellness,
three-day wellness entries, rehabilitation and gynecological-surgery periods,
and non-teaching study duration. Approval reloads balances/history and displays
the documentary checklist. The database serializes annual-limit checks by employee.

Documentary eligibility (including aggregate service, same-event prior usage,
medical/court authority, solo-parent status, adoption duration and exceptions)
is explicitly an HRMO review, not automatically inferred from incomplete records.
Authorities are recorded as references in remarks; do not include diagnoses or
VAWC case details. Working days remain entered from the approved schedule; the
system validates the inclusive date span but does not assume a holiday calendar.
Terminal payouts are blocked in the ordinary leave form because its single-credit
debit cannot settle VL and SL correctly. Process these through a verified terminal
settlement. Unpaid extensions likewise need the appropriate separate HR process.

References checked September 10, 2026:
- CSC Omnibus Rules: https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/10/38435
- Maternity: https://csc.gov.ph/csc-issues-new-rules-on-maternity-adoption-leave-for-gov-t-workers
- Solo parents (RA 11861): https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/95472
- Wellness: https://www.deped.gov.ph/2026/02/13/deped-nagkaloob-ng-5-araw-na-wellness-leave-para-sa-lahat-ng-guro-at-kawani/
- Study: https://csc.gov.ph/phocadownload/userupload/irmo/mc/2004/mc21s2004.pdf
- Teachers (RA 4670): https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/6799
- Special leave for women: https://www.csc.gov.ph/phocadownload/userupload/irmo/mc/2010/mc25s2010.pdf
- Calamity: https://csc.gov.ph/special-emergency-leave-available-for-government-employees-during-calamities
- Adoption (RA 11642): https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/94036
- VSC: https://www.deped.gov.ph/wp-content/uploads/DO_s2024_013.pdf
