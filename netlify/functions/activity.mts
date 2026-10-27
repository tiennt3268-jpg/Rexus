import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { getUserFromRequest, unauthorized } from "./lib/auth.mts";
import { findProjectOwnerAccessibleToUser } from "./lib/collab.mts";
import { getFullUser, getEffectiveProjectRole } from "./lib/rbac.mts";

function serializeEntry(row: any) {
  let meta = row.meta;
  if (typeof meta === "string") { try { meta = JSON.parse(meta); } catch { meta = null; } }
  return {
    ...row,
    meta: meta || null,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
}

/** Same visibility as the task list: owner, project member, a share of the project or of the task, or System Admin (any project). */
async function canView(db: any, uid: string, owner: string, project: string, taskId: string | null) {
  const me = await getFullUser(db, uid);
  if (await getEffectiveProjectRole(db, owner, project, uid, me?.role)) return true;
  const sh = await db.sql`SELECT 1 FROM shares WHERE shared_with_user_id = ${uid}
    AND ((entity_type = 'project' AND entity_id = ${owner + "::" + project}) OR (entity_type = 'task' AND entity_id = ${taskId || ""})) LIMIT 1`;
  return sh.length > 0;
}

async function aliasesOf(db: any, newId: string) {
  const rows = await db.sql`SELECT old_type, old_id FROM rexus_entity_aliases WHERE new_id = ${newId}`;
  return { task: rows.filter((r: any) => r.old_type === "task").map((r: any) => r.old_id),
    subtask: rows.filter((r: any) => r.old_type === "subtask").map((r: any) => r.old_id) };
}

export default async (req: Request, context: Context) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();
  const db = getDatabase();
  const url = new URL(req.url);

  try {
    if (req.method === "GET") {
      const entity = url.searchParams.get("entity");
      if (!entity) {
        const rows = await db.sql`
          SELECT * FROM activity_log WHERE user_id = ${user.uid}
          ORDER BY created_at DESC LIMIT 300
        `;
        return Response.json({ activity: rows.map(serializeEntry) });
      }
      // v2.3.5 LOG-01: one timeline per project / task / subtask, newest first, 50 per page.
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);
      const before = url.searchParams.get("before") || "9999-12-31T00:00:00Z";
      const id = url.searchParams.get("id") || "";
      let rows: any[] = [];
      if (entity === "task") {
        const t = (await db.sql`SELECT id, user_id, project FROM tasks WHERE id = ${id}`)[0];
        if (!t) return Response.json({ error: "Task not found" }, { status: 404 });
        if (!(await canView(db, user.uid, t.user_id, t.project, t.id))) return Response.json({ error: "You do not have access to this task." }, { status: 403 });
        const al = await aliasesOf(db, id);
        const taskIds = [id, ...al.task], subIds = al.subtask.length ? al.subtask : ["-"];
        rows = await db.sql`
          SELECT a.*, COALESCE(NULLIF(u.full_name, ''), u.username) AS actor_name FROM activity_log a LEFT JOIN users u ON u.id = a.user_id
          WHERE (a.task_id = ANY(${taskIds}::text[]) OR a.subtask_id = ANY(${subIds}::text[])) AND a.created_at < ${before}
          ORDER BY a.created_at DESC, a.id DESC LIMIT ${limit + 1}`;
      } else if (entity === "subtask") {
        const s = (await db.sql`SELECT s.id, t.id AS task_id, t.user_id, t.project FROM subtasks s JOIN tasks t ON t.id = s.task_id WHERE s.id = ${id}`)[0];
        if (!s) return Response.json({ error: "Subtask not found" }, { status: 404 });
        if (!(await canView(db, user.uid, s.user_id, s.project, s.task_id))) return Response.json({ error: "You do not have access to this subtask." }, { status: 403 });
        const al = await aliasesOf(db, id);
        const subIds = [id, ...al.subtask], oldTasks = al.task.length ? al.task : ["-"];
        rows = await db.sql`
          SELECT a.*, COALESCE(NULLIF(u.full_name, ''), u.username) AS actor_name FROM activity_log a LEFT JOIN users u ON u.id = a.user_id
          WHERE (a.subtask_id = ANY(${subIds}::text[]) OR (a.task_id = ANY(${oldTasks}::text[]) AND a.subtask_id IS NULL)) AND a.created_at < ${before}
          ORDER BY a.created_at DESC, a.id DESC LIMIT ${limit + 1}`;
      } else if (entity === "project") {
        const project = url.searchParams.get("project") || "";
        const owner = url.searchParams.get("owner") || (await findProjectOwnerAccessibleToUser(db, project, user.uid));
        if (!owner || !(await canView(db, user.uid, owner, project, null))) return Response.json({ error: "You do not have access to this project." }, { status: 403 });
        rows = await db.sql`
          SELECT a.*, COALESCE(NULLIF(u.full_name, ''), u.username) AS actor_name FROM activity_log a LEFT JOIN users u ON u.id = a.user_id
          WHERE a.owner_id = ${owner} AND a.project = ${project} AND a.created_at < ${before}
          ORDER BY a.created_at DESC, a.id DESC LIMIT ${limit + 1}`;
      } else {
        return Response.json({ error: "entity must be project, task or subtask" }, { status: 400 });
      }
      const more = rows.length > limit;
      const page = rows.slice(0, limit).map(serializeEntry);
      return Response.json({ activity: page, next_before: more ? page[page.length - 1].created_at : null });
    }

    if (req.method === "POST") {
      // v2.3.5 LOG-01: events are written by the server action that made the change.
      // Client-written entries were duplicates and could be forged, so they are no longer stored.
      return Response.json({ ignored: true });
    }

    return Response.json({ error: "Unsupported method" }, { status: 405 });
  } catch (err: any) {
    return Response.json({ error: "Server error: " + err.message }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/activity"
};
