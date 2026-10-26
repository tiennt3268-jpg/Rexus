# REXUS v2.3.4 — REXUS_Requirements_v2.3.4: implementation & traceability

Source: *Tài liệu đặc tả yêu cầu sản phẩm (PRD / SRS) — REXUS • REXUS Document • REXUS Survey*, target version 2.3.4 (26/10/2026). Release notes: [`../../REXUS-v2.3.4-RELEASE-NOTES.md`](../../REXUS-v2.3.4-RELEASE-NOTES.md). Test report: [01-TEST-REPORT](01-TEST-REPORT.md). Screenshots: [evidence/](evidence).

No database migration and no permission change. The only server change is in the survey rules (sections and branching), and it stays inside the existing question JSON.

## Open decisions (section 8 of the source): what was applied
The document lists these as "cần xác nhận". The document's own proposal was applied in each case, and the user was told before the work started.

| Item | Applied |
|---|---|
| SUR-02 | Hide only the technical labels (`QUESTION 01 · RATING`, type names). Progress (counter, bar, navigator for forms without sections) is kept. |
| SUR-05 | Branching on **single-choice** questions only. Respondents can go back and change an answer, and the path is recomputed. Targets can only be **later** sections or "Submit form", so a path can never loop. |
| SUR-06 | Already delivered in v2.3.0 and kept unchanged. Admin picks the target (all / departments / positions / specific User IDs). Each person answers **once**. Admins are gated only if targeted. A closed, expired or full survey releases everyone. Re-checked in E2E. |
| GEN-03 | Job title comes from the account's *position* (HR data). If it is empty, "No job title" is shown. If the email is empty, it is left out. |
| WM-06 | Week starts on **Monday**. Times use the browser's local time. View only (**no** drag to reschedule). The view opens at 07:00, or at the first timed task if it is earlier. |

## Traceability

| ID | What was done | Files | Tests (e2e234 unless noted) |
|---|---|---|---|
| GEN-01 | New sign-in screen: minimal two columns, the wordmark and the exact tagline "all in one with Rexus" on the left, the form on the right, no illustration. It stacks on phones. Errors, Enter and Tab work as before. No Meta logo, name or artwork. | `index.html` (auth markup), `rexus-v234.css` | GEN-01 × 6; UI audit `login` |
| GEN-02 | Rows that mix short values and text use proportional columns instead of equal halves. **Log Work:** date / start / end / hours share one row. **Compensation:** manual rating is narrow next to Notes; the hourly-rate history table uses the full card; new rate + date + Save sit on one row. Project budget and the monthly-minimum field are compact. Phones get one column. | `index.html`, `rexus-v221.js`, `rexus-ui.css`, `rexus-v234.css` | GEN-02 × 5 |
| GEN-03 | One shared helper, `REXUSui.personOption`, renders Name with "Job title · Email" as a second line. The shared combobox shows both lines, searches them, and always turns people pickers into searchable lists, even short ones. Used for HR manager/approver, approvers, members, the rate employee, Document sharing and Survey specific employees. The Assign Task picker shows job title · email. | `rexus-ui.js`, `index.html`, `rexus-v221.js`, `rexus-document.js`, `rexus-survey.js` | GEN-03 × 4 |
| SUR-01 | Survey buttons use the REXUS geometry and variants (default glass, primary smoke, danger), the same accent token and line icons (SVG) in the same tile style as the REXUS sidebar. Actions are unchanged. | `rexus-survey.css`, `rexus-survey.js` | SUR-01 × 2 |
| SUR-02 | The respondent form shows only the question, its help text, the answers and the required mark. The builder still shows "Question 01 · Rating". | `rexus-gate.js` | SUR-02 |
| SUR-03 | No decorative dots in the respondent UI (eyebrow, status bar, required badge, user name). Question text typed by authors is untouched. | `rexus-gate.js` | SUR-03 |
| SUR-04 | **Builder:** *Section* items (stable `s_…` id, title, description) can be added, renamed, moved, duplicated and deleted; questions below a section belong to it. **Respondent:** one page per section, Back keeps answers, required questions are checked per section. A form without sections works exactly as before: one question per page, with the navigator. | `rexus-survey.js`, `rexus-gate.js`, `lib/survey.mts`, `surveys.mts`, `survey-respond.mts` | SUR-04 × 6; backend `sections.test.mjs` |
| SUR-05 | **Single choice:** per answer, choose "Continue to next section", "Go to Section n" (later sections only) or "Submit form". The server refuses backward or deleted targets with a clear message. Deleting a section resets answers that pointed to it. The builder shows a warning banner if a move breaks a route. The path is computed the same way on the client and the server: only questions on the path are required and stored. | same | SUR-05 × 10; backend `sections.test.mjs` (11) |
| SUR-06 | Unchanged from v2.3.0, re-checked: a targeted user sees the full-screen intro, can finish through a branch-to-end path, enters the app, and is not asked again after reload. | — | SUR-06 × 4; e2e230 (68) |
| WM-01 | Worklog grid: one thin neutral line per cell. Before, there were separate borders with 2 px spacing (the double line). Sticky columns keep their line. | `rexus-v234.css` | WM-01 × 2 |
| WM-02 | Notifications: unread = pastel blue card, read = white card, no left stripe. Dark mode uses equivalent tones. | `rexus-v234.css` | WM-02 × 2 |
| WM-03 | **All / Important** tabs in the notification panel. The star marks a notification as important; this is stored per account in the existing `notifications.important` column and is independent of read/unread. The list updates immediately and is kept after reload. | `index.html`, `rexus-v234.css` | WM-03 × 5 |
| WM-04 | Calendar month items are light tags without the dark left bar. Long titles are cut with an ellipsis. "+n more" opens that day. | `index.html`, `rexus-v234.css` | WM-04 × 2 |
| WM-05 | Clicking the title ("October 2026") opens a picker: year arrows plus 12 months, and in Week/Day also the days of the month. Prev / Next / **Today** and Month/Week/Day still work. Dates are handled as local `YYYY-MM-DD`. The old week list used UTC `toISOString()`, which shifted days in UTC+7. | `index.html`, `rexus-v234.css` | WM-05 × 6 |
| WM-06 | **Week** = 7 columns (Mon–Sun); **Day** = 1 column. Each has an all-day lane for tasks without times, a 24-hour timeline (48 px/hour) with timed blocks, overlapping tasks side by side, and a current-time line. Clicking a day header opens that day. Switching views keeps the date. | `index.html`, `rexus-v234.css` | WM-06 × 7 |
| DOC-01 | One SVG chevron for the space switcher, the section toggles and the folder tree. It has the same size and motion, points down when open, and is keyboard operable. The add-space button is separate. | `rexus-document.js`, `rexus-v234.css` | DOC-01 × 3 |

## Data and compatibility
- Survey sections and routes live in the existing JSON column of each survey version. Old published versions have no `section` items, so they behave as before.
- Analytics and export list questions only; section items carry no answers.
- `rexus-v234.css` is loaded last and holds every visual rule of this release.
- The v2.3.2 import migration (036) is still shipped only in the deploy zips, not in git.

## Not done (not requested, or explicitly out of scope)
- Drag to reschedule in Week/Day (WM-06 says not to enable it by default).
- Branching for multiple-choice questions (SUR-05 proposal: single choice only).
- A survey-level setting for "after section X go to …" (not in the requirement).
