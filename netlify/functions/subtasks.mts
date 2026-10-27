import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { randomUUID } from "node:crypto";
import { getUserFromRequest, unauthorized } from "./lib/auth.mts";
import { canAccessProject } from "./lib/collab.mts";
import { logActivity, changedFields } from "./lib/activity-log.mts";
import { getFullUser, getEffectiveProjectRole, roleCanManage } from "./lib/rbac.mts";
import { createNotification } from "./lib/notify.mts";

async function isSubtaskMember(db: any, subtaskId: string, userId: string): Promise<boolean> {
  const rows = await db.sql`SELECT 1 FROM subtask_members WHERE subtask_id = ${subtaskId} AND user_id = ${userId}`;
  return rows.length > 0;
}
async function isTaskMember(db: any, taskId: string, userId: string): Promise<boolean> {
  const rows = await db.sql`SELECT 1 FROM task_members WHERE task_id = ${taskId} AND user_id = ${userId}`;
  return rows.length > 0;
}

function toJsonArrayText(v: any): string {
  if (Array.isArray(v)) return JSON.stringify(v);
  if (typeof v === "string") {
    try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? v : "[]"; }
    catch { return "[]"; }
  }
  return "[]";
}
function parseJsonArray(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; }
    catch { return []; }
  }
  return [];
}
function normalizeReporters(list: any): any[] {
  var arr = Array.isArray(list) ? list : [];
  return arr.map(function (r: any) {
    if (typeof r === "string") return { type: "custom", name: r };
    if (r && r.type === "user") return { type: "user", id: r.id, name: r.name };
    return { type: "custom", name: (r && r.name) || String(r) };
  });
}
function toDateStr(v: any) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v;
}

function serializeSubtask(row: any) {
  return {
    ...row,
    progress: row.progress == null ? 0 : Number(row.progress),
    estimated_hours: row.estimated_hours == null ? 0 : Number(row.estimated_hours),
    reporter: parseJsonArray(row.reporter),
    assignee_id: row.assignee_id || "",
    assignee_name: row.assignee_name || row.assignee || "",
    created_by: row.created_by || "",
    labels: parseJsonArray(row.labels),
    due_date: toDateStr(row.due_date),
    priority: row.priority || "Medium",
    description: row.description || "",
    attachments: parseJsonArray(row.attachments),
    view_only: !!row.view_only,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    archived_at: row.archived_at instanceof Date ? row.archived_at.toISOString() : (row.archived_at || null)
  };
}
const SUBTASK_FIELDS = ["name","status","progress","estimated_hours","reporter","assignee_name","priority","due_date","description","labels"];

