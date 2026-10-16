# REXUS Work Management v2.1.0 — Release Candidate

## Important release status

**This package is a development release candidate, NOT a production-verified release.**
The source includes functional backend/API implementations and integrated browser interfaces for the listed modules; however, end-to-end tests against a real Netlify Database, live Google OAuth, Netlify Blobs and representative production records have **not** been executed. Do **not** deploy straight to production. Make a recoverable staging copy first.

Based on REXUS v2.0.8, preserving Project, Task, Subtask, Worklog, Payroll, KPI, Document and Audit sources. Not a rewrite or a new database.

## Feature status and limitations

| Module | Implemented in source | Remaining work / qualification |
| --- | --- | --- |
| Google link + login | Authorization Code + PKCE, state/nonce, Google's JWKS ID token verification, existing REXUS identity lookup, link/unlink, Connected Accounts and login UI. One-to-one constraints in DB. | Not tested with real Google application or production callback URL. Requires Google Cloud and Netlify credentials. OAuth end-to-end security review and real sessions still required. |
| Resource Planning | Working capacity, per-employee schedules and days off, planned allocations separate from Worklogs, utilization, overload calculation and overview UI. | Daily/weekly/monthly employee timeline, heatmap, interactive allocation editor, leave-data integration and comprehensive permissions UX not finished. |
| Approval Center | Request/step/event persistence, single/sequential/parallel approval decisions, concurrency-safe step updates, notifications, initial disbursement source application. | Only certain request types activated; budget/HR/payroll/document underlying operations are NOT automatically executed, and some workflows/UI states are incomplete. |
| Gantt dependencies | FS graph API, cycle prevention, notifications on predecessor completion, support legacy predecessor JSON, no automatic changes to successors. | Full visual connector editing and real concurrent deduplication tests outstanding. Existing Gantt frontend still provides legacy editing. |
| Organization | Search-only interface; employee details only after explicit selection; server search and debounce. | Keyboard up/down selection, wider role-dependent directory privacy testing outstanding. |
| Document Space Switcher | Dropdown, accessible Space filtering through current API, active Space and space search; current Folder/File and Editor remain intact. | Unsaved-change protection across every navigation path, direct URL refresh and browser back behavior need further QA. |
| Project Financials | Separate Income/Expense Ledger, authorized budget vs received/expenses, payment records, approval-linked partial disbursements, finance events, transaction row locks. | All finance business reconciliation scenarios, diverse currencies, detailed supporting attachments, correction/reversal workflow, full audit and concurrency tests remain outstanding. UI currently uses straightforward dialogs for certain steps. |
| Liquid Glass UI/icons | Shared navy-blue translucent tokens and original hand-authored simple SVG white-stroke pictograms for new modules. | Older screens retain some existing icons/styles. Complete system-wide icon replacement and all metric-card semantic variants still need a full visual pass. |

## Migration

New additive migration: `netlify/database/migrations/030_rexus_v210/migration.sql`.

**Do not run migration against an unbacked-up production database.** Verify that migrations 001–029 already applied in order. Staging DB should be a realistic copy. The new migration adds OAuth link/pending state tables; planning, approval and dependency tables; workflow-events, finance ledger, disbursement/payment/audit tables; plus additive columns to Projects. It does not explicitly delete business tables or files.

Recommended safe procedure:

1. Export and verify a restorable Netlify Database snapshot and Netlify Blobs backup; record current migration version.
2. Clone to a separate staging Netlify site/database and test authentication and existing business modules before changes.
3. Deploy the migration-containing code to **staging** using the existing Netlify Database migration workflow; Netlify Database normally applies migrations during deploy. Confirm migration 030 succeeded **before** testing new Function endpoints. Inspect schema compatibility first.
4. Ensure every new table, foreign key and unique index exists; review old Project/Task records and confirm their IDs and counts remain identical.
5. Configure OAuth secrets and `SESSION_SECRET`, then deploy the LITE zip to **staging**.
6. Execute full acceptance/regression testing with 2+ users and overlapping transactions. Reconcile financial numbers to legacy sources.
7. Move to production only after explicit signoff on unfinished items. Follow site-specific backup/restore procedure for rollback. Database migration is additive, but reverting code alone does not drop new tables.

## Required environment configuration (Netlify)

- `SESSION_SECRET`: **REQUIRED**, at least 32 high-entropy random characters. The v2.1.0 source deliberately removes the former embedded signing-secret fallback. A missing value will prevent session verification/login. Existing sessions signed with a different secret require fresh login.
- `GOOGLE_CLIENT_ID`: OAuth client ID for the correct REXUS Google application.
- `GOOGLE_CLIENT_SECRET`: OAuth client secret; keep on server only.
- `GOOGLE_REDIRECT_URI`: complete HTTPS URL, e.g. `https://YOUR-STAGING-SITE.netlify.app/api/google/callback`; must exactly match Google Cloud Console Authorized redirect URI.
- Keep existing Netlify Database and Blobs configuration intact; no new database should be created.

### Google Cloud Console configuration

1. Create/select a Google Cloud project, configure Google Auth Platform consent screen with the required domain, application details and test users as appropriate.
2. Create an OAuth **Web application** client. Register the intended Netlify HTTPS origin and the exact callback `/api/google/callback` URI for staging and production separately.
3. Put Client ID, Client Secret and callback URI in the appropriate Netlify environment scope. Do not commit them to source or put them in browser JavaScript.
4. Confirm login/link, duplicate identity checks, active/inactive status checks, cancelled login, token expiry, nonce/state validation, and account unlink with 2+ real Google accounts on staging.
5. REXUS does not create a user from Google or link accounts automatically by matching email. A user must first sign in with REXUS credentials to connect Google from Account Settings.

## Test results performed in this workspace

- **PASS — Static:** `node --check` for `public/rexus-v210.js` and revised Document JS; syntax extraction from main `index.html`.
- **PASS — Static TypeScript:** `tsc --noEmit` for the new APIs and changed Project/Task Functions with lightweight development-only ambient declarations. This is NOT a full Netlify deployment build.
- **PASS — UI smoke with mocked APIs, offline Chromium:** app booted, Organization, Resource Planning, Approval Center and Project Financials views displayed; employee search returned a test record; no JavaScript page errors in those steps. Test data was mocked **only in test harness, never in shipped application source**.
- **NOT RUN:** real Google OAuth, migration against live database, actual transaction/approval concurrency, actual Blobs upload, cross-user access QA, mobile end-to-end navigation, full 8-module acceptance and regression matrix.

## Backward compatibility

- Existing backend functions are preserved; changed Project/Task endpoints implement notification-only dependencies.
- Legacy Project Gantt auto-rescheduling calls are intentionally disabled: this **changes behavior** according to the v2.1.0 specification. Check with stakeholders before deploying.
- Database contains no destructive DROP statements in the new migration.
- Session secret policy is stricter; set `SESSION_SECRET` **before** running this version.
- No actual production records have been read or changed in this build workspace.

## Package contents

- `FULL`: complete application source, prior and new migrations, configs, lockfile, release notes, and dependency tree for inspection/archive.
- `LITE`: runtime assets, Netlify Functions, database migrations, `netlify.toml`, dependency manifest/lockfile. No backups, tests, or preview images.

## No production-ready claim

This release deliberately **does not** claim it meets all items in the v2.1.0 master acceptance criteria. Each unfinished item above requires additional implementation and/or tests before production approval.
