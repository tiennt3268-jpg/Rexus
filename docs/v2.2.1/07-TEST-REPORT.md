# 07 — Functional & regression test report (v2.2.1)

Test date: 2026-10-14 (re-run after removing Google sign-in). **Every result below was actually executed.** Anything not executed is listed in §6 and is **not** reported as passed.

## 1. Environment

| Layer | What was used | Fidelity |
|---|---|---|
| Database | **PGlite 0.2.17** (PostgreSQL 16 compiled to WASM, in-process) with **all migrations 001–033** applied in order | Real Postgres SQL, constraints, indexes and transactions. Single connection (see §6). |
| Functions | The **real** `netlify/functions/*.mts` handlers, run through `tsx`. `@netlify/database` is shimmed to use the real `waddler/node-postgres` driver over PGlite. `@netlify/blobs` is shimmed in memory. | Same handler code as production, but not the Netlify runtime |
| Auth | Real signed session cookies from `lib/auth.mts` (key stored in the DB, as in migration 032) | Real |
| Browser | Playwright (Python) + Chromium against a local Node server that serves `public/` and routes `/api/*` to the real handlers | Real browser, local server |
| Seed | The repository's seeded users, tasks and projects, plus test fixtures (holiday, leave, subtasks, dependency, task-only project) | — |

## 2. Functional tests

### 2.1 Backend suite: **156 / 156 passed**
Source: `tests/v2.2.1/backend/backend.test.mjs`. Raw results: `backend-results.json` and `backend.log`.

| Section | Checks | Passed | What is covered |
|---|---|---|---|
| Migrations | 9 | 9 | All 033 tables exist; existing users, tasks and projects are untouched |
| M9 Preferences | 6 | 6 | Default mono; navy saved per user ID and persisted on the server; isolated per user; unknown theme rejected; unauthenticated requests rejected |
| M4 HR | 14 | 14 | Profile permissions (self, manager, unrelated user, admin); history including the 1900-01-01 snapshot; holidays (admin only, duplicate 409); leave duration of 16 h; routing to the manager; overlap refused; multi-day half-day refused |
| M3 Approvals | 35 | 35 | Self-approval forbidden; reason required; idempotent decisions; source updated; requester notified; sequential stages and notifications; parallel; changes requested; direct-type restriction; reassign (reason, permissions, not to the requester, audit, previous approver loses access); delegation (category scope, finance safety, delegated tab, acted_by, expiry, revoke permissions); 422 routing error; admin-only routing rules; rule routing; admin "All" tab with filter and pagination |
| M2 Capacity declarations | 13 | 13 | Missing ≠ 0; draft → pending → approved; pending lock; pending ≠ confirmed; versioning (v1 effective while v2 is a draft, then v1 Superseded); copy previous month; team view |
| M2 Resource planning | 18 | 18 | 144 h full-time example; weekends; no double deduction; effective-dated schedule (Nov 8 h vs Dec 6 h); planned 58 h with roll-up and allocation rules; unestimated; unscheduled; actual (worklog counted once); variance; utilization; preview; visibility; availability search; estimate permissions; estimate fill doesn't change status, assignee or dates |
| M5 Workflow | 21 | 21 | Multiple predecessors; duplicate, self and circular dependencies rejected; non-blocking; ready notification only when all predecessors are done, to the assignee and PM once each; no duplicates on repeated saves; reopen → waiting; genuine re-transition notifies; settings; templates (save, cycle reject, apply creates 3 tasks with offsets and dependencies; member refused) |
| M7 Finance | 36 | 36 | Registered and task-only projects; member visibility; owner + name; legacy ambiguity 409; draft/confirm/double-confirm; reference uniqueness; expense approval ≠ cash; balances; budget separate from cash; reversal (reason, once only, original kept); currency grouping; base amount; finance approver role; atomic disbursement and approval; payment gating, partial and full; duplicate reference; over-approved and over-budget refused; disbursement ≠ expense; audit trail; non-member refused; unregistered project can't release funds |
| M1 Google removed | 1 | 1 | No function serves `/api/google/*` any more |
| M10 Concurrency | 3 | 3 | Two simultaneous decisions → exactly one succeeds; simultaneous identical payments → recorded once; concurrent draft saves → a single open declaration |

Migration idempotency: `tests/v2.2.1/backend/rerun.mjs` applies 033 a second time on a fully migrated DB → **"033 re-applied OK"**.

The suite was run again from its packaged location (`tests/v2.2.1/backend`, fresh `npm install`) → **156/156 passed**.

### 2.2 End-to-end UI suite: **48 / 48 passed**
Source: `tests/v2.2.1/e2e/e2e221.py`. Log: `e2e-results.log`. All flows use the real handlers, and the browser logs in as the seeded admin, PM, member and part-time users.

