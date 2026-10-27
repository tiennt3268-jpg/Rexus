# 01 — Test report v2.3.5

**Test date:** 2026-10-28.

**Only executed results are listed here.**

**Environment:**
- PGlite (PostgreSQL 16) with migrations 001–035 and 037.
- The real Netlify Function handlers, served by `tests/v2.2.1/backend/server.mjs`.
- Chromium (Playwright).
- Each E2E suite ran on a fresh database: `tests/v2.3.5/e2e/run.sh` restarts the server before each suite.

## Summary
| Suite | Result | Log |
|---|---|---|
| E2E v2.3.5: every requirement ID (new) | **84 / 84** | `tests/v2.3.5/e2e/e2e235.py`, `e2e235-results.log` |
| Backend v2.3.5: timeline, partial edit, conflict, clone / archive / move / convert, transaction rollback, permissions (new) | **78 / 78** | `tests/v2.2.1/backend/actions.test.mjs`, `tests/v2.3.5/backend/actions.log` |
| Unit: completion and performance (worked example, N/A cases, caps) (new) | **20 / 20** | `tests/v2.3.5/unit/metrics.test.js`, `metrics.log` |
| Backend regression: existing integration checks | **224 / 224** | `backend/backend-regression.log` |
| Backend regression: Survey and First Login | **97 / 97** | `backend/survey-regression.log` |
| Backend regression: Survey sections | **11 / 11** | `backend/sections-regression.log` |
| E2E v2.3.4 / v2.3.1 / v2.3.0 regression | **69 / 69**, **44 / 44**, **68 / 68** | `e2e/regression-e2e234.log`, `-e2e231.log`, `-e2e230.log` |
| E2E v2.2.3 / v2.2.2 / v2.2.1 regression | **75 / 75**, **53 / 53**, **48 / 48** | `e2e/regression-e2e22*.log` |
| Legacy UI harness (mocked API) | **24 / 24** | `e2e/regression-interact.log` |
| UI audit: 60 screens × 7 configurations (420 screen checks) | 393 / 420 clean on the full run. The 27 findings were 2 contrast issues in dark mode; they were fixed, and the 4 dark configurations were checked again: **28 / 28 clean**. | `e2e/ui-audit-results.log`, `e2e/ui-audit-rerun-dark.log` |
| `tsc --noEmit` on all functions; `node --check` on `rexus-metrics.js`; syntax of the inline app script | Pass | — |

No older test was changed. Every older suite ran unchanged.

## Problems found by the runs and fixed
1. **e2e223 (first run 73 / 75): GEN-12 badges must be full-fill with no outline.** The new status colours had a 1 px border, and their dark tones were translucent. Badges are now borderless with opaque dark tones. Result: 75 / 75.
2. **e2e230 (first run stopped at the HRM record check).** The fix for "reload on `#/overview` shows an empty Dashboard" re-rendered every empty view, and that wiped the HRM record opened from an old Survey link. The fix now applies to the Dashboard only. Result: 68 / 68.
3. **UI audit findings (dark mode):**
   - The active tab count was white on the light accent, at 2.3 : 1.
   - The Gantt "Today" label was at 3.3 : 1.
   - Both now use fixed accessible colours. The re-check was clean.
4. **During development:**
   - A CSS selector for square corners was accidentally a descendant selector, which made avatars square. This was caught by e2e235 (UI-01, avatars) and fixed.

## Order of runs
1. Backend suites, unit tests, and the e2e234 / 231 / 230 / 223 / 222 / 221 and legacy harness regressions on the code at that point.
2. Fixes 1 and 2. Then e2e223, e2e230 and e2e235 again, plus the backend `actions` suite after a small server change: restoring a converted task is now refused.
3. Full UI audit, with 7 configurations, then fix 3 and the dark re-check.
4. Last changes were CSS only: the transparent action bar and the contrast colours. After them, e2e235 (84 / 84) and e2e234 (69 / 69) were run again.

