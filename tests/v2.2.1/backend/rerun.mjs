// idempotency: re-apply the additive migrations 033 and 034 on top of a fully migrated database
import { freshDb } from './migrate.mjs'; import fs from 'node:fs';
const ROOT = (process.env.REXUS_SRC || new URL('../../..', import.meta.url).pathname) + '/netlify/database/migrations/';
const { db, log } = await freshDb(ROOT);
if (log.some(l => l[0] !== 'OK')) throw new Error(JSON.stringify(log.filter(l => l[0] !== 'OK')));
for (const m of ['033_rexus_v221', '034_rexus_v222']) { await db.exec(fs.readFileSync(ROOT + m + '/migration.sql', 'utf8')); console.log(m + ' re-applied OK'); }
