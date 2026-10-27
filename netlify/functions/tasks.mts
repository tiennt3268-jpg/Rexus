import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { randomUUID } from "node:crypto";
import { getUserFromRequest, unauthorized } from "./lib/auth.mts";
import { canAccessProject, findProjectOwnerAccessibleToUser } from "./lib/collab.mts";
import { logActivity, changedFields } from "./lib/activity-log.mts";
import { getFullUser, getEffectiveProjectRole, roleCanManage } from "./lib/rbac.mts";
import { createNotification } from "./lib/notify.mts";
import { emitTaskReady } from "./lib/task-ready.mts";

async function isTaskMember(db: any, taskId: string, userId: string): Promise<boolean> {
  const rows = await db.sql`SELECT 1 FROM task_members WHERE task_id = ${taskId} AND user_id = ${userId}`;
  return rows.length > 0;
}

function normalizePredecessors(list: any): any[] {
  const arr = Array.isArray(list) ? list : [];
  const validTypes = ["FS", "SS", "FF", "SF"];
  return arr
    .filter((p: any) => p && p.id)
    .map((p: any) => ({
      id: String(p.id),
      type: validTypes.indexOf(p.type) !== -1 ? p.type : "FS",
      lag_days: Number(p.lag_days) || 0
    }));
}

async function validatePredecessors(db:any,taskId:string,owner:string,project:string,preds:any[]):Promise<string|null>{
 const all=await db.sql`SELECT id,predecessors FROM tasks WHERE user_id=${owner} AND project=${project}`;
 const adjacency=new Map<string,string[]>();
 for(const t of all)adjacency.set(t.id,parseJsonArray(t.predecessors).map((p:any)=>String(p.id)));
 adjacency.set(taskId,preds.map((p:any)=>String(p.id)));
 for(const p of preds){
  if(String(p.id)===taskId)return 'A Task cannot depend on itself';
  if(!adjacency.has(String(p.id)))return 'Predecessor must exist in the same Project';
 }
 const seen=new Set<string>(),stack=new Set<string>();
 function cycle(node:string):boolean{
  if(stack.has(node))return true;if(seen.has(node))return false;
  seen.add(node);stack.add(node);
  for(const next of adjacency.get(node)||[])if(cycle(next))return true;
  stack.delete(node);return false;
 }
 return cycle(taskId)?'Circular Gantt dependency is not allowed':null;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000);
}
function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
function shiftDateByRecurrence(dateStr: string | null, recurring: string): string | null {
  if (!dateStr) return dateStr;
  const r = (recurring || "").toLowerCase();
  if (r === "daily") return addDays(dateStr, 1);
  if (r === "weekly") return addDays(dateStr, 7);
  if (r === "monthly") return addMonths(dateStr, 1);
  return dateStr;
}

/**
 * When a recurring task (Daily/Weekly/Monthly) is marked Completed, spins up
 * the next instance automatically: same name/project/assignee/etc., dates
 * shifted forward by one recurrence period, status reset to Not Started.
 * Never mutates the completed task itself (it stays in history as-is),
 * which keeps this consistent with the "never retroactively rewrite past
 * records" pattern used for cost/salary history elsewhere in the app.
 */
async function createNextRecurringInstance(db: any, completed: any, actorUsername: string) {
  const recurring = completed.recurring;
  if (!recurring) return;

  const oldStart = toDateStr(completed.start_date);
  const oldDue = toDateStr(completed.due_date);
  const newDue = shiftDateByRecurrence(oldDue, recurring);
  let newStart: string | null = null;
  if (oldStart && oldDue && newDue) {
    const duration = Math.max(0, daysBetween(oldStart, oldDue));
    newStart = addDays(newDue, -duration);
  } else if (oldStart && !oldDue) {
    newStart = shiftDateByRecurrence(oldStart, recurring);
  }

  const newId = "T" + randomUUID().slice(0, 8).toUpperCase();
  const now = new Date().toISOString();
  const reporterList = parseJsonArray(completed.reporter);

  const rows = await db.sql`
    INSERT INTO tasks (id, user_id, task, description, project, priority, status, progress,
      start_date, due_date, start_time, end_time, estimated_hours, actual_hours, notes,
      task_type, labels, attachments, recurring, reporter, assignee_id, assignee_name, created_by, created_at, updated_at,
      predecessors, is_milestone)
    VALUES (${newId}, ${completed.user_id}, ${completed.task}, ${completed.description || ""}, ${completed.project},
      ${completed.priority || "Medium"}, 'Not Started', 0,
      ${newStart}, ${newDue}, ${completed.start_time || ""}, ${completed.end_time || ""},
      ${completed.estimated_hours || 0}, 0, "",
      ${completed.task_type || "Task"}, ${toJsonArrayText(completed.labels)}, '[]',
      ${recurring}, ${JSON.stringify(reporterList)}, ${completed.assignee_id || null}, ${completed.assignee_name || ""},
      ${actorUsername}, ${now}, ${now}, '[]', false)
    RETURNING *
  `;

  await logActivity(db, {
    userId: completed.user_id, project: completed.project, taskId: newId, action: "create_task",
    description: `Recurring task "${completed.task}" auto-created its next (${recurring}) instance`
  });
  if (completed.assignee_id) {
    await createNotification(db, {
      userId: completed.assignee_id, type: "assigned",
      title: `New recurring task: "${completed.task}"`,
      message: `A new instance of this ${recurring} recurring task was created for you.`,
      entityType: "task", entityId: newId, project: completed.project
    });
  }
  return rows[0];
}

