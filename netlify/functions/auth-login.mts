import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { verifyPassword, createSessionToken, sessionCookieHeader } from "./lib/auth.mts";
import { serializeUserWithRole } from "./lib/rbac.mts";
import { logAudit } from "./lib/rexus-audit.mts";
import { gateState } from "./lib/survey.mts";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return Response.json({ error: "Unsupported method" }, { status: 405 });

  try {
    const body = await req.json();
    const identifier = String(body.username || body.email || "").trim();
    const password = String(body.password || "");
    const identifierLower = identifier.toLowerCase();
    const remember = body.remember !== false; // default to remembering unless explicitly unchecked

    const db = getDatabase();
    const rows = await db.sql`SELECT * FROM users WHERE email = ${identifierLower} OR username = ${identifier}`;
    if (!rows.length || !verifyPassword(password, rows[0].password_hash)) {
      return Response.json({ error: "Invalid username or password." }, { status: 401 });
    }

    const user = rows[0];
    if (user.status && user.status !== "Active") {
      return Response.json({ error: "This account has been deactivated. Contact a System Admin." }, { status: 403 });
    }
    const token = await createSessionToken(user.id, user.username || user.email);
    await logAudit(db, { actorId: user.id, actorName: user.username || user.email, action: 'login', entityType: 'session', entityId: user.id, summary: 'Signed in to REXUS' });
    return new Response(JSON.stringify({ ...serializeUserWithRole(user), onboarding: await gateState(db, user.id) }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Set-Cookie": sessionCookieHeader(token, remember) }
    });
  } catch (err: any) {
    return Response.json({ error: "Server error: " + err.message }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/auth/login"
};
