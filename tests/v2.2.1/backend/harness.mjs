// Runs REXUS Netlify Functions in-process against PGlite (PostgreSQL 16) with all migrations applied.
import { freshDb } from './migrate.mjs';
import { tsImport } from 'tsx/esm/api';
import fs from 'node:fs'; import path from 'node:path';

export const SRC = process.env.REXUS_SRC || path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const HERE = path.dirname(new URL(import.meta.url).pathname);
export async function boot() {
  // copy functions next to the shimmed node_modules so '@netlify/database' resolves to the PGlite shim
  fs.rmSync(path.join(HERE, 'functions'), { recursive: true, force: true });
  fs.cpSync(path.join(SRC, 'netlify/functions'), path.join(HERE, 'functions'), { recursive: true });
  const { db, log } = await freshDb(path.join(SRC, 'netlify/database/migrations'));
  const failed = log.filter(l => l[0] !== 'OK'); if (failed.length) throw new Error('migration failed: ' + JSON.stringify(failed));
  globalThis.__REXUS_PGLITE = db; globalThis.__REXUS_DBCONN = null;
  globalThis.Netlify = { env: { get: (k) => process.env[k] } };
  const mods = {};
  for (const f of fs.readdirSync(path.join(HERE, 'functions'))) if (f.endsWith('.mts')) {
    const m = await tsImport(path.join(HERE, 'functions', f), import.meta.url);
    const p = m.config?.path; mods[f] = { handler: m.default, paths: Array.isArray(p) ? p : p ? [p] : [] };
  }
  const auth = await tsImport(path.join(HERE, 'functions/lib/auth.mts'), import.meta.url);
  const tokens = {};
  async function tokenFor(uid) {
    if (!tokens[uid]) { const r = await db.query('SELECT username FROM users WHERE id=$1', [uid]); tokens[uid] = await auth.createSessionToken(uid, r.rows[0].username); }
    return tokens[uid];
  }
  function route(pathname) {
    let best = null;
    for (const [f, m] of Object.entries(mods)) for (const p of m.paths) {
      const re = new RegExp('^' + p.replace(/:[a-z]+\*?/g, '[^/]+').replace(/\*/g, '.*') + '$');
      if (re.test(pathname) && (!best || p.length > best.p.length)) best = { f, m, p };
    }
    return best;
  }
  async function call(uid, method, url, body) {
    const u = new URL(url, 'http://rexus.test');
    const r = route(u.pathname); if (!r) return { status: 404, json: { error: 'no route ' + u.pathname } };
    const headers = { 'content-type': 'application/json' };
    if (uid) headers.cookie = 'wm_session=' + encodeURIComponent(await tokenFor(uid));
    const req = new Request(u.toString(), { method, headers, body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body) });
    const res = await r.m.handler(req, {});
    const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, json, headers: res.headers };
  }
  return { db, call, mods, route, tokenFor, auth };
}
