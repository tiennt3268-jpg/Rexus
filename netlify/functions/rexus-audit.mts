import type { Context, Config } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { getUserFromRequest, unauthorized } from './lib/auth.mts';
import { getFullUser, isSystemAdmin } from './lib/rbac.mts';

// Read-only endpoint. Audit events can only be written by server-side handlers.
export default async (req: Request, _context: Context) => {
  const session = await getUserFromRequest(req);
  if (!session) return unauthorized();
  if (req.method !== 'GET') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const db = getDatabase();
    const account = await getFullUser(db, session.uid);
    if (!account) return unauthorized();
    const url = new URL(req.url);
    const allUsers = url.searchParams.get('scope') === 'all';
    if (allUsers && !isSystemAdmin(account)) return Response.json({ error: 'Admin access required' }, { status: 403 });
    const rawLimit = Number(url.searchParams.get('limit') || 80);
    const limit = Number.isFinite(rawLimit) ? Math.min(200, Math.max(1, Math.floor(rawLimit))) : 80;
    const page = Number(url.searchParams.get('page') || 0);
    const offset = Number.isSafeInteger(page) && page >= 0 ? Math.min(page, 100) * limit : 0;
    const rows = allUsers
      ? await db.sql`SELECT a.id, COALESCE(NULLIF(u.full_name, ''), u.username, a.actor_username) AS actor_username, a.action, a.entity_type, a.entity_id, a.summary, a.details, a.created_at
         FROM rexus_audit_log a LEFT JOIN users u ON u.id = a.actor_user_id ORDER BY a.created_at DESC LIMIT ${limit} OFFSET ${offset}`
      : await db.sql`SELECT a.id, COALESCE(NULLIF(u.full_name, ''), u.username, a.actor_username) AS actor_username, a.action, a.entity_type, a.entity_id, a.summary, a.details, a.created_at
         FROM rexus_audit_log a LEFT JOIN users u ON u.id = a.actor_user_id WHERE a.actor_user_id = ${session.uid}
         ORDER BY a.created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    return Response.json({ events: rows, scope: allUsers ? 'all' : 'mine', page: offset / limit },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err: any) {
    return Response.json({ error: 'Audit history unavailable. Check migration 027.' }, { status: 500 });
  }
};
export const config: Config = { path: '/api/rexus-audit' };
