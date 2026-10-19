# REXUS v2.3.0 — REXUS Survey v1.0.0 + First Login: documentation & traceability

Source: *REXUS Survey v1.0.0 — SRS + UI/UX B+C, Fullscreen REV1* (RS-SPEC-1.0-UIUX-BC-FS-REV1). Release notes: [`../../REXUS-v2.3.0-RELEASE-NOTES.md`](../../REXUS-v2.3.0-RELEASE-NOTES.md).

| Doc | Content |
|---|---|
| [01-DEPLOYMENT](01-DEPLOYMENT.md) | Migration 035, new files, rollback, staging smoke test (AC01–AC09) |
| [02-SURVEY-GUIDE](02-SURVEY-GUIDE.md) | Permissions, First Login order, builder, targets, availability, answering, analytics, personal information |
| [03-TEST-REPORT](03-TEST-REPORT.md) | What was run, with results |
| [04-DECISIONS-AND-LIMITATIONS](04-DECISIONS-AND-LIMITATIONS.md) | D1–D8 as applied, other choices, known limitations |
| [evidence/](evidence) | Screenshots of the implemented screens (mockups 01–11) |

The v2.2.3 docs ([`../v2.2.3/`](../v2.2.3/README.md)) still apply: UI guideline, badge palette, page / modal / notification rules.

## Traceability — functions (F01–F07)

| Req | Implementation | Files | Tests |
|---|---|---|---|
| F01 REXUS Survey | Workspace in the App Switcher; create (blank / templates), builder with 9 question types, preview, publish with immutable versions, duplicate, close / reopen / archive, analytics, CSV / Excel | `rexus-survey.js`, `rexus-gate.js` (form), `surveys.mts`, `survey-respond.mts`, `lib/survey.mts`, migration 035 | Backend *Survey builder*, *Versioning*, *Analytics*, *Public survey*; E2E builder / analytics / public |
| F02 Mandatory on Login | System Admin setting; All / Departments / Job positions / Specific employees, OR, unique estimate, priority | `surveys.mts` (`settings`, `estimate`), `lib/survey.mts` (`TARGET_SQL`) | Backend *AC03*, *Priority*; E2E AC03 |
| F03 Fullscreen Mandatory | Intro and form fill 100vw × 100dvh, single CTA, no Skip / Close / Dashboard | `rexus-gate.js`, `rexus-survey.css` | E2E AC04, UIAC07, UIAC08 |
| F04 Respondent identity | User ID from the session only; department/position snapshot; no demographics copied | `survey-respond.mts` | Backend *AC05/AC06*; E2E AC06 |
| F05 Availability | Open/close time (UTC+7), response limit (transaction-safe), manual close; gate released when closed | `lib/survey.mts` (`OPEN_SQL`), `survey-respond.mts` | Backend *AC07*; E2E AC07 |
| F06 Demographics | Field configuration, self-service vs HR-managed, required/visible rules, admin view, audit (no values logged) | `onboarding.mts`, `rexus-gate.js` (profile form), `rexus-survey.js` (Employee Profiles, Profile Fields), `index.html` (My Account) | Backend *AC02*, *AC08*, *Rollout*; E2E profile / My Account / fields |
| F07 First Login Gate | Server-side gate in `getUserFromRequest`: password → profile → mandatory surveys → workspace; flags only for new / reset accounts | `lib/auth.mts`, `lib/survey.mts` (`gateState`), `auth-*.mts`, `admin-users.mts`, `index.html` (boot) | Backend *AC01*, *AC02*, *Rollout and reset*; E2E AC01, AC02, AC05 |

## Acceptance criteria

| ID | Scenario | Evidence |
|---|---|---|
| AC01 | New user with temporary password is stopped at Change password | Backend *AC01* (16 checks); E2E AC01; `evidence/05-first-login-password.jpg` |
| AC02 | Password changed, DOB/education missing → no Dashboard | Backend *AC02* (8); E2E AC02; `evidence/06-first-login-profile.jpg` |
| AC03 | Mandatory for a department / position → only those User IDs | Backend *AC03* (9); E2E AC03; `evidence/04-settings.jpg` |
| AC04 | Intro has no Skip/Close; only Start | E2E AC04, UIAC07; `evidence/07-mandatory-intro.jpg` |
| AC05 | Refresh / sign-out before submit → same step after sign-in | Backend *AC05/AC06* (13, shared); E2E AC05 |
| AC06 | Response stored with the session User ID | Backend *AC05/AC06*; E2E AC06 |
| AC07 | Quota / expiry → no new answers, gate released | Backend *AC07* (10); E2E AC07 |
| AC08 | No demographics / identified responses via API without permission | Backend *AC08* (6); E2E AC08 |
| AC09 | Work Management and Document regression | E2E v2.2.3 / v2.2.2 / v2.2.1, legacy UI harness, backend 224, UI audit |

UI acceptance (UIAC01–UIAC10) is mapped in [03-TEST-REPORT](03-TEST-REPORT.md).
