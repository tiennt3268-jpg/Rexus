# REXUS v2.2.2 — documentation & requirement traceability

Source: *Requirement V2.1.2 (Updated)*. Release notes: [`../../REXUS-v2.2.2-RELEASE-NOTES.md`](../../REXUS-v2.2.2-RELEASE-NOTES.md).

| Doc | Content |
|---|---|
| [01-DEPLOYMENT](01-DEPLOYMENT.md) | Migration 034, deploy and rollback, smoke checklist |
| [02-HRM-PERMISSION-MATRIX](02-HRM-PERMISSION-MATRIX.md) | HRM-01 role × action matrix for QA |
| [03-MONTHLY-SCHEDULE](03-MONTHLY-SCHEDULE.md) | HRM-02…05 rules: regular vs OT, minimum, requests |
| [04-TEST-REPORT](04-TEST-REPORT.md) | What was run, with results |
| [05-DECISIONS-AND-LIMITATIONS](05-DECISIONS-AND-LIMITATIONS.md) | Q01–Q11 answers and assumptions, known limitations |
| [evidence/](evidence) | Before / after screenshots |

The v2.2.1 docs in [`../v2.2.1/`](../v2.2.1/README.md) still apply. v2.2.2 changes them only where noted: the drag Gantt is gone, dark mode exists, and capacity declarations now include regular hours + OT for everyone.

## Traceability (issue → change → evidence)

| Req | Main change | Files | Test evidence |
|---|---|---|---|
| GEN-01 | Automated contrast and overflow audit of 20 screens × 7 configurations; fixes from it | `tests/v2.2.2/e2e/ui_audit.py`, `public/rexus-ui.css`, `public/rexus-dark.css` | `ui-audit-results.log` (140/140 clean) |
| GEN-02 | Tokenized palette (surface/wash), accessible avatar colors | `rexus-ui.css`, `index.html` | UI audit; `evidence/gen03-*.jpg` |
| GEN-03 | Light/Dark/System per account | `rexus-dark.css`, `rexus-v221.js`, `index.html` (head), `preferences.mts`, migration 034 | Backend "v2.2.2 GEN-03" (5 checks); E2E GEN-03 (6) |
| GEN-04 | Redundant subtitles removed, guidance kept | `rexus-v221.js`, `rexus-document.js` | E2E GEN-04 (2); `evidence/gen04-*.jpg` |
| GEN-05 | No old-login flash; English strings | `index.html` | E2E GEN-05 (7: reload, form login, refresh, expiry, logout, English, restyled login); `evidence/gen05-*.jpg` |
| GEN-06 | Drag-to-reschedule Gantt removed | `index.html`, `rexus-ui.css`, `rexus-ui.js` | E2E GEN-06 (2) |
| GEN-07 | Column resize in every data table | `rexus-ui.js` §4c, `rexus-ui.css` | E2E GEN-07 (5) |
| ACC-01 | Username field and validation | `admin-users.mts`, `lib/account-rules.mts`, `index.html` | Backend ACC-01 (6); E2E ACC-01 (3) |
| ACC-02 | Soft delete, restore, sessions revoked | `admin-users.mts`, `lib/auth.mts`, `users-list.mts`, `index.html`, migration 034 | Backend ACC-02 (19); E2E ACC-02 (5); `evidence/acc02-delete-account.jpg` |
| ACC-03 | Admin self-profile (no role/status) | `auth-profile.mts`, `index.html` | Backend ACC-03 (7); E2E ACC-03 (4) |
| HRM-01 | Server checks and matrix | `hr.mts`, [02-HRM-PERMISSION-MATRIX](02-HRM-PERMISSION-MATRIX.md) | Backend HRM-01 (7) |
| HRM-02/03 | Monthly schedule for all, regular vs OT | `hr.mts`, `lib/capacity.mts`, `rexus-v221.js` | Backend HRM-02/03 (9); E2E HRM-02/03 (5) |
| HRM-04 | Part-time minimum (company + personal, frozen per month) | `hr.mts`, `rexus-v221.js`, migration 034 | Backend HRM-04 (8); E2E HRM-04 (3); `evidence/hrm-parttime-minimum.jpg` |
| HRM-05 | Manager schedule requests, no duplicates | `hr.mts`, `rexus-v221.js`, `index.html` (notification link) | Backend HRM-05 (7); E2E HRM-05 (5); `evidence/hrm-team-schedules.jpg` |
| DOC-01 | Sidebar show/hide | `rexus-document.js`, `rexus-ui.css` | E2E DOC-01 (2); `evidence/doc01-*.jpg` |
| DOC-02 | Wider, responsive dialogs | `rexus-ui.css` | E2E DOC-02 (2); `evidence/doc02-*.jpg` |
| DOC-03 | Seamless editor | `rexus-ui.css`, `rexus-dark.css` | E2E DOC-03 (1); `evidence/doc03-*.jpg` |
