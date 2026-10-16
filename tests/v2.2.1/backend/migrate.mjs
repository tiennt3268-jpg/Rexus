import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs'; import path from 'node:path';
export async function freshDb(migDir){
  const db = new PGlite();
  const dirs = fs.readdirSync(migDir).sort();
  const log = [];
  for (const d of dirs){
    const f = path.join(migDir, d, 'migration.sql');
    if (!fs.existsSync(f)) continue;
    try { await db.exec(fs.readFileSync(f, 'utf8')); log.push(['OK', d]); }
    catch(e){ log.push(['FAIL', d, e.message]); }
  }
  return { db, log };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const { log } = await freshDb(process.argv[2]);
  for (const l of log) console.log(l.join('  '));
}