/**
 * When a task's dates change, pushes forward any dependent tasks in the
 * same project whose predecessor constraints are no longer satisfied
 * (Gantt auto-scheduling). Only ever pushes dates later, never pulls them
 * earlier — mirrors how Microsoft Project's auto-schedule behaves when a
 * predecessor slips. Guarded against cycles with a visited set.
 */
async function cascadeAutoSchedule(db: any, ownerUserId: string, projectName: string, changedTaskId: string, actorUsername: string) {
  const allRows = await db.sql`SELECT id, task, start_date, due_date, predecessors FROM tasks WHERE user_id = ${ownerUserId} AND project = ${projectName}`;
  const byId: Record<string, any> = {};
  allRows.forEach((r: any) => {
    byId[r.id] = { id: r.id, task: r.task, start_date: toDateStr(r.start_date), due_date: toDateStr(r.due_date), predecessors: parseJsonArray(r.predecessors) };
  });

  const visited = new Set<string>();
  const queue: string[] = [changedTaskId];
  while (queue.length) {
    const curId = queue.shift() as string;
    if (visited.has(curId)) continue;
    visited.add(curId);

    for (const s of Object.values(byId) as any[]) {
      if (s.id === curId) continue;
      const preds: any[] = s.predecessors || [];
      if (!preds.some((p) => p.id === curId)) continue;
      if (!s.start_date || !s.due_date) continue;

      let requiredStart: string | null = null;
      let requiredDue: string | null = null;
      for (const p of preds) {
        const pred = byId[p.id];
        if (!pred || !pred.start_date || !pred.due_date) continue;
        const lag = Number(p.lag_days) || 0;
        if (p.type === "SS") {
          const cand = addDays(pred.start_date, lag);
          if (!requiredStart || cand > requiredStart) requiredStart = cand;
        } else if (p.type === "FF") {
          const cand = addDays(pred.due_date, lag);
          if (!requiredDue || cand > requiredDue) requiredDue = cand;
        } else if (p.type === "SF") {
          const cand = addDays(pred.start_date, lag);
          if (!requiredDue || cand > requiredDue) requiredDue = cand;
        } else {
          const cand = addDays(pred.due_date, lag);
          if (!requiredStart || cand > requiredStart) requiredStart = cand;
        }
      }

      const duration = Math.max(0, daysBetween(s.start_date, s.due_date));
      let newStart = s.start_date, newDue = s.due_date, changed = false;
      if (requiredStart && requiredStart > newStart) {
        newStart = requiredStart;
        newDue = addDays(newStart, duration);
        changed = true;
      }
      if (requiredDue && requiredDue > newDue) {
        newDue = requiredDue;
        newStart = addDays(newDue, -duration);
        changed = true;
      }

      if (changed) {
        await db.sql`UPDATE tasks SET start_date = ${newStart}, due_date = ${newDue}, updated_at = ${new Date().toISOString()} WHERE id = ${s.id}`;
        await logActivity(db, {
          userId: ownerUserId, project: projectName, taskId: s.id, action: "auto_reschedule",
          description: `Auto-rescheduled "${s.task}" after ${actorUsername} moved a predecessor task`
        });
        byId[s.id].start_date = newStart;
        byId[s.id].due_date = newDue;
        queue.push(s.id);
      }
    }
  }
}

function toDateStr(v: any) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v;
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

