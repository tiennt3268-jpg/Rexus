// Applies a migrations folder (001-035 + 036 import) to an empty PGlite database and prints row counts.
// usage: node scripts/import-previous-data/test036.mjs <migrations_dir_with_036>
import { freshDb } from '../../tests/v2.2.1/backend/migrate.mjs';
import fs from 'node:fs';
const dir = process.argv[2];
const { db, log } = await freshDb(dir);
const bad = log.filter(l => l[0] !== 'OK'); console.log('migrations:', log.length, 'failed:', JSON.stringify(bad));
const q = async s => (await db.query(s)).rows;
for (const t of ['users','task_types','reporters','projects','project_members','tasks','subtasks','worklogs','comments','activity_log','notifications','employee_rates','finance_audit_log','departments','company_settings'])
  console.log(t, (await q(`select count(*)::int n from ${t}`))[0].n);
console.log(await q(`select id, username, role, status, position, must_change_password, profile_gate from users order by id`));
console.log(await q(`select company_name, perf_pay_enabled from company_settings`));
console.log('date sample', await q(`select id, due_date, start_date from tasks where due_date is not null limit 2`));
let second = 'ran'; try { await db.exec(fs.readFileSync(dir + '/036_rexus_import_previous_data/migration.sql', 'utf8')); } catch (e) { second = 'refused: ' + e.message; }
console.log('second run:', second);
console.log('users after second attempt', (await q(`select count(*)::int n from users`))[0].n);
