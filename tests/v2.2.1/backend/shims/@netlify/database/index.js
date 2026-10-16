// TEST SHIM: @netlify/database backed by PGlite (in-process PostgreSQL 16). Same waddler SQL builder as production.
import { waddler } from 'waddler/node-postgres';
const g = globalThis;
function makePool(db){
  let chain = Promise.resolve();
  const run = (text, params) => db.query(text, params || [], { rowMode: 'object' }).then(r => ({ rows: r.rows, rowCount: r.affectedRows ?? r.rows.length, fields: r.fields || [] }));
  return {
    query: (text, params) => { if (typeof text === 'object') { params = params ?? text.values; text = text.text; } return run(text, params); },
    // PGlite is single-connection: emulate a checked-out client by serialising whole transactions.
    connect: async () => { let release; const turn = new Promise(r => release = r); const prev = chain; chain = chain.then(() => turn); await prev;
      return { query: (t, p) => { if (typeof t === 'object') { p = p ?? t.values; t = t.text; } return run(t, p); }, release: () => release() }; },
    on(){}, end: async () => {}
  };
}
export function getDatabase(){
  if (!g.__REXUS_PGLITE) throw new Error('test DB not initialised');
  if (!g.__REXUS_DBCONN){ const pool = makePool(g.__REXUS_PGLITE); g.__REXUS_DBCONN = { driver: 'server', pool, sql: waddler({ client: pool }), connectionString: 'pglite://memory' }; }
  return g.__REXUS_DBCONN;
}
export class MissingDatabaseConnectionError extends Error {}
export function getConnectionString(){ return 'pglite://memory'; }
