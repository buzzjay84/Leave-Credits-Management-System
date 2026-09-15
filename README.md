# SwiSS (SWabe ISabela City SDO)

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
git clone https://github.com/jaybhee84/SwiSS.git
cd SwiSS
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
6. Keep the shared project's existing Auth/email-confirmation setting; SwiSS
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
an update has downloaded, pressing **OK** closes SwiSS, installs the update, and
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

Run `supabase/feature_retired_items.sql` in your Supabase SQL editor to enable this. A reclass evolves an existing employee's OSEC item number into a new one for the same person — it does not free the old number for someone else to be hired into. A trigger retires the old item number the moment it changes on an existing roster row (via Reclass or a PSIPOP-matched update), permanently excluding it from Vacant Items and the appointment generator, the same way CTI items are excluded. Review or undo a retirement (e.g. a typo during reclass) from the Retired Items tab.

Run `supabase/feature_vice_history.sql` next. A genuine promotion — picking "PROMOTION" as the Nature of Appointment when reclassifying an employee into a different, already-existing item — does the opposite of a reclass: the old item is freed as a real vacancy instead of being retired, and who last held it is remembered. The next time that item is picked in the appointment generator (or its number is typed/pasted into the Reclass screen), "Vice (who is being replaced)" prefills with that person's name automatically. This chains naturally: if that new holder is later promoted out of the same item too, they become the name remembered for whoever comes after them.

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

### Study leave return tracking

Run `supabase/feature_leave_return_tracking.sql` after `feature_leave_enhancements.sql`
for existing and fresh installations. It adds a `return_confirmed_at` column to
`leave_transactions` and an `lcms_confirm_leave_return` RPC HRMO uses to confirm
an employee reported back after Study Leave.

Study Leave under CSC MC 14, s. 1999 runs at most one year, is LWOP by default
(paid only with a confirmed scholarship/government study grant), and requires
agency head approval before activation. Because its end date passing doesn't by
itself mean the employee returned, the HRMO Dashboard shows a banner once an
approved Study Leave is within 7 days of its end date, and keeps showing it as
overdue every day after until HRMO clicks **Mark reported back** on that entry.
While a Study Leave is overdue and unconfirmed, or while an employee is within
an approved Maternity Leave's date range, new leave requests for that employee
are blocked in both the School and HRMO request forms.

### Removing an Allowed User deletes their account

Run `supabase/feature_hard_delete_allowed_user.sql` after `LCMS_SQL_EDITOR_SETUP.sql`,
`schema.sql`, and `feature_superadmin_settings.sql`. It relaxes a few foreign
keys that previously blocked deleting an `auth.users` row (`leave_requests.
requested_by_user`, `lcms_account_audit.actor_id`, `lcms_admin_emails.
granted_by` now go to `null` on delete instead of blocking it — each keeps a
readable text column alongside the FK, so no audit context is lost) and adds
the `lcms_hard_delete_allowed_user` RPC.

Removing an already-registered row from Allowed Users now permanently deletes
that Supabase Auth account (cascading to `LCMS-profiles` and any superadmin
grant), not just the allowlist row. Previously the person's login survived
removal, so re-adding the same email later — even under a different role —
failed at registration with "user already registered" even though they no
longer appeared anywhere in the app. This is irreversible; the confirmation
dialog says so before it runs.

### AOII school reassignment keeps their account in sync

Run `supabase/feature_aoii_school_reassignment.sql` after `LCMS_SQL_EDITOR_SETUP.sql`,
`schema.sql`, `feature_superadmin_settings.sql`, and `feature_hard_delete_allowed_user.sql`.
It adds an optional `email` column to `leave_employees`, the
`lcms_reassign_allowed_user_school` RPC, and an `AFTER UPDATE OF school_id`
trigger on `leave_employees`.

