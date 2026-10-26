# REXUS v2.3.2 — Move the previous REXUS data onto a new database

Same application as v2.3.1. What is new is migration **036**: it imports the data exported from the previous REXUS site (`rexusmanagement`). The import runs once, on a **new, empty** database.

## Why a new database
The previous site's database had applied an older `026_rexus_document` migration. Netlify refuses a deploy whose applied migrations were changed, removed, or that adds new migrations with a lower number. The current code cannot be deployed on top of that history. The data was therefore exported (CSV, 16 tables) and is loaded into a fresh database that runs migrations 001–035 and then 036.

## What 036 does
1. **Safety check:** if the database contains any account other than the seed accounts that migrations 001–035 create, it stops with an error. The deploy then fails and nothing is changed. It can never overwrite a database that is already in use.
2. **Removes the seed rows** created by 001–035: demo team accounts, demo project, tasks, work logs, rates, departments, task types and reporters. Configuration rows are kept: HR settings, profile fields, and company settings row 1, which is overwritten with the exported values.
3. **Inserts the exported rows:**

   | Table | Rows |
   |---|---|
   | users | 7 |
   | projects | 14 |
   | tasks | 25 |
   | subtasks | 9 |
   | worklogs | 38 |
   | activity log | 72 |
   | notifications | 110 |
   | project members | 2 |
   | task types | 4 |
   | reporters | 6 |
   | comments | 1 |
   | hourly rates | 1 |
   | finance audit log | 7 |
   | company settings | 1 |

   Passwords are kept as their stored hashes (same scrypt format), so everyone signs in with their existing password. Imported accounts do not get the First Login steps.

## Columns that no longer exist in v2.3.x
The export had a few columns that the current schema does not have:
- `users.member_type`: copied into `position` when position was empty (2 accounts: "Giảng viên UEH").
- `users.student_id`, `users.institution`: empty in the export, dropped.
- `project_members.title`: dropped (value "Thành viên").
- `company_settings.email_notifications_enabled`: dropped.

## Not in the export (so not imported)
- `departments` and `employee_performance`: these CSV files were empty.
- REXUS Document data (`rexus_*` tables) was not part of the export.
- Files stored in Netlify Blobs (attachments) live with the old site. On a new site they are not available; task `attachments` lists may point to missing files.

## Deploy steps
1. Use the **LITE** zip, which contains migration 036. Deploy it to the site whose database is **new**:
   - **Option A, new site:** create a new Netlify site, then drag the LITE zip to Deploys. Netlify creates the database because `@netlify/database` is in package.json.
   - **Option B, keep the `rexusmanagement` address:** in the Netlify UI for that site, go to *Data & Storage → Database* and delete the database. Only a Team Owner can do this, and it permanently erases the old data, so first keep the CSV export. Then deploy the LITE zip.
2. Sign in as `admin` with the old admin password, and check projects, tasks and work logs.
3. Do not deploy 036 to a database that already has real accounts. It refuses, by design.

## Developer notes
- 036 is **not committed to git**, because it contains personal data and password hashes. It is only in the release zips.
- To rebuild it from a new export, run from the repo root:
  ```bash
  node scripts/import-previous-data/cols.mjs > schema.json
  python3 -I scripts/import-previous-data/gen.py <csv_folder> schema.json 036.sql
  ```
- To test it: copy the migrations folder, add `036_rexus_import_previous_data/migration.sql`, then run `node scripts/import-previous-data/test036.mjs <folder>`.
- The automated test suites expect the seed data. Run them without 036 (the git checkout has none). `tests/v2.2.1/backend/server.mjs` accepts `REXUS_NO_SEED=1` to serve the database exactly as the migrations leave it.

## Verified (executed)
- On an empty PGlite (PostgreSQL 16), migrations 001–035 plus 036 all applied, and the row counts match the CSV files.
- Running 036 a second time is refused, and nothing changes.
- App on the imported data (test server, `REXUS_NO_SEED=1`):
  - `admin` opens the workspace with no gate.
  - 14 projects, 25 tasks and 38 work logs are returned by the API.
  - Projects and Work Log views render.
  - An imported employee's HRM record opens.
  - Notifications load, with no JavaScript errors (9/9).

## Not verified
- The real Netlify deploy.
- Sign-in with a real password. The hash format matches, but no password was available to test.
