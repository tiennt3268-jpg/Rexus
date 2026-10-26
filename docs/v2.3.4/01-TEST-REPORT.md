# 01 — Test report v2.3.4

Test date: 2026-10-26. **Only executed results are listed.** Environment: PGlite (PostgreSQL 16) with migrations 001–035, the real Netlify Function handlers (`tests/v2.2.1/backend/server.mjs`), Chromium (Playwright). Each E2E suite ran on a fresh database.

## Summary
| Suite | Result | Log |
|---|---|---|
| E2E v2.3.4: every requirement ID (new) | **69 / 69** | `tests/v2.3.4/e2e/e2e234.py`, `e2e234-results.log` |
| Unit: sections, branching path, answer validation (new) | **11 / 11** | `tests/v2.2.1/backend/sections.test.mjs`, `tests/v2.3.4/backend/sections.log` |
| Backend: existing integration checks | **224 / 224** | `tests/v2.3.4/backend/backend-regression.log` |
| Backend: Survey + First Login | **97 / 97** | `survey-regression.log` |
| E2E v2.3.1 regression | **44 / 44** | `tests/v2.3.4/e2e/regression-e2e231.log` |
| E2E v2.3.0 regression (Survey, First Login, mandatory) | **68 / 68** | `regression-e2e230.log` |
| E2E v2.2.3 / v2.2.2 / v2.2.1 regression | **75 / 75**, **53 / 53**, **48 / 48** | `regression-e2e22*.log` |
| Legacy UI harness (mocked API) | **24 / 24** | `regression-interact.log` |
| UI audit: 49 screens × 7 configurations | **341 / 343** clean on the full run. The 2 findings (Survey builder at 375 px, dark) were fixed and re-checked: **8 / 8** clean. | `ui-audit-results.log`, `ui-audit-rerun-builder-375.log` |
| `tsc --noEmit` on all functions (incl. changed survey files); `node --check` on every changed script; inline app script syntax | Pass | — |

No test was changed to make it pass. The older suites ran unchanged.

### Order of runs
1. **First full run:** every suite on the final code, except for two later visual fixes.
   - Its UI audit found 8 *bright surface in dark mode* results (calendar picker and Important tab selected states). Those were fixed and re-checked in the 4 dark configurations: 24/24 clean (`ui-audit-rerun-dark.log`).
   - Its survey screens were **not valid**. The audit navigated by hash only, so they stayed on the previous unsaved form page.
2. **Navigation fix:** every audit step now does a full page load.
3. **Second full UI audit:** **341/343**, with the survey screens now really shown.
4. **Last fixes:**
   - The builder overflow at 375 px was fixed and re-checked.
   - Two more CSS-only fixes: a white sign-in background in both themes, and wrapping the calendar header on phones.
5. **After those fixes:** E2E v2.3.4 (69/69) and E2E v2.3.0 (68/68) were run again.

The older suites (v2.3.1, v2.2.x, backend, legacy harness) were not run again after those CSS-only changes.

## E2E v2.3.4 (69) by requirement
| ID | Checks |
|---|---|
| GEN-01 | Exact tagline · no images · brand left / form right · Enter submits and the error stays visible · 375 px stacked with no overflow · Tab order |
| GEN-02 | Log Work: 4 short fields on one row, not full width · Manual rating narrower than Notes · rate history table spans the card · new rate / date / Save on one row |
| GEN-03 | Manager picker rows: name + job title · email · "No job title" fallback · search by username · Assign Task meta shows job title · email |
| SUR-01 | Survey primary button has the same colour, radius and height as the REXUS primary · line icons in the Survey navigation |
| SUR-02 / 03 | No "QUESTION 0x" or type label for respondents · no decorative dots or separators in the respondent header and footer |
| SUR-04 | Section cards in the builder · questions numbered without sections · sections saved with stable `s_` ids · required checked per section · Back keeps answers · analytics without section rows · forms without sections: one question per page + navigator |
| SUR-05 | Answer targets Continue / Go to Section n / Submit form · no backward targets offered · server refuses backward and deleted targets · deleting a section clears links to it · Student jumps over Staff · Guest turns Next into Submit · Staff goes Staff → Students · stored answers follow the path (the skipped answer is not stored) |
| SUR-06 | Targeted user gets the full-screen intro · branch-to-end submission opens the app · reload does not ask again · non-target user is not gated |
| WM-01 | No cell spacing; one 1 px solid line per edge · values still shown |
| WM-02 | Unread `rgb(234,242,255)`, read white · no left stripe (no inset shadow, 1 px border) |
| WM-03 | Important tab shows only starred items · starring keeps the item unread · kept after reload · un-starring empties the list at once · another account sees none of the markers |
| WM-04 | No left bar on month items · an item opens its task |
| WM-05 | Title opens the 12-month picker · March of next year · Next after picking · Today · Day/Week picker lists the days · picked day without timezone shift |
| WM-06 | Mon–Sun columns with today marked · 09:00 at 432 px, 14:00 at 672 px · overlapping blocks side by side · all-day lane · now line · Week → Month keeps the date · Day view |
| DOC-01 | All chevrons are the same 14 × 14 icon · Enter toggles and the collapsed chevron rotates · add-space button separate from the toggle |
| — | No JavaScript page errors |

## UI audit
- **Configurations:** dark Black & White at 1440 / 768 / 375 px, dark Navy at 1440, light Black & White at 1440 / 375, light Navy at 1440.
- **New screens:** sign-in, calendar picker / week / day, worklog grid, notification Important tab, builder with a section. These are added to the v2.3.1 set.
- **Checks:** text contrast (≥ 4.5:1), bright surfaces in dark mode, page overflow, JS errors.
- **Screenshots checked by eye:** sign-in light/dark, compensation, week at 375 px, Important tab dark, builder at 375 px.

## Not tested (not claimed)
- The real Netlify deploy. Migration 036 (data import from v2.3.2) is unchanged and was tested in v2.3.2 on an empty database.
- Browsers other than Chromium (the requirement asks for Chrome/Edge; Edge is Chromium-based but was not run). Real phones were not used (viewport emulation only).
- Real screen readers. Roles, labels and keyboard paths were checked.
