# REXUS Work Management v2.1.1 — Document UX and Privacy Refinement

**Status:** Release Candidate — staging validation required before production.

This update builds on v2.1.0. Existing Project, Task, Subtask, Worklog, Payroll, KPI, Gantt, Google authentication, and Project Financials APIs remain unchanged. No existing document, folder, file, or task ID is intentionally deleted or changed.

## Changes

| Request | Implementation | Validation status |
|---|---|---|
| Notion-like Space dropdown | Current Space, searchable list of accessible Spaces, active tick, `+ New space`; removed account/upgrade/invite controls | Source integration and JS syntax checked; browser testing pending |
| Confluence-inspired editor | More compact toolbar and actions, Heading 1–6 selection, existing autosave, inline comment threads, version history, sharing and pageless content | Source integration checked; **not a real-time multiuser collaborative editor** |
| Insert REXUS objects | Insert menu contains Project, Task and Subtask pickers using existing authenticated APIs. References retain IDs and open the REXUS view when accessible | Source integration checked, not end-to-end tested |
| Private Document visibility | `031_rexus_document_private` converts legacy organization-wide Space access to `restricted` and explicit organization-wide Document overrides to `inherited`. Existing named grants, ownership and admin access remain | Authorization function tested with mocked data; migration **not** run on PostgreSQL staging |
| Project income/expenses | Existing v2.1.0 Project Financials: income, expense, confirmation, approval requests, disbursement payment records | Existing feature inspected; not changed or reconfirmed on live database |
| Bulk selection | Existing Document list bulk operations and Task list bulk actions preserved. Other supported work tables gain multi-select + Copy Rows / Export Selected CSV | JS syntax checked; browser tests pending. **Bulk mutation not available on every list** |
| Better image insertion | Insert Image, paste image from clipboard, drag/drop image files; upload via existing secured Document file API (4MB max), with file ID saved in editor HTML | Source integration checked; production Netlify Blobs upload pending |
| More compact UI | Reworked REXUS Document sidebar, Space dropdown, card/toolbar/table density; constrained responsive layout; retained Glass navy/white design | CSS integration reviewed; browser visual QA pending |
| Hand-drawn pictograms | SVG 2D white-line glyphs replace emoji decorations in legacy glass components and main Document item glyphs | JS syntax checked; full page-by-page icon audit pending |

## Security and access behavior change (IMPORTANT)

Before v2.1.1, older Space rows defaulted to `access_mode='organization'`, allowing general organization access. **v2.1.1 changes this intentionally** to satisfy the new privacy request:

- System Admin: retains access.
- Space/Document creator: retains access to their item.
- Members with explicit `rexus_document_shares` grants: retain their assigned View, Comment or Edit access, inherited as currently supported.
- Other members: previously organization-visible items will **no longer appear** in REXUS Document after migration; direct file API uses the same access checks.
- It does not delete any Space, Document, Folder, comment, revision or Blob.
- Owners/Admin must issue explicit shares where prior access was inherited through organization-wide visibility.

The migration backs up original access modes only in `rexus_acl_previous_modes_031` for old organization-wide rows. It does not back up the entire database — **take a full PostgreSQL and Netlify Blobs backup externally**.

### Apply migration

1. Back up production PostgreSQL and Netlify Blobs.
2. Deploy to **staging first**, using representative data and two REXUS test users.
3. Apply migrations through `031_rexus_document_private` with your existing Netlify Database migration mechanism. Do not rerun destructive historical seed migrations against production.
4. Test: admin sees all, owner sees owned, explicitly shared user sees only shared material, unshared user sees empty content/list; direct document IDs and file downloads reject access.
5. Confirm documents can be shared again to affected users, and that Task/Subtask links remain correct.
6. Only after those checks, consider a production rollout.

### Manual rollback of the access-mode change

Revert only after reviewing any permissions changed since migration. The following statements restore **only the `organization` values recorded by migration 031**:

```sql
UPDATE rexus_spaces s SET access_mode=b.previous_mode
FROM rexus_acl_previous_modes_031 b
WHERE b.entity_type='space' AND b.entity_id=s.id;

UPDATE rexus_documents d SET access_mode=b.previous_mode
FROM rexus_acl_previous_modes_031 b
WHERE b.entity_type='document' AND b.entity_id=d.id;

ALTER TABLE rexus_spaces ALTER COLUMN access_mode SET DEFAULT 'organization';
```

Take a fresh backup before rollback. Avoid an automatic rollback if permission changes were made after deploy.

## Existing Project Financials

The API `/api/project-financials` from v2.1.0 already supports creating Income and Expense drafts, confirming transactions, creating Disbursement requests, and recording payments after approval. The UI is available through the Project Financials screen, using existing authenticated Project data. **No new finance schema or financial transactions were created in this update.** The v2.1.0 Release Candidate financial limitations (real DB reconciliation, concurrent approvals, audit) still apply.

## Known limitations / not yet production-validated

1. **True Confluence Live Docs-style collaborative editing** (simultaneous cursors, live coauthor presence, instant multi-user sync, conflict-free concurrent typing) is **not implemented**. REXUS uses version-based autosave and conflict detection, not live CRDT/OT sync.
2. The existing Mermaid renderer handles basic previews; full diagram rendering remains limited. PDF export remains browser Print/Save as PDF.
3. Bulk actions that **mutate business records** remain specialized: Documents and Tasks have built-in bulk workflows; generic other list tables support copy and CSV export only, to avoid bypassing authorization/business rules.
4. Pasted image upload depends on browser clipboard permission and an authenticated Netlify Blobs backend. Maximum file size is 4 MB per image/file.
5. The embedded REXUS reference uses live authenticated record lookup, not snapshots. Cross-browser navigation and permissions still require staging QA.
6. The frontend uses the established `contenteditable` editor and `document.execCommand` for formatting. A production-grade editor framework with collaboration is a future architectural task, not silently represented as complete here.
7. Chromium browser smoke testing in this execution environment failed to open the local server with `net::ERR_BLOCKED_BY_ADMINISTRATOR`. **No browser interaction or Netlify DB/Blobs test is claimed as passed.**

## Tests executed in this build

- `node --check` on frontend JavaScript and the main inline app JavaScript: **PASS**.
- Authorization `listVisible` tests for owner, admin, unauthorized user and explicit page share with mock DB: **PASS**.
- Frontend browser test: **BLOCKED** by environment, not passed.
- Netlify database migration run: **NOT EXECUTED**.
- Netlify Blobs upload, concurrency and finance integrations: **NOT EXECUTED**.
- ZIP CRC/integrity: checked during packaging.

## Deploy packages

- `REXUS-Work-Management-v2.1.1-FULL.zip` — source, dependencies included as in the v2.1.0 FULL, migration and release documentation.
- `REXUS-Work-Management-v2.1.1-LITE-Netlify.zip` — only runtime source, migrations, Netlify functions/configuration and package manifest; dependencies installed by build.

For Netlify Functions and Database features, deploy using a Netlify build (Git or CLI / supported ZIP workflow that builds functions); merely serving static HTML will not activate backend APIs.
