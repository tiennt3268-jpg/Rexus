# REXUS v2.3.1 — Module reorganisation: one employee record in HRM, no duplicate entry points

Release notes: [`../../REXUS-v2.3.1-RELEASE-NOTES.md`](../../REXUS-v2.3.1-RELEASE-NOTES.md) · Test report: [01-TEST-REPORT](01-TEST-REPORT.md) · Screenshots: [evidence/](evidence)

Request: *"What is Employee Profile in here for? Put it into REXUS's Human Resources module. Review the whole system, reorganise the functions so they are not duplicated between modules, and link the modules together more."*

## What "Employee Profiles" in REXUS Survey was for

In v2.3.0 the Survey workspace had two System Admin pages that belonged to First Login rather than to surveys:

- **Employee Profiles**: each person's onboarding status (personal password set, required profile completed), their personal information (Date of Birth, Education Level and other fields), and **Reset password**.
- **Profile Fields**: which personal fields REXUS collects, which are required, and the *Apply required fields to existing accounts* action.

These describe a person, not a survey. Survey answers never copy them: a response stores only the User ID plus the department and position at that moment. From v2.3.1 both pages live in HRM.

## Choices made with the user (before the work)

| Question | Answer |
|---|---|
| Where should account administration go? | HRM → the employee record |
| Where should salary and hourly rates go? | A **Compensation** tab in the HRM employee record |
| Clean-up | Remove `rexus-v210.js` and the unused fallback code · remove the auto-inserted bulk-copy checkbox column (`rexus-v211.js`) · merge the duplicate entry points (Resource Planning, Project Financials) |
| Restore Departments + org chart as an HRM tab? | **Not selected.** The department editor and org-chart code is unreachable from the menu, as it was in v2.3.0, and was **left untouched**. |

## Module responsibility map (after v2.3.1)

| Data / function | Owner module (one place) | Linked from |
|---|---|---|
| Employee record: who someone is, their work, employment, leave, personal information, pay, account | **HRM → Employee Search → employee record** | Finance By Personnel (row → Compensation) · Configuration (button) · old `#survey/profiles/<id>` links · Approval Center (leave) · `REXUS221.openEmployee(id, tab)` |
| Account list: create / delete / restore (System Admin) | HRM → Employee Search (below the search) | Configuration (button) |
| Role, department and status of an account | Account editor, opened from the record → Account | — |
| Onboarding status, Reset password | Record → Account | — |
| Personal information (demographics) | Record → Personal information; your own also in My Account (same component) | — |
| Profile fields configuration | **HRM → HR Settings** | Old `#survey/fields` link · Configuration (button) |
| Working schedules, part-time minimum, holidays | HRM → HR Settings (renamed from *Working Schedules & Holidays*) | — |
| Salary history, Edit Salary, hourly-rate history, performance-based pay per person | Record → **Compensation** | Finance By Personnel |
| Setting a new hourly rate (default or per project) | Record → Compensation (System Admin) | — |
| Performance-pay *rules* (weights, tiers, on/off) | Configuration (a company-wide policy) | — |
| Resource Planning | HRM → Resource Planning | Old `#/resource-planning` link |
| Project income, expenses, disbursements, history | **Finance → Project Financials** | Project Detail (summary + *Open in Project Finance*) · Approval Center (expense / disbursement) · old `#/project-financials` link |
| Approvals | Approval Center | Each request links back to its record (*Open related record*) |
| Surveys, builder, analytics | REXUS Survey | — |
| Company info, task types | Configuration | — |

## Employee record (HRM)

One record per employee, opened from search, from the account list, or from another module. The tabs depend on who is looking. Every tab calls the API that already owns the data, so the server decides as before.

| Tab | Content | Who sees it (unchanged server rules) |
|---|---|---|
| Overview | ID, email, department, title, manager, status; **Work in REXUS**: open tasks (link → task), projects (link → Project Detail), hours logged this month | Everyone (directory data). Tasks and hours are what the viewer can already load. |
| Employment & leave | Employment and capacity, Edit employment, leave this year, schedule history | Self, manager, HR (`/api/hr/profile`) |
| Personal information | Personal fields form | Self and System Admin (`/api/onboarding`) |
| Compensation | Salary history, Edit Salary (password re-entry), hourly-rate history, performance-based pay (if enabled); System Admin also **Set hourly rate** | Project Manager and System Admin; a PM sees only people in their managed scope (`/api/finance`); rates are System Admin only (`/api/rates`) |
| Account | Username, email, role, status; Edit role/department/status; Reset password; Delete account; first sign-in status | System Admin |

## Moved / removed

| Before (v2.3.0) | After (v2.3.1) |
|---|---|
| Survey → Employee Profiles | HRM record → Personal information + Account. Old links redirect. |
| Survey → Profile Fields | HRM → HR Settings → *Personal information fields*. Old links redirect. Code moved to `REXUSGate.mountFields`. |
| Configuration → Employees (create / delete / restore) | HRM → Employee Search (System Admin). The same form and table; a row opens the HRM record, not the old modal. |
| Configuration → Employee Hourly Rates | HRM record → Compensation (fixed to that employee). |
| Finance → By Personnel → detail panel below the table | Row opens HRM record → Compensation. The list, totals and filters stay in Finance. |
| Project Detail → full Project Financials (second copy of the ledger with all actions) | Summary (budget, received, expenses, net cash, utilization, counts) + *Open in Project Finance*. People without the Finance tab keep the full inline view, so nobody loses access. |
| Hidden tabs `resource-planning`, `project-financials` and their empty views | Removed. The routes stay as aliases. |
| `rexus-v210.js` (v2.1.0 screens, never shown since v2.2.1) and the `window.REXUS210` fallbacks / alias | Removed. |
| `rexus-v211.js` (added a checkbox "bulk copy" column to every read-only table, including empty-state rows) | Removed. `rexus-v211.css` stays: it styles the Document workspace. |
| Dead legacy employee list in the Organization view (`employeeListSectionHtml`, `renderEmployeesTable`, …) | Removed. |
| HRM admin tab *Working Schedules & Holidays* | Renamed **HR Settings** (also holds Profile fields). |

## New links between modules

- Approval Center request → **Open related record**: leave → HRM Leave Management (team calendar for approvers, the month of the leave); monthly schedule → HRM Monthly Schedule (team, that month); expense / disbursement → that project in Finance → Project Financials (Income & Expenses / Disbursements tab).
- Employee record Overview → task and project links.
- Project Detail → Project Finance.
- Finance By Personnel → employee Compensation.
- Configuration → HRM employees / HR Settings.

## Not changed

- No API, migration or permission was changed. All server checks are as in v2.3.0.
- Departments and the org chart are left as they were (no menu entry), as decided.
- My Account still shows your own personal information. It is the same component as the record tab, not a second implementation.
