import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { getUserFromRequest, unauthorized } from "./lib/auth.mts";
import { getFullUser, isSystemAdmin } from "./lib/rbac.mts";

function serializeDept(row: any, headUser: any) {
  return {
    name: row.name,
    description: row.description || "",
    parent_department: row.parent_department || "",
    head_user_id: row.head_user_id || "",
    head_name: headUser ? (headUser.full_name || headUser.username) : ""
  };
}

export default async (req: Request, context: Context) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const db = getDatabase();
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean); // ["api","departments", name?]
  const name = parts[2] ? decodeURIComponent(parts[2]) : null;

  try {
    if (req.method === "GET") {
      const rows = await db.sql`
        SELECT d.*, u.username AS head_username, u.full_name AS head_full_name
        FROM departments d LEFT JOIN users u ON u.id = d.head_user_id
        ORDER BY d.name ASC
      `;
      return Response.json({
        departments: rows.map((r: any) => serializeDept(r, r.head_user_id ? { username: r.head_username, full_name: r.head_full_name } : null))
      });
    }

    // Creating, editing, and deleting departments is System-Admin-only —
    // everyone else (Manager and Member) can view the structure but not
    // change it.
    const requester = await getFullUser(db, user.uid);
    if (!isSystemAdmin(requester)) {
      return Response.json({ error: "Only a System Admin can manage departments." }, { status: 403 });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const deptName = String(body.name || "").trim();
      const description = String(body.description || "").trim();
      const parentDepartment = String(body.parent_department || "").trim() || null;
      const headUserId = String(body.head_user_id || "").trim() || null;
      if (!deptName) return Response.json({ error: "Department name is required" }, { status: 400 });
      if (parentDepartment === deptName) return Response.json({ error: "A department cannot be its own parent." }, { status: 400 });

      await db.sql`
        INSERT INTO departments (name, description, parent_department, head_user_id)
        VALUES (${deptName}, ${description}, ${parentDepartment}, ${headUserId})
        ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, parent_department = EXCLUDED.parent_department, head_user_id = EXCLUDED.head_user_id
      `;
      return Response.json({ ok: true });
    }

    if (req.method === "DELETE") {
      if (!name) return Response.json({ error: "Missing department name" }, { status: 400 });
      await db.sql`UPDATE departments SET parent_department = NULL WHERE parent_department = ${name}`;
      await db.sql`DELETE FROM departments WHERE name = ${name}`;
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unsupported method" }, { status: 405 });
  } catch (err: any) {
    return Response.json({ error: "Server error: " + err.message }, { status: 500 });
  }
};

export const config: Config = {
  path: ["/api/departments", "/api/departments/*"]
};
