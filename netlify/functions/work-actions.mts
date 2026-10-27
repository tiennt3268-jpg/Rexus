import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { randomUUID } from "node:crypto";
import { getUserFromRequest, unauthorized } from "./lib/auth.mts";
import { getFullUser, getEffectiveProjectRole, roleCanManage, isManagerOrAdmin } from "./lib/rbac.mts";
import { logActivity } from "./lib/activity-log.mts";
import { tx } from "./lib/approvals.mts";

/* v2.3.5 ACT-01..03: Clone, Archive / Restore, Move and Convert for tasks and subtasks.
   Every action that touches more than one row runs in one transaction, and each one writes a timeline event. */

const newTaskId = () => "T" + randomUUID().slice(0, 8).toUpperCase();
const newSubId = () => "S" + randomUUID().slice(0, 8).toUpperCase();
const fail = (error: string, status = 400) => Response.json({ error }, { status });
const parseArr = (v: any) => { if (Array.isArray(v)) return v; try { const p = JSON.parse(v || "[]"); return Array.isArray(p) ? p : []; } catch { return []; } };

type Who = { uid: string; username: string; role?: string };

async function role(db: any, who: Who, owner: string, project: string) {
  return getEffectiveProjectRole(db, owner, project, who.uid, who.role);
}
async function canManage(db: any, who: Who, owner: string, project: string) {
  return roleCanManage(await role(db, who, owner, project));
}
/** Same rule as editing a task: manager of the project, or the task's assignee / member. */
async function canEditTask(db: any, who: Who, t: any) {
  const r = await role(db, who, t.user_id, t.project);
  if (!r) return false;
  if (roleCanManage(r)) return true;
  if (t.assignee_id === who.uid) return true;
  return (await db.sql`SELECT 1 FROM task_members WHERE task_id = ${t.id} AND user_id = ${who.uid}`).length > 0;
}
/** Same rule as editing a subtask: anyone who can edit the parent, or the subtask's assignee / member. */
async function canEditSubtask(db: any, who: Who, s: any, parent: any) {
  if (await canEditTask(db, who, parent)) return true;
  if (!(await role(db, who, parent.user_id, parent.project))) return false;
  if (s.assignee_id === who.uid) return true;
  return (await db.sql`SELECT 1 FROM subtask_members WHERE subtask_id = ${s.id} AND user_id = ${who.uid}`).length > 0;
}
async function loadTask(db: any, id: string) { return (await db.sql`SELECT * FROM tasks WHERE id = ${id}`)[0] || null; }
async function loadSub(db: any, id: string) { return (await db.sql`SELECT * FROM subtasks WHERE id = ${id}`)[0] || null; }
async function projectExists(db: any, owner: string, name: string) {
  return (await db.sql`SELECT 1 FROM projects WHERE user_id = ${owner} AND name = ${name}`).length > 0;
}
/** Closed (approved) project costs must not silently move to another project. */
async function approvedLogs(db: any, where: { taskId?: string; subtaskId?: string }) {
  const r = where.subtaskId
    ? await db.sql`SELECT COUNT(*)::int AS n FROM worklogs WHERE subtask_id = ${where.subtaskId} AND status = 'approved'`
    : await db.sql`SELECT COUNT(*)::int AS n FROM worklogs WHERE task_id = ${where.taskId} AND status = 'approved'`;
  return Number(r[0]?.n || 0);
}

/** Removes dependency links between `taskId` and tasks of its old project; returns what was removed for the log. */
async function cutDependencies(c: any, taskId: string, owner: string, project: string) {
  const removed: { from: string; to: string }[] = [];
  const self = (await c.query("SELECT predecessors FROM tasks WHERE id = $1", [taskId])).rows[0];
  for (const p of parseArr(self?.predecessors)) removed.push({ from: String(p.id), to: taskId });
  await c.query("UPDATE tasks SET predecessors = '[]' WHERE id = $1", [taskId]);
  const others = (await c.query("SELECT id, predecessors FROM tasks WHERE user_id = $1 AND project = $2 AND id <> $3", [owner, project, taskId])).rows;
  for (const o of others) {
    const list = parseArr(o.predecessors);
    const kept = list.filter((p: any) => String(p.id) !== taskId);
    if (kept.length !== list.length) {
      removed.push({ from: taskId, to: o.id });
      await c.query("UPDATE tasks SET predecessors = $1 WHERE id = $2", [JSON.stringify(kept), o.id]);
    }
  }
  const dep = await c.query("DELETE FROM rexus_task_dependencies WHERE predecessor_id = $1 OR successor_id = $1 RETURNING predecessor_id, successor_id", [taskId]);
  for (const d of dep.rows) if (!removed.some(r => r.from === d.predecessor_id && r.to === d.successor_id)) removed.push({ from: d.predecessor_id, to: d.successor_id });
  return removed;
}

