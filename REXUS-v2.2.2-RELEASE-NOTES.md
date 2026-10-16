# REXUS Work Management v2.2.2 — Release Notes

Release date: 2026-10-16 · Source requirement: **Requirement V2.1.2 (Updated)** · Builds on v2.2.1 · Schema: migrations 001–**034**

> **Version note.** The requirement document is titled "V2.1.2", but the system was already at v2.2.1, so this release is numbered **v2.2.2**.

Full documentation: [`docs/v2.2.2/`](docs/v2.2.2/README.md). Before/after screenshots: [`docs/v2.2.2/evidence/`](docs/v2.2.2/evidence).

## Decisions confirmed by the product owner (2026-10-16)

| Question | Decision |
|---|---|
| Q04 Delete account | **Soft delete.** The account is locked, hidden and signed out everywhere. Its history is kept, and an admin can restore it. |
| Q01 Dark mode | **Light / Dark / System**, saved per account. The existing color themes (Black & White, Navy & Light Blue) work in both modes. |
| Q06–Q08 Monthly schedule | **Extend the capacity declaration workflow.** Every employee registers regular hours and overtime. The flow is Draft → Submit → manager approves or requests changes. Part-time staff have a minimum number of hours per month (a company default, overridable per person). Managers send requests to All or Selected employees through in-app notifications. |
| Q11 Column widths | Saved **per browser**. |

The remaining open questions were handled with the defaults stated in the requirement document. See [decisions & limitations](docs/v2.2.2/05-DECISIONS-AND-LIMITATIONS.md).

## Changes by requirement

### Shared interface
- **GEN-01 UI review.** All 20 main screens were checked with an automated contrast and overflow audit:
  - Dark mode, Black & White and Navy themes, at 1440 px.
  - Dark mode at 768 px and 375 px.
  - Light mode, both themes, at 1440 px and 375 px.
  - Result: **140/140 screen checks clean**. No text is below 3:1 contrast, no bright surface is left in dark mode, there is no horizontal page overflow, and there are no JavaScript errors.
- **GEN-02 Palette.**
  - Navy, blue and neutral tokens are used for both modes. Avatar colors were replaced by a palette where every color gives at least 4.5:1 contrast with white initials.
  - All hard-coded white surfaces and translucent white layers in `rexus-ui.css` were converted to tokens (`--rx-surface`, `--rx-wash`).
- **GEN-03 Dark mode.**
  - New `rexus-dark.css`.
  - Light / Dark / System can be chosen in My Account → Appearance. The change applies instantly, with no sign-out or reload.
  - The choice is saved per account (`/api/preferences.mode`) and cached in the browser so the page doesn't flash on load. System mode follows the operating-system setting live.
  - Pages, tables, modals, dropdowns, forms, the launcher, the login screen and the Document editor are all covered.
- **GEN-04 Redundant subtitles.**
  - Removed under Human Resources Management and the Approval Center, and on the three Document home cards.
  - Kept where the text gives real guidance: Resource Planning ("advisory only") and Project Finance ("Approved budget is never counted as received cash").
- **GEN-05 English UI and no old-login flash.**
  - The login screen is now hidden until the session check finishes **and** every stylesheet has loaded, so the old navy-header login no longer flashes.
  - All remaining Vietnamese UI strings were translated: the launcher heading, the employee modal tabs, Position/Department labels, and the project cost close/reopen flow including its toasts, prompts and confirmations.
- **GEN-06 Drag-to-reschedule Gantt removed.**
  - The "Interactive Gantt (drag to reschedule)" section, the frappe-gantt CDN loader, and its drag write-back code were removed.
  - The WBS + Gantt timeline (view, navigate, dependencies, progress) is unchanged. Dates are edited only through the task forms.
  - The project "Enable Gantt chart" setting is kept, because it controls the dependency fields.
- **GEN-07 Column resizing.**
  - Every data table in REXUS and REXUS Document gets a draggable column edge.
  - Minimum column width is 56 px. Tables wider than the screen scroll horizontally.
  - Arrow Left/Right on a focused edge resizes it from the keyboard; double-click an edge to reset.
  - Widths are remembered per browser. Header sorting and row selection still work. The handles are hidden on touch devices.

### Accounts
- **ACC-01 Username.**
  - The Create Account form has a Username field, suggested from the full name (diacritics removed) and editable before saving.
  - Format: 3–32 characters, using `a–z 0–9 . _ -`, starting and ending with a letter or digit.
  - Usernames are unique regardless of case, and deleted accounts keep theirs reserved. Duplicates are rejected with a clear message (409).
  - The new account can sign in with its username.
- **ACC-02 Delete account (soft).**
  - Admin only, from Configuration → Employees. To confirm, the admin must type the account's username.
  - You cannot delete the account you are signed in with.
  - What deletion does:
    - Sets the account to Inactive, with `deleted_at` / `deleted_by`.
    - Hides it from lists and pickers. It still resolves for names on old records.
    - Blocks sign-in.
    - **Cuts every existing session on every API immediately.** `getUserFromRequest` now checks the account status, which also closes the old gap where a deactivated user kept API access until the next page load.
    - Writes an audit-log entry.
  - "Show deleted accounts" lists deleted accounts with a **Restore** button. A restored account comes back Inactive, and an admin re-activates it explicitly.
