import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { getUserFromRequest, unauthorized } from "./lib/auth.mts";
import { getFullUser, isManagerOrAdmin } from "./lib/rbac.mts";

export default async (req: Request, context: Context) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const db = getDatabase();

  try {
    if (req.method === "GET") {
      const rows = await db.sql`SELECT name, color FROM task_types ORDER BY name ASC`;
      return Response.json({ task_types: rows.map((r: any) => ({ name: r.name, color: r.color || "" })) });
    }

    // Managing the list itself (adding/removing types) is limited to
    // Admin/Manager, same bar as managing projects.
    const requester = await getFullUser(db, user.uid);
    if (!isManagerOrAdmin(requester)) {
      return Response.json({ error: "Only a System Admin or Project Manager can manage task types." }, { status: 403 });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const name = String(body.name || "").trim();
      const color = String(body.color || "").trim();
      if (!name) return Response.json({ error: "Task type name is required" }, { status: 400 });
      await db.sql`INSERT INTO task_types (name, color) VALUES (${name}, ${color}) ON CONFLICT (name) DO UPDATE SET color = EXCLUDED.color`;
      return Response.json({ name, color });
    }

    if (req.method === "DELETE") {
      const url = new URL(req.url);
      const parts = url.pathname.split("/").filter(Boolean);
      const name = parts[2] ? decodeURIComponent(parts[2]) : null;
      if (!name) return Response.json({ error: "Missing task type name" }, { status: 400 });
      await db.sql`DELETE FROM task_types WHERE name = ${name}`;
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unsupported method" }, { status: 405 });
  } catch (err: any) {
    return Response.json({ error: "Server error: " + err.message }, { status: 500 });
  }
};

export const config: Config = {
  path: ["/api/task-types", "/api/task-types/*"]
};
