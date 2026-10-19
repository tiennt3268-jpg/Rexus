import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { getUserFromRequest, unauthorized, verifyPassword, hashPassword } from "./lib/auth.mts";
import { passwordPolicyError } from "./lib/account-rules.mts";
import { logAudit } from "./lib/rexus-audit.mts";
import { gateState } from "./lib/survey.mts";

const MAX_FAILED = 5, WINDOW_MIN = 15;

// Also the First Login step (F07): reachable while the account is gated; clears must_change_password on success.
export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return Response.json({ error: "Unsupported method" }, { status: 405 });
  const session = await getUserFromRequest(req, { allowGate: true });
  if (!session) return unauthorized();

  try {
    const body = await req.json();
    const currentPassword = String(body.current_password || "");
    const newPassword = String(body.new_password || "");
    const weak = passwordPolicyError(newPassword);
    if (weak) return Response.json({ error: weak, field: "new_password" }, { status: 400 });
    if (body.confirm_password !== undefined && String(body.confirm_password) !== newPassword) {
      return Response.json({ error: "The new passwords do not match.", field: "confirm_password" }, { status: 400 });
    }

    const db = getDatabase();
    // Attempt limit: counted from the audit trail (no password content is ever written there).
    const fails = await db.sql`SELECT COUNT(*)::int AS n FROM rexus_audit_log WHERE actor_user_id = ${session.uid} AND action = 'password_change_failed' AND created_at > NOW() - (${WINDOW_MIN} * INTERVAL '1 minute')`;
    if ((fails[0]?.n || 0) >= MAX_FAILED) {
      return Response.json({ error: `Too many attempts. Try again in ${WINDOW_MIN} minutes.` }, { status: 429 });
    }
    const rows = await db.sql`SELECT * FROM users WHERE id = ${session.uid}`;
    if (!rows.length) return Response.json({ error: "Account not found." }, { status: 404 });
    if (!verifyPassword(currentPassword, rows[0].password_hash)) {
      await logAudit(db, { actorId: session.uid, actorName: session.username, action: "password_change_failed", entityType: "user", entityId: session.uid, summary: "Wrong current password" });
      return Response.json({ error: "Current password is incorrect.", field: "current_password" }, { status: 401 });
    }
    if (verifyPassword(newPassword, rows[0].password_hash)) {
      return Response.json({ error: "Choose a password different from the current one.", field: "new_password" }, { status: 400 });
    }

    await db.sql`UPDATE users SET password_hash = ${hashPassword(newPassword)}, must_change_password = FALSE, updated_at = ${new Date().toISOString()} WHERE id = ${session.uid}`;
    await logAudit(db, { actorId: session.uid, actorName: session.username, action: rows[0].must_change_password ? "first_login_password_changed" : "password_changed", entityType: "user", entityId: session.uid, summary: "Password changed" });
    return Response.json({ ok: true, onboarding: await gateState(db, session.uid) });
  } catch (err: any) {
    return Response.json({ error: "Server error: " + err.message }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/auth/change-password"
};
