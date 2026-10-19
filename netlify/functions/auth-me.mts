import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { getUserFromRequest, clearSessionCookieHeader } from "./lib/auth.mts";
import { serializeUserWithRole } from "./lib/rbac.mts";
import { gateState } from "./lib/survey.mts";

export default async (req: Request, context: Context) => {
  const session = await getUserFromRequest(req, { allowGate: true });
  if (!session) return Response.json({ user: null });

  const db = getDatabase();
  const rows = await db.sql`SELECT id, username, email, full_name, avatar, role, position, department, status FROM users WHERE id = ${session.uid}`;
  if (!rows.length) return Response.json({ user: null });

  // A deactivated account's session token is still cryptographically valid
  // (tokens aren't individually revocable), so we cut it off here instead —
  // this endpoint is checked on every page load/reload, and returning
  // user:null + clearing the cookie sends them straight back to the login
  // screen, where auth-login.mts also blocks them outright.
  if (rows[0].status && rows[0].status !== "Active") {
    return new Response(JSON.stringify({ user: null }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Set-Cookie": clearSessionCookieHeader() }
    });
  }

  // v2.3.0: outstanding First Login step / mandatory surveys — the app shows the matching fullscreen step.
  return Response.json({ user: serializeUserWithRole(rows[0]), onboarding: await gateState(db, session.uid) });
};

export const config: Config = {
  path: "/api/auth/me"
};
