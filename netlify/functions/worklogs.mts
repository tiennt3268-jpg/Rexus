import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { randomUUID } from "node:crypto";
import { getUserFromRequest, unauthorized } from "./lib/auth.mts";
import { canAccessProject } from "./lib/collab.mts";
import { logActivity } from "./lib/activity-log.mts";

function toDateStr(v: any) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v;
}
function serializeLog(row: any) {
  return {
    ...row,
    date: toDateStr(row.date),
    hours: row.hours == null ? 0 : Number(row.hours),
    logged_by: row.logged_by || row.user_id || "",
    logged_by_name: row.logged_by_name || "",
    logged_by_avatar: row.logged_by_avatar || "",
    status: row.status || "submitted",
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
}
async function taskInfo(db: any, taskId: string) {
  const rows = await db.sql`SELECT id, task, user_id, project FROM tasks WHERE id = ${taskId}`;
  return rows.length ? rows[0] : null;
}

export default async (req: Request, context: Context) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const db = getDatabase();
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const id = parts[2] ? decodeURIComponent(parts[2]) : null;

  try {
    if (req.method === "GET") {
      const rows = await db.sql`
        SELECT l.*, u.username AS logged_by_name, u.avatar AS logged_by_avatar
        FROM worklogs l
        JOIN tasks t ON t.id = l.task_id
        LEFT JOIN users u ON u.id = l.logged_by
        WHERE t.user_id = ${user.uid}
           OR EXISTS (
             SELECT 1 FROM project_members pm
             WHERE pm.owner_user_id = t.user_id AND pm.project = t.project AND pm.user_id = ${user.uid}
           )
        ORDER BY l.date DESC, l.created_at DESC
      `;
      return Response.json({ worklogs: rows.map(serializeLog) });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const l = body.log || body;
      const parent = await taskInfo(db, l.task_id);
      if (!parent) return Response.json({ error: "Task not found" }, { status: 404 });
      if (!(await canAccessProject(db, parent.user_id, parent.project, user.uid))) {
        return Response.json({ error: "You do not have access to this task." }, { status: 403 });
      }

      const newId = "L" + randomUUID().slice(0, 8).toUpperCase();
      const now = new Date().toISOString();
      const rows = await db.sql`
        INSERT INTO worklogs (id, user_id, logged_by, task_id, subtask_id, date, start_time, end_time, description, hours, created_at)
        VALUES (${newId}, ${parent.user_id}, ${user.uid}, ${l.task_id}, ${l.subtask_id || null}, ${l.date}, ${l.start_time || ""}, ${l.end_time || ""},
          ${l.description || ""}, ${l.hours || 0}, ${now})
        RETURNING *
      `;
      await logActivity(db, {
        userId: user.uid, project: parent.project, taskId: l.task_id, subtaskId: l.subtask_id || null, ownerId: parent.user_id, action: "log_work",
        meta: { worklog_id: newId, hours: Number(l.hours) || 0, date: l.date },
        description: `${user.username} logged ${l.hours}h on task "${parent.task}"`
      });
      return Response.json(serializeLog(rows[0]));
    }

    if (req.method === "PUT") {
      if (!id) return Response.json({ error: "Missing log id" }, { status: 400 });
      const existingRows = await db.sql`SELECT * FROM worklogs WHERE id = ${id}`;
      if (!existingRows.length) return Response.json({ error: "Log entry not found: " + id }, { status: 404 });
      const current = existingRows[0];
      const parent = await taskInfo(db, current.task_id);
      if (!parent || !(await canAccessProject(db, parent.user_id, parent.project, user.uid))) {
        return Response.json({ error: "You do not have access to this log entry." }, { status: 403 });
      }
      if (current.status === "approved") {
        return Response.json({ error: "This log entry's project cost has been closed and is locked. Ask a Project Manager or Admin to reopen it first." }, { status: 409 });
      }

      const patch = await req.json();
      const merged: any = { ...current, ...patch };

      const rows = await db.sql`
        UPDATE worklogs SET
          task_id = ${merged.task_id},
          subtask_id = ${merged.subtask_id || null},
          date = ${merged.date},
          start_time = ${merged.start_time || ""},
          end_time = ${merged.end_time || ""},
          description = ${merged.description || ""},
          hours = ${merged.hours || 0}
        WHERE id = ${id}
        RETURNING *
      `;
      await logActivity(db, {
        userId: user.uid, project: parent.project, taskId: current.task_id, subtaskId: current.subtask_id || null, ownerId: parent.user_id, action: "update_log",
        description: `${user.username} updated a work log entry on task "${parent.task}"`
      });
      return Response.json(serializeLog(rows[0]));
    }

    if (req.method === "DELETE") {
      if (!id) return Response.json({ error: "Missing log id" }, { status: 400 });
      const existingRows = await db.sql`SELECT * FROM worklogs WHERE id = ${id}`;
      if (!existingRows.length) return Response.json({ ok: true });
      const current = existingRows[0];
      const parent = await taskInfo(db, current.task_id);
      if (!parent || !(await canAccessProject(db, parent.user_id, parent.project, user.uid))) {
        return Response.json({ error: "You do not have access to this log entry." }, { status: 403 });
      }
      if (current.status === "approved") {
        return Response.json({ error: "This log entry's project cost has been closed and is locked. Ask a Project Manager or Admin to reopen it first." }, { status: 409 });
      }
      await db.sql`DELETE FROM worklogs WHERE id = ${id}`;
      await logActivity(db, {
        userId: user.uid, project: parent.project, taskId: current.task_id, subtaskId: current.subtask_id || null, ownerId: parent.user_id, action: "delete_log",
        description: `${user.username} deleted a work log entry on task "${parent.task}"`
      });
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unsupported method" }, { status: 405 });
  } catch (err: any) {
    return Response.json({ error: "Server error: " + err.message }, { status: 500 });
  }
};

export const config: Config = {
  path: ["/api/worklogs", "/api/worklogs/*"]
};