async function cloneTask(c: any, src: any, who: Who, withSubtasks: boolean) {
  const id = newTaskId(), now = new Date().toISOString();
  // Copies content, dates, assignee and labels. Status/progress restart; worklogs, comments, history and files are not copied.
  await c.query(`INSERT INTO tasks (id,user_id,task,description,project,priority,status,progress,start_date,due_date,start_time,end_time,
      estimated_hours,actual_hours,notes,task_type,labels,attachments,recurring,reporter,assignee_id,assignee_name,created_by,created_at,updated_at,predecessors,is_milestone)
    SELECT $1,user_id,task || ' (copy)',description,project,priority,'Not Started',0,start_date,due_date,start_time,end_time,
      estimated_hours,0,notes,task_type,labels,'[]',recurring,reporter,assignee_id,assignee_name,$2,$3,$3,'[]',is_milestone
    FROM tasks WHERE id = $4`, [id, who.username, now, src.id]);
  let subCount = 0;
  if (withSubtasks) {
    const subs = (await c.query("SELECT id FROM subtasks WHERE task_id = $1 AND archived_at IS NULL ORDER BY created_at", [src.id])).rows;
    for (const s of subs) { await cloneSub(c, s.id, id, who, false); subCount++; }
  }
  return { id, subCount };
}
async function cloneSub(c: any, srcId: string, parentId: string, who: Who, rename: boolean) {
  const id = newSubId(), now = new Date().toISOString();
  await c.query(`INSERT INTO subtasks (id,user_id,task_id,name,status,progress,estimated_hours,reporter,assignee_id,assignee_name,created_by,priority,due_date,description,labels,attachments,created_at,updated_at)
    SELECT $1,(SELECT user_id FROM tasks WHERE id = $2),$2,CASE WHEN $6 THEN name || ' (copy)' ELSE name END,'Not Started',0,estimated_hours,reporter,assignee_id,assignee_name,$3,priority,due_date,description,labels,'[]',$4,$4
    FROM subtasks WHERE id = $5`, [id, parentId, who.username, now, srcId, rename]);
  return id;
}

async function addAlias(c: any, oldType: string, oldId: string, newType: string, newId: string, owner: string, project: string, by: string) {
  await c.query(`INSERT INTO rexus_entity_aliases (old_type, old_id, new_type, new_id, new_owner, new_project, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (old_type, old_id) DO UPDATE SET new_type = EXCLUDED.new_type, new_id = EXCLUDED.new_id,
    new_owner = EXCLUDED.new_owner, new_project = EXCLUDED.new_project`, [oldType, oldId, newType, newId, owner, project, by]);
  // keep older aliases pointing at the newest object
  await c.query("UPDATE rexus_entity_aliases SET new_type = $1, new_id = $2, new_owner = $3, new_project = $4 WHERE new_type = $5 AND new_id = $6",
    [newType, newId, owner, project, oldType, oldId]);
}

