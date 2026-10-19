# 03 — Test report v2.3.0

Test date: 2026-10-19. **Only executed results are listed.** Environment: PGlite (PostgreSQL 16) with migrations 001–035, the real Netlify Function handlers (`tests/v2.2.1/backend/server.mjs`), Chromium driven by Playwright.

## Summary
| Suite | Result | Source / log |
|---|---|---|
| Backend — REXUS Survey + First Login (new) | **97 / 97** | `tests/v2.2.1/backend/survey.test.mjs`, `tests/v2.3.0/backend/survey-backend.log` |
| Backend — existing integration checks | **224 / 224** | `tests/v2.2.1/backend/backend.test.mjs`, `tests/v2.3.0/backend/backend-regression.log` |
| E2E v2.3.0 (AC01–AC09, UIAC) | **67 / 67** | `tests/v2.3.0/e2e/e2e230.py`, `e2e230-results.log` |
| E2E v2.2.3 regression | **75 / 75** | `tests/v2.3.0/e2e/regression-e2e223.log` |
| E2E v2.2.2 regression | **53 / 53** | `tests/v2.3.0/e2e/regression-e2e222.log` |
| E2E v2.2.1 regression | **48 / 48** | `tests/v2.3.0/e2e/regression-e2e221.log` |
| Legacy UI regression (mocked API) | **24 / 24** | harness from v2.2.0 (not shipped) |
| UI audit (contrast, dark surfaces, overflow, JS errors) | **252 screen checks**: 248 clean on the first run; 4 findings fixed and re-checked (16/16 clean) | `tests/v2.3.0/e2e/ui_audit.py`, `ui-audit-results.log` |
| `tsc --noEmit` on new/changed functions; `node --check` on new/changed scripts; inline app script syntax | Pass | — |

### Changes to older tests (by design)
- `e2e222.py` GEN-05: a freshly created account now completes the First Login steps (new password, DOB, education) before the workspace; the later sign-in uses the new password. The ACC-03 "role is read-only" check ignores the selects of the new Personal information card. No assertion was removed.

## Backend (97)
- **Migration 035 (5)**: new columns and tables exist. Existing accounts are not gated and still work. Default fields have DOB and Education required.
- **AC01 password (16)**:
  - Admin creates an account; sign-in reports the password step; `/auth/me` works.
  - Five business APIs (tasks, projects, documents, surveys, HR) return 401.
  - The profile cannot be filled first.
  - The password change rejects a weak password, a mismatch, a wrong temporary password and reuse of the temporary password; a valid change moves to the profile step.
  - The flag is cleared only after the save. No password is written to the audit log.
- **AC02 profile (8)**:
  - The account stays blocked while the profile is incomplete, and the required fields are listed.
  - DOB missing, DOB in the future and an unknown option are each rejected at the field. An HR-managed field cannot be self-edited.
  - A valid save releases the account. Values are not in the audit log.
- **AC08 privacy (6)**:
  - Another employee and a Project Manager both get 403 on someone's demographics; a System Admin can read and edit them.
  - Only an admin configures fields, and a hidden field is never required.
- **Builder (8)**:
  - A Member cannot create surveys; a PM can, from a template, but cannot set mandatory.
  - Option and type validation work, and all 9 types save.
  - A PM publishes their own survey. A non-owner cannot open the builder.
- **AC03 targeting (9)**:
  - A mandatory survey needs a target. The OR estimate counts unique people.
  - A draft does not gate anyone.
  - After publishing, people are gated if targeted by User ID or by department; outsiders are not.
  - The intro data is returned.
- **AC05/AC06 responses (13)**:
  - Respondents get the published questions. Invalid submissions are rejected, each pointing at its question: a missing required answer, an invalid option, a rating out of range, a text over the limit.
  - The account stays gated after those failures.
  - The stored user is the session user, even when the body claims another.
  - A same-token resend is idempotent, and a second submission is refused, leaving exactly one response.
  - The gate is released after the save. An outsider cannot answer.
- **Versioning (4)**:
  - The draft is edited without touching the published version.
  - Republishing creates version 2, and the old answer stays on version 1.
  - A stale form is asked to reload.
- **AC07 availability (10)**:
  - Reaching the quota releases the gate and refuses new answers.
  - A past closing date releases the gate. A future opening date shows Scheduled and does not gate.
  - A close date before the open date is rejected.
  - When the survey is open again, the gate returns. Manual close releases it, and reopening gates again.
- **Priority (1)**: the higher-priority survey is asked first.
- **Analytics (8)**:
  - Choice counts and rating average are correct.
  - The respondent is visible to the owner; a non-owner gets 404.
  - The export has the User ID column.
  - Excluding a response needs a reason, is logged, and keeps the original.
- **Public (5)**:
  - A public survey cannot be mandatory, and anyone with the link can answer.
  - No user ID is stored, even for a signed-in person. The export has no respondent columns.
  - An authenticated survey needs sign-in.
- **Rollout and reset (4)**:
  - Applying the required fields to existing accounts gates those missing DOB.
  - An admin password reset returns a temporary password and gates the account.