function serializeTask(row: any) {
  return {
    ...row,
    start_date: toDateStr(row.start_date),
    due_date: toDateStr(row.due_date),
    progress: row.progress == null ? 0 : Number(row.progress),
    estimated_hours: row.estimated_hours == null ? 0 : Number(row.estimated_hours),
    actual_hours: row.actual_hours == null ? 0 : Number(row.actual_hours),
    labels: parseJsonArray(row.labels),
    attachments: parseJsonArray(row.attachments),
    recurring: row.recurring || "",
    reporter: parseJsonArray(row.reporter),
    assignee_id: row.assignee_id || "",
    assignee_name: row.assignee_name || row.assignee || "",
    created_by: row.created_by || "",
    task_type: row.task_type || "Task",
    predecessors: parseJsonArray(row.predecessors),
    is_milestone: !!row.is_milestone,
    view_only: !!row.view_only,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    archived_at: row.archived_at instanceof Date ? row.archived_at.toISOString() : (row.archived_at || null)
  };
}
/* v2.3.5: fields the detail form can change, for the activity timeline */
export const TASK_FIELDS = ["task","description","priority","status","progress","start_date","due_date","start_time","end_time",
  "estimated_hours","actual_hours","notes","task_type","labels","recurring","reporter","assignee_name","predecessors","is_milestone"];
