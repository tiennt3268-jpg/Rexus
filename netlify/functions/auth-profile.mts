import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { getUserFromRequest, unauthorized } from "./lib/auth.mts";
import { serializeUserWithRole, getFullUser, isSystemAdmin } from "./lib/rbac.mts";
import { logAudit } from "./lib/rexus-audit.mts";
import { usernameError, emailError, takenError } from "./lib/account-rules.mts";

/* Own profile. Everyone may change full name and avatar.
   ACC-03 (v2.2.2): a System Admin may also change their own username, email, position and
   department here. Role and status are never accepted from this endpoint, so the form can't
   be used to escalate privileges or bypass the admin account rules. */
export default async (req: Request, context: Context) => {
  if (req.method !== "PUT") return Response.json({ error: "Unsupported method" }, { status: 405 });
  const session = await getUserFromRequest(req);
  if (!session) return unauthorized();

  try {
    const body = await req.json();
    const db = getDatabase();
    const me = await getFullUser(db, session.uid);
    const fullName = String(body.full_name || "").trim();
    const avatar = String(body.avatar || "").trim();
    if (!fullName) return Response.json({ error: "Full name is required.", field: "full_name" }, { status: 400 });

    let username = me.username, email = me.email, position = me.position || "", department = me.department || "";
    if (isSystemAdmin(me)) {
      if (body.username !== undefined) {
        username = String(body.username).trim().toLowerCase();
        if (username !== me.username) {
          const bad = usernameError(username) || await takenError(db, "username", username, me.id);
          if (bad) return Response.json({ error: bad, field: "username" }, { status: bad.includes("taken") ? 409 : 400 });
        }
      }
      if (body.email !== undefined) {
        email = String(body.email).trim().toLowerCase();
        if (email !== (me.email || "").toLowerCase()) {
          const bad = emailError(email) || await takenError(db, "email", email, me.id);
          if (bad) return Response.json({ error: bad, field: "email" }, { status: bad.includes("exists") ? 409 : 400 });
        }
      }
      if (body.position !== undefined) position = String(body.position).trim().slice(0, 200);
      if (body.department !== undefined) department = String(body.department).trim().slice(0, 200);
    } else if (["username", "email", "position", "department", "role", "status"].some(k => body[k] !== undefined && body[k] !== (me as any)[k])) {
      return Response.json({ error: "Username, email, role, position and department are managed by your System Admin." }, { status: 403 });
    }

    await db.sql`UPDATE users SET full_name = ${fullName}, avatar = ${avatar}, username = ${username}, email = ${email},
      position = ${position}, department = ${department}, updated_at = ${new Date().toISOString()} WHERE id = ${session.uid}`;
    if (username !== me.username || email !== me.email)
      await logAudit(db, { actorId: me.id, actorName: me.username, action: "profile_identity_change", entityType: "account", entityId: me.id,
        summary: `Own profile: ${username !== me.username ? `username ${me.username} → ${username}` : ""}${username !== me.username && email !== me.email ? ", " : ""}${email !== me.email ? "email changed" : ""}` });
    const rows = await db.sql`SELECT id, username, email, full_name, avatar, role, position, department, status FROM users WHERE id = ${session.uid}`;
    return Response.json(serializeUserWithRole(rows[0]));
  } catch (err: any) {
    return Response.json({ error: "Server error: " + err.message }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/auth/profile"
};