## E2E v2.3.0 (67)
Highlights by criterion. The full list is in the log.
- **Workspace (3)**:
  - The App Switcher shows REXUS Survey.
  - The workspace navigation is Overview, My Surveys, Builder, Settings, Analytics.
  - The work views are hidden.
- **Builder (8)**: create from a template; add a required dropdown; duplicate; delete with confirmation; reorder; save; preview at desktop and mobile width; publish version 1.
- **AC03 (3 + 1)**:
  - The department is picked with the searchable list (typed without diacritics).
  - The unique estimate is 1, and the OR rule is explained. The settings are saved.
  - A user outside the target goes straight to the workspace.
- **AC01 / UIAC06 (6)**:
  - Signing in lands on the password step.
  - There is no Skip/Close; Esc and a typed module URL do not leave the step.
  - The API is refused.
  - Validation errors appear at the field, from the client and from the server.
- **AC02 (6)**:
  - The profile step has no exit buttons, and managed fields are read-only.
  - Required-field errors appear at the fields. Refresh keeps the step.
- **AC04 / UIAC07 (5)**:
  - The intro is 100% of the viewport, with only Start survey (+ Sign out). It shows the name, question count, time estimate and User ID note.
  - The form is 100% of the viewport, with progress, navigator and Previous/Next.
  - Required answers are validated at the question. Arrow keys work on the rating scale.
- **AC05 (3)**:
  - Refresh mid-survey returns to the flow.
  - Signing out and back in shows the same step.
  - The draft answers are restored.
- **AC06 (3)**:
  - Submitting opens the workspace.
  - The response is linked to the User ID, and the APIs open.
- **AC07 (3)**:
  - Adding a group gates it on the next sign-in. Closing the survey releases it.
  - The server refuses answers after closing.
- **Mid-session publish (1)**: the next action shows the intro, not the login screen.
- **UIAC08 / UIAC10 (4)**:
  - On a 390 × 844 phone: the intro is full width with no overflow; the form is 100vw with no overflow and Next is visible in the viewport.
  - Dark mode is applied to the mandatory form.
- **Analytics (4)**:
  - One valid response and the choice bars are shown.
  - The CSV download has the User ID column and the right person. The responses list names the respondent. Republishing creates version 2.
- **Public + non-mandatory (4)**:
  - A public survey on a phone needs no account and shows the thank-you page.
  - A Member sees *Surveys for you* without the builder, and answers and returns to Overview.
- **My Account (2)**: the Personal information card is shown and saves.
- **Admin (5)**:
  - Employee Profiles shows status and DOB.
  - Reset password shows the temporary password once and waits for OK.
  - A hidden field cannot be required, and the field configuration saves.
- **AC08 (2)**: from the browser, an employee cannot read another person's demographics or identified responses.
- **No JavaScript errors (1).**

## UI acceptance mapping
| ID | Covered by |
|---|---|
| UIAC01 Visual consistency | One stylesheet (`rexus-survey.css`) and shared tokens; UI audit screens |
| UIAC02 Overview priority | Overview KPIs, Needs attention, Quick actions (E2E screenshot `01-overview`) |
| UIAC03 My Surveys | Search / status / owner / sort, labelled status, limit, closing date; actions kept in a menu (`evidence/20-my-surveys.jpg`) |
| UIAC04 Builder before publish | Preview desktop/mobile, properties panel, versioning note (E2E builder checks) |
| UIAC05 Targeting / availability | OR explanation, estimate, close conditions summary, time zone (E2E AC03; `04-settings`) |
| UIAC06 First Login gate | E2E AC01/AC02 (no Skip/Close, no menu shortcut) |
| UIAC07 Mandatory intro/form | E2E full-viewport checks |
| UIAC08 Devices | E2E 390 × 844; UI audit at 375 / 768 / 1440 |
| UIAC09 Pending / error states | Saving / Submitting busy states, Retry on network error, nothing marked done before the server confirms (E2E AC05/AC06; backend AC05) |
| UIAC10 Dark mode & regression | E2E dark form; UI audit dark configurations; regression suites |

## UI audit
Configurations: dark Black & White at 1440 / 768 / 375 px; dark Navy at 1440; light Black & White at 1440 / 375; light Navy at 1440.

Screens: the 25 v2.2.3 screens, plus seven Survey workspace screens (overview, my surveys, builder, settings, analytics, employee profile, profile fields) and four First Login / mandatory screens (password, profile with field errors, intro, form).

Result:
- First full run: **248 / 252 clean**. No text was below 4.5:1, there was no horizontal overflow and no JS errors.
- The 4 findings all had the same cause: in dark mode the hover colour of the primary button (#a3c7ff) counted as a "bright surface" on the password and form screens.
- Fix: in dark mode the hover colour now darkens (#5f9bf5, which still gives at least 6:1 with the dark label).
- Re-run of the four First Login and mandatory screens in the four dark configurations: **16 / 16 clean**.

## Not tested (not claimed)
- The real Netlify deploy and database (migration 035 not run there).
- Browsers other than Chromium; real phones and tablets (viewport emulation only); real screen readers (roles, live regions and keyboard behaviour were checked).
- Concurrency at real scale. The quota is checked inside a transaction with a row lock; the test database is single-connection.
- Excel export with the spreadsheet library loaded: the CDN is blocked in the test browser, so the E2E checks the CSV path.
