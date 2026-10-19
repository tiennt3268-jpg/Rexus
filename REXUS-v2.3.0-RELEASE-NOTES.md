# REXUS Work Management v2.3.0 — Release Notes

Release date: 2026-10-19 · Source: **REXUS Survey v1.0.0 — SRS + UI/UX B+C, Fullscreen REV1** (RS-SPEC-1.0-UIUX-BC-FS-REV1) · Builds on v2.2.3 · Schema: migrations 001–**035**

> **Version note.** The document describes *REXUS Survey v1.0.0* on top of REXUS v2.2.3. Because it adds a new workspace and a database migration, the platform release is numbered **v2.3.0**; the Survey module inside it is v1.0.0.

Full documentation: [`docs/v2.3.0/`](docs/v2.3.0/README.md) · Guide: [`02-SURVEY-GUIDE`](docs/v2.3.0/02-SURVEY-GUIDE.md) · Screenshots: [`docs/v2.3.0/evidence/`](docs/v2.3.0/evidence).

## Decisions D1–D8
The SRS left D1–D8 "pending approval", each with a proposed answer. All proposed answers were applied: DOB and Education Level required for new accounts (D1); target groups combined with OR (D2); closed / expired / full surveys release the gate automatically (D3); conditional logic, matrix and file upload postponed (D4); B + C design (D5); real data only on Overview (D6); responsive and accessibility in this release (D7); REXUS Dark mode kept through semantic tokens (D8). Details and the other choices made: [04-DECISIONS-AND-LIMITATIONS](docs/v2.3.0/04-DECISIONS-AND-LIMITATIONS.md).

## What's new

### REXUS Survey workspace (F01)
- A third workspace in the App Switcher, next to Work Management and Document. It uses the same account and session; nothing depends on Google Forms or Google sign-in.
- Navigation:
  - **Overview** — KPIs, Needs your attention, Quick actions, 7-day response activity, Surveys for you.
  - **My Surveys** — search, status, owner, sort, row actions.
  - **Survey Builder**, **Survey Settings**, **Analytics**.
  - **Employee Profiles** and **Profile Fields** (System Admin).
- Builder:
  - Three panes: question types, canvas, properties.
  - Nine question types: Short, Long, Single choice, Multiple choice, Dropdown, Rating, Linear scale, Date, Number.
  - Per question: required flag, helper text, options and limits.
  - Reorder, duplicate, delete, autosave, preview at desktop and mobile width.
  - Templates: blank, employee engagement, training feedback.
- Publishing freezes the questions as an immutable **version**; changes after publishing create the next version only if something changed. Each response stays linked to the version it answered.
- Lifecycle: Draft → (Scheduled) → Active → Closed ↔ Reopen → Archived. Duplicate creates a new draft.
- Analytics:
  - Per-question summaries: choice bars, average and distribution, text answers.
  - Daily trend; filters by date, department and job position; response list with answers.
  - **Exclude** a response with a logged reason; the original answers are never edited.
  - Export to CSV (formula-safe) or Excel.
- Public surveys at `survey.html?id=…` for people without an account. No user ID is stored.

### Mandatory survey on login (F02–F05)
- A System Admin can make an authenticated survey mandatory for **All employees**, **Departments**, **Job positions** and/or **Specific employees** (by User ID).
  - Groups are combined with OR, and a live estimate shows how many unique accounts match.
  - When several mandatory surveys apply, the order follows the admin's priority.
- The **Mandatory Intro** and **Mandatory Form** fill 100% of the viewport on desktop, tablet and phone. Neither is a modal.
  - The intro has a single **Start survey** action; there is no Skip, Close or Dashboard (Sign out stays available).
  - The form shows progress and a question navigator, with Previous/Next and Submit. Validation happens at each question. The action bar stays on screen, drafts are kept on the device, and Retry is offered on network errors.
- The respondent is always the signed-in User ID, together with their department and position at that moment. Demographic data is not copied into responses.
- Availability:
  - Opening and closing times (Asia/Ho_Chi_Minh).
  - A response limit, checked in the same transaction as the insert.
  - Manual close.

  Whichever condition is reached first applies, and nobody stays blocked by a survey that has stopped.

### First Login onboarding (F06–F07)
- New accounts, and accounts whose password an admin resets, must first create their own password.
  - Minimum 8 characters with a letter and a digit, different from the temporary password.
  - 5 attempts per 15 minutes.
- Then the account must fill in the required personal fields (default: Date of Birth, Education Level). After that come any mandatory surveys, and only then the workspace.
- The order is enforced **on the server** for every API call. Refreshing, opening a new tab, typing a module URL or signing in on another device all return to the missing step.
- Existing accounts are not affected after the upgrade. An admin can roll out the required fields with *Profile Fields → Apply to existing accounts*.
- Profile Fields lets an admin change label, visibility, required flag, order and dropdown options. A hidden field is never required.
- Employees edit their own fields in **My Account → Personal information**. Name, department and position stay HR-managed.
- Personal information is visible only to the person and System Admins. Changes are audit-logged with field names only.
- Employee Profiles shows onboarding status and has a **Reset password** action, which shows the new temporary password once.

### Also changed
- The password rule (≥ 8 characters with a letter and a digit) now applies to every password change, including forgot-password.
- If a mandatory survey is published while someone is working, their next action shows the survey intro instead of the login screen.
- `data-rx-search` can force the searchable list (GEN-08) on short lists; Survey target pickers use it.

## Testing (executed; details in [03-TEST-REPORT](docs/v2.3.0/03-TEST-REPORT.md))
- Backend: **97/97** new checks (AC01–AC08 server side) and **224/224** existing checks.
- E2E v2.3.0: **67/67** (AC01–AC09, UIAC06–UIAC10, builder, analytics, export, public survey, My Account, admin screens).
- Regression: E2E v2.2.3 **75/75**, v2.2.2 **53/53**, v2.2.1 **48/48**, legacy UI harness **24/24**.
- UI audit: 36 screens × 7 configurations (light/dark, both themes, 1440/768/375 px), including the Survey workspace, First Login and mandatory screens. **248/252** were clean on the first run; the 4 findings were one dark-mode hover colour, which is fixed and re-checked (16/16 clean).
- `tsc --noEmit` on every new or changed function.

## Upgrade
Migration 035 (additive). No new environment variables. See [01-DEPLOYMENT](docs/v2.3.0/01-DEPLOYMENT.md).
