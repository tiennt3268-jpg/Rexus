import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { randomUUID, randomBytes } from "node:crypto";
import { getUserFromRequest, unauthorized, hashPassword } from "./lib/auth.mts";
import { getFullUser, isSystemAdmin, serializeUserWithRole, SYSTEM_ADMIN, PROJECT_MANAGER, MEMBER } from "./lib/rbac.mts";
import { logActivity } from "./lib/activity-log.mts";
import { createNotification } from "./lib/notify.mts";
import { logAudit } from "./lib/rexus-audit.mts";
import { usernameError, takenError } from "./lib/account-rules.mts";

const VALID_ROLES = [SYSTEM_ADMIN, PROJECT_MANAGER, MEMBER];

function generateTempPassword(): string {
  // Short, readable, hard-to-guess temp password e.g. "Wm-7f3a9c2e".
  return "Wm-" + randomBytes(5).toString("hex");
}

function slugUsernameFrom(fullName: string, email: string): string {
  const base = (fullName || email.split("@")[0] || "user")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip Vietnamese diacritics
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return base || "user";
}

export default async (req: Request, context: Context) => {
  const session = await getUserFromRequest(req);
  if (!session) return unauthorized();

  const db = getDatabase();
  const requester = await getFullUser(db, session.uid);
  if (!isSystemAdmin(requester)) {
    return Response.json({ error: "Only a System Admin can manage accounts." }, { status: 403 });
  }

  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean); // ["api","admin","users", ":id"?]
  const targetId = parts[3] ? decodeURIComponent(parts[3]) : null;

  try {
    if (req.method === "GET") {
      const rows = await db.sql`
        SELECT id, username, email, full_name, avatar, role, position, department, status, created_at, deleted_at
        FROM users ORDER BY full_name ASC, username ASC
      `;
      return Response.json({
        users: rows.map((u: any) => ({
          ...serializeUserWithRole(u),
          status: u.status || "Active",
          deleted: !!u.deleted_at,
          created_at: u.created_at instanceof Date ? u.created_at.toISOString() : u.created_at
        }))
      });
    }

    if (req.method === "POST" && targetId) {
      // ACC-02: restore a soft-deleted account (it comes back Inactive; an admin re-activates it explicitly).
      const body = await req.json().catch(() => ({}));
      if (body.action !== "restore") return Response.json({ error: "Unknown action" }, { status: 400 });
      const rows = await db.sql`UPDATE users SET deleted_at = NULL, deleted_by = NULL, updated_at = ${new Date().toISOString()} WHERE id = ${targetId} AND deleted_at IS NOT NULL RETURNING id, username, full_name`;
      if (!rows.length) return Response.json({ error: "Deleted account not found" }, { status: 404 });
      await logAudit(db, { actorId: session.uid, actorName: requester.username, action: "account_restore", entityType: "account", entityId: targetId, summary: `Restored account ${rows[0].username}` });
      await logActivity(db, { userId: session.uid, project: "", action: "restore_account", description: `${requester.username} restored the account "${rows[0].full_name || rows[0].username}"` });
      return Response.json({ ok: true });
    }

    if (req.method === "DELETE") {
      // ACC-02: soft delete only. Nothing the account created is removed or re-assigned.
      if (!targetId) return Response.json({ error: "Missing user id" }, { status: 400 });
      if (targetId === session.uid) return Response.json({ error: "You cannot delete the account you are signed in with." }, { status: 400 });
      const body = await req.json().catch(() => ({}));
      const rows = await db.sql`SELECT id, username, full_name, role, deleted_at FROM users WHERE id = ${targetId}`;
      if (!rows.length || rows[0].deleted_at) return Response.json({ error: "Account not found" }, { status: 404 });
      if (String(body.confirm_username || "") !== rows[0].username) return Response.json({ error: "Type the account's username to confirm deletion." }, { status: 400 });
      const upd = await db.sql`UPDATE users SET status = 'Inactive', deleted_at = NOW(), deleted_by = ${session.uid}, updated_at = ${new Date().toISOString()}
        WHERE id = ${targetId} AND deleted_at IS NULL RETURNING id`;
      if (!upd.length) return Response.json({ error: "Account was already deleted" }, { status: 409 });
      await logAudit(db, { actorId: session.uid, actorName: requester.username, action: "account_delete", entityType: "account", entityId: targetId, summary: `Deleted (soft) account ${rows[0].username}` });
      await logActivity(db, { userId: session.uid, project: "", action: "delete_account", description: `${requester.username} deleted the account "${rows[0].full_name || rows[0].username}"` });
      return Response.json({ ok: true });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const email = String(body.email || "").trim().toLowerCase();
      const fullName = String(body.full_name || "").trim();
      const position = String(body.position || "").trim();
      const department = String(body.department || "").trim();
      let role = String(body.role || MEMBER).trim();
      if (VALID_ROLES.indexOf(role) === -1) role = MEMBER;

      if (!email || !email.includes("@")) {
        return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
      }
      if (!fullName) {
        return Response.json({ error: "Please enter the person's full name." }, { status: 400 });
      }

      const requested = String(body.username || "").trim().toLowerCase();
      if (requested) {
        const bad = usernameError(requested); if (bad) return Response.json({ error: bad, field: "username" }, { status: 400 });
        const taken = await takenError(db, "username", requested, null); if (taken) return Response.json({ error: taken, field: "username" }, { status: 409 });
      }
      let username = requested || slugUsernameFrom(fullName, email);
      const existing = await takenError(db, "email", email, null);
      if (existing) {
        return Response.json({ error: existing, field: "email" }, { status: 409 });
      }
      // Make sure the username is unique — append a short suffix if needed.
      let uniqueUsername = username;
      let suffix = 1;
      while (!requested && (await db.sql`SELECT id FROM users WHERE LOWER(username) = LOWER(${uniqueUsername})`).length) {
        suffix += 1;
        uniqueUsername = username + suffix;
      }

      const id = "U" + randomUUID().slice(0, 8).toUpperCase();
      const tempPassword = generateTempPassword();
      const passwordHash = hashPassword(tempPassword);
      const now = new Date().toISOString();

      await db.sql`
        INSERT INTO users (id, email, username, full_name, password_hash, status, role, position, department, created_at, updated_at)
        VALUES (${id}, ${email}, ${uniqueUsername}, ${fullName}, ${passwordHash}, 'Active', ${role}, ${position}, ${department}, ${now}, ${now})
      `;
      await logActivity(db, {
        userId: session.uid, project: "", action: "create_account",
        description: `${requester.username} created the account "${fullName}" (${role})`
      });

      const rows = await db.sql`SELECT id, username, email, full_name, avatar, role, position, department FROM users WHERE id = ${id}`;
      return Response.json({
        user: serializeUserWithRole(rows[0]),
        temp_password: tempPassword
      });
    }

    if (req.method === "PUT") {
      if (!targetId) return Response.json({ error: "Missing user id" }, { status: 400 });
      const rows = await db.sql`SELECT * FROM users WHERE id = ${targetId}`;
      if (!rows.length) return Response.json({ error: "Account not found" }, { status: 404 });
      const current = rows[0];
      if (current.deleted_at) return Response.json({ error: "Restore this deleted account before editing it." }, { status: 409 });

      const patch = await req.json();
      const fullName = patch.full_name !== undefined ? String(patch.full_name).trim() : (current.full_name || "");
      const position = patch.position !== undefined ? String(patch.position).trim() : (current.position || "");
      const department = patch.department !== undefined ? String(patch.department).trim() : (current.department || "");
      let status = patch.status !== undefined ? String(patch.status).trim() : (current.status || "Active");
      if (status !== "Active" && status !== "Inactive") status = current.status || "Active";
      let role = patch.role !== undefined ? String(patch.role).trim() : (current.role || MEMBER);
      if (VALID_ROLES.indexOf(role) === -1) role = current.role || MEMBER;

      if (current.id === session.uid && role !== SYSTEM_ADMIN) {
        return Response.json({ error: "You cannot remove your own System Admin role." }, { status: 400 });
      }
      if (current.id === session.uid && status !== "Active") {
        return Response.json({ error: "You cannot deactivate your own account." }, { status: 400 });
      }

      await db.sql`
        UPDATE users SET full_name = ${fullName}, position = ${position}, department = ${department},
          status = ${status}, role = ${role}, updated_at = ${new Date().toISOString()}
        WHERE id = ${targetId}
      `;
      await logActivity(db, {
        userId: session.uid, project: "", action: "update_account",
        description: `${requester.username} updated the account "${fullName || current.username}" (role: ${role})`
      });

      if (targetId !== session.uid) {
        const changes: string[] = [];
        if (role !== (current.role || MEMBER)) changes.push(`role changed to ${role}`);
        if (status !== (current.status || "Active")) changes.push(`account marked ${status}`);
        if (position !== (current.position || "")) changes.push("position updated");
        if (department !== (current.department || "")) changes.push("department updated");
        await createNotification(db, {
          userId: targetId, type: "profile", title: "Your account details were updated",
          message: changes.length ? `${requester.username}: ${changes.join(", ")}.` : `${requester.username} updated your account details.`,
          entityType: "profile", entityId: targetId, project: ""
        });
      }

      const finalRows = await db.sql`SELECT id, username, email, full_name, avatar, role, position, department, status FROM users WHERE id = ${targetId}`;
      return Response.json(serializeUserWithRole(finalRows[0]));
    }

    return Response.json({ error: "Unsupported method" }, { status: 405 });
  } catch (err: any) {
    return Response.json({ error: "Server error: " + err.message }, { status: 500 });
  }
};

export const config: Config = {
  path: ["/api/admin/users", "/api/admin/users/*"]
};