| Module | Checks |
|---|---|
| M4 HR | Sidebar renamed; page title and tabs; search-first (no directory shown before searching); search results; keyboard selection opens the profile; own profile shows employment and capacity; leave submitted through the UI and routed to the manager; shown as Pending Approval; leave calendar grid; holidays admin list |
| M1 / M9 | Google login button and Connected Accounts card are gone; Appearance shows two themes; theme applies without a reload; persists across logins (server-side); other users keep their own theme |
| M3 | Pending tab lists the leave; detail shows the related record, steps and history; reject requires a reason (client); approve through the UI; delegations tab |
| M10 | Direct URL `#/approval-center` survives a refresh; browser Back returns to the previous view; Escape closes v2.2.1 dialogs |
| M2 | Capacity calendar for a declaration-based employee; weekly pattern fills matching weekdays; declaration submitted → Pending; pending month locked; accessible list view; dashboard cards; pending shown as not confirmed; heatmap cells; weekly scale |
| M7 | Finance lists registered and task-only projects; overview metrics; income added through the dialog as a draft; confirmed income updates cash; Financials section inside project detail |
| M6 / M5 | WBS replaces the flat list; numbering 1, 1.1, …; WBS and Gantt row counts equal; collapse updates both; selecting a bar highlights its WBS row; no nested vertical scrollbar; dependency line drawn; dependency dialog opens |
| Global | No JavaScript page errors in any flow; **responsive sweep: 6 widths (320, 375, 768, 1024, 1440, 1920) × 5 new screens** (HR, Resource Planning, Approval Center, Finance, project WBS) with no page-level horizontal overflow and no JS errors |

Screenshots were checked visually at 1440 px for both themes, including the Navy theme on the Tasks view and the finance detail page with a toast.

## 3. Static checks
- `tsc --noEmit` (TypeScript 5.6, non-strict, NodeNext) over hr, approval-center, resource-planning, project-financials, preferences, workflow-templates, task-dependencies, tasks, lib/capacity, lib/approvals and lib/task-ready: **passed**.
- JavaScript syntax check of `public/rexus-v221.js` and `public/rexus-ui.js`: **passed**.

## 4. Regression
Checks that existing (v2.1.x / v2.2.0) behaviour still works. These run against the legacy UI with a **mocked API** (`harness/mock.py`; not shipped).

### 4.1 Interaction regression: **24 / 24 passed**
- Sidebar keyboard access, aria-current, row action icons, accessible names on all visible buttons.
- Delete confirm dialog: alertdialog role, initial focus on Cancel, scroll lock, focus trap, Escape cancels with no DELETE sent, focus restored afterwards.
- Stacking: confirm dialog above the parent modal; modal above the sticky header.
- Save confirmation shows a loading state; a repeat click during confirmation sends exactly one create request (the original bug is fixed).
- Toast placement and live region; glass surfaces have no fixed hue; REXUS Document mode renders; no JS errors.

### 4.2 Layout sweep: **120 measurements** (20 screens × 6 widths)
- No horizontal page overflow and no JS errors on any screen, including Overview, All tasks, Projects, Worklog, Calendar, HR, Approval Center, Finance, Task detail, My Account, Configuration, the notification panel, the user menu, modals, toasts, the launcher and Documents.
- The only flagged items are on Project detail: 3 "clipped" and 16 "small" elements. These are the **intentional** single-line ellipsis on long WBS task names and the compact WBS columns. Full names are available via the title tooltip and the row's detail button.

### 4.3 Backend regression
The backend suite boots every existing function module alongside the new ones on the full 001–033 schema. The "existing users / tasks / projects untouched by 033" check confirms that migration 033 changes no existing rows in those tables.

## 5. Re-running the tests
```sh
# backend (Node 20+)
cd tests/v2.2.1/backend
npm install
sh setup-shims.sh          # installs the @netlify/database and @netlify/blobs test shims; re-run after any npm install
node backend.test.mjs      # → "156/156 backend checks passed", writes backend-results.json
node rerun.mjs             # → "033 re-applied OK"

# end-to-end (needs Python 3 + playwright + Chromium)
node server.mjs 8899 &     # TEST-ONLY server: real handlers on PGlite, /__test/login issues sessions
python3 ../e2e/e2e221.py http://localhost:8899 ./shots
```
`server.mjs` exposes `/__test/login` and is a **test tool only**. It is never deployed: it is not under `netlify/functions` and not in the LITE package.

## 6. Not tested (not claimed as passed)
- **Real Netlify Database** (managed Postgres) and the migration running in the Netlify deploy pipeline; **real Netlify Blobs**.
- **True multi-connection concurrency.** PGlite has a single connection, so concurrent requests were interleaved rather than run in parallel. Row locks and unique constraints are standard Postgres, but they were not exercised under real parallel load.
- Netlify Functions runtime limits (cold starts, timeouts, memory) and performance with production-size data.
- **Document Space Switcher**: no changes were made, so no new tests were written. It is covered only by the existing-UI smoke ("REXUS Document mode renders").
- Real email or push delivery of notifications (only in-app notification rows were verified).
- Screen-reader testing with real assistive technology (only ARIA attributes and keyboard behaviour were checked).
- Browsers other than Chromium (Safari and Firefox were not run).
- Real mobile devices (only viewport emulation was used).