Not run again after steps 3–4: e2e231, e2e222, e2e221 and the legacy harness. Those changes were CSS only, plus the Dashboard-only reload fix. The backend survey and sections suites were also not run again; the only later server change was inside `work-actions.mts`.

## E2E v2.3.5 (84) by requirement
| ID | Checks |
|---|---|
| UI-01 | Square corners on buttons, cards, tabs and inputs · avatars stay round · keyboard focus visible |
| UI-02 | Input padding within 6–8 / 10–12 px · label gap within 4–6 px · body line-height within 1.35–1.45 |
| PRJ-01 | Worked example: completion 60 %, performance **120 · Ahead** in green · tooltip on keyboard focus lists estimated / logged / planned earned / earned / SPI / EI · N/A without tasks, no NaN · completion ≤ 100 · project header shows badge, chip and "% complete" |
| PRJ-02 | Active green · Cancelled blue · unknown status neutral · task badges use the same map |
| DSH-01 | Exact tab labels · count equals rows for each tab, and the selected tab is marked · Today and Completed content · arrow keys · a row opens the task · tab remembered |
| DSH-02 | A bar for every dated in-progress task · undated tasks listed · axis and today marker · horizontal scroll · dragging a bar changes nothing (checked through the API) · "Assigned to me" filter · a bar opens the task |
| DSH-03 | No Progress section or Overall Progress card |
| DTL-01 | Read mode without controls · empty values as text · pencil on hover and on keyboard focus · single-field edit opens one field · Save sends only that field + version · value shown after save · leave guard · last saved value kept · global Edit / Cancel / Save (changed fields only) · empty name refused · concurrent change → conflict dialog, the other person's change kept · subtask detail also in read mode |
| DTL-02 | Edit / Assign / Comment / More · old footer hidden · Assign focuses the people picker · Comment focuses the composer · More items · Escape closes the menu · menu fits a 375 px screen |
| DTL-03 | No Participants · Created by / Created / Last updated in Activity |
| ACT-01 | Clone dialog with optional subtasks · opens the new ID · subtasks copied, work logs not · archive hides it from All Tasks · Archived view · restore · server refuses archive by a member who cannot edit |
| ACT-02 | Preview text · subtask → task opens the new task · old subtask link opens it · "task with subtasks → subtask" disabled · preview follows the name · task → project · old task link opens the project · duplicate project name refused |
| ACT-03 | Destination list without the current project · no destination → message · moved with the same ID · breadcrumb updated |
| LOG-01 | "Priority: High → Low" with actor · clone / archive / restore events · move shows source and destination · no access → 403 · 50 per page + Load older · newest first |
| — | 375 px: no page overflow on detail and Dashboard · no JavaScript page errors |

## Backend v2.3.5 (78), main points
- Migration 037 columns and table.
- Partial edits keep reporters, dependencies and labels.
- A stale `expected_updated_at` returns 409 with the latest copy.
- The project cannot change through an edit.
- Timeline events for create, update, status, subtask, work log and comment, with `from → to`.
- Paging and access: an outsider gets 403. Forged client entries are ignored.
- Clone, archive and restore. Archived items are hidden and cannot be edited.
- Moves: removed dependency links are reported. Destination role is checked. Closed costs block a move across projects.
- Conversions in all three directions, with aliases and alias chains. A task with subtasks cannot become a subtask. A converted task cannot be restored. Done % is kept within 0–100.
- **A failure inside a conversion rolls back everything:** no new task is created and nothing is archived.

## Not tested (not claimed)
- The real Netlify deploy and migration 037 on the production database. Migration 037 ran on PGlite with migrations 001–035.
- Migration 036 is unchanged from v2.3.2 and was not run again.
- Browsers other than Chromium, real phones and screen readers.
- Zoom to 200 % and browser font scaling were not run as automated tests.
