import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { randomUUID } from "node:crypto";
import { getUserFromRequest, unauthorized } from "./lib/auth.mts";
import { canAccessProject, findProjectOwnerAccessibleToUser } from "./lib/collab.mts";
import { getFullUser, getEffectiveProjectRole, roleCanManage } from "./lib/rbac.mts";
import { logActivity } from "./lib/activity-log.mts";
import { createNotification } from "./lib/notify.mts";

type Scope = "task" | "subtask" | "project";

function serializeComment(row: any) {
  return {
    id: row.id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    author_id: row.author_id || "",
    author_name: row.author_name || row.author_username || "Deleted user",
    author_avatar: row.author_avatar || "",
    body: row.body,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
  };
}

async function taskInfo(db: any, taskId: string) {
  const rows = await db.sql`SELECT id, task, user_id, project, assignee_id FROM tasks WHERE id = ${taskId}`;
  return rows.length ? rows[0] : null;
}
async function subtaskInfo(db: any, subtaskId: string) {
  const rows = await db.sql`SELECT id, name, user_id, task_id, assignee_id FROM subtasks WHERE id = ${subtaskId}`;
  return rows.length ? rows[0] : null;
}

/**
 * Resolves a {scope, id} pair (as used by /api/shares) into the storage
 * entity_id, the owning project (for access checks, notifications and
 * activity logging), a human label, and the set of people to notify on a
 * new comment (everyone with a stake in the item, minus the author).
 */
async function resolveEntity(db: any, scope: Scope, id: string, requestingUserId: string) {
  if (scope === "task") {
    const t = await taskInfo(db, id);
    if (!t) return { error: "Task not found" };
    if (!(await canAccessProject(db, t.user_id, t.project, requestingUserId))) {
      return { error: "You do not have access to this task." };
    }
    const members = await db.sql`SELECT user_id FROM task_members WHERE task_id = ${id}`;
    const participantIds = new Set<string>([t.user_id, t.assignee_id, ...members.map((m: any) => m.user_id)].filter(Boolean));
    return { entityId: id, ownerId: t.user_id, project: t.project, label: t.task, participantIds };
  }
  if (scope === "subtask") {
    const s = await subtaskInfo(db, id);
    if (!s) return { error: "Subtask not found" };
    const t = await taskInfo(db, s.task_id);
    if (!t) return { error: "Parent task not found" };
    if (!(await canAccessProject(db, t.user_id, t.project, requestingUserId))) {
      return { error: "You do not have access to this subtask." };
    }
    const members = await db.sql`SELECT user_id FROM subtask_members WHERE subtask_id = ${id}`;
    const participantIds = new Set<string>([t.user_id, t.assignee_id, s.assignee_id, ...members.map((m: any) => m.user_id)].filter(Boolean));
    return { entityId: id, ownerId: t.user_id, project: t.project, label: s.name, participantIds };
  }
  if (scope === "project") {
    const ownerId = await findProjectOwnerAccessibleToUser(db, id, requestingUserId);
    if (!ownerId) return { error: "Project not found or not accessible" };
    const members = await db.sql`SELECT user_id FROM project_members WHERE owner_user_id = ${ownerId} AND project = ${id}`;
    const participantIds = new Set<string>([ownerId, ...members.map((m: any) => m.user_id)].filter(Boolean));
    return { entityId: ownerId + "::" + id, ownerId, project: id, label: id, participantIds };
  }
  return { error: "Unknown scope" };
}

