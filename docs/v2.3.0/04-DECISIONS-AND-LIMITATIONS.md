# 04 — Decisions and known limitations (v2.3.0)

The SRS lists D1–D8 as "pending approval", each with a proposed answer. The request was to implement the system ("update lại hệ thống"), so **every proposed answer was applied**. Each can be changed once confirmed.

| ID | Question | Applied |
|---|---|---|
| D1 | DOB and Education Level required for new accounts | **Yes** — seeded as required; existing accounts only after the admin's "Apply to existing accounts" action |
| D2 | Several target groups combined with OR | **Yes** |
| D3 | Expired / full / closed surveys release the gate automatically | **Yes** — re-evaluated on every request |
| D4 | Conditional logic, matrix, file upload in a later phase | **Yes** — not built |
| D5 | B + C as the design standard | **Yes** — soft colours, one primary action per screen, flat cards |
| D6 | Quick actions, Needs attention, assignment estimate use real API data | **Yes** — no illustrative metrics |
| D7 | Responsive and accessibility in the same release | **Yes** — see the test report |
| D8 | Keep REXUS Dark mode / themes via semantic tokens | **Yes** — `--sv-*` tokens with dark values |

## Other choices made during implementation
| Topic | Choice |
|---|---|
| Who creates surveys | System Admin and Project Manager (the SRS only says "quản trị viên" for mandatory settings). Mandatory on Login: System Admin only. |
| Respondent modes | *REXUS accounts* (linked to User ID) and *Anyone with the link* (public, no user id). The SRS's "anonymous public" case is the public mode. |
| "Once per survey/round" | One valid response per person per survey. Rounds ("đợt") are not modelled separately: to ask the same people again, duplicate the survey. A new question **version** does not re-ask people who already answered. |
| Excluding a response of a mandatory survey | The person is asked again on their next request, because they no longer have a valid response. |
| Password policy | ≥ 8 characters, a letter and a digit; 5 failed attempts per 15 minutes on the change-password step. |
| Admin password reset | New action in Employee Profiles; shows the temporary password once and sets the first-login flag. |
| Where the profile step reads fields | Visible fields only; HR-managed fields (Employment Start Date) are read-only for the employee. |
| Who sees demographics | The person and System Admins. There is no separate "Analyst" role in REXUS today, so nobody else can read them. |
| Survey workspace "Employee Profiles" and "Profile Fields" | Admin-only items in the Survey navigation (mockup 01 and 11). |
| Excel export | Built in the browser with the spreadsheet library already loaded by REXUS; if it is unavailable, CSV is downloaded instead. |
| Time zone | Inputs and display use Asia/Ho_Chi_Minh (UTC+7); stored in UTC. |

## Known limitations
1. Public surveys have no CAPTCHA or per-IP rate limit; the response limit and idempotent submissions are the only protections. Use authenticated mode for anything sensitive.
2. Rounds/re-runs of the same survey, conditional logic, matrix and file-upload questions are not available (D4).
3. Question reordering uses ↑/↓ buttons (keyboard accessible); there is no drag-and-drop.
4. Analytics show the latest 200 responses in the list and the latest 20 text answers per question; the export contains everything.
5. Demographic filters in Analytics are not offered (the SRS allows restricting them); only department and job position, which come from the organisation data stored with each response.
6. A business API called while a step is pending answers 401 (the same as signed-out). The app handles it by showing the step; an external client sees "Not signed in".
7. Every request now runs one extra query for the gate. Fine for the current size; for thousands of concurrent users it should be cached briefly.
8. Not run: real Netlify deploy and database, browsers other than Chromium, real phones, real screen readers.