export default async (req: Request, context: Context) => {
  const session = await getUserFromRequest(req);
  if (!session) return unauthorized();
  const db = getDatabase();
  const me = await getFullUser(db, session.uid);
  const who: Who = { uid: session.uid, username: session.username, role: me?.role };
  const url = new URL(req.url);

  try {
    if (req.method === "GET") {
      // Old link -> current object after a conversion.
      const oldId = url.searchParams.get("resolve") || "";
      const a = (await db.sql`SELECT * FROM rexus_entity_aliases WHERE old_id = ${oldId}`)[0];
      if (!a) return fail("Not found", 404);
      if (a.new_owner && a.new_project && !(await role(db, who, a.new_owner, a.new_project))) return fail("Not found", 404);
      return Response.json({ old_id: a.old_id, old_type: a.old_type, new_type: a.new_type, new_id: a.new_id, project: a.new_project });
    }
    if (req.method !== "POST") return fail("Unsupported method", 405);

    const b = await req.json().catch(() => ({}));
    const action = String(b.action || ""), type = String(b.type || ""), id = String(b.id || "");
    if (type !== "task" && type !== "subtask") return fail("type must be task or subtask");

    /* ---------------- TASK ---------------- */
    if (type === "task") {
      const t = await loadTask(db, id);
      if (!t) return fail("Task not found", 404);
      const ev = { userId: who.uid, project: t.project, taskId: t.id, ownerId: t.user_id };

      if (action === "archive" || action === "restore") {
        if (!(await canEditTask(db, who, t))) return fail("You can only archive tasks you can edit.", 403);
        if (action === "archive" && t.archived_at) return fail("This task is already archived.", 409);
        if (action === "restore" && !t.archived_at) return fail("This task is not archived.", 409);
        if (action === "restore" && !(await projectExists(db, t.user_id, t.project))) return fail("The project of this task no longer exists.", 409);
        if (action === "restore" && (await db.sql`SELECT 1 FROM rexus_entity_aliases WHERE old_type = 'task' AND old_id = ${id}`).length)
          return fail("This task was converted. Open the new item instead.", 409);
        if (action === "archive") await db.sql`UPDATE tasks SET archived_at = NOW(), archived_by = ${who.uid} WHERE id = ${id}`;
        else await db.sql`UPDATE tasks SET archived_at = NULL, archived_by = NULL WHERE id = ${id}`;
        await logActivity(db, { ...ev, action: action === "archive" ? "archive_task" : "restore_task",
          description: `${who.username} ${action === "archive" ? "archived" : "restored"} task "${t.task}"` });
        return Response.json({ ok: true, id });
      }
      if (t.archived_at) return fail("This task is archived. Restore it first.", 409);

      if (action === "clone") {
        if (!(await canManage(db, who, t.user_id, t.project))) return fail("Only a Project Manager or Admin can create tasks in this project.", 403);
        const out = await tx(db, c => cloneTask(c, t, who, !!b.include_subtasks));
        await logActivity(db, { ...ev, taskId: out.id, action: "clone_task", meta: { source_id: t.id, subtasks: out.subCount },
          description: `${who.username} cloned task "${t.task}"` + (out.subCount ? ` with ${out.subCount} subtask(s)` : "") });
        await logActivity(db, { ...ev, action: "cloned_to", meta: { new_id: out.id }, description: `${who.username} made a copy of this task (${out.id})` });
        return Response.json({ ok: true, id: out.id, subtasks: out.subCount }, { status: 201 });
      }

      if (action === "move") {
        const destProject = String(b.project || ""), destOwner = String(b.owner || "");
        if (!destProject || !destOwner) return fail("Choose a destination project.");
        if (destOwner === t.user_id && destProject === t.project) return fail("The task is already in that project.");
        if (!(await canManage(db, who, t.user_id, t.project))) return fail("You need to manage the source project to move this task.", 403);
        if (!(await projectExists(db, destOwner, destProject))) return fail("Destination project not found.", 404);
        if (!(await canManage(db, who, destOwner, destProject))) return fail("You need to manage the destination project.", 403);
        if (await approvedLogs(db, { taskId: id })) return fail("This task has work logs in a closed project cost. Reopen the cost before moving it.", 409);
        const removed = await tx(db, async c => {
          const r = await cutDependencies(c, id, t.user_id, t.project);
          await c.query("UPDATE tasks SET project = $1, user_id = $2, updated_at = NOW() WHERE id = $3", [destProject, destOwner, id]);
          await c.query("UPDATE subtasks SET user_id = $1 WHERE task_id = $2", [destOwner, id]);
          await c.query("UPDATE worklogs SET user_id = $1 WHERE task_id = $2", [destOwner, id]);
          return r;
        });
        const meta = { from: { owner: t.user_id, project: t.project }, to: { owner: destOwner, project: destProject }, removed_dependencies: removed };
        await logActivity(db, { ...ev, project: destProject, ownerId: destOwner, action: "move_task", meta,
          description: `${who.username} moved task "${t.task}" from "${t.project}" to "${destProject}"` + (removed.length ? ` (${removed.length} dependency link(s) removed)` : "") });
        await logActivity(db, { userId: who.uid, ownerId: t.user_id, project: t.project, entityType: "project", entityId: t.user_id + "::" + t.project,
          action: "move_task_out", meta, description: `${who.username} moved task "${t.task}" to "${destProject}"` });
        return Response.json({ ok: true, id, removed_dependencies: removed });
      }

      if (action === "convert") {
        const to = String(b.to || "");
        if (!(await canManage(db, who, t.user_id, t.project))) return fail("Only a Project Manager or Admin can convert this task.", 403);

        if (to === "project") {
          if (!isManagerOrAdmin(me)) return fail("Only a System Admin or Project Manager can create projects.", 403);
          const name = String(b.name || t.task).trim().slice(0, 200);
          if (!name) return fail("Project name required");
          if (await projectExists(db, t.user_id, name)) return fail(`A project named "${name}" already exists.`, 409);
          const owner = t.user_id;
          const created = await tx(db, async c => {
            await c.query(`INSERT INTO projects (user_id, owner_id, name, deadline, start_date, description, attachments, status, owner, members, gantt_enabled, gantt_auto_schedule, budget, workflow_notifications_enabled)
              SELECT $1, $1, $2, $3, $4, $5, '[]', 'Active', COALESCE(NULLIF(owner, ''), $6), members, false, false, NULL, false FROM projects WHERE user_id = $1 AND name = $7`,
              [owner, name, t.due_date, t.start_date, t.description || "", who.username, t.project]);
            await c.query(`INSERT INTO project_members (owner_user_id, project, user_id, role)
              SELECT owner_user_id, $1, user_id, role FROM project_members WHERE owner_user_id = $2 AND project = $3 ON CONFLICT DO NOTHING`, [name, owner, t.project]);
            const subs = (await c.query("SELECT * FROM subtasks WHERE task_id = $1 AND archived_at IS NULL ORDER BY created_at", [id])).rows;
            const map: Record<string, string> = {};
            for (const s of subs) {
              const nid = newTaskId();
              map[s.id] = nid;
              await c.query(`INSERT INTO tasks (id,user_id,task,description,project,priority,status,progress,start_date,due_date,start_time,end_time,estimated_hours,actual_hours,notes,task_type,labels,attachments,recurring,reporter,assignee_id,assignee_name,created_by,created_at,updated_at,predecessors,is_milestone)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9,'','',$10,0,'','Task',$11,$12,'',$13,$14,$15,$16,$17,NOW(),'[]',false)`,
                [nid, owner, s.name, s.description || "", name, s.priority || "Medium", s.status || "Not Started", s.progress || 0, s.due_date, s.estimated_hours || 0,
                 s.labels || "[]", s.attachments || "[]", s.reporter || "[]", s.assignee_id, s.assignee_name || "", s.created_by || who.username, s.created_at]);
              await c.query("UPDATE worklogs SET task_id = $1, subtask_id = NULL WHERE subtask_id = $2", [nid, s.id]);
              await c.query("INSERT INTO task_members (task_id, user_id) SELECT $1, user_id FROM subtask_members WHERE subtask_id = $2 ON CONFLICT DO NOTHING", [nid, s.id]);
              await c.query("UPDATE subtasks SET archived_at = NOW(), archived_by = $1 WHERE id = $2", [who.uid, s.id]);
              await addAlias(c, "subtask", s.id, "task", nid, owner, name, who.uid);
            }
            await cutDependencies(c, id, owner, t.project);
            await c.query("UPDATE tasks SET archived_at = NOW(), archived_by = $1 WHERE id = $2", [who.uid, id]);
            await addAlias(c, "task", id, "project", owner + "::" + name, owner, name, who.uid);
            return map;
          });
          const meta = { from: { type: "task", id }, to: { type: "project", owner, project: name }, subtasks: created };
          await logActivity(db, { ...ev, action: "convert_task", meta, description: `${who.username} converted task "${t.task}" into project "${name}"` });
          await logActivity(db, { userId: who.uid, ownerId: owner, project: name, entityType: "project", entityId: owner + "::" + name, action: "create_project", meta,
            description: `${who.username} created project "${name}" from task "${t.task}" (${Object.keys(created).length} subtask(s) became tasks)` });
          return Response.json({ ok: true, project: name, owner, tasks: created }, { status: 201 });
        }

        if (to === "subtask") {
          const parent = await loadTask(db, String(b.parent_id || ""));
          if (!parent || parent.archived_at) return fail("Choose the task that will contain this subtask.", 404);
          if (parent.id === id) return fail("A task cannot become its own subtask.");
          if (!(await canEditTask(db, who, parent))) return fail("You cannot add subtasks to that task.", 403);
          const open = (await db.sql`SELECT COUNT(*)::int AS n FROM subtasks WHERE task_id = ${id} AND archived_at IS NULL`)[0].n;
          if (Number(open) > 0) return fail("Only a task without subtasks can become a subtask. Move or convert its subtasks first.", 409);
          const crossProject = parent.user_id !== t.user_id || parent.project !== t.project;
          if (crossProject && await approvedLogs(db, { taskId: id })) return fail("This task has work logs in a closed project cost. Reopen the cost first.", 409);
          const nid = newSubId();
          await tx(db, async c => {
            await c.query(`INSERT INTO subtasks (id,user_id,task_id,name,status,progress,estimated_hours,reporter,assignee_id,assignee_name,created_by,priority,due_date,description,labels,attachments,created_at,updated_at)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())`,
              [nid, parent.user_id, parent.id, t.task, t.status || "Not Started", t.progress || 0, t.estimated_hours || 0, t.reporter || "[]", t.assignee_id, t.assignee_name || "",
               t.created_by || who.username, t.priority || "Medium", t.due_date, t.description || "", t.labels || "[]", t.attachments || "[]", t.created_at]);
            await c.query("UPDATE worklogs SET task_id = $1, subtask_id = $2, user_id = $3 WHERE task_id = $4", [parent.id, nid, parent.user_id, id]);
            await c.query("INSERT INTO subtask_members (subtask_id, user_id) SELECT $1, user_id FROM task_members WHERE task_id = $2 ON CONFLICT DO NOTHING", [nid, id]);
            await cutDependencies(c, id, t.user_id, t.project);
            await c.query("UPDATE tasks SET archived_at = NOW(), archived_by = $1 WHERE id = $2", [who.uid, id]);
            await addAlias(c, "task", id, "subtask", nid, parent.user_id, parent.project, who.uid);
          });
          const meta = { from: { type: "task", id }, to: { type: "subtask", id: nid, parent_id: parent.id } };
          await logActivity(db, { ...ev, action: "convert_task", meta, description: `${who.username} converted task "${t.task}" into a subtask of "${parent.task}"` });
          await logActivity(db, { userId: who.uid, project: parent.project, taskId: parent.id, subtaskId: nid, ownerId: parent.user_id, action: "create_subtask", meta,
            description: `${who.username} made task "${t.task}" a subtask of "${parent.task}"` });
          return Response.json({ ok: true, id: nid, parent_id: parent.id }, { status: 201 });
        }
        return fail("A task can be converted to a project or a subtask.");
      }
      return fail("Unknown action");
    }

    /* ---------------- SUBTASK ---------------- */
    const s = await loadSub(db, id);
    if (!s) return fail("Subtask not found", 404);
    const parent = await loadTask(db, s.task_id);
    if (!parent) return fail("Parent task not found", 404);
    const ev = { userId: who.uid, project: parent.project, taskId: parent.id, subtaskId: s.id, ownerId: parent.user_id };

    if (action === "archive" || action === "restore") {
      if (!(await canEditSubtask(db, who, s, parent))) return fail("You can only archive subtasks you can edit.", 403);
      if (action === "archive" && s.archived_at) return fail("This subtask is already archived.", 409);
      if (action === "restore" && !s.archived_at) return fail("This subtask is not archived.", 409);
      if (action === "restore" && parent.archived_at) return fail("Restore the parent task first.", 409);
      if (action === "restore" && (await db.sql`SELECT 1 FROM rexus_entity_aliases WHERE old_type = 'subtask' AND old_id = ${id}`).length)
        return fail("This subtask was converted. Open the new item instead.", 409);
      if (action === "archive") await db.sql`UPDATE subtasks SET archived_at = NOW(), archived_by = ${who.uid} WHERE id = ${id}`;
      else await db.sql`UPDATE subtasks SET archived_at = NULL, archived_by = NULL WHERE id = ${id}`;
      await logActivity(db, { ...ev, action: action === "archive" ? "archive_subtask" : "restore_subtask",
        description: `${who.username} ${action === "archive" ? "archived" : "restored"} subtask "${s.name}"` });
      return Response.json({ ok: true, id });
    }
    if (s.archived_at || parent.archived_at) return fail("This subtask is archived. Restore it first.", 409);

    if (action === "clone") {
      if (!(await canEditTask(db, who, parent))) return fail("You cannot add subtasks to this task.", 403);
      const nid = await tx(db, c => cloneSub(c, id, parent.id, who, true));
      await logActivity(db, { ...ev, subtaskId: nid, action: "clone_subtask", meta: { source_id: id }, description: `${who.username} cloned subtask "${s.name}"` });
      return Response.json({ ok: true, id: nid }, { status: 201 });
    }

    if (action === "move") {
      const dest = await loadTask(db, String(b.parent_id || ""));
      if (!dest || dest.archived_at) return fail("Choose a destination task.", 404);
      if (dest.id === parent.id) return fail("The subtask is already in that task.");
      if (!(await canEditSubtask(db, who, s, parent))) return fail("You cannot move this subtask.", 403);
      if (!(await canEditTask(db, who, dest))) return fail("You cannot add subtasks to the destination task.", 403);
      const cross = dest.user_id !== parent.user_id || dest.project !== parent.project;
      if (cross && await approvedLogs(db, { subtaskId: id })) return fail("This subtask has work logs in a closed project cost. Reopen the cost first.", 409);
      await tx(db, async c => {
        await c.query("UPDATE subtasks SET task_id = $1, user_id = $2, updated_at = NOW() WHERE id = $3", [dest.id, dest.user_id, id]);
        await c.query("UPDATE worklogs SET task_id = $1, user_id = $2 WHERE subtask_id = $3", [dest.id, dest.user_id, id]);
      });
      const meta = { from: { task_id: parent.id, project: parent.project }, to: { task_id: dest.id, project: dest.project } };
      await logActivity(db, { ...ev, taskId: dest.id, project: dest.project, ownerId: dest.user_id, action: "move_subtask", meta,
        description: `${who.username} moved subtask "${s.name}" from "${parent.task}" to "${dest.task}"` });
      await logActivity(db, { userId: who.uid, project: parent.project, taskId: parent.id, ownerId: parent.user_id, entityType: "task", entityId: parent.id,
        action: "move_subtask_out", meta, description: `${who.username} moved subtask "${s.name}" to "${dest.task}"` });
      return Response.json({ ok: true, id, parent_id: dest.id });
    }

    if (action === "convert") {
      if (String(b.to || "") !== "task") return fail("A subtask can be converted to a task.");
      if (!(await canManage(db, who, parent.user_id, parent.project))) return fail("Only a Project Manager or Admin can create tasks in this project.", 403);
      const nid = newTaskId();
      await tx(db, async c => {
        await c.query(`INSERT INTO tasks (id,user_id,task,description,project,priority,status,progress,start_date,due_date,start_time,end_time,estimated_hours,actual_hours,notes,task_type,labels,attachments,recurring,reporter,assignee_id,assignee_name,created_by,created_at,updated_at,predecessors,is_milestone)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9,'','',$10,0,'','Task',$11,$12,'',$13,$14,$15,$16,$17,NOW(),'[]',false)`,
          [nid, parent.user_id, s.name, s.description || "", parent.project, s.priority || "Medium", s.status || "Not Started", s.progress || 0, s.due_date, s.estimated_hours || 0,
           s.labels || "[]", s.attachments || "[]", s.reporter || "[]", s.assignee_id, s.assignee_name || "", s.created_by || who.username, s.created_at]);
        await c.query("UPDATE worklogs SET task_id = $1, subtask_id = NULL WHERE subtask_id = $2", [nid, id]);
        await c.query("INSERT INTO task_members (task_id, user_id) SELECT $1, user_id FROM subtask_members WHERE subtask_id = $2 ON CONFLICT DO NOTHING", [nid, id]);
        await c.query("UPDATE subtasks SET archived_at = NOW(), archived_by = $1 WHERE id = $2", [who.uid, id]);
        await addAlias(c, "subtask", id, "task", nid, parent.user_id, parent.project, who.uid);
      });
      const meta = { from: { type: "subtask", id, parent_id: parent.id }, to: { type: "task", id: nid } };
      await logActivity(db, { ...ev, action: "convert_subtask", meta, description: `${who.username} converted subtask "${s.name}" into a task` });
      await logActivity(db, { userId: who.uid, project: parent.project, taskId: nid, ownerId: parent.user_id, action: "create_task", meta,
        description: `${who.username} created task "${s.name}" from a subtask of "${parent.task}"` });
      return Response.json({ ok: true, id: nid }, { status: 201 });
    }
    return fail("Unknown action");
  } catch (e: any) {
    return fail("Server error: " + (e?.message || "unknown"), 500);
  }
};

export const config: Config = { path: "/api/work-actions" };
