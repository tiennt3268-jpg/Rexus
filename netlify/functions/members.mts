import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { getUserFromRequest, unauthorized } from "./lib/auth.mts";
import { canAccessProject, findProjectOwnerAccessibleToUser } from "./lib/collab.mts";
import { getFullUser, getEffectiveProjectRole, roleCanManage } from "./lib/rbac.mts";
import { createNotification } from "./lib/notify.mts";

function serializeMember(row: any) {
  return { id: row.id, username: row.username, full_name: row.full_name || row.username, avatar: row.avatar || "", role: row.role };
}

async function taskAccessInfo(db: any, taskId: string) {
  const rows = await db.sql`SELECT user_id, project FROM tasks WHERE id = ${taskId}`;
  return rows.length ? rows[0] : null;
}
async function subtaskAccessInfo(db: any, subtaskId: string) {
  const rows = await db.sql`
    SELECT t.user_id, t.project FROM subtasks s JOIN tasks t ON t.id = s.task_id WHERE s.id = ${subtaskId}
  `;
  return rows.length ? rows[0] : null;
}

export default async (req: Request, context: Context) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const db = getDatabase();
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);

  try {
    if (req.method === "GET") {
      const scope = url.searchParams.get("scope");
      const id = url.searchParams.get("id");
      if (!scope || !id) return Response.json({ error: "Missing scope or id" }, { status: 400 });

      if (scope === "project") {
        const ownerId = await findProjectOwnerAccessibleToUser(db, id, user.uid);
        if (!ownerId) return Response.json({ error: "Project not found or not accessible" }, { status: 404 });
        const rows = await db.sql`
          SELECT u.id, u.username, u.full_name, u.avatar, pm.role FROM project_members pm
          JOIN users u ON u.id = pm.user_id
          WHERE pm.owner_user_id = ${ownerId} AND pm.project = ${id}
          ORDER BY pm.added_at ASC
        `;
        const ownerUserRows = await db.sql`SELECT id, username, full_name, avatar FROM users WHERE id = ${ownerId}`;
        const members = ownerUserRows.length ? [serializeMember({ ...ownerUserRows[0], role: "Owner" })] : [];
        rows.forEach((r: any) => members.push(serializeMember(r)));
        return Response.json({ members });
      }

      if (scope === "task") {
        const rows = await db.sql`
          SELECT u.id, u.username, u.full_name, u.avatar FROM task_members m
          JOIN users u ON u.id = m.user_id WHERE m.task_id = ${id} ORDER BY m.added_at ASC
        `;
        return Response.json({ members: rows.map((r: any) => serializeMember(r)) });
      }

      if (scope === "subtask") {
        const rows = await db.sql`
          SELECT u.id, u.username, u.full_name, u.avatar FROM subtask_members m
          JOIN users u ON u.id = m.user_id WHERE m.subtask_id = ${id} ORDER BY m.added_at ASC
        `;
        return Response.json({ members: rows.map((r: any) => serializeMember(r)) });
      }

      return Response.json({ error: "Unknown scope" }, { status: 400 });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const scope = body.scope;
      const id = body.id;
      const targetUserId = body.user_id;
      if (!scope || !id || !targetUserId) return Response.json({ error: "Missing scope, id, or user_id" }, { status: 400 });

      if (scope === "project") {
        const ownerId = await findProjectOwnerAccessibleToUser(db, id, user.uid);
        if (!ownerId) return Response.json({ error: "Project not found or not accessible" }, { status: 404 });
        const requester = await getFullUser(db, user.uid);
        const effRole = await getEffectiveProjectRole(db, ownerId, id, user.uid, requester?.role);
        if (!roleCanManage(effRole)) {
          return Response.json({ error: "Only the project owner, a Project Manager, or Admin can add members." }, { status: 403 });
        }
        const memberRole = body.role === "Manager" ? "Manager" : "Member";
        await db.sql`
          INSERT INTO project_members (owner_user_id, project, user_id, role)
          VALUES (${ownerId}, ${id}, ${targetUserId}, ${memberRole})
          ON CONFLICT (owner_user_id, project, user_id) DO NOTHING
        `;
        if (targetUserId !== user.uid) {
          await createNotification(db, {
            userId: targetUserId, type: "member_added", title: `You were added to project "${id}"`,
            message: `${user.username} added you as a ${memberRole.toLowerCase()} of this project.`,
            entityType: "project", entityId: id, project: id
          });
        }
        return Response.json({ ok: true });
      }

      if (scope === "task") {
        const info = await taskAccessInfo(db, id);
        if (!info || !(await canAccessProject(db, info.user_id, info.project, user.uid))) {
          return Response.json({ error: "Not accessible" }, { status: 403 });
        }
        await db.sql`INSERT INTO task_members (task_id, user_id) VALUES (${id}, ${targetUserId}) ON CONFLICT (task_id, user_id) DO NOTHING`;
        if (targetUserId !== user.uid) {
          const taskRows = await db.sql`SELECT task FROM tasks WHERE id = ${id}`;
          const taskName = taskRows.length ? taskRows[0].task : id;
          await createNotification(db, {
            userId: targetUserId, type: "member_added", title: `You were added to "${taskName}"`,
            message: `${user.username} added you as a collaborator on this task.`,
            entityType: "task", entityId: id, project: info.project
          });
        }
        return Response.json({ ok: true });
      }

      if (scope === "subtask") {
        const info = await subtaskAccessInfo(db, id);
        if (!info || !(await canAccessProject(db, info.user_id, info.project, user.uid))) {
          return Response.json({ error: "Not accessible" }, { status: 403 });
        }
        await db.sql`INSERT INTO subtask_members (subtask_id, user_id) VALUES (${id}, ${targetUserId}) ON CONFLICT (subtask_id, user_id) DO NOTHING`;
        if (targetUserId !== user.uid) {
          const subtaskRows = await db.sql`SELECT name FROM subtasks WHERE id = ${id}`;
          const subtaskName = subtaskRows.length ? subtaskRows[0].name : id;
          await createNotification(db, {
            userId: targetUserId, type: "member_added", title: `You were added to "${subtaskName}"`,
            message: `${user.username} added you as a collaborator on this subtask.`,
            entityType: "subtask", entityId: id, project: info.project
          });
        }
        return Response.json({ ok: true });
      }

      return Response.json({ error: "Unknown scope" }, { status: 400 });
    }

    if (req.method === "DELETE") {
      const scope = parts[2];
      const id = parts[3] ? decodeURIComponent(parts[3]) : null;
      const targetUserId = parts[4] ? decodeURIComponent(parts[4]) : null;
      if (!scope || !id || !targetUserId) return Response.json({ error: "Missing scope, id, or user id" }, { status: 400 });

      if (scope === "project") {
        const ownerId = await findProjectOwnerAccessibleToUser(db, id, user.uid);
        if (!ownerId) return Response.json({ error: "Project not found or not accessible" }, { status: 404 });
        const requester = await getFullUser(db, user.uid);
        const effRole = await getEffectiveProjectRole(db, ownerId, id, user.uid, requester?.role);
        if (!roleCanManage(effRole)) {
          return Response.json({ error: "Only the project owner, a Project Manager, or Admin can remove members." }, { status: 403 });
        }
        await db.sql`DELETE FROM project_members WHERE owner_user_id = ${ownerId} AND project = ${id} AND user_id = ${targetUserId}`;
        return Response.json({ ok: true });
      }

      if (scope === "task") {
        const info = await taskAccessInfo(db, id);
        if (!info || !(await canAccessProject(db, info.user_id, info.project, user.uid))) {
          return Response.json({ error: "Not accessible" }, { status: 403 });
        }
        await db.sql`DELETE FROM task_members WHERE task_id = ${id} AND user_id = ${targetUserId}`;
        return Response.json({ ok: true });
      }

      if (scope === "subtask") {
        const info = await subtaskAccessInfo(db, id);
        if (!info || !(await canAccessProject(db, info.user_id, info.project, user.uid))) {
          return Response.json({ error: "Not accessible" }, { status: 403 });
        }
        await db.sql`DELETE FROM subtask_members WHERE subtask_id = ${id} AND user_id = ${targetUserId}`;
        return Response.json({ ok: true });
      }

      return Response.json({ error: "Unknown scope" }, { status: 400 });
    }

    return Response.json({ error: "Unsupported method" }, { status: 405 });
  } catch (err: any) {
    return Response.json({ error: "Server error: " + err.message }, { status: 500 });
  }
};

export const config: Config = {
  path: ["/api/members", "/api/members/*"]
};
