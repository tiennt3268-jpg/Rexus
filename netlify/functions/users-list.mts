import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { getUserFromRequest, unauthorized } from "./lib/auth.mts";

export default async (req: Request, context: Context) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const db = getDatabase();
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const department = (url.searchParams.get("department") || "").trim();

  let rows = await db.sql`
    SELECT id, username, full_name, email, avatar, role, position, department, status
    FROM users ORDER BY full_name ASC, username ASC
  `;

  if (department) {
    rows = rows.filter((u: any) => (u.department || "") === department);
  }
  if (q) {
    rows = rows.filter((u: any) => {
      const hay = [u.full_name, u.username, u.email, u.department, u.position].filter(Boolean).join(" ").toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  return Response.json({
    users: rows.map((u: any) => ({
      id: u.id,
      username: u.username,
      full_name: u.full_name || u.username,
      email: u.email,
      avatar: u.avatar || "",
      role: u.role || "Member",
      position: u.position || "",
      department: u.department || "",
      status: u.status || "Active"
    }))
  });
};

export const config: Config = {
  path: "/api/users"
};
