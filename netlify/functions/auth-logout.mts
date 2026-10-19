import type { Context, Config } from "@netlify/functions";
import { clearSessionCookieHeader, getUserFromRequest } from "./lib/auth.mts";
import { getDatabase } from "@netlify/database";
import { logAudit } from "./lib/rexus-audit.mts";

export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  const session = await getUserFromRequest(req, { allowGate: true });
  if (session) await logAudit(getDatabase(), { actorId: session.uid, actorName: session.username, action: 'logout', entityType: 'session', entityId: session.uid, summary: 'Signed out of REXUS' });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": clearSessionCookieHeader() }
  });
};

export const config: Config = {
  path: "/api/auth/logout"
};
