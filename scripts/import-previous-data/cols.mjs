// Prints the schema (columns, keys) and the seed account IDs of a fresh database built from migrations 001-035.
// usage (from the repo root): node scripts/import-previous-data/cols.mjs > schema.json
import { freshDb } from '../../tests/v2.2.1/backend/migrate.mjs';
const { db } = await freshDb(new URL('../../netlify/database/migrations', import.meta.url).pathname);
const r = (await db.query(`select table_name t, column_name c, data_type d, is_nullable n, column_default def from information_schema.columns where table_schema='public' order by table_name, ordinal_position`)).rows;
const out={}; for (const x of r){ (out[x.t] ||= {})[x.c]={type:x.d,nullable:x.n==='YES',def:x.def}; }
const fk = (await db.query(`select conrelid::regclass::text t, confrelid::regclass::text ref, pg_get_constraintdef(oid) def from pg_constraint where contype='f' order by 1`)).rows;
const pk = (await db.query(`select conrelid::regclass::text t, pg_get_constraintdef(oid) def from pg_constraint where contype in ('p','u') order by 1`)).rows;
const seed_users = (await db.query(`select id from users order by id`)).rows.map(r => r.id);
console.log(JSON.stringify({cols:out,fk,pk,seed_users}));