- **ACC-03 Admin edits own profile.**
  - In My Account, a System Admin can edit their own username, email, position and department, with server-side format and uniqueness checks.
  - Role and status are never accepted from this form.
  - Other users can only change their name. Any other field returns 403.
  - Username and email changes are audit-logged.

### HRM / Planning capacity
- **HRM-01 Permissions.**
  - Every HR action is checked on the server. See the matrix for QA: [02-HRM-PERMISSION-MATRIX](docs/v2.2.2/02-HRM-PERMISSION-MATRIX.md).
  - HR permissions are not extended to Project, Task or Subtask.
- **HRM-02 Monthly schedule for everyone.** The HR tab is now called **Monthly Schedule**.
  - Every employee picks a month and sees its status.
  - Days can be added, edited or cleared, each with regular hours, overtime (OT) and a note.
  - Each day is stored once (the server de-duplicates), so totals never double-count a day.
  - Managers see regular capacity, OT and status per person per month.
- **HRM-03 Full-time and OT.**
  - Full-time regular hours come from the working schedule (for example 8 h on workdays) and are never filled in on rest days or holidays.
  - OT is declared separately. It is shown separately and reported as "approved OT"; it is **not** added to regular capacity or utilization.
  - Regular hours + OT may not exceed 24 h in a day.
- **HRM-04 Part-time minimum.**
  - An HR admin sets a company default minimum of regular hours per month. A personal minimum on the employee profile overrides it.
  - Below the minimum, the employee sees a warning (submission is still allowed) and the manager sees the shortfall.
  - The minimum in force is **frozen on the submitted month**, so later settings changes never rewrite approved history.
- **HRM-05 Schedule requests.**
  - A manager chooses a month, All or Selected people, an optional due date and a message.
  - Each person receives an in-app notification that opens that month's form, plus a banner on the form.
  - The manager sees, per person, when the request was sent and how many times.
  - Re-sending updates the same employee-month request (×2, ×3 …) instead of creating duplicates.

### REXUS Document
- **DOC-01 Show/hide.** The sidebar sections ("In &lt;space&gt;", "Other shared items") are toggle buttons with `aria-expanded`, work from the keyboard, and are remembered per browser. Folders keep their existing expand/collapse.
- **DOC-02 Wider dialogs.**
  - Root cause: the dialog wrapper was a content-sized grid, so every Document dialog shrank to about 300 px.
  - Dialogs are now `min(600px, viewport)`, scroll internally, and become a bottom sheet on phones.
  - Focus, Cancel, Save and error messages are unchanged.
- **DOC-03 Seamless editor.** There is no outline or box around the writing area or the title while typing. The caret shows focus in the body; the title shows a thin accent underline when focused. Formatting, selection and saving are unchanged.

## Migration 034 (additive)
`netlify/database/migrations/034_rexus_v222/migration.sql`. Applying it twice is safe; this was tested.

| Change | Purpose |
|---|---|
| `rexus_user_preferences.mode` (`light`/`dark`/`system`, default `light`) | GEN-03 |
| `users.deleted_at`, `users.deleted_by` | ACC-02 soft delete |
| `rexus_capacity_entries.ot_hours` (0–24, regular + OT ≤ 24) | HRM-03 |
| `rexus_capacity_declarations.ot_total_hours`, `.min_hours_snapshot` | HRM-03 / HRM-04 |
| `rexus_hr_settings` (single row, `part_time_min_monthly_hours`) | HRM-04 company default |
| `rexus_resource_settings.min_monthly_hours` | HRM-04 personal override |
| `rexus_schedule_requests` (UNIQUE month + user) | HRM-05 |

No DROP, no DELETE, no ID changes, and no rewrite of existing rows.

## API additions
- `GET/PUT /api/preferences`: now includes `mode`.
- `DELETE /api/admin/users/:id {confirm_username}`: soft delete. `POST /api/admin/users/:id {action:'restore'}` restores.
- `POST /api/admin/users`: validates `username`.
- `PUT /api/auth/profile`: admins can also send username, email, position and department.
- `GET /api/users?include_deleted=1`: includes deleted accounts, flagged with `deleted: true`. Without the parameter, deleted accounts are hidden.
- `GET /api/hr/capacity`: now returns `schedule_hours`, `minimum` and `requests`. `POST` accepts `ot_hours` per entry.
- `GET /api/hr/team`: now returns regular capacity, OT, minimum and request per person.
- `POST /api/hr/requests` and `GET/PUT /api/hr/settings`: new.

## Testing (actually executed — see [04-TEST-REPORT](docs/v2.2.2/04-TEST-REPORT.md))
- **Backend:** 224/224 checks on PGlite (PostgreSQL 16) against the real handlers. This includes **68 new v2.2.2 checks**. Migrations 033 and 034 were each re-applied a second time without error.
- **E2E, v2.2.2 suite:** **53/53** in Chromium against the real handlers.
- **E2E, v2.2.1 regression:** **48/48**.
- **Legacy UI regression** (mocked API): **24/24**.
- **UI audit:** **140/140** screen checks across modes, themes and widths.
- `tsc --noEmit` and JavaScript syntax checks passed.
- **Not tested:** the real Netlify Database and deploy pipeline, real multi-connection concurrency, Safari and Firefox, real phones, screen readers, and email delivery (notifications are in-app only).
