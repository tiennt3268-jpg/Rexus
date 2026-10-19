# 01 — Test report v2.3.1

Test date: 2026-10-19. **Only executed results are listed.** Environment: PGlite (PostgreSQL 16) with migrations 001–035, the real Netlify Function handlers (`tests/v2.2.1/backend/server.mjs`), Chromium driven by Playwright. Each E2E suite ran on a fresh database.

## Summary
| Suite | Result | Log |
|---|---|---|
| E2E v2.3.1 — reorganisation (new) | **44 / 44** | `tests/v2.3.1/e2e/e2e231.py`, `e2e231-results.log` |
| Backend — existing integration checks | **224 / 224** | `tests/v2.3.1/backend/backend-regression.log` |
| Backend — Survey + First Login | **97 / 97** | `tests/v2.3.1/backend/survey-regression.log` |
| E2E v2.3.0 regression | **68 / 68** | `tests/v2.3.1/e2e/regression-e2e230.log` |
| E2E v2.2.3 regression | **75 / 75** | `regression-e2e223.log` |
| E2E v2.2.2 regression | **53 / 53** | `regression-e2e222.log` |
| E2E v2.2.1 regression | **48 / 48** (second run, after two by-design test updates; the first run was 46 / 48, see below) | `regression-e2e221.log` |
| Legacy UI harness (mocked API) | **24 / 24** | `regression-interact.log` |
| UI audit, full (42 screens × 7 configurations) | 294 / 294 reported clean, no JS errors. **However**, the 5 employee-record screens in that run showed an unrelated "Discard changes" dialog, so they were not really checked (see below). | `ui-audit-results.log` |
| UI audit, new screens re-run (8 screens × 7 configurations) | **56 / 56 clean**, no JS errors | `ui-audit-rerun-new-screens.log` |
| `node --check` on changed scripts; syntax check of the inline app script | Pass | — |

No backend file changed in this release, so the backend suites are regression only. `tsc` was not re-run, because no `.mts` file changed.

### Order of runs
Every suite above ran on the final code with two exceptions:
- **CSS fix after the first runs.** The full regression ran before a small CSS fix: horizontal scrolling for the Compensation tables and a single-column rate form at ≤ 640 px. The rules only target the new employee-record elements (`#rxCompFinance`, `#rxCompRates`, `.rx-emp-body`).
- **Version bump after the first runs.** The `?v=2.3.1` cache-busting was also added afterwards.

After those two changes, E2E v2.3.1, E2E v2.2.1 and the new-screens audit were run again: 44/44, 48/48 and 56/56. The other suites were not re-run after the CSS-only change.

## E2E v2.3.1 (44)
- **No duplicate entry points (4)**:
  - The hidden duplicate tabs are gone.
  - `rexus-v210.js` and `rexus-v211.js` are not loaded, `window.REXUS210` is undefined, and no bulk-copy column appears.
  - The old `#/resource-planning` and `#/project-financials` links open HRM → Resource Planning and Finance → Project Financials.
- **Configuration (3)**:
  - It keeps Company info, Task types and Performance-pay rules.
  - It holds no account list or rate editor, and shows a note.
  - Its button opens HRM.
- **HRM accounts → record (12)**:
  - The account list is shown to a System Admin. The username is suggested, the account is created with a temporary password shown once, and it appears in the list.
  - A row opens the record, not the modal, with tabs Overview / Employment & leave / Personal information / Compensation / Account.
  - The Account tab shows the pending first sign-in.
  - Edit opens the account editor on its Account pane, and the edit is saved.
  - Reset password shows the temporary password.
- **Record content (10)**:
  - `REXUS221.openEmployee` opens the record from code.
  - Overview shows linked work, and a project link opens Project Detail.
  - Project Detail shows the summary with *Open in Project Finance*, and that button opens the project in Finance.
  - Personal information is saved from HRM.
  - Compensation shows salary history, rate history and Edit Salary.
  - A System Admin gets a rate editor fixed to that employee, and a new rate is saved and listed.
- **HR Settings / Survey (6)**:
  - The tab is renamed HR Settings and shows Profile fields with *Apply to existing accounts*. A field change is saved.
  - The Survey navigation has no profile pages.
  - The old `#survey/profiles/<id>` link opens the HRM record on Personal information, and `#survey/fields` opens HR Settings.
- **Finance (1)**: a By Personnel row opens the record on Compensation.
- **Approval Center (4)**:
  - A member submits leave.
  - The manager opens the request, which shows *Open related record*.
  - That link opens HRM → Leave Management.
- **Permissions unchanged (5)**:
  - A Project Manager gets no Personal information or Account tab for someone else, no rate editor, and no account list.
  - A Member looking at a colleague sees Overview only; a Member looking at themself also gets Personal information.
- **No JavaScript page errors (1).**

## Tests changed by design (no assertion weakened beyond the moved UI)
| Test | Change | Reason |
|---|---|---|
| `e2e230.py` admin section | Opens `#survey/profiles/<id>` and `#survey/fields`, which now redirect, and checks the HRM record (Personal information, then the Account tab for the status) and HR Settings. The single "status + personal information" check became two checks (67 → 68). | Employee Profiles / Profile Fields moved to HRM |
| `e2e222.py` ACC-01/02 | Account create / delete / restore starts from HRM → Employee Search instead of Configuration. Same selectors and the same assertions. | The account list moved to HRM |
| `e2e222.py` GEN-04 | Opens Project Financials through the route alias instead of clicking the removed hidden tab. | Hidden duplicate tab removed |
| `e2e221.py` M4 | Clicks the *Employment & leave* tab before checking "Employment & capacity". | The record opens on Overview |
| `e2e221.py` M7 | In Project Detail, expects ≥ 5 summary metrics plus *Open in Project Finance*, instead of ≥ 7 metrics from the full inline ledger. | Project Detail shows a summary; the ledger lives in Project Finance |
| `ui_audit.py` (v2.3.1 copy) | Resource Planning / Project Financials are opened from their owner modules. The survey-profiles and survey-fields screens were replaced by 8 new screens: 5 record tabs, HRM accounts, HR Settings, Configuration. | Screens moved |

## UI audit
- Configurations: dark Black & White at 1440 / 768 / 375 px, dark Navy at 1440, light Black & White at 1440 / 375, light Navy at 1440.
- **Full run**: 42 screens × 7 configurations = 294, all reported clean (contrast, dark surfaces, page overflow, JS errors).
  - Review of the screenshots showed that the 5 employee-record screens were covered by a "Discard changes" confirmation left by the previous screen, an unsaved form page. Those 35 results therefore do not count.
  - The navigation was fixed with a fresh page load before the record.
- **Re-run of the 8 new screens in all 7 configurations: 56 / 56 clean, no JS errors.**
  - The screenshots were checked by eye.
  - At 375 px the Compensation card was wider than the screen. A card-level overflow is not caught by the page-overflow rule. It was fixed (tables scroll inside the card) and checked again.
- Screenshots: `docs/v2.3.1/evidence/`.

## Not tested (not claimed)
- The real Netlify deploy (no migration in this release).
- Browsers other than Chromium; real phones (viewport emulation only).
- Opening a record as a Project Manager for someone **outside** their managed scope. The server returns 403 for the Compensation data (finance rules are unchanged and covered by the backend suite), but the UI message for that case was not checked in E2E.
