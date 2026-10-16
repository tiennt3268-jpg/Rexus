import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { getUserFromRequest, unauthorized } from "./lib/auth.mts";
import { serializeUserWithRole } from "./lib/rbac.mts";

export default async (req: Request, context: Context) => {
  if (req.method !== "PUT") return Response.json({ error: "Unsupported method" }, { status: 405 });
  const session = await getUserFromRequest(req);
  if (!session) return unauthorized();

  try {
    const body = await req.json();
    const fullName = String(body.full_name || "").trim();
    const avatar = String(body.avatar || "").trim();

    // Position/Department/Role are managed centrally by a System Admin
    // (see /api/admin/users) and are intentionally not editable here.
    const db = getDatabase();
    await db.sql`UPDATE users SET full_name = ${fullName}, avatar = ${avatar}, updated_at = ${new Date().toISOString()} WHERE id = ${session.uid}`;
    const rows = await db.sql`SELECT id, username, email, full_name, avatar, role, position, department FROM users WHERE id = ${session.uid}`;
    return Response.json(serializeUserWithRole(rows[0]));
  } catch (err: any) {
    return Response.json({ error: "Server error: " + err.message }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/auth/profile"
};