An AOII account being moved to a different school now updates both the
Allowed Users row and (if they've already registered) their live
`LCMS-profiles.school_id` — previously only the allowlist row changed, so an
already-registered AO kept their old school's data reachable until they
happened to re-register. Superadmin can trigger this directly by
right-clicking a School (AOII) row's School/Division Office cell in Allowed
Users. It also fires automatically whenever a Personnel record's `school_id`
changes (Employee edit form, staff self-assignment, CSV import) if that
person's Personnel record has an email matching their Allowed Users email —
add the email on the Personnel side (Employee edit form) once to link the
two; without it, reassigning the Personnel record doesn't touch the account.

### At most one AOII per school

Run `supabase/feature_aoii_single_assignment_guard.sql` after
`LCMS_SQL_EDITOR_SETUP.sql`, `schema.sql`, `feature_superadmin_settings.sql`,
`feature_hard_delete_allowed_user.sql`, and `feature_aoii_school_reassignment.sql`.
It adds the `lcms_aoii_school_is_exempt` and `lcms_bump_aoii_if_occupied`
functions, the `lcms_add_allowed_user` and `lcms_change_allowed_user_role`
RPCs, and updates `lcms_apply_account_school_by_email` and
`lcms_reassign_allowed_user_school` to call the new occupancy guard.

Assigning or reassigning a School (AOII) account to a school that already has
one now warns the admin/superadmin first instead of silently allowing two AOs
at the same school. If they continue anyway, the incumbent AO is bumped to an
"Unassigned" school (they keep their account but see no school data until a
superadmin reassigns them) rather than left double-booked or silently
overwritten. Isabela City's 2 single-ID integrated schools — Badjao Floating
Integrated School and Panigayan Integrated School, which cover both an
elementary and a secondary campus under one DepEd School ID — are exempt and
may carry 2 AOs at once; every other integrated school (Geras, Ismael, ...)
already gets 2 AOs for free since its Elementary/Secondary campuses have
separate DepEd School IDs. This guard applies to every path that seats an AOII
at a school: adding a new allowance, reassigning an existing AOII's school,
converting another role into an AOII, and the automatic Personnel-record sync
(which always proceeds without a confirmation prompt, since no admin is there
to answer one).

### Superadmin can switch into the "Isabela City SDO" AOII view

Run `supabase/feature_sdo_admin_dashboard_switch.sql` after
`LCMS_SQL_EDITOR_SETUP.sql`, `schema.sql`, `feature_superadmin_settings.sql`,
and `feature_appointments_role.sql`. It updates `lcms_switch_superadmin_role`
to accept the Division Office's `'DEFAULT'` school_id (previously only a real
6-digit DepEd School ID was accepted for the AOII dashboard) and standardizes
its school_name fallback to `'Isabela City SDO'`.

The Topbar's superadmin "Switch dashboard" menu now lists "Isabela City SDO"
at the top of the AOII Dashboard optgroup, above every school, so superadmin
can preview that view the same way they can any other AOII account.

### "SDO Admin" is its own role, not a disguised AOII

Run `supabase/feature_sdo_admin_role.sql` after `LCMS_SQL_EDITOR_SETUP.sql`,
`schema.sql`, `feature_superadmin_settings.sql`, `feature_appointments_role.sql`,
`feature_aoii_single_assignment_guard.sql`, and
`feature_sdo_admin_dashboard_switch.sql`. It adds `'sdo_admin'` to the `role`
CHECK constraint on both `LCMS-profiles` and `LCMS-allowed-users`, backfills
every existing account that was `role='aoii'` pinned to `school_id='DEFAULT'`
(the only way "SDO Admin" was reachable before) to `role='sdo_admin'`, and
updates `lcms_change_allowed_user_role` and `lcms_switch_superadmin_role` to
read/write that role directly.

