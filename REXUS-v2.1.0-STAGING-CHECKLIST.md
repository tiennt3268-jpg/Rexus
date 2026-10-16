# REXUS v2.1.0 Staging Checklist

- [ ] Restorable database and Blob backups verified.
- [ ] Schema migrated through 030 on staging only; existing User/Task/Document/Payroll IDs checked.
- [ ] `SESSION_SECRET` (>=32 random characters) configured on staging and production prior to rollout.
- [ ] Google OAuth Client, secret, allowed origins, redirect URI configured for staging.
- [ ] Password login and OAuth login each confirmed; unlinked/disabled Google accounts rejected.
- [ ] Linking/unlinking verifies reauthentication, unique relationships and audit events.
- [ ] Resource allocation totals validated against known Tasks and Worklogs.
- [ ] Resource timeline/heatmap requirements resolved (not fully implemented).
- [ ] Approval single/sequential/parallel, missing rights and concurrent decisions tested.
- [ ] Disbursement approval, split payments, zero/over budget, duplicate references tested.
- [ ] Real ledger reconciled with legacy budgets, payroll advances and other finance records.
- [ ] Gantt dependencies do NOT prevent early work/Worklogs or auto-change dates.
- [ ] Ready-to-start notifications no-duplicate tests for concurrent completions.
- [ ] Organization employee search permission and keyboard UX tested.
- [ ] Document Space dropdown search, direct URLs, restricted spaces, dirty editor tested.
- [ ] Mobile and desktop screens verified; customized icons consistent.
- [ ] Existing Project/Task/Subtask/Document/Calendar/Worklog/Payroll/KPI flows regression tested.
- [ ] Remaining feature gaps from RELEASE-NOTES resolved before production approval.
