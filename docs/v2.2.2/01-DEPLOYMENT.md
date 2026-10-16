# 01 — Deploying v2.2.2

Follow the v2.2.1 procedure ([../v2.2.1/01-DEPLOYMENT-AND-MIGRATION.md](../v2.2.1/01-DEPLOYMENT-AND-MIGRATION.md)) for backup, staging first, and recovery. This page lists only what is different.

## Prerequisites
- Migrations 001–033 have been applied (v2.2.1).
- A verified database backup exists (`pg_dump`, or a Netlify Database branch or backup).

## Migration
- File: `netlify/database/migrations/034_rexus_v222/migration.sql`. Netlify Database applies it during deploy, after 033.
- It is additive and idempotent: `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, and guarded constraints. It contains no DROP or DELETE and changes no IDs.
- After deploying, verify with:
  ```sql
  SELECT column_name FROM information_schema.columns WHERE table_name='rexus_user_preferences' AND column_name='mode';
  SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name IN ('deleted_at','deleted_by');
  SELECT column_name FROM information_schema.columns WHERE table_name='rexus_capacity_entries' AND column_name='ot_hours';
  SELECT to_regclass('rexus_hr_settings'), to_regclass('rexus_schedule_requests');
  SELECT * FROM rexus_hr_settings;   -- one row, part_time_min_monthly_hours = 0
  ```
- No environment variables were added. The `GOOGLE_*` variables have been unused since v2.2.1.

## Behaviour changes to tell users about
- **Sessions of inactive or deleted accounts stop working immediately on every page and API.** Before, they kept working until the next full reload. Expect support questions from people who were deactivated while signed in.
- The drag-to-reschedule Gantt is gone. Reschedule tasks from the task form.
- The HR tab "Capacity Declarations" is now **Monthly Schedule** and is available to every employee. Full-time staff can register overtime there.
- Admins can now edit their own username and email. A changed username becomes the new sign-in name.

## Staging smoke test
- [ ] Sign in, refresh, sign out. The old navy login screen must not flash during load.
- [ ] My Account → Appearance: try Dark, Light and System. Sign in from another browser and check that the mode follows the account.
- [ ] Configuration → Create Account with a username, then sign in as the new user.
- [ ] Delete that account (type its username to confirm). The user's open session should be signed out on its next action. Check "Show deleted accounts", then Restore, then set the account Active again.
- [ ] As an admin, change your own position or department in My Account and reload.
- [ ] HR → Monthly Schedule:
  - full-time: add OT and a note, then submit;
  - part-time below the minimum: check the warning appears;
  - manager: Team Schedules → Request schedules → check the employee gets a notification that opens the form;
  - approve in the Approval Center.
- [ ] Project detail: the WBS and Gantt show, and there is no drag Gantt section.
- [ ] Drag a table column edge, reload, and check the width is kept. Double-click the edge to reset it.
- [ ] REXUS Document: collapse and expand a sidebar section. "New page" opens a wide dialog. The editor shows no box while typing.

## Rollback
- Code: in Netlify, publish the previous v2.2.1 deploy. v2.2.1 runs on the 034 schema, because it ignores the new columns and tables. Two consequences:
  - Soft-deleted accounts stay Inactive, so they still can't sign in under v2.2.1. But they reappear in lists, because v2.2.1 doesn't read `deleted_at`.
  - Overtime that has already been declared is ignored by v2.2.1.
- Data: restore the pre-deploy dump only as a last resort, because it loses everything written after the backup.
