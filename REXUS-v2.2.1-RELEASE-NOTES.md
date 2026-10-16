# REXUS Work Management v2.2.1 — Release Notes / Changelog

Release date: 2026-10-14 · Builds on v2.2.0 (Adaptive Liquid Glass UI) · Schema: migrations 001–033

> Version note: the implementation brief references both "2.1.0" and "2.2.1". This release is versioned **2.2.1** (package.json, lockfile, docs).

Detailed documentation lives in [`docs/v2.2.1/`](docs/v2.2.1/README.md).

## Summary

v2.2.1 adds Human Resources, capacity-aware Resource Planning, a central Approval Center with routing and delegation, a WBS + Gantt task view with notification-only dependencies, a reworked Project Finance module, and two server-saved themes. Google account linking was removed. All changes are additive: **no existing IDs, tables or records are removed or rewritten**. The only data written to existing rows is a category backfill on existing approval requests (presentation metadata, see Migration).

## Module changes

### M1 — Google sign-in & account linking: **removed**
- At the owner's request, the Google linking and "Sign in with Google" feature was dropped. Sign-in is REXUS username/email + password only.
- Removed: the `google-auth` Netlify Function (`/api/google/begin`, `/api/google/callback`, `/api/google/account`), the login-page Google button, the "Connected Accounts" card in My Account, and their styles. My Account keeps the Appearance (theme) section.
- The `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` environment variables are no longer used and can be deleted from Netlify.
- The v2.1.0 tables `user_google_accounts` and `oauth_pending_states` (migration 030) are **left in place** and simply unused. Dropping them would be a destructive migration; existing rows are kept and never read.

### M2 — Resource Planning & Capacity
- New capacity engine (`netlify/functions/lib/capacity.mts`) with two capacity methods:
  - **Schedule:** workdays × hours/day − holidays − personal days off − approved leave.
  - **Declaration:** approved monthly declarations, mainly for part-time staff.
- Effective-dated employment profiles. A schedule change never rewrites past months.
- Planned hours come from task and subtask estimates without double counting, plus explicit allocations, distributed over the assignee's working days. Unestimated and undated work is reported separately rather than counted as zero. Actual hours come from work logs.
- Dashboard with 7 summary metrics, filters and presets, an employee table, a day/week/month timeline heatmap, an unestimated-work list, an availability search, and an allocation preview that shows overload before you save.
- Visibility: PMs and Admins see everyone; other users see themselves and the people they manage.

### M3 — Central Approval Center
- One inbox for all approval types, grouped into four categories: Human Resources, Project Management, Project Finance and Documents.
- Tabs: Pending / Assigned / My Requests / Delegated / Approved / Rejected / All (admin). Filters, sorting, pagination, and a detail view showing the related record, steps and history.
- Sequential and parallel steps.
- Approve, Reject and Request Changes. Reject and Request Changes require a reason.
- Self-approval is forbidden.
- Decisions are idempotent: a conditional update guarantees one decision even when two requests race.
- Routing: explicit approver → routing rules → HR profile → department head. If none applies, the user gets an actionable error.
- Date-bounded, category-scoped delegations. Steps record the original approver plus `acted_by`.
- Reassignment with a reason and an audit event.
- Finance approvals require a PM or System Admin.

### M4 — Human Resources Management (renamed from "Organization")
- Search-first employee lookup: no org chart or directory dump. Supports keyboard navigation.
- Employee profile: employment type, capacity method, hours and workdays, manager, capacity approver, history.
- Leave requests (Annual, Sick, Unpaid, Personal, Other; full-day, half-day or hourly) with overlap protection and automatic duration. Requests go through the Approval Center.
- Monthly capacity declarations with a calendar, "apply weekly pattern", "copy previous month", an accessible list view, and version history.
- Team capacity view for managers. Company and global holiday admin.

### M5 — Notification-only workflow
- Task dependencies with multiple predecessors. Duplicate, self and circular dependencies are rejected.
- Dependencies **never block** work or change status. When every predecessor is done, the successor's assignee and/or the project manager receive one "ready" notification per real transition.
- Per-project settings: dependencies on/off, notify assignee, notify PM.
- Workflow templates: save, apply (creates new tasks with dependencies in one transaction) and delete. Cyclic templates are rejected.
- Fix: reopening and re-completing a predecessor within the same second could miss the notification, because the signature used a second-precision date. It now uses millisecond ISO timestamps.

