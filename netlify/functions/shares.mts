import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { randomUUID } from "node:crypto";
import { getUserFromRequest, unauthorized } from "./lib/auth.mts";
import { canAccessProject, findProjectOwnerAccessibleToUser } from "./lib/collab.mts";
import { getFullUser, getEffectiveProjectRole, roleCanManage } from "./lib/rbac.mts";
import { logActivity } from "./lib/activity-log.mts";
import { createNotification } from "./lib/notify.mts";

function serializeShareUser(row: any) {
  return { id: row.id, username: row.username, full_name: row.full_name || row.username, avatar: row.avatar || "" };
}

async function taskAccessInfo(db: any, taskId: string) {
  const rows = await db.sql`SELECT id, task, user_id, project FROM tasks WHERE id = ${taskId}`;
  return rows.length ? rows[0] : null;
}

export default async (req: Request, context: Context) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const db = getDatabase();
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean); // ["api","shares", scope?, id?, userId?]

  try {
    if (req.method === "GET") {
      const scope = url.searchParams.get("scope");
      const id = url.searchParams.get("id");
      if (!scope || !id) return Response.json({ error: "Missing scope or id" }, { status: 400 });

      let entityId: string | null = null;
      if (scope === "task") {
        const info = await taskAccessInfo(db, id);
        if (!info || !(await canAccessProject(db, info.user_id, info.project, user.uid))) {
          return Response.json({ error: "Not accessible" }, { status: 403 });
        }
        entityId = id;
      } else if (scope === "project") {
        const ownerId = await findProjectOwnerAccessibleToUser(db, id, user.uid);
        if (!ownerId) return Response.json({ error: "Project not found or not accessible" }, { status: 404 });
        entityId = ownerId + "::" + id;
      } else {
        return Response.json({ error: "Unknown scope" }, { status: 400 });
      }

      const rows = await db.sql`
        SELECT u.id, u.username, u.full_name, u.avatar FROM shares sh
        JOIN users u ON u.id = sh.shared_with_user_id
        WHERE sh.entity_type = ${scope} AND sh.entity_id = ${entityId}
        ORDER BY sh.created_at ASC
      `;
      return Response.json({ shares: rows.map(serializeShareUser) });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const scope = body.scope;
      const id = body.id;
      const targetUserId = body.user_id;
      if (!scope || !id || !targetUserId) return Response.json({ error: "Missing scope, id, or user_id" }, { status: 400 });

      let entityId: string | null = null;
      let projectForLog = "";
      if (scope === "task") {
        const info = await taskAccessInfo(db, id);
        if (!info) return Response.json({ error: "Task not found" }, { status: 404 });
        const requester = await getFullUser(db, user.uid);
        const effRole = await getEffectiveProjectRole(db, info.user_id, info.project, user.uid, requester?.role);
        if (!roleCanManage(effRole)) {
          return Response.json({ error: "Only the owner, a Project Manager, or Admin can share this task." }, { status: 403 });
        }
        entityId = id;
        projectForLog = info.project;
      } else if (scope === "project") {
        const ownerId = await findProjectOwnerAccessibleToUser(db, id, user.uid);
        if (!ownerId) return Response.json({ error: "Project not found or not accessible" }, { status: 404 });
        const requester = await getFullUser(db, user.uid);
        const effRole = await getEffectiveProjectRole(db, ownerId, id, user.uid, requester?.role);
        if (!roleCanManage(effRole)) {
          return Response.json({ error: "Only the owner, a Project Manager, or Admin can share this project." }, { status: 403 });
        }
        entityId = ownerId + "::" + id;
        projectForLog = id;
      } else {
        return Response.json({ error: "Unknown scope" }, { status: 400 });
      }

      const shareId = "SH" + randomUUID().slice(0, 8).toUpperCase();
      await db.sql`
        INSERT INTO shares (id, entity_type, entity_id, shared_with_user_id, shared_by)
        VALUES (${shareId}, ${scope}, ${entityId}, ${targetUserId}, ${user.uid})
        ON CONFLICT (entity_type, entity_id, shared_with_user_id) DO NOTHING
      `;
      await logActivity(db, {
        userId: user.uid, project: projectForLog, action: "share",
        description: `${user.username} shared a ${scope} with another user`
      });
      if (targetUserId !== user.uid) {
        const label = scope === "task" ? (await taskAccessInfo(db, id))?.task || id : id;
        await createNotification(db, {
          userId: targetUserId, type: "shared", title: `${user.username} shared "${label}" with you`,
          message: `You now have view-only access to this ${scope}.`, entityType: scope, entityId: id, project: projectForLog
        });
      }
      return Response.json({ ok: true });
    }

    if (req.method === "DELETE") {
      const scope = parts[2];
      const id = parts[3] ? decodeURIComponent(parts[3]) : null;
      const targetUserId = parts[4] ? decodeURIComponent(parts[4]) : null;
      if (!scope || !id || !targetUserId) return Response.json({ error: "Missing scope, id, or user id" }, { status: 400 });

      let entityId: string | null = null;
      if (scope === "task") {
        const info = await taskAccessInfo(db, id);
        if (!info) return Response.json({ error: "Task not found" }, { status: 404 });
        const requester = await getFullUser(db, user.uid);
        const effRole = await getEffectiveProjectRole(db, info.user_id, info.project, user.uid, requester?.role);
        if (!roleCanManage(effRole)) {
          return Response.json({ error: "Only the owner, a Project Manager, or Admin can unshare this task." }, { status: 403 });
        }
        entityId = id;
      } else if (scope === "project") {
        const ownerId = await findProjectOwnerAccessibleToUser(db, id, user.uid);
        if (!ownerId) return Response.json({ error: "Project not found or not accessible" }, { status: 404 });
        const requester = await getFullUser(db, user.uid);
        const effRole = await getEffectiveProjectRole(db, ownerId, id, user.uid, requester?.role);
        if (!roleCanManage(effRole)) {
          return Response.json({ error: "Only the owner, a Project Manager, or Admin can unshare this project." }, { status: 403 });
        }
        entityId = ownerId + "::" + id;
      } else {
        return Response.json({ error: "Unknown scope" }, { status: 400 });
      }

      await db.sql`DELETE FROM shares WHERE entity_type = ${scope} AND entity_id = ${entityId} AND shared_with_user_id = ${targetUserId}`;
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unsupported method" }, { status: 405 });
  } catch (err: any) {
    return Response.json({ error: "Server error: " + err.message }, { status: 500 });
  }
};

export const config: Config = {
  path: ["/api/shares", "/api/shares/*"]
};
