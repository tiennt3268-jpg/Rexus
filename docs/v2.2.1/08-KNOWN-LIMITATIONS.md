# 08 — Known limitations (v2.2.1)

## Not verified on real infrastructure
1. Google sign-in was removed. The unused v2.1.0 tables `user_google_accounts` and `oauth_pending_states` stay in the database (dropping them would be destructive).
2. Migration 033 has not been run on the real Netlify Database. Netlify Blobs was not exercised. Concurrency was tested on a single-connection PGlite only. See [07 §6](07-TEST-REPORT.md#6-not-tested-not-claimed-as-passed).

## Functional gaps
3. **Document Space Switcher (Module 8): not changed in this release.** The behaviour is the same as v2.1.x.
4. **Disbursement resubmission:** after *Changes Requested*, a disbursement returns to **Draft**, but there is no UI action to edit and resubmit it. Create a new disbursement request instead.
5. **WBS:** no inline cell editing (use the task or subtask detail), finish-to-start dependencies only, and no critical path or baselines. *(v2.2.2: the separate drag-to-reschedule Gantt was removed — GEN-06.)*
6. **Approval list filtering** is done in memory over the most recent **2,000** requests the user can see. Older requests do not appear in the list views, though they are still in the database and in the audit log. Server-side pagination would be needed for very large volumes.
7. **Payroll and KPI approval types** are not active in the Approval Center. The categories are Human Resources, Project Management, Project Finance and Documents only.
8. **Leave overlap:** only *full-day* overlaps are refused. A half-day or hourly request can be added on a day that already has leave. Capacity is still deducted once, using the largest leave on that day.
9. **Leave balances / entitlements** (annual quota, carry-over) are not tracked. Only requests and approvals are.
10. **Exchange rates** are entered manually per transaction. There is no rate feed. Totals stay grouped per currency rather than converted.
11. Releasing funds (disbursement payments) requires a **registered project with an approved budget**. Task-only projects can record income and expenses but cannot release funds.
12. Notifications are **in-app only**: no email or push for approvals or ready events.

## UI notes
13. ~~No dark mode~~ — *resolved in v2.2.2 (Light / Dark / System).*
14. The v2.1.1 bulk-copy row checkboxes (`rexus-v211.js`) are also attached to some of the new v2.2.1 tables. They are harmless, but they add a column there.
15. Long WBS task names are truncated to one line with an ellipsis. The full name is shown in the tooltip and in the detail view.
16. The previous `/api/resource-planning` `settings` action has been retired (it returns **410**). Schedules are now managed in HR → Employee profile.