### M6 — WBS + Gantt
- The project detail page now leads with a hierarchical WBS (numbered 1, 1.1, …; expand and collapse; subtask roll-up Σ) aligned row-for-row with a Gantt timeline. The timeline has dependency links, day/week/month modes and selection sync.
- The legacy drag-to-reschedule Gantt is kept below as "Interactive Gantt (drag to reschedule)".

### M7 — Project Finance
- Fixed a bug where projects were missing from Finance. Finance now lists registered projects **and** task-only projects, identified by owner + name. Duplicate names are resolved by owner.
- Ledger status flow: Draft → Pending Approval → Approved → Completed (plus Rejected and Cancelled). **Only Completed entries count as cash.** An approval is not a cash movement.
- Corrections are made by reversal entries, which keep the original. Totals are grouped per currency, and an optional base amount is stored.
- A disbursement request and its approval are created atomically. Payments are capped by the approved amount and the budget, and use row locks and unique references.
- Full audit history per record.

### M8 — Document Space Switcher
- **No changes in this release.** The behaviour is the same as v2.1.x. See Known Limitations.

### M9 — Themes & compact layout
- Two themes: **Black & White** (`mono`, the default neutral liquid glass) and **Navy & Light Blue** (`navy`).
- The theme is saved per user ID on the server (`/api/preferences`), applied without a reload, and cached locally to avoid a flash on load.
- Compact density is now the default, driven by density tokens.

### M10 — Integration
- Hash routing (`#/view`). Deep links survive a refresh, and browser Back and Forward work.
- All new endpoints check the session. Permission checks happen on the backend.

## API additions

| Endpoint | Purpose |
|---|---|
| `GET/PUT /api/preferences` | Theme and density per user |
| `/api/hr/profile`, `/api/hr/holidays`, `/api/hr/leave`, `/api/hr/capacity`, `/api/hr/team` | HR module |
| `/api/resource-planning` (rewritten) | Capacity plan, availability, preview, allocations, estimates. The legacy `settings` action returns 410. |
| `/api/approval-center` (rewritten) | List, detail, meta, create, decide, assign, reassign, delegate, routing |
| `/api/project-financials` (rewritten) | Project list, ledger, reversals, disbursements, payments, history |
| `/api/task-dependencies` (rewritten) | Dependencies and workflow settings |
| `/api/workflow-templates` (new) | Templates |
| `/api/google/*` | **Removed** (function deleted) |

## Migration
- New additive, idempotent migration: `netlify/database/migrations/033_rexus_v221/migration.sql`. It was run twice on PGlite to confirm idempotency.
- The migration contains no DROP, no TRUNCATE, no DELETE and no ID changes.
- It runs two `UPDATE` statements that set the new `category` column on existing approval requests (`project_disbursement` → Project Finance, `document_review` → Documents).
- Full procedure: [`docs/v2.2.1/01-DEPLOYMENT-AND-MIGRATION.md`](docs/v2.2.1/01-DEPLOYMENT-AND-MIGRATION.md).

## Testing (summary)

Actual results only. Details are in [`docs/v2.2.1/07-TEST-REPORT.md`](docs/v2.2.1/07-TEST-REPORT.md).
- Backend, real handlers on PGlite (PostgreSQL 16) with migrations 001–033: **156/156 passed**.
- E2E in a browser (Playwright/Chromium) against the real handlers: **48/48 passed**.
- Legacy UI regression with a mocked API: **24/24 interaction checks passed**, plus a 120-measurement layout sweep (clean apart from intentional WBS name truncation).
- `tsc --noEmit` on new and changed functions: passed.
- **Not tested:** real Netlify Database and Blobs, real multi-connection concurrency, and the production deploy.

## Known limitations
See [`docs/v2.2.1/08-KNOWN-LIMITATIONS.md`](docs/v2.2.1/08-KNOWN-LIMITATIONS.md).
