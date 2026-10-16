// idempotency: apply 033 twice
import { freshDb } from './migrate.mjs'; import fs from 'node:fs';
const { db } = await freshDb((process.env.REXUS_SRC || new URL('../../..', import.meta.url).pathname) + '/netlify/database/migrations');
await db.exec(fs.readFileSync((process.env.REXUS_SRC || new URL('../../..', import.meta.url).pathname) + '/netlify/database/migrations/033_rexus_v221/migration.sql','utf8'));
console.log('033 re-applied OK');
