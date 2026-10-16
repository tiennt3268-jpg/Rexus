/* REXUS v2.2.1/v2.2.2 — per-user appearance preferences (Module 9, GEN-03).
   GET /api/preferences → {theme, mode, density}
   PUT {theme:'mono'|'navy', mode:'light'|'dark'|'system', density:'compact'|'comfortable'}
   Keyed by the existing REXUS user id, so the same choice follows the user on any device. */
import type { Context, Config } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { getUserFromRequest, unauthorized } from './lib/auth.mts';

const THEMES = ['mono', 'navy'], MODES = ['light', 'dark', 'system'], DENSITIES = ['compact', 'comfortable'];
export default async (req: Request, _ctx: Context) => {
  const session = await getUserFromRequest(req); if (!session) return unauthorized();
  const db = getDatabase();
  try {
    if (req.method === 'GET') {
      const rows = await db.sql`SELECT theme, mode, density, updated_at FROM rexus_user_preferences WHERE user_id = ${session.uid}`;
      return Response.json(rows[0] ? { theme: rows[0].theme, mode: rows[0].mode, density: rows[0].density, saved: true } : { theme: 'mono', mode: 'light', density: 'compact', saved: false });
    }
    if (req.method === 'PUT') {
      const b = await req.json().catch(() => ({}));
      if (b.theme !== undefined && !THEMES.includes(b.theme)) return Response.json({ error: 'Unknown theme' }, { status: 400 });
      if (b.mode !== undefined && !MODES.includes(b.mode)) return Response.json({ error: 'Unknown mode' }, { status: 400 });
      if (b.density !== undefined && !DENSITIES.includes(b.density)) return Response.json({ error: 'Unknown density' }, { status: 400 });
      const rows = await db.sql`INSERT INTO rexus_user_preferences(user_id, theme, mode, density) VALUES (${session.uid}, ${b.theme || 'mono'}, ${b.mode || 'light'}, ${b.density || 'compact'})
        ON CONFLICT(user_id) DO UPDATE SET theme = COALESCE(${b.theme ?? null}, rexus_user_preferences.theme), mode = COALESCE(${b.mode ?? null}, rexus_user_preferences.mode),
          density = COALESCE(${b.density ?? null}, rexus_user_preferences.density), updated_at = NOW()
        RETURNING theme, mode, density`;
      return Response.json({ ...rows[0], saved: true });
    }
    return Response.json({ error: 'Method not supported' }, { status: 405 });
  } catch (e: any) { return Response.json({ error: 'Preferences error: ' + (e?.message || 'unknown') }, { status: 500 }); }
};
export const config: Config = { path: '/api/preferences' };
