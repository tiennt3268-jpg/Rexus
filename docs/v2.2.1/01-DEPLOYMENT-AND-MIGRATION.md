# 01 — Deployment, migration, backup & recovery

## 0. Prerequisites
- The existing site runs v2.1.2, v2.1.3 or v2.2.0, with migrations **001–032 applied**. Migration 032 (`032_rexus_session_auto_key`) stores the session signing key in the database.
- You have access to the Netlify site, its Netlify Database, and Netlify Blobs.
- You have a **staging** site, ideally with a recent copy of production data.

## 1. Backup
Do all of these **before** deploying to any environment that holds real data.

1. **Database snapshot**
   - Use the Netlify Database backup or branch feature for the site, or run `pg_dump` with the database connection string shown in the Netlify UI:
     ```sh
     pg_dump --format=custom --no-owner --file=rexus-pre-v221-$(date +%F).dump "$DATABASE_CONNECTION_STRING"
     ```
   - Verify the dump: `pg_restore --list rexus-pre-v221-*.dump | head`.
2. **Record the migration state.** Note which migrations are recorded as applied; 032 should be the latest. Also note row counts for `users`, `tasks`, `subtasks`, `projects`, `rexus_approval_requests`, `rexus_project_transactions`, `rexus_project_disbursements` and `rexus_project_payments`.
3. **Netlify Blobs.** Export the document and attachment stores with your usual Blobs backup procedure. v2.2.1 does not change Blobs, but take a backup anyway because this is a full-release rollback point.
4. **Code.** Keep the currently deployed build (the Netlify deploy history) so you can roll back with one click.

## 2. Migration
File: `netlify/database/migrations/033_rexus_v221/migration.sql` (211 lines).

**Order:** 033 must run after 001–032. It depends on tables from 030, including `rexus_approval_requests`, `rexus_project_transactions`, `rexus_resource_settings` and `rexus_task_dependencies`.

**How it is applied:** the same way as 030–032. The Netlify Database migration workflow applies new folders under `netlify/database/migrations/` during deploy. No manual SQL is needed.

**What it does** (all `CREATE … IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, or guarded constraint and index creation):
- New tables: `rexus_user_preferences`, `rexus_resource_settings_history`, `rexus_leave_requests`, `rexus_capacity_declarations`, `rexus_capacity_entries`, `rexus_approval_delegations`, `rexus_approval_routing_rules`, `rexus_workflow_templates`.
- New columns:
  - `rexus_resource_settings`: employment_type, capacity_method, capacity_approver_id, manager_id, effective_from, updated_by.
  - `rexus_resource_days_off`: kind, hours, created_by.
  - `rexus_approval_requests`: category, priority, department, project_key, due_at, submitted_at.
  - `rexus_approval_steps`: acted_by, assigned_by, assigned_at.
  - Approval events: details.
  - `projects`: dependencies_enabled, notify_assignee, notify_project_manager.
  - Finance columns on transactions, disbursements and payments: transaction_date, payment_method, counterparty, notes, attachment_url, exchange_rate, base_amount, approval_request_id, reverses_id, updated_by and updated_at.
- Existing rows are written only by two `UPDATE` statements. These set `category` on existing approval requests whose type is `project_disbursement` (→ Project Finance) or `document_review` (→ Documents).
- **No DROP, TRUNCATE or DELETE, and no primary key or ID changes.**

**Idempotency:** verified by applying 033 a second time on top of a migrated PGlite database (`tests/v2.2.1/backend/rerun.mjs` → "033 re-applied OK").

**Post-migration verification (SQL):**
```sql
SELECT to_regclass('rexus_user_preferences'), to_regclass('rexus_leave_requests'),
       to_regclass('rexus_capacity_declarations'), to_regclass('rexus_approval_delegations'),
       to_regclass('rexus_approval_routing_rules'), to_regclass('rexus_workflow_templates');
SELECT category, COUNT(*) FROM rexus_approval_requests GROUP BY 1;
-- Compare with the row counts recorded in step 1.2: they must be identical.
```

## 3. Netlify environment variables
No new variables are required for v2.2.1.

- Google sign-in was removed, so `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI` are **not used**. If they were set for v2.1.x, you can delete them (and the OAuth client in Google Cloud).
- `SESSION_SECRET` is **not** needed. Since migration 032, the session signing key is generated and stored in the database.
- Netlify Database credentials are injected by Netlify. Do not add them manually.

## 4. Production deployment checklist
Pre-flight
- [ ] Old `GOOGLE_*` env vars removed from Netlify (optional, §3).
- [ ] Backup steps 1.1–1.4 done, and the dump is verified as readable.
- [ ] Staging deploy done. Migration 033 shows as applied on staging.
- [ ] Post-migration SQL checks (§2) pass on staging, and row counts are unchanged.

Staging smoke test (manual, real infrastructure)
- [ ] Log in with a REXUS password. Verify the session persists after a refresh, and that the login page shows no Google button.
- [ ] HR: search for an employee and open the profile. Admin edits the employment profile and checks that history appears.
- [ ] Submit a leave request, find it in the manager's Approval Center, and approve it. Verify the request shows Approved and capacity drops.
- [ ] Submit a part-time capacity declaration, then approve it. Verify Resource Planning shows the confirmed capacity.
- [ ] Approval Center: reject without a reason and confirm it is blocked. Create a delegation, act as the delegate, then revoke the delegation.
- [ ] Project detail: the WBS renders and the Gantt is aligned. Add a dependency, complete the predecessors, and confirm exactly one ready notification arrives.
- [ ] Finance: task-only projects are listed. Add income as a draft, confirm it, and check that cash updates. Request a disbursement, approve it, and record a partial payment.
- [ ] Theme: switch to Navy, log in on another browser, and check that Navy is applied.
- [ ] Existing documents, the Document Space, payroll and the legacy Gantt still work.
- [ ] Check function logs for errors.

Go-live
- [ ] Get sign-off on the open items in [08 — Known limitations](08-KNOWN-LIMITATIONS.md).
- [ ] Deploy to production during a low-traffic window.
- [ ] Re-run the post-migration SQL and a short smoke test on production.

## 5. Recovery / rollback
- **Code only** (UI or function problem): use Netlify → Deploys → publish the previous deploy. Migration 033 is additive, so v2.1.x and v2.2.0 code runs fine on a 033 schema; the older code ignores the new tables and columns. This is the preferred rollback.
- **Data problem caused by v2.2.1 usage:** fix it forward where possible. Finance has reversal entries; approvals keep an audit history.
- **Full restore** (last resort): put the site into maintenance mode, restore the step 1.1 dump into a fresh database or branch (`pg_restore --clean --no-owner -d "$TARGET" rexus-pre-v221-*.dump`), point the site at it, and redeploy the previous code. **All data written after the backup is lost**, so export new records first if they matter.
- Reverting code does not drop the 033 tables and columns. Leaving them in place is safe.