export default async (req: Request, context: Context) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const db = getDatabase();
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean); // ["api","comments", id?]

  try {
    if (req.method === "GET") {
      const scope = url.searchParams.get("scope") as Scope | null;
      const id = url.searchParams.get("id");
      if (!scope || !id) return Response.json({ error: "Missing scope or id" }, { status: 400 });

      const resolved = await resolveEntity(db, scope, id, user.uid);
      if (resolved.error) return Response.json({ error: resolved.error }, { status: resolved.error.indexOf("access") !== -1 ? 403 : 404 });

      const rows = await db.sql`
        SELECT c.*, u.full_name AS author_name, u.username AS author_username, u.avatar AS author_avatar
        FROM comments c
        LEFT JOIN users u ON u.id = c.author_id
        WHERE c.entity_type = ${scope} AND c.entity_id = ${resolved.entityId}
        ORDER BY c.created_at ASC
      `;
      return Response.json({ comments: rows.map(serializeComment) });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const scope = body.scope as Scope;
      const id = body.id;
      const text = String(body.body || "").trim();
      if (!scope || !id) return Response.json({ error: "Missing scope or id" }, { status: 400 });
      if (!text) return Response.json({ error: "Comment can't be empty." }, { status: 400 });
      if (text.length > 4000) return Response.json({ error: "Comment is too long (4000 characters max)." }, { status: 400 });

      const resolved = await resolveEntity(db, scope, id, user.uid);
      if (resolved.error) return Response.json({ error: resolved.error }, { status: resolved.error.indexOf("access") !== -1 ? 403 : 404 });

      const commentId = "C" + randomUUID().slice(0, 10).toUpperCase();
      await db.sql`
        INSERT INTO comments (id, entity_type, entity_id, author_id, body)
        VALUES (${commentId}, ${scope}, ${resolved.entityId}, ${user.uid}, ${text})
      `;

      await logActivity(db, {
        userId: user.uid, project: resolved.project || "",
        taskId: scope === "task" ? id : null, subtaskId: scope === "subtask" ? id : null, ownerId: resolved.ownerId,
        meta: { comment_id: commentId, excerpt: text.slice(0, 160) },
        action: "comment",
        description: `${user.username} commented on ${scope} "${resolved.label}"`
      });

      const snippet = text.length > 120 ? text.slice(0, 117) + "…" : text;
      const notifyTargets = Array.from(resolved.participantIds || []).filter((uid: any) => uid && uid !== user.uid);
      for (const targetId of notifyTargets) {
        await createNotification(db, {
          userId: targetId as string, type: "comment",
          title: `${user.username} commented on ${scope === "project" ? "project" : scope} "${resolved.label}"`,
          message: snippet, entityType: scope, entityId: id, project: resolved.project || ""
        });
      }

      const rows = await db.sql`
        SELECT c.*, u.full_name AS author_name, u.username AS author_username, u.avatar AS author_avatar
        FROM comments c LEFT JOIN users u ON u.id = c.author_id WHERE c.id = ${commentId}
      `;
      return Response.json(serializeComment(rows[0]));
    }

    if (req.method === "DELETE") {
      const commentId = parts[2] ? decodeURIComponent(parts[2]) : null;
      if (!commentId) return Response.json({ error: "Missing comment id" }, { status: 400 });

      const rows = await db.sql`SELECT * FROM comments WHERE id = ${commentId}`;
      if (!rows.length) return Response.json({ error: "Comment not found" }, { status: 404 });
      const comment = rows[0];

      if (comment.author_id !== user.uid) {
        // Not the author — only someone who can manage this project (owner,
        // Project Manager on it, or System Admin) may remove someone else's
        // comment (moderation).
        const scope = comment.entity_type as Scope;
        const originalId = scope === "project" ? String(comment.entity_id).split("::").slice(1).join("::") : comment.entity_id;
        const resolved = await resolveEntity(db, scope, originalId, user.uid);
        if (resolved.error) return Response.json({ error: resolved.error }, { status: 403 });
        const requester = await getFullUser(db, user.uid);
        const effRole = await getEffectiveProjectRole(db, resolved.ownerId, resolved.project, user.uid, requester?.role);
        if (!roleCanManage(effRole)) {
          return Response.json({ error: "You can only delete your own comments." }, { status: 403 });
        }
      }

      await db.sql`DELETE FROM comments WHERE id = ${commentId}`;
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unsupported method" }, { status: 405 });
  } catch (err: any) {
    return Response.json({ error: "Server error: " + err.message }, { status: 500 });
  }
};

export const config: Config = {
  path: ["/api/comments", "/api/comments/*"]
};