async function parentTaskInfo(db: any, taskId: string) {
  const rows = await db.sql`SELECT id, task, user_id, project, assignee_id FROM tasks WHERE id = ${taskId}`;
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
      const withArchived = url.searchParams.get("include_archived") === "1";
      const ownedOrMemberRows = await db.sql`
        SELECT s.*, t.archived_at AS parent_archived_at, false as view_only FROM subtasks s
        JOIN tasks t ON t.id = s.task_id
        WHERE t.user_id = ${user.uid}
           OR EXISTS (
             SELECT 1 FROM project_members pm
             WHERE pm.owner_user_id = t.user_id AND pm.project = t.project AND pm.user_id = ${user.uid}
           )
        ORDER BY s.created_at ASC
      `;
      const taskSharedRows = await db.sql`
        SELECT s.*, t.archived_at AS parent_archived_at, true as view_only FROM subtasks s
        JOIN tasks t ON t.id = s.task_id
        JOIN shares sh ON sh.entity_type = 'task' AND sh.entity_id = t.id
        WHERE sh.shared_with_user_id = ${user.uid}
      `;
      const projectSharedRows = await db.sql`
        SELECT s.*, t.archived_at AS parent_archived_at, true as view_only FROM subtasks s
        JOIN tasks t ON t.id = s.task_id
        JOIN shares sh ON sh.entity_type = 'project' AND sh.entity_id = (t.user_id || '::' || t.project)
        WHERE sh.shared_with_user_id = ${user.uid}
      `;
      const merged: Record<string, any> = {};
      for (const r of [...ownedOrMemberRows, ...taskSharedRows, ...projectSharedRows]) {
        if (!merged[r.id] || !r.view_only) merged[r.id] = r;
      }
      // v2.3.5 ACT-01: an archived subtask, or one under an archived task, is hidden outside the Archived view
      const list = Object.values(merged).filter((r: any) => withArchived || (!r.archived_at && !r.parent_archived_at));
      return Response.json({ subtasks: list.map((r: any) => { const { parent_archived_at, ...rest } = r; return serializeSubtask(rest); }) });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const s = body.subtask || body;
      const parent = await parentTaskInfo(db, s.task_id);
      if (!parent) return Response.json({ error: "Parent task not found" }, { status: 404 });
      if (!(await canAccessProject(db, parent.user_id, parent.project, user.uid))) {
        return Response.json({ error: "You do not have access to this task." }, { status: 403 });
      }
      {
        const requester = await getFullUser(db, user.uid);
        const effRole = await getEffectiveProjectRole(db, parent.user_id, parent.project, user.uid, requester?.role);
        if (!roleCanManage(effRole)) {
          const isAssignee = (parent as any).assignee_id === user.uid;
          const isMember = await isTaskMember(db, s.task_id, user.uid);
          if (!isAssignee && !isMember) {
            return Response.json({ error: "You can only add subtasks to tasks assigned to you." }, { status: 403 });
          }
        }
      }

      const newId = "S" + randomUUID().slice(0, 8).toUpperCase();
      const now = new Date().toISOString();
      const reporterList = normalizeReporters(s.reporter && s.reporter.length ? s.reporter : [{ type: "user", id: user.uid, name: user.username }]);
      for (const r of reporterList) {
        if (r.type === "custom") await db.sql`INSERT INTO reporters (name) VALUES (${r.name}) ON CONFLICT (name) DO NOTHING`;
      }

      const rows = await db.sql`
        INSERT INTO subtasks (id, user_id, task_id, name, status, progress, estimated_hours,
          reporter, assignee_id, assignee_name, created_by, priority, due_date, description, labels, attachments, created_at, updated_at)
        VALUES (${newId}, ${parent.user_id}, ${s.task_id}, ${s.name}, ${s.status || "Not Started"},
          ${s.progress || 0}, ${s.estimated_hours || 0}, ${JSON.stringify(reporterList)},
          ${s.assignee_id || null}, ${s.assignee_name || ""}, ${user.username},
          ${s.priority || "Medium"}, ${s.due_date || null}, ${s.description || ""}, ${toJsonArrayText(s.labels)}, ${toJsonArrayText(s.attachments)},
          ${now}, ${now})
        RETURNING *
      `;
      await logActivity(db, {
        userId: user.uid, project: parent.project, taskId: s.task_id, subtaskId: newId, ownerId: parent.user_id, action: "create_subtask",
        description: `${user.username} created subtask "${s.name}" on task "${parent.task}"`
      });
      if (s.assignee_id && s.assignee_id !== user.uid) {
        await createNotification(db, {
          userId: s.assignee_id, type: "assigned", title: `You were assigned "${s.name}"`,
          message: `${user.username} assigned you to this subtask.`, entityType: "subtask", entityId: newId, project: parent.project
        });
      }
      return Response.json(serializeSubtask(rows[0]));
    }

    if (req.method === "PUT") {
      if (!id) return Response.json({ error: "Missing subtask id" }, { status: 400 });
      const existingRows = await db.sql`SELECT * FROM subtasks WHERE id = ${id}`;
      if (!existingRows.length) return Response.json({ error: "Subtask not found: " + id }, { status: 404 });
      const current = existingRows[0];
      const parent = await parentTaskInfo(db, current.task_id);
      if (!parent || !(await canAccessProject(db, parent.user_id, parent.project, user.uid))) {
        return Response.json({ error: "You do not have access to this subtask." }, { status: 403 });
      }
      {
        const requester = await getFullUser(db, user.uid);
        const effRole = await getEffectiveProjectRole(db, parent.user_id, parent.project, user.uid, requester?.role);
        if (!roleCanManage(effRole)) {
          const isAssignee = current.assignee_id === user.uid || parent.assignee_id === user.uid;
          const isMember = (await isSubtaskMember(db, id, user.uid)) || (await isTaskMember(db, current.task_id, user.uid));
          if (!isAssignee && !isMember) {
            return Response.json({ error: "You can only update subtasks assigned to you." }, { status: 403 });
          }
        }
      }

      const patch = await req.json();
      if (current.archived_at) return Response.json({ error: "This subtask is archived. Restore it before editing." }, { status: 409 });
      if (patch.expected_updated_at && new Date(patch.expected_updated_at).getTime() !== new Date(current.updated_at).getTime()) {
        return Response.json({ error: "This subtask was changed by someone else after you opened it. Reload to see the latest version.", code: "conflict", subtask: serializeSubtask(current) }, { status: 409 });
      }
      delete patch.expected_updated_at;
      if (patch.task_id !== undefined && patch.task_id !== current.task_id) {
        return Response.json({ error: "Use More > Move to move a subtask to another task." }, { status: 400 });
      }
      const merged: any = { ...current, reporter: parseJsonArray(current.reporter), ...patch };
      merged.updated_at = new Date().toISOString();

      const reporterList = normalizeReporters(merged.reporter && merged.reporter.length ? merged.reporter : [{ type: "user", id: user.uid, name: user.username }]);
      for (const r of reporterList) {
        if (r.type === "custom") await db.sql`INSERT INTO reporters (name) VALUES (${r.name}) ON CONFLICT (name) DO NOTHING`;
      }

      const rows = await db.sql`
        UPDATE subtasks SET
          name = ${merged.name},
          status = ${merged.status},
          progress = ${merged.progress || 0},
          estimated_hours = ${merged.estimated_hours || 0},
          reporter = ${JSON.stringify(reporterList)},
          assignee_id = ${merged.assignee_id || null},
          assignee_name = ${merged.assignee_name || ""},
          priority = ${merged.priority || "Medium"},
          due_date = ${merged.due_date || null},
          description = ${merged.description || ""},
          labels = ${toJsonArrayText(merged.labels)},
          attachments = ${toJsonArrayText(merged.attachments)},
          updated_at = ${merged.updated_at}
        WHERE id = ${id}
        RETURNING *
      `;

      const changes = changedFields(serializeSubtask(current), serializeSubtask(rows[0]), SUBTASK_FIELDS.filter(f => f in patch));
      const meta = changes.length ? { changes } : null;
      const ev = { userId: user.uid, project: parent.project, taskId: current.task_id, subtaskId: id, ownerId: parent.user_id, meta };
      if (patch.status && patch.status !== current.status) {
        await logActivity(db, {
          ...ev, action: "change_status",
          description: `${user.username} changed subtask "${current.name}" status from ${current.status} to ${patch.status}`
        });
        if (current.assignee_id && current.assignee_id !== user.uid) {
          await createNotification(db, {
            userId: current.assignee_id, type: "status_change", title: `"${current.name}" is now ${patch.status}`,
            message: `${user.username} changed the status from ${current.status} to ${patch.status}.`,
            entityType: "subtask", entityId: id, project: parent.project
          });
        }
      } else if (patch.assignee_id !== undefined && patch.assignee_id !== current.assignee_id) {
        await logActivity(db, {
          ...ev, action: "assign_task",
          description: `${user.username} assigned subtask "${current.name}" to ${merged.assignee_name || "someone"}`
        });
        if (merged.assignee_id && merged.assignee_id !== user.uid) {
          await createNotification(db, {
            userId: merged.assignee_id, type: "assigned", title: `You were assigned "${current.name}"`,
            message: `${user.username} assigned you to this subtask.`, entityType: "subtask", entityId: id, project: parent.project
          });
        }
      } else {
        await logActivity(db, {
          ...ev, action: "update_subtask",
          description: `${user.username} updated subtask "${current.name}"`
        });
        if (current.assignee_id && current.assignee_id !== user.uid) {
          await createNotification(db, {
            userId: current.assignee_id, type: "updated", title: `"${current.name}" was updated`,
            message: `${user.username} updated details on this subtask.`, entityType: "subtask", entityId: id, project: parent.project
          });
        }
      }
      return Response.json(serializeSubtask(rows[0]));
    }

    if (req.method === "DELETE") {
      if (!id) return Response.json({ error: "Missing subtask id" }, { status: 400 });
      const existingRows = await db.sql`SELECT * FROM subtasks WHERE id = ${id}`;
      if (!existingRows.length) return Response.json({ ok: true });
      const current = existingRows[0];
      const parent = await parentTaskInfo(db, current.task_id);
      if (!parent || !(await canAccessProject(db, parent.user_id, parent.project, user.uid))) {
        return Response.json({ error: "You do not have access to this subtask." }, { status: 403 });
      }
      {
        const requester = await getFullUser(db, user.uid);
        const effRole = await getEffectiveProjectRole(db, parent.user_id, parent.project, user.uid, requester?.role);
        if (!roleCanManage(effRole)) {
          const isAssignee = current.assignee_id === user.uid || parent.assignee_id === user.uid;
          const isMember = (await isSubtaskMember(db, id, user.uid)) || (await isTaskMember(db, current.task_id, user.uid));
          if (!isAssignee && !isMember) {
            return Response.json({ error: "You can only delete subtasks assigned to you." }, { status: 403 });
          }
        }
      }
      await db.sql`DELETE FROM subtasks WHERE id = ${id}`;
      await logActivity(db, {
        userId: user.uid, project: parent.project, taskId: current.task_id, subtaskId: id, ownerId: parent.user_id, action: "delete_subtask",
        description: `${user.username} deleted subtask "${current.name}"`
      });
      if (current.assignee_id && current.assignee_id !== user.uid) {
        await createNotification(db, {
          userId: current.assignee_id, type: "deleted", title: `"${current.name}" was deleted`,
          message: `${user.username} deleted this subtask.`, entityType: "subtask", entityId: "", project: parent.project
        });
      }
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unsupported method" }, { status: 405 });
  } catch (err: any) {
    return Response.json({ error: "Server error: " + err.message }, { status: 500 });
  }
};

export const config: Config = {
  path: ["/api/subtasks", "/api/subtasks/*"]
};
