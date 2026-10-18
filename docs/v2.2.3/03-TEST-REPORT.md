# 03 — Test report v2.2.3

Test date: 2026-10-18. **Only executed results are listed.** Environment as in v2.2.2: PGlite (PostgreSQL 16) with migrations 001–034, the real Netlify Function handlers behind `tests/v2.2.1/backend/server.mjs`, Chromium driven by Playwright.

## Summary
| Suite | Result | Source / log |
|---|---|---|
| E2E v2.2.3 (GEN-08…12) | **75 / 75** | `tests/v2.2.3/e2e/e2e223.py`, `e2e223-results.log` |
| E2E v2.2.2 regression | **53 / 53** | `tests/v2.2.2/e2e/e2e222.py`, `tests/v2.2.3/e2e/regression-e2e222.log` |
| E2E v2.2.1 regression | **48 / 48** | `tests/v2.2.1/e2e/e2e221.py`, `tests/v2.2.3/e2e/regression-e2e221.log` |
| Legacy UI regression (mocked API: dialogs, focus, double-submit, notifications, Document mode) | **24 / 24** | harness from v2.2.0 (not shipped) |
| Backend integration (real handlers, real SQL) | **224 / 224** (no API change in v2.2.3) | `tests/v2.2.1/backend/backend.test.mjs`, `tests/v2.2.3/backend-rerun.log` |
| UI audit: contrast < 3:1 and < 4.5:1, bright surfaces in dark mode, horizontal overflow, JS errors | **175 / 175 clean** (25 screens × 7 configurations), 0 warnings | `tests/v2.2.3/e2e/ui_audit.py`, `ui-audit-results.log` |
| `node --check` on every changed script, syntax check of the inline app script | Pass | — |

### Test changes in the older suites (by design, not regressions)
- `e2e221.py` / `e2e222.py`: the result-message helper reads the shared notification (`REXUSNotify.last`) instead of the removed ring popup, and the form locator accepts a dialog **or** a form page (`.rx-dialog, .rx-page.active .rx-page-form`). No assertion was removed or relaxed.
- Legacy harness: the v2.2.0 check "toast sits at the bottom" was replaced by "result notification sits in the centre" (GEN-10 reverses that rule); the project form is found on its page.

## E2E v2.2.3 (75)
- **GEN-08 (20)**
  - Recipients (checkbox list): search box on top; "nguyen hoang" finds "Nguyễn Hoàng…"; "NGUYỄN HOÀNG" gives the same result; username matches; Select all applies to the filtered results only; "No results found"; selections survive a new query; Clear; ↓ from the search box + Enter selects.
  - Approvers (multi-select): searchable; focus goes to the search box; "tran" finds Trần/Trân without accents; ↓ + Space selects and the native field holds the value; Esc closes and returns focus; empty state.
  - Delegate (single select): type + Enter picks the match and shows it.
  - 150-item list: opens and filters in < 150 ms excluding the debounce; 61 matches for "nguoi dung so 1".
  - Task-form people picker: diacritic-insensitive; ↓↓ + Enter picks a person; "No results found".
- **GEN-09 (31)**
  - Request schedules opens as a page (no overlay) with its own URL, breadcrumb *HRM › Monthly Schedule › Request schedules…* and sticky actions.
  - Back returns to Team Schedules with the status filter kept.
  - Unsaved changes: Back asks first; cancelling keeps the input; browser Back can be cancelled.
  - Refresh reopens the page; browser Back then lands on HRM; submitting closes the page and returns to the list.
  - Direct links (new tab) for approval-new, approval-rule-new, approval-delegation-new, hr-leave-new, hr-employment, project-new, task-new open the right form; Back from each lands on its screen.
  - Nested pages: task page → log time opens on top → browser Back returns to the task → Back lands on All Tasks.
  - Finance: Add expense is a page under *Project Finance*; the same link opens it in a new tab; Back returns to the ledger with its filter.
  - Permissions unchanged: an Employee opening the admin-only routing-rule link is sent back to the Approval Center.
- **GEN-10 (15)**
  - A real save shows a centred Success with icon, English text and `role=status`; the old popup element is gone; it closes by itself after ~2.5 s; Esc and click close it earlier.
  - A failed form submit keeps the message inline in the form (validation stays at the form).
  - A failed list action (network aborted) shows a centred Error with OK, `role=alert`, focus on OK, and it does not close by itself.
  - A new notification replaces the old one; OK closes a warning; an action button (Retry) runs its callback.
  - The corner indicator for background progress is still there; the notification fits a 375 px screen in dark mode.
- **GEN-11 (3):** no row or card has more than 2 badges on Overview, All Tasks, Projects, Work Log, Calendar, Approval Center, Finance; no badge inside a badge; cards have no drop shadow.
- **GEN-12 (5):** every rendered badge (36 per mode on Overview, All Tasks, Approval Center → All, Team Schedules) reaches ≥ 4.5:1 in light **and** dark; all are full-fill (no border, no dot) in both modes; the CSS tokens equal palette 4.1.
- **Global:** no JavaScript errors.

## UI audit configurations
Dark Black & White at 1440, 768 and 375 px; dark Navy at 1440; light Black & White at 1440 and 375; light Navy at 1440.

Screens: the 20 v2.2.2 screens plus the Request schedules page, the leave form page, the New approval request page with the approver search open, an Error notification and a Success notification.

## Definition-of-Done test matrix
| Dimension | Covered by |
|---|---|
| Light / dark | E2E GEN-10 (dark), GEN-12 (both); UI audit (both) |
| Desktop / mobile | UI audit at 1440 / 768 / 375; E2E GEN-10 at 375 |
| Admin / Manager / Employee | Admin and manager flows in E2E GEN-08/09/10; Employee permission check in GEN-09; v2.2.2 suite covers member / part-time / manager roles |
| Empty, small and > 100-item lists | Empty states (GEN-08), 22-person recipients list, 150-option list |
| With and without diacritics | GEN-08 ("nguyen hoang" / "NGUYỄN HOÀNG", "tran") |
| Success and network error | GEN-10 (real save, aborted request) |
| Back, refresh, new tab | GEN-09 |
| Keyboard, focus, contrast, screen-reader announcements | GEN-08 keyboard, GEN-10 focus + `role`/`aria-live`, GEN-12 contrast, UI audit |

## Not tested (not claimed)
- Real Netlify deploy and the production database (no migration in this release).
- Browsers other than Chromium; real phones (viewport emulation only).
- Real screen readers (roles, live regions and keyboard behaviour were checked, not the spoken output).
- Every one of the ~100 legacy `showSync(..., 'ok'|'error')` call sites individually — they all go through the one function that now calls the shared component; a sample is exercised by the E2E suites.
