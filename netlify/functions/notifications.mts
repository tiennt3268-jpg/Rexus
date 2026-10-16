import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { getUserFromRequest, unauthorized } from "./lib/auth.mts";

function serializeNotification(row: any) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message || "",
    entity_type: row.entity_type || "",
    entity_id: row.entity_id || "",
    project: row.project || "",
    read: !!row.read_at,
    important: !!row.important,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
}

export default async (req: Request, context: Context) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const db = getDatabase();
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean); // ["api","notifications", id?]
  const id = parts[2] ? decodeURIComponent(parts[2]) : null;

  try {
    if (req.method === "GET") {
      const rows = await db.sql`
        SELECT * FROM notifications WHERE user_id = ${user.uid} ORDER BY created_at DESC LIMIT 50
      `;
      const unreadRows = await db.sql`
        SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = ${user.uid} AND read_at IS NULL
      `;
      return Response.json({
        notifications: rows.map(serializeNotification),
        unread_count: unreadRows.length ? unreadRows[0].c : 0
      });
    }

    if (req.method === "PUT") {
      if (id === "read-all") {
        await db.sql`UPDATE notifications SET read_at = NOW() WHERE user_id = ${user.uid} AND read_at IS NULL`;
        return Response.json({ ok: true });
      }
      if (!id) return Response.json({ error: "Missing notification id" }, { status: 400 });

      // Body is optional — an empty/absent body keeps the old "PUT = mark
      // read" behavior for callers that don't send one. When a body IS
      // sent, only the fields present in it are changed: {read:false} lets
      // the frontend mark something back to unread, and {important:true}
      // stars it, independent of read state.
      let body: any = {};
      try { body = await req.json(); } catch { body = {}; }
      const hasRead = Object.prototype.hasOwnProperty.call(body, "read");
      const hasImportant = Object.prototype.hasOwnProperty.call(body, "important");

      if (!hasRead && !hasImportant) {
        await db.sql`UPDATE notifications SET read_at = NOW() WHERE id = ${id} AND user_id = ${user.uid}`;
        return Response.json({ ok: true });
      }
      if (hasRead) {
        if (body.read) {
          await db.sql`UPDATE notifications SET read_at = NOW() WHERE id = ${id} AND user_id = ${user.uid}`;
        } else {
          await db.sql`UPDATE notifications SET read_at = NULL WHERE id = ${id} AND user_id = ${user.uid}`;
        }
      }
      if (hasImportant) {
        await db.sql`UPDATE notifications SET important = ${!!body.important} WHERE id = ${id} AND user_id = ${user.uid}`;
      }
      const rows = await db.sql`SELECT * FROM notifications WHERE id = ${id} AND user_id = ${user.uid}`;
      return Response.json({ ok: true, notification: rows.length ? serializeNotification(rows[0]) : null });
    }

    return Response.json({ error: "Unsupported method" }, { status: 405 });
  } catch (err: any) {
    return Response.json({ error: "Server error: " + err.message }, { status: 500 });
  }
};

export const config: Config = {
  path: ["/api/notifications", "/api/notifications/*"]
};