"SDO Admin" (Isabela City SDO) previously had no role of its own — it was a
regular School (AOII) account that just happened to be pinned to the Division
Office's school_id, detected only by that side-channel (`school_id ===
'DEFAULT'`). It still renders through the exact same AOII/School dashboard
view and still acts as the AO for its own (Division-Office-scoped) personnel —
including submitting their leave requests — but is no longer indistinguishable
from a real school's AO at the data layer: it's excluded from rules that only
make sense for a real school, like the one-AO-per-school guard and school
reassignment.

### SDO dashboard shows Division Office personnel, not a school roster

The School dashboard (`SchoolDashboard.jsx`) now offers a **position** filter
(distinct job titles present in the visible roster) alongside the existing
Teaching/Non-Teaching type filter and search box, for every AOII account —
useful for a school roster too, not just Division Office personnel.

It also adapts specifically when `user.role === 'sdo_admin'`:
- The Teaching/Non-Teaching type filter is hidden (SDO personnel span many
  distinct job titles rather than a clean Teaching/Non-Teaching split, so the
  position filter above covers this on its own).
- The **Appointments** tab and the **"Add staff to your school"** panel
  (CSV upload / search-by-name staff self-assignment) are hidden — both are
  school-specific and don't apply to Division Office personnel.
- Submitting a leave request still works exactly like a School AOII, since
  SDO Admin is the only AO Division-Office-scoped personnel have.

Run `supabase/feature_sdo_admin_leave_requests.sql` after
`LCMS_SQL_EDITOR_SETUP.sql`, `schema.sql`, `feature_leave_enhancements.sql`,
and `feature_sdo_admin_role.sql`. It updates the `requests_insert_aoii` RLS
policy on `leave_requests` to also grant insert to `role = 'sdo_admin'` (it
previously only granted `role = 'aoii'`, which would have silently rejected
every leave request submitted from the SDO dashboard once "SDO Admin" became
its own role).

### SDO Admin's heading reads "Isabela City Schools Division Office"

Run `supabase/feature_sdo_admin_display_name.sql` after
`LCMS_SQL_EDITOR_SETUP.sql`, `schema.sql`, `feature_superadmin_settings.sql`,
`feature_sdo_admin_dashboard_switch.sql`, and `feature_sdo_admin_role.sql`. It
backfills every existing `role='sdo_admin'` account's `school_name` to
"Isabela City Schools Division Office" (matching the `SCHOOL_LOGO_MAP` entry
that gives that heading its `icsdo.png` logo) and fixes
`lcms_switch_superadmin_role` to set that name directly for `school_id =
'DEFAULT'` instead of looking it up from any `LCMS-allowed-users` row pinned
to `'DEFAULT'` — that id is shared by every hrmo/appointments account too
(it's their default `school_id`), so the lookup could pick up an unrelated
account's `school_name` (e.g. the bootstrap "Default Organization" placeholder
from this README's example `INSERT`) instead of the Division Office's own
name. `'DEFAULT'` isn't a real school to look up; unlike a real DepEd school
(which has no canonical name source and genuinely needs that lookup), it has
exactly one true name.

### Deleting an Allowed User is now audit-logged

Run `supabase/feature_log_allowed_user_deletion.sql` after
`LCMS_SQL_EDITOR_SETUP.sql`, `schema.sql`, `feature_superadmin_settings.sql`,
and `feature_hard_delete_allowed_user.sql`. `lcms_hard_delete_allowed_user`
was the only admin action in this codebase that wrote no `lcms_account_audit`
row at all — every other action (school reassignment, role changes,
superadmin dashboard switches) already logs who did what. A deletion by
anyone — superadmin or a regular admin — now logs an `allowed_user_hard_
deleted` entry with the actor and the deleted account's email/role/school.

The audit log itself is already superadmin-only to read (`lcms_account_audit`'s
`superadmin_reads_audit` RLS policy grants `select` only to
`lcms_is_superadmin()`); a regular admin has no read access to this table at
all, deletion entries included, and that policy is unchanged by this
migration.

### Superadmin Dashboard

Run `supabase/feature_superadmin_dashboard.sql` after
`LCMS_SQL_EDITOR_SETUP.sql`, `schema.sql`, `feature_superadmin_settings.sql`,
and `feature_sdo_admin_display_name.sql`. It adds `'superadmin'` to
`lcms_switch_superadmin_role`'s allow-list, and adds the
`lcms_delete_account_audit_entry` and `lcms_clear_account_audit` RPCs.

Superadmin now has a dedicated dashboard, separate from Admin Console (which
it still shares with regular admins) — reached via a new "Superadmin" card on
the post-login subsystem chooser (shown only to superadmin, alongside the
existing HRMO/Appointments/LCMS cards, which now also gained an "AOII
Dashboard" card with its own embedded school picker, replacing the picker
that used to sit below the cards) or the "Superadmin Dashboard" option in the
Topbar's dashboard switcher. It has 3 tabs:
- **Audit Log** (`AuditLogAdmin.jsx`) — reads `lcms_account_audit` directly
  (RLS already scopes every row to superadmin), with a human-readable
  one-line summary per action type. Superadmin can delete individual entries
  or clear the whole log — meant for wiping pre-deployment test activity so
  the real audit trail starts clean at go-live. Both actions log themselves
  as a new entry (`audit_log_entry_deleted` / `audit_log_cleared`) rather
  than leaving a silent gap; clearing specifically keeps exactly one fresh
  entry recording who cleared it, when, and how many entries were removed.
- **Allowed Users** — the same `AllowedUsersAdmin.jsx` page Admin Console
  already has (unchanged, still there for regular admins too); now also
  reachable from here for convenience.
- **Admin Access** (`AdminAccessAdmin.jsx`) — the "grant/revoke Admin console
  access by email" tool, moved out of the post-login subsystem chooser (where
  it used to sit below the cards) into its own tab here.

### No more shared "admin"/"admin" bootstrap login

Granting Admin Access used to also call a `provision-admin-bootstrap` edge
function, which silently created a real Supabase Auth account with username
`"admin"` and password `"admin"` for the newly-granted email, if that email
hadn't registered its own login yet — meant as a one-time login for their
first visit, but only one such account could exist at a time (a sameness
check blocked granting a 2nd person while the first "admin" account was still
unclaimed), and it left a shared, low-entropy password sitting in the
database. That edge function (`supabase/functions/provision-admin-bootstrap`)
has been deleted, and `AdminAccessAdmin.jsx`'s grant flow no longer calls it.

Granting Admin Access now behaves exactly like adding any other Allowed User:
it only records the grant (`lcms_set_admin_email` already required — and
still requires — the email to already be in Allowed Users). The person
registers their own username and password on the Register tab, same as an
HRMO/AOII/Appointments account. If a shared "admin"/"admin" account was
already provisioned by the old flow before this change, it isn't touched by
this migration set — delete or reassign that `auth.users` row directly (by
email, in the Supabase dashboard) if you want it gone, since no automated
migration here does that on your behalf.

On top of deleting that edge function, `"admin"` is now an explicitly
reserved username and password everywhere this app itself can set either
one: registration (`useAuth.jsx`'s `register()`), the forgot-password reset
flow (`confirmPasswordReset()`), and the signed-in change-password/
change-username form (`AccountSettings.jsx`) all reject it client-side with
a clear message. Passwords can only be enforced client-side — Supabase Auth
hashes a password before it reaches any table this project controls, so
there's no server-side trigger point to inspect the plaintext — but
usernames are also enforced server-side: run
`supabase/feature_block_admin_username.sql` (after `LCMS_SQL_EDITOR_SETUP.sql`,
`schema.sql`, and `feature_superadmin_settings.sql`) to add the same check to
`lcms_handle_new_user` (the registration trigger — rejecting it here rolls
back the entire `auth.users` insert, not just the LCMS profile) and
`lcms_update_own_username`, so a direct RPC/signUp call can't set the
username to `"admin"` either, bypassing the UI.

### Granting Admin Access no longer requires an existing Allowed Users entry

Run `supabase/feature_admin_access_without_allowed_user.sql` after
`LCMS_SQL_EDITOR_SETUP.sql`, `schema.sql`, and
`feature_superadmin_settings.sql`. It replaces `lcms_set_admin_email`,
adding optional `p_last_name`/`p_first_name`/`p_middle_name` parameters.

Previously, granting Admin Access to an email required a two-step process —
add that person in Allowed Users first, then separately grant access here —
because `lcms_set_admin_email` raised "Add this email to Allowed Users
first" for any email it didn't already recognize. It now creates that
Allowed Users entry itself, in the same step, when the email doesn't already
have one — which is why the Admin Access form (`AdminAccessAdmin.jsx`) now
also collects Family Name and First Name (required only for a brand-new
email; ignored/not needed when the email is already in Allowed Users). An
email that's in Allowed Users but marked inactive still isn't auto-reactivated
here on purpose — that still needs a look at the existing record in Allowed
Users, not a one-click bypass from this tab. The Admin Access table also now
shows each granted account's name (joined from Allowed Users by email), not
just the raw email address.

### Superadmin can globally toggle staff self-assignment off

Run `supabase/feature_staff_self_assignment_toggle.sql` after
`LCMS_SQL_EDITOR_SETUP.sql`, `schema.sql`, and
`feature_superadmin_settings.sql`. It adds a singleton `lcms_app_settings`
row (`id boolean primary key default true check (id)` enforces exactly one
row) with a `staff_self_assignment_enabled` column, readable by every
signed-in account (RLS `select` policy, `using (true)`) but writable only
through the new `lcms_set_staff_self_assignment_enabled` RPC, which requires
superadmin and logs the change (`staff_self_assignment_toggled`) like every
other superadmin action.

Superadmin Dashboard gained a 4th tab, **Settings** (`SuperadminSettings.jsx`),
with an Enabled/Disabled toggle for the "Add staff to your school" panel
(CSV upload / search-by-name self-assignment) — turning it off hides that
panel from every School/AOII dashboard at once, division-wide, not per
school (`SchoolDashboard.jsx` reads the flag through the new
`useAppSettings()` hook, on top of the existing per-account `isSdoAdmin`
check that already hides it for SDO Admin specifically). Turning it off asks
for confirmation first, since it's a division-wide change; turning it back
on doesn't. It doesn't touch any staff already assigned — only the ability
to assign more this way; HRMO's own assignment tools are unaffected.

### Fixed: several `create or replace function` migrations left stale duplicate overloads

Run `supabase/feature_fix_overloaded_functions.sql` after
`LCMS_SQL_EDITOR_SETUP.sql`, `schema.sql`, `feature_superadmin_settings.sql`,
`feature_aoii_school_reassignment.sql`,
`feature_aoii_single_assignment_guard.sql`, and
`feature_admin_access_without_allowed_user.sql`.

`CREATE OR REPLACE FUNCTION` does not replace a function when the new
definition adds parameters — even trailing ones with defaults — it silently
creates a second, distinct overload instead, leaving the original narrower
version still callable. Three functions in this codebase hit that: `lcms_set_
admin_email` (2 params → 5, in `feature_admin_access_without_allowed_user.sql`),
`lcms_reassign_allowed_user_school` and `lcms_apply_account_school_by_email`
(3 params → 4 each, in `feature_aoii_single_assignment_guard.sql`). Calling
any of them with only the original narrower set of named parameters (e.g.
Admin Access's "Remove" button previously called `lcms_set_admin_email` with
just `target_email`/`allow_access`) became ambiguous — Postgres can't tell
whether the caller meant the exact 2-arg match or the 5-arg version with its
extra parameters defaulted — and raised "Could not choose the best candidate
function...". This migration drops the stale narrower overloads; the current
(wider) versions are untouched, since dropping the old ones doesn't affect
the new ones' grants or definitions.

### "Remove" on Admin Access now does the same thing as "Remove" on Allowed Users

Same migration (`feature_fix_overloaded_functions.sql`) also replaces
`lcms_hard_delete_allowed_user` so it also deletes any matching
`lcms_admin_emails` row for the account being deleted — without this, a
hard-deleted admin's email would stay listed as "granted" with no account
behind it, and if that email were ever registered again later (by the same
person re-added to Allowed Users, or coincidentally by someone else), they'd
silently receive admin access with no new grant action by any superadmin.

`AdminAccessAdmin.jsx`'s former "Revoke" button (which only removed the
`lcms_admin_emails` grant, leaving the account itself intact) is gone —
"Remove" now calls the exact same RPC (`lcms_hard_delete_allowed_user`) as
Allowed Users' own "Remove" button, with matching confirmation wording:
permanently deletes the account (sign-in, profile, admin access, and the
allowlist entry), irreversible. The one edge case where there's no account
to delete — a grant with no matching Allowed Users row at all (shown as a
"Missing" status pill) — falls back to clearing just the dangling grant via
`lcms_set_admin_email(allow_access: false)`, since there's nothing else to
remove in that case.

### Holiday Calendar moved from Admin Console to Superadmin Dashboard

`HolidayCalendarAdmin.jsx` is no longer a tab on Admin Console (removed from
`AdminConsole.jsx`'s `TABS`) — a regular admin can no longer reach it. It's
now a tab on the Superadmin Dashboard instead (`SuperadminDashboard.jsx`),
superadmin-only. No SQL migration was needed for this move: switching into
the Superadmin Dashboard already sets the account's profile `role` to
`'hrmo'` (via `lcms_switch_superadmin_role`'s catch-all branch — see
"Superadmin Dashboard" above), which is exactly what `leave_holidays`'s
`holidays_write` RLS policy (`lcms_is_hrmo()`) already requires, so write
access carries over unchanged.

It also gained a bulk **"Add PH Regular Holidays"** action (a year picker +
button, next to the existing single-holiday form): computes that year's
fixed-date/fixed-rule Philippine regular holidays under RA 9492 — New
Year's Day, Maundy Thursday, Good Friday (both derived from Easter Sunday
via the Meeus/Jones/Butcher algorithm, `utils/phHolidays.js`), Araw ng
Kagitingan, Labor Day, Independence Day, National Heroes Day (last Monday of
August), Bonifacio Day, Christmas Day, and Rizal Day — and bulk-inserts
whichever of those aren't already recorded as an everywhere-holiday for that
year (via the new `addHolidays` bulk insert in `useHolidays.js`), so
re-clicking it for the same year is a no-op rather than creating duplicates.
Eid'l Fitr and Eid'l Adha are regular holidays too (RA 9849) but follow the
Islamic lunar calendar and are only fixed by an official proclamation each
year, not a computable rule — those still need manual entry once
proclaimed. The Holiday Calendar previously had no seeded holidays at all
(admin had to know to add every single one, including the standard national
holidays, by hand); this doesn't change that for local/special dates, but
covers the recurring national ones automatically.

### Undertime deduction (September 2026)

A new **Undertime** tab records minutes short directly against an employee's
leave credits — 8 hrs = 480 min = 1.00 day. HRMO (LCMS Handler) gets an
input-and-history view on `HRMODashboard.jsx`: search by name/employee no. or
filter by school/office (including the SDO), type minutes into a row to
preview the resulting balance, then **Save** that row individually or **Save
All** to post every entered row at once — each action posts straight to the
database and shows a success/failure notice inline, with no confirmation
dialog. AOII and SDO Admin get the same tab on `SchoolDashboard.jsx` as a
read-only history, scoped to their own school.

Non-Teaching deducts from SL; Teaching deducts from VSC. If a Non-Teaching
employee's SL is already at exactly 0, the deduction falls back to VL
instead — SL itself is still allowed to run past zero for a single
transaction while it has any positive balance beforehand. Once the relevant
pool(s) are actually exhausted (SL and VL both at 0 for Non-Teaching, or VSC
at 0 for Teaching, which has no second pool), the deduction stops there:
the balance floors at 0 rather than going negative, and the uncovered
remainder is documented in the transaction's remarks as a payroll deduction
rather than a leave-credit debit. The new `lcms_record_undertime` RPC
(`feature_undertime.sql`) enforces this server-side; `previewUndertimeDeduction`
in `leaveCalc.js` mirrors it exactly for the live client-side preview. Each
recorded entry lands in `leave_transactions` as a `UNDERTIME_DEBIT` row (new
`undertime_minutes` and `undertime_pool` columns record the original minutes
and which pool — SL, VL, or VSC — actually absorbed it) and surfaces
automatically in the existing Monthly Transaction Record table alongside
every other leave action.

The employee detail modal's old "Accrual History (last 6 months)" block
(a fixed +1.25 VL/SL-per-month display) was removed as redundant, and its
"Complete Leave Credit History" table now excludes CTO transactions, since
those already have their own breakdown table directly above it.
