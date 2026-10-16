import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { getUserFromRequest, unauthorized, verifyPassword, hashPassword } from "./lib/auth.mts";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return Response.json({ error: "Unsupported method" }, { status: 405 });
  const session = await getUserFromRequest(req);
  if (!session) return unauthorized();

  try {
    const body = await req.json();
    const currentPassword = String(body.current_password || "");
    const newPassword = String(body.new_password || "");
    if (newPassword.length < 6) {
      return Response.json({ error: "New password must be at least 6 characters." }, { status: 400 });
    }

    const db = getDatabase();
    const rows = await db.sql`SELECT * FROM users WHERE id = ${session.uid}`;
    if (!rows.length) return Response.json({ error: "Account not found." }, { status: 404 });
    if (!verifyPassword(currentPassword, rows[0].password_hash)) {
      return Response.json({ error: "Current password is incorrect." }, { status: 401 });
    }

    await db.sql`UPDATE users SET password_hash = ${hashPassword(newPassword)}, updated_at = ${new Date().toISOString()} WHERE id = ${session.uid}`;
    return Response.json({ ok: true });
  } catch (err: any) {
    return Response.json({ error: "Server error: " + err.message }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/auth/change-password"
};
