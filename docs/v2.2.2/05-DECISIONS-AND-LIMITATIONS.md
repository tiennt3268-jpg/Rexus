# 05 — Decisions on the open questions, and known limitations

## Q01–Q11
"**Owner**" means the product owner answered on 2026-10-16. "**Default**" means an assumption taken from the requirement document's own stated default or from the existing behaviour. Every "Default" can be changed when it is confirmed.

| ID | Question | Answer used | |
|---|---|---|---|
| Q01 | Colors, theme storage, System mode | Navy / blue / neutral tokens (no official brand guide was supplied). Light / Dark / **System**, saved **per account**. | Owner (mode) · Default (palette) |
| Q02 | English scope | The UI only: labels, menus, placeholders, actions, validation, toasts and notifications. **User-entered data** (names, task titles, documents) is not translated. Exported files keep their content. | Default |
| Q03 | Username rules | 3–32 characters, `a–z 0–9 . _ -`, starting and ending with a letter or digit, unique regardless of case. Sign-in accepts username **or** email (as before). An **admin** can change **their own** username. Changing other users' usernames is not offered yet. | Default |
| Q04 | Delete account | **Soft delete.** Admin only, never yourself, confirmed by typing the username. Locks the account, hides it, revokes its sessions and keeps all history. Restorable. | Owner |
| Q05 | HRM roles | HR Admin = System Admin. Manager = profile manager or capacity approver, or department head. Employee = self. See [02](02-HRM-PERMISSION-MATRIX.md). | Default |
| Q06 | Working days, part-time minimum unit, OT rules | Full-time: the working schedule on the profile (default 8 h Mon–Fri). Part-time minimum = **regular hours per month** (company default with a personal override). OT is declared per day, regular + OT ≤ 24 h a day. There is no OT cap beyond that and no separate OT approval: OT is approved together with the month. | Owner (workflow) · Default (units) |
| Q07 | Approval, lock, deadline | Approval: yes, via the Approval Center. A pending month is locked. There is no automatic deadline; managers can set a due date on the request (informational). | Owner (approval) · Default |
| Q08 | Notifications and tracking | In-app notification with a deep link. Per-person status in Team Schedules. No email. | Owner |
| Q09 | Document panel and editor border | Show/hide on the sidebar sections (folders already expand and collapse). Removed both the body focus box and the title box. | Default (from screenshots 5 and 7) |
| Q10 | Gantt drag scope | Removed the whole drag Gantt (move **and** resize), because it was one component. The WBS timeline was never draggable. | Default (the requirement's default covers move; resize went with the same component) |
| Q11 | Column widths | **Per browser** (localStorage). Applies to every data table, including those in modals and in REXUS Document. Not applied to tables inside document content written in the editor. There are no pinned columns in the app today. | Owner (storage) · Default (scope) |

## Known limitations
1. The real Netlify Database migration (034) and the deploy pipeline have not been run. Run the staging smoke test in [01-DEPLOYMENT](01-DEPLOYMENT.md) first.
2. Restoring a deleted account leaves it **Inactive**. An admin must set it Active to allow sign-in (deliberate).
3. Admins cannot change **other** users' username or email from the UI (only their own). Other users' position, department, role and status are editable as before.
4. Schedule requests send no email reminders and do not enforce a deadline.
5. OT has no separate approval step or monthly cap. It is approved as part of the month's schedule.
6. Column widths do not follow the user to another browser or device (per-browser by decision Q11).
7. Dark mode styles the application UI. Colors that **users** typed into document content (for example a highlighted table) are kept as authored and may have low contrast in dark mode.
8. Carried over from v2.2.1 (still open): no edit-and-resubmit action for disbursements; no inline WBS editing; approval list filtering covers the most recent 2,000 requests; no Payroll/KPI approval types; leave balances are not tracked; v2.1.1 bulk-copy checkboxes appear on some tables; the Document Space Switcher is unchanged.
