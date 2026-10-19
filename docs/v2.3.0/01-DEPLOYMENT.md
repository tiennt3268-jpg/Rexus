# 01 — Deploying v2.3.0 (REXUS Survey v1.0.0 + First Login)

Follow the v2.2.1 procedure ([../v2.2.1/01-DEPLOYMENT-AND-MIGRATION.md](../v2.2.1/01-DEPLOYMENT-AND-MIGRATION.md)) for backup, staging first and recovery. This page lists what is new.

## Migration 035
- File: `netlify/database/migrations/035_rexus_survey/migration.sql`. Netlify Database applies it during deploy, after 034.
- Additive and idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO NOTHING`). No DROP, no DELETE, no ID changes.
- New columns on `users`: `must_change_password`, `profile_gate` (both default **FALSE**, so no existing account is blocked after the upgrade) and `onboarding_completed_at`.
- New tables: `rexus_demographic_fields` (seeded with 7 fields; DOB and Education Level required), `rexus_user_demographics`, `rexus_surveys`, `rexus_survey_versions`, `rexus_survey_responses`.
- Verify after deploy:
  ```sql
  SELECT COUNT(*) FROM users WHERE must_change_password OR profile_gate;   -- 0 right after the upgrade
  SELECT key, required, visible FROM rexus_demographic_fields ORDER BY sort_order;
  SELECT to_regclass('rexus_surveys'), to_regclass('rexus_survey_versions'), to_regclass('rexus_survey_responses');
  ```
- Before the migration runs, the gate code treats "table/column missing" as "no obligation", so a function deployed slightly before the migration does not lock anyone out.

## New and changed files
- Functions (new): `onboarding.mts` (`/api/onboarding`, `/api/profile-fields`), `surveys.mts` (`/api/surveys`), `survey-respond.mts` (`/api/survey-respond`), `lib/survey.mts`.
- Functions (changed): `lib/auth.mts` (server-side gate in `getUserFromRequest`), `auth-me.mts` and `auth-login.mts` (return `onboarding`), `auth-change-password.mts` (policy, attempt limit, clears the first-login flag), `auth-forgot-password.mts` (same policy), `admin-users.mts` (new accounts get the flags; `reset_password` action), `auth-logout.mts` and `preferences.mts` (allowed during the gate), `lib/account-rules.mts`.
- Front end (new): `rexus-gate.js`, `rexus-survey.js`, `rexus-survey.css`, `survey.html` (public surveys). Changed: `index.html` (App Switcher entry, boot through the gate, My Account personal information, survey notifications), `rexus-ui.js` (`data-rx-search`).
- No environment variables were added.

## Rollback
Redeploy v2.2.3. The new columns and tables stay (unused) and are harmless. If you must roll back after accounts were created, those accounts keep their temporary password and can sign in normally on v2.2.3.

## Behaviour changes to announce
- **New accounts** must change the temporary password and complete Date of Birth and Education Level at first sign-in.
- **Password rule** for every password change is now: at least 8 characters with a letter and a digit.
- The App Switcher has a third workspace, **REXUS Survey**. Members see surveys assigned to them; Project Managers and System Admins can create surveys; only System Admins can make a survey mandatory.
- When a System Admin publishes a mandatory survey, targeted people are asked to answer it on their next request (also in the middle of a session) before they can continue.

## Staging smoke test (maps to AC01–AC09)
- [ ] Admin creates an account → sign in with the temporary password → only *Create your own password* is shown; typing `#/all` keeps you there (AC01).
- [ ] After the password: *Complete your personal profile*; leaving DOB empty shows a field error; refresh keeps the step (AC02).
- [ ] Survey → Create → publish → Settings → Mandatory on, Departments = one department → only people in it are asked (AC03).
- [ ] Intro fills the screen and has only *Start survey* (+ Sign out) (AC04).
- [ ] Refresh or sign out in the middle → back at the intro after signing in (AC05).
- [ ] Submit → workspace opens; Analytics → Responses shows the right person (AC06).
- [ ] Set the response limit to the current count, or *Close now* → people who have not answered can work again, and the server refuses new answers (AC07).
- [ ] As a Member, `/api/onboarding?user_id=<someone else>` → 403 (AC08).
- [ ] Work Management and REXUS Document still work (AC09).
