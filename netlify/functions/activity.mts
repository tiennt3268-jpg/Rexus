import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { randomUUID } from "node:crypto";
import { getUserFromRequest, unauthorized } from "./lib/auth.mts";


function serializeEntry(row: any) {
  return {
    ...row,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
}

export default async (req: Request, context: Context) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const db = getDatabase();

  try {
    if (req.method === "GET") {
      const rows = await db.sql`
        SELECT * FROM activity_log WHERE user_id = ${user.uid}
        ORDER BY created_at DESC LIMIT 300
      `;
      return Response.json({ activity: rows.map(serializeEntry) });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const newId = "A" + randomUUID().slice(0, 8).toUpperCase();
      const now = new Date().toISOString();
      const rows = await db.sql`
        INSERT INTO activity_log (id, user_id, project, task_id, action, description, created_at)
        VALUES (${newId}, ${user.uid}, ${body.project || null}, ${body.task_id || null},
          ${body.action}, ${body.description}, ${now})
        RETURNING *
      `;
      return Response.json(serializeEntry(rows[0]));
    }

    return Response.json({ error: "Unsupported method" }, { status: 405 });
  } catch (err: any) {
    return Response.json({ error: "Server error: " + err.message }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/activity"
};
