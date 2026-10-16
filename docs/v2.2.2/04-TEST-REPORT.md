# 04 — Test report v2.2.2

Test date: 2026-10-16. **Only executed results are listed.** The environment is the same as in v2.2.1 ([../v2.2.1/07-TEST-REPORT.md](../v2.2.1/07-TEST-REPORT.md)): PGlite (PostgreSQL 16) with migrations 001–034, the real Netlify Function handlers, and Chromium driven by Playwright.

## Summary
| Suite | Result | Source / log |
|---|---|---|
| Backend integration (real handlers, real SQL) | **224 / 224** (156 carried over from v2.2.1, 68 new) | `tests/v2.2.1/backend/backend.test.mjs`, `backend.log`, `backend-results.json` |
| Migration idempotency | 033 and 034 re-applied on a migrated DB: **OK** | `tests/v2.2.1/backend/rerun.mjs` |
| E2E v2.2.2 features | **53 / 53** | `tests/v2.2.2/e2e/e2e222.py`, `e2e222-results.log` |
| E2E v2.2.1 regression | **48 / 48** | `tests/v2.2.1/e2e/e2e221.py` |
| Legacy UI regression (mocked API: dialogs, focus, double-submit, toasts, Document mode) | **24 / 24** | harness from v2.2.0 (not shipped) |
| UI audit: contrast < 3:1, bright surfaces in dark mode, horizontal overflow, JS errors | **140 / 140 clean** (20 screens × 7 configurations) | `tests/v2.2.2/e2e/ui_audit.py`, `ui-audit-results.log` |
| `tsc --noEmit` on the changed functions; `node --check` on the changed scripts | Pass | — |

## New backend checks (68)
- **GEN-03 (5):** default mode is light; dark is saved and persists per account; system + navy together; unknown mode rejected.
- **ACC-01 (6):**
  - Only admins can create accounts.
  - An invalid format is rejected with a message, and a duplicate username is rejected regardless of case.
  - The account is created with the chosen username, a duplicate email is rejected, and the new account signs in with its username.
- **ACC-03 (7):**
  - The admin saves their own username, email, position and department, and the changes persist.
  - Role and status cannot be changed from the profile form.
  - Another user's username is refused, and an invalid username is refused.
  - A member cannot change their username or role, but a member can change their full name.
  - The change is audit-logged.
- **ACC-02 (19):**
  - Only admins can delete; you cannot delete yourself; the confirmation must match the username.
  - The row is kept as Inactive with `deleted_at` and `deleted_by`, and work-log history is kept.
  - The deleted account's session gets 401 on every API, `/auth/me` returns signed out, and sign-in is blocked.
  - The account is hidden from lists but can still be resolved with `include_deleted`. Editing it is refused (409), and a second delete returns 404.
  - Deletion is audit-logged. Restore works and returns the account Inactive; re-activating it works.
  - Deactivation also cuts the session immediately.
- **HRM-01 (7):** see the [permission matrix](02-HRM-PERMISSION-MATRIX.md).
- **HRM-02/03 (9):**
  - Full-time regular hours equal the schedule, with nothing on weekends.
  - OT is separate, and a duplicate day is counted once. Notes are kept, and a Saturday never gets regular hours.
  - More than 24 h in a day is rejected.
  - On submit, the approver sees "+ OT" in the title. After approval, OT is reported separately and capacity is unchanged.
  - The team view shows regular hours and OT.
- **HRM-04 (8):**
  - The admin sets the minimum; an invalid value is rejected; the part-time employee sees the company minimum.
  - Saving below the minimum is flagged (regular 12 h, OT 1 h), and the manager sees the shortfall.
  - The submitted month freezes the minimum (40), and changing the setting to 60 does not rewrite the approved month.
  - A personal minimum (10) overrides the company default.
- **HRM-05 (7):**
  - A request to All reaches every managed person. Re-sending updates the existing row instead of duplicating it, and the send count is tracked.
  - The employee sees the request with the due date and the requester, and gets two in-app notifications.
  - The manager sees request status per person. An invalid month is rejected.
- **Plus the session-status change:** all 156 earlier checks still pass with `getUserFromRequest` now checking account status.

## E2E v2.2.2 (53)
- **GEN-05 (7):**
  - No login flash when a signed-in user reloads.
  - The launcher is in English, and signed-out visitors see the restyled login screen.
  - The sign-in form works with a username, and refreshing doesn't flash.
  - A cleared cookie (expired session) returns to the login screen, and signing out shows the login screen.
- **GEN-06 (2):** no drag Gantt; the timeline still shows bars and dependency links.
- **GEN-04 (2):** subtitle removed; guidance kept.
- **GEN-07 (5):** drag to widen with aligned cells; Arrow-key resize; kept after reload; double-click resets; no page overflow.
- **GEN-03 (6):**
  - Three modes are offered, and dark applies instantly and survives a reload.
  - The mode follows the account into a new browser.
  - System follows the operating system, checked with both light and dark emulation.
- **ACC-03 (4), ACC-01 (3), ACC-02 (5):**
  - Admin edits their own profile; an inline error appears for a bad username; the profile persists; the role stays read-only.
  - The username is suggested; duplicates are refused; the new account is listed.
  - There is no delete button on your own row; the confirmation must match; the deleted account disappears, then shows under "Show deleted", and Restore works.
- **HRM (13):**
  - The admin sets the minimum.
  - Full-time: the form shows read-only regular hours plus OT; OT is saved separately; the summary shows regular and OT apart; notes are saved.
  - Part-time below the minimum sees a warning.
  - Manager: the team table shows regular hours, OT and the minimum, plus the shortfall; requests send; status shows "Sent"; re-sending shows ×2.
  - Employee: gets the notification, and clicking it opens the right month with the banner.
- **DOC (5):** a sidebar section hides on click (`aria-expanded`) and reopens with Enter; New page is at least 560 px on desktop and inside the viewport on mobile; no box around the editor body or title.
- **Global:** no JavaScript errors.

## UI audit configurations
Dark Black & White at 1440, 768 and 375 px; dark Navy at 1440; light Black & White at 1440 and 375; light Navy at 1440.

Screens: overview, all tasks, projects, project detail (WBS + Gantt), work log, calendar, HR (employees, leave, monthly schedule, team), resource planning, approval center, finance, project financials, my account, user menu, notifications, new-task modal, launcher, documents.

## Not tested (not claimed)
- Real Netlify Database or Blobs and the deploy pipeline (034 was not run on the real database).
- Real multi-connection concurrency.
- Browsers other than Chromium, and real mobile devices (only viewport emulation was used).
- Screen readers (only ARIA attributes and keyboard behaviour were checked).
- Email notifications (they don't exist; notifications are in-app only).
- Contrast inside user-authored document content with custom colors.