/** v2.3.5 DTL-01: another person saved after this form was opened. */
export function isStale(current: any, expected: any): boolean {
  if (!expected) return false;
  const a = new Date(current.updated_at as any).getTime(), b = new Date(expected).getTime();
  return !isNaN(a) && !isNaN(b) && a !== b;
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
        SELECT t.*, false as view_only FROM tasks t
        WHERE t.user_id = ${user.uid}
           OR EXISTS (
             SELECT 1 FROM project_members pm
             WHERE pm.owner_user_id = t.user_id AND pm.project = t.project AND pm.user_id = ${user.uid}
           )
        ORDER BY t.due_date ASC NULLS LAST, t.id ASC
      `;
      // Tasks/projects shared directly with this user (view-only) even
      // though they are not an owner, project member, assignee, or reporter.
      const taskSharedRows = await db.sql`
        SELECT t.*, true as view_only FROM tasks t
        JOIN shares sh ON sh.entity_type = 'task' AND sh.entity_id = t.id
        WHERE sh.shared_with_user_id = ${user.uid}
      `;
      const projectSharedRows = await db.sql`
        SELECT t.*, true as view_only FROM tasks t
        JOIN shares sh ON sh.entity_type = 'project' AND sh.entity_id = (t.user_id || '::' || t.project)
        WHERE sh.shared_with_user_id = ${user.uid}
      `;
      const merged: Record<string, any> = {};
      for (const r of [...ownedOrMemberRows, ...taskSharedRows, ...projectSharedRows]) {
        if (!merged[r.id] || !r.view_only) merged[r.id] = r;
      }
      // v2.3.5 ACT-01: archived tasks are hidden unless the Archived view asks for them
      const list = Object.values(merged).filter((r: any) => withArchived || !r.archived_at);
      return Response.json({ tasks: list.map(serializeTask) });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const t = body.task || body;
      const newId = "T" + randomUUID().slice(0, 8).toUpperCase();
      const now = new Date().toISOString();

      const projectName = t.project || "General";
      const spaceOwnerId = (await findProjectOwnerAccessibleToUser(db, projectName, user.uid)) || user.uid;

      const requester = await getFullUser(db, user.uid);
      const effRole = await getEffectiveProjectRole(db, spaceOwnerId, projectName, user.uid, requester?.role);
      if (!roleCanManage(effRole)) {
        return Response.json({ error: "Members can only be assigned tasks by a Project Manager or Admin, not create their own." }, { status: 403 });
      }

      const reporterList = normalizeReporters(t.reporter && t.reporter.length ? t.reporter : [{ type: "user", id: user.uid, name: user.username }]);
      for (const r of reporterList) {
        if (r.type === "custom") await db.sql`INSERT INTO reporters (name) VALUES (${r.name}) ON CONFLICT (name) DO NOTHING`;
      }
      const predecessors = normalizePredecessors(t.predecessors);
      const invalid=await validatePredecessors(db,newId,spaceOwnerId,projectName,predecessors);
      if(invalid)return Response.json({error:invalid},{status:400});

      const rows = await db.sql`
        INSERT INTO tasks (id, user_id, task, description, project, priority, status, progress,
          start_date, due_date, start_time, end_time, estimated_hours, actual_hours, notes,
          task_type, labels, attachments, recurring, reporter, assignee_id, assignee_name, created_by, created_at, updated_at,
          predecessors, is_milestone)
        VALUES (${newId}, ${spaceOwnerId}, ${t.task}, ${t.description || ""}, ${projectName},
          ${t.priority || "Medium"}, ${t.status || "Not Started"}, ${t.progress || 0},
          ${t.start_date || null}, ${t.due_date || null}, ${t.start_time || ""}, ${t.end_time || ""},
          ${t.estimated_hours || 0}, ${t.actual_hours || 0}, ${t.notes || ""},
          ${t.task_type || "Task"}, ${toJsonArrayText(t.labels)}, ${toJsonArrayText(t.attachments)},
          ${t.recurring || ""}, ${JSON.stringify(reporterList)}, ${t.assignee_id || null}, ${t.assignee_name || ""},
          ${user.username}, ${now}, ${now}, ${JSON.stringify(predecessors)}, ${!!t.is_milestone})
        RETURNING *
      `;
      await logActivity(db, {
        userId: user.uid, project: projectName, taskId: newId, action: "create_task",
        description: `${user.username} created task "${t.task}"`
      });
      if (t.assignee_id && t.assignee_id !== user.uid) {
        await createNotification(db, {
          userId: t.assignee_id, type: "assigned", title: `You were assigned "${t.task}"`,
          message: `${user.username} assigned you to this task.`, entityType: "task", entityId: newId, project: projectName
        });
      }
      return Response.json(serializeTask(rows[0]));
    }

    if (req.method === "PUT") {
      if (!id) return Response.json({ error: "Missing task id" }, { status: 400 });
      const existingRows = await db.sql`SELECT * FROM tasks WHERE id = ${id}`;
      if (!existingRows.length) return Response.json({ error: "Task not found: " + id }, { status: 404 });
      const current = existingRows[0];
      if (!(await canAccessProject(db, current.user_id, current.project, user.uid))) {
        return Response.json({ error: "You do not have access to this task." }, { status: 403 });
      }
      {
        const requester = await getFullUser(db, user.uid);
        const effRole = await getEffectiveProjectRole(db, current.user_id, current.project, user.uid, requester?.role);
        if (!roleCanManage(effRole)) {
          const isAssignee = current.assignee_id === user.uid;
          const isMember = await isTaskMember(db, id, user.uid);
          if (!isAssignee && !isMember) {
            return Response.json({ error: "You can only update tasks assigned to you." }, { status: 403 });
          }
        }
      }

      const patch = await req.json();
      if (current.archived_at) return Response.json({ error: "This task is archived. Restore it before editing." }, { status: 409 });
      if (isStale(current, patch.expected_updated_at)) {
        return Response.json({ error: "This task was changed by someone else after you opened it. Reload to see the latest version.", code: "conflict", task: serializeTask(current) }, { status: 409 });
      }
      delete patch.expected_updated_at;
      if (patch.project !== undefined && patch.project !== current.project) {
        return Response.json({ error: "Use More > Move to move a task to another project." }, { status: 400 });
      }
      // JSON columns come back as text: parse them so a partial patch keeps reporters and dependencies.
      const merged: any = { ...current, reporter: parseJsonArray(current.reporter), predecessors: parseJsonArray(current.predecessors), ...patch };
      merged.updated_at = new Date().toISOString();
      // v2.3.5 PRJ-01: Done % feeds project completion, so keep it within 0–100
      merged.progress = Math.min(100, Math.max(0, Math.round(Number(merged.progress) || 0)));

      const reporterList = normalizeReporters(merged.reporter && merged.reporter.length ? merged.reporter : [{ type: "user", id: user.uid, name: user.username }]);
      for (const r of reporterList) {
        if (r.type === "custom") await db.sql`INSERT INTO reporters (name) VALUES (${r.name}) ON CONFLICT (name) DO NOTHING`;
      }
      const predecessors = normalizePredecessors(merged.predecessors);
      const invalid=await validatePredecessors(db,id,current.user_id,current.project,predecessors);
      if(invalid)return Response.json({error:invalid},{status:400});

      const rows = await db.sql`
        UPDATE tasks SET
          task = ${merged.task},
          description = ${merged.description},
          priority = ${merged.priority},
          status = ${merged.status},
          progress = ${merged.progress},
          start_date = ${merged.start_date || null},
          due_date = ${merged.due_date || null},
          start_time = ${merged.start_time || ""},
          end_time = ${merged.end_time || ""},
          estimated_hours = ${merged.estimated_hours || 0},
          actual_hours = ${merged.actual_hours || 0},
          notes = ${merged.notes || ""},
          task_type = ${merged.task_type || "Task"},
          labels = ${toJsonArrayText(merged.labels)},
          attachments = ${toJsonArrayText(merged.attachments)},
          recurring = ${merged.recurring || ""},
          reporter = ${JSON.stringify(reporterList)},
          assignee_id = ${merged.assignee_id || null},
          assignee_name = ${merged.assignee_name || ""},
          predecessors = ${JSON.stringify(predecessors)},
          is_milestone = ${!!merged.is_milestone},
          updated_at = ${merged.updated_at}
        WHERE id = ${id}
        RETURNING *
      `;

      // v2.1.0: dependency visualization/notifications only. Do not move Task dates.

      const changes = changedFields(serializeTask(current), serializeTask(rows[0]), TASK_FIELDS.filter(f => f in patch));
      const meta = changes.length ? { changes } : null;
      if (patch.status && patch.status !== current.status) {
        await logActivity(db, {
          userId: user.uid, project: current.project, taskId: id, ownerId: current.user_id, action: "change_status", meta,
          description: `${user.username} changed task "${current.task}" status from ${current.status} to ${patch.status}`
        });
        if (current.assignee_id && current.assignee_id !== user.uid) {
          await createNotification(db, {
            userId: current.assignee_id, type: "status_change", title: `"${current.task}" is now ${patch.status}`,
            message: `${user.username} changed the status from ${current.status} to ${patch.status}.`,
            entityType: "task", entityId: id, project: current.project
          });
        }
        if (patch.status === "Completed" && current.status !== "Completed") {
          await emitTaskReady(db,id);
        }
        if (patch.status === "Completed" && current.recurring) {
          await createNextRecurringInstance(db, rows[0], user.username);
        }
      } else if (patch.assignee_id !== undefined && patch.assignee_id !== current.assignee_id) {
        await logActivity(db, {
          userId: user.uid, project: current.project, taskId: id, ownerId: current.user_id, action: "assign_task", meta,
          description: `${user.username} assigned task "${current.task}" to ${merged.assignee_name || "someone"}`
        });
        if (merged.assignee_id && merged.assignee_id !== user.uid) {
          await createNotification(db, {
            userId: merged.assignee_id, type: "assigned", title: `You were assigned "${current.task}"`,
            message: `${user.username} assigned you to this task.`, entityType: "task", entityId: id, project: current.project
          });
        }
      } else {
        await logActivity(db, {
          userId: user.uid, project: current.project, taskId: id, ownerId: current.user_id, action: "update_task", meta,
          description: `${user.username} updated task "${current.task}"`
        });
        if (current.assignee_id && current.assignee_id !== user.uid) {
          await createNotification(db, {
            userId: current.assignee_id, type: "updated", title: `"${current.task}" was updated`,
            message: `${user.username} updated details on this task.`, entityType: "task", entityId: id, project: current.project
          });
        }
      }
      return Response.json(serializeTask(rows[0]));
    }

    if (req.method === "DELETE") {
      if (!id) return Response.json({ error: "Missing task id" }, { status: 400 });
      const existingRows = await db.sql`SELECT * FROM tasks WHERE id = ${id}`;
      if (!existingRows.length) return Response.json({ ok: true });
      const current = existingRows[0];
      if (!(await canAccessProject(db, current.user_id, current.project, user.uid))) {
        return Response.json({ error: "You do not have access to this task." }, { status: 403 });
      }
      {
        const requester = await getFullUser(db, user.uid);
        const effRole = await getEffectiveProjectRole(db, current.user_id, current.project, user.uid, requester?.role);
        if (!roleCanManage(effRole)) {
          return Response.json({ error: "Only a Project Manager or Admin can delete tasks." }, { status: 403 });
        }
      }
      await db.sql`DELETE FROM tasks WHERE id = ${id}`;
      await logActivity(db, {
        userId: user.uid, project: current.project, taskId: id, action: "delete_task",
        description: `${user.username} deleted task "${current.task}"`
      });
      if (current.assignee_id && current.assignee_id !== user.uid) {
        await createNotification(db, {
          userId: current.assignee_id, type: "deleted", title: `"${current.task}" was deleted`,
          message: `${user.username} deleted this task.`, entityType: "task", entityId: "", project: current.project
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
  path: ["/api/tasks", "/api/tasks/*"]
};
