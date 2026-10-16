import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { getUserFromRequest, unauthorized } from "./lib/auth.mts";
import { logActivity } from "./lib/activity-log.mts";
import { getFullUser, isManagerOrAdmin, getEffectiveProjectRole, roleCanManage } from "./lib/rbac.mts";
import { findProjectOwnerAccessibleToUser } from "./lib/collab.mts";
import { createNotification } from "./lib/notify.mts";

async function notifyProjectMembers(db: any, ownerId: string, projectName: string, actorId: string, actorUsername: string, title: string, message: string) {
  const memberRows = await db.sql`SELECT user_id FROM project_members WHERE owner_user_id = ${ownerId} AND project = ${projectName}`;
  const targets = new Set<string>(memberRows.map((r: any) => r.user_id));
  if (ownerId !== actorId) targets.add(ownerId);
  targets.delete(actorId);
  for (const uid of targets) {
    await createNotification(db, { userId: uid, type: "project", title, message, entityType: "project", entityId: projectName, project: projectName });
  }
}

function toDateStr(v: any) {
  if (!v) return "";
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

function serializeProject(r: any, myRole: string) {
  return {
    name: r.name,
    deadline: toDateStr(r.deadline),
    start_date: toDateStr(r.start_date),
    description: r.description || "",
    attachments: parseJsonArray(r.attachments),
    status: r.status || "Active",
    owner: r.owner || "Me",
    owner_id: r.owner_id || r.user_id,
    members: parseJsonArray(r.members),
    my_role: myRole,
    view_only: myRole === "Shared",
    gantt_enabled: !!r.gantt_enabled,
    gantt_auto_schedule: false,
    workflow_notifications_enabled: !!r.workflow_notifications_enabled,
    budget_currency: r.budget_currency || "VND",
    budget: r.budget == null ? null : Number(r.budget)
  };
}

export default async (req: Request, context: Context) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const db = getDatabase();
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const name = parts[2] ? decodeURIComponent(parts[2]) : null;

  try {
    if (req.method === "GET") {
      const ownRows = await db.sql`SELECT * FROM projects WHERE user_id = ${user.uid} ORDER BY name ASC`;
      const memberRows = await db.sql`
        SELECT p.* FROM project_members pm
        JOIN projects p ON p.user_id = pm.owner_user_id AND p.name = pm.project
        WHERE pm.user_id = ${user.uid}
        ORDER BY p.name ASC
      `;
      const sharedRows = await db.sql`
        SELECT p.* FROM shares sh
        JOIN projects p ON (p.user_id || '::' || p.name) = sh.entity_id
        WHERE sh.entity_type = 'project' AND sh.shared_with_user_id = ${user.uid}
        ORDER BY p.name ASC
      `;
      const memberNames = new Set(memberRows.map((r: any) => r.user_id + "::" + r.name));
      const projects = ownRows.map((r: any) => serializeProject(r, "Owner"))
        .concat(memberRows.map((r: any) => serializeProject(r, "Member")))
        .concat(sharedRows.filter((r: any) => !memberNames.has(r.user_id + "::" + r.name) && r.user_id !== user.uid)
          .map((r: any) => serializeProject(r, "Shared")));
      return Response.json({ projects });
    }

    if (req.method === "POST") {
      const requester = await getFullUser(db, user.uid);
      if (!isManagerOrAdmin(requester)) {
        return Response.json({ error: "Only a System Admin or Project Manager can create projects." }, { status: 403 });
      }
      const body = await req.json();
      const p = body.project || body;
      await db.sql`
        INSERT INTO projects (user_id, owner_id, name, deadline, start_date, description, attachments, status, owner, members, gantt_enabled, gantt_auto_schedule, budget, workflow_notifications_enabled)
        VALUES (${user.uid}, ${user.uid}, ${p.name}, ${p.deadline || null}, ${p.start_date || null},
          ${p.description || ""}, ${toJsonArrayText(p.attachments)}, ${p.status || "Active"}, ${p.owner || user.username}, ${toJsonArrayText(p.members)},
          ${!!p.gantt_enabled}, ${false}, ${p.budget != null ? p.budget : null}, ${!!p.workflow_notifications_enabled})
        ON CONFLICT (user_id, name) DO UPDATE SET
          deadline = EXCLUDED.deadline, start_date = EXCLUDED.start_date,
          description = EXCLUDED.description, attachments = EXCLUDED.attachments, status = EXCLUDED.status,
          owner = EXCLUDED.owner, members = EXCLUDED.members,
          gantt_enabled = EXCLUDED.gantt_enabled, gantt_auto_schedule = EXCLUDED.gantt_auto_schedule,
          budget = EXCLUDED.budget, workflow_notifications_enabled = EXCLUDED.workflow_notifications_enabled
      `;
      await logActivity(db, { userId: user.uid, project: p.name, action: "create_project", description: `${user.username} created project "${p.name}"` });
      const rows = await db.sql`SELECT * FROM projects WHERE user_id = ${user.uid} AND name = ${p.name}`;
      return Response.json(serializeProject(rows[0], "Owner"));
    }

    if (req.method === "PUT") {
      if (!name) return Response.json({ error: "Missing project name" }, { status: 400 });
      const patch = await req.json();
      const ownerId = await findProjectOwnerAccessibleToUser(db, name, user.uid);

      if (!ownerId) {
        const anyRows = await db.sql`SELECT 1 FROM projects WHERE name = ${name} LIMIT 1`;
        if (anyRows.length) {
          return Response.json({ error: "You do not have access to this project." }, { status: 403 });
        }
        // Genuinely new project name — create it, owned by the requester.
        const requester = await getFullUser(db, user.uid);
        if (!isManagerOrAdmin(requester)) {
          return Response.json({ error: "Only a System Admin or Project Manager can create projects." }, { status: 403 });
        }
        await db.sql`
          INSERT INTO projects (user_id, owner_id, name, deadline, start_date, description, attachments, status, owner, members, gantt_enabled, gantt_auto_schedule, budget, workflow_notifications_enabled)
          VALUES (${user.uid}, ${user.uid}, ${patch.name || name}, ${patch.deadline || null}, ${patch.start_date || null},
            ${patch.description || ""}, ${toJsonArrayText(patch.attachments)}, ${patch.status || "Active"}, ${patch.owner || user.username}, ${toJsonArrayText(patch.members)},
            ${!!patch.gantt_enabled}, ${false}, ${patch.budget != null ? patch.budget : null}, ${!!patch.workflow_notifications_enabled})
        `;
        const finalRows = await db.sql`SELECT * FROM projects WHERE user_id = ${user.uid} AND name = ${patch.name || name}`;
        return Response.json(serializeProject(finalRows[0], "Owner"));
      }

      const rows = await db.sql`SELECT * FROM projects WHERE user_id = ${ownerId} AND name = ${name}`;
      if (!rows.length) return Response.json({ error: "Project not found" }, { status: 404 });
      const current = rows[0];

      const requester = await getFullUser(db, user.uid);
      const effRole = await getEffectiveProjectRole(db, ownerId, name, user.uid, requester?.role);
      if (!roleCanManage(effRole)) {
        return Response.json({ error: "Only the project owner, a Project Manager, or Admin can edit this project." }, { status: 403 });
      }

      const merged: any = { ...current, ...patch };
      const newName = merged.name || name;

      await db.sql`
        UPDATE projects SET
          name = ${newName},
          deadline = ${merged.deadline || null},
          start_date = ${merged.start_date || null},
          description = ${merged.description || ""},
          attachments = ${toJsonArrayText(merged.attachments)},
          status = ${merged.status || "Active"},
          owner = ${merged.owner || user.username},
          members = ${toJsonArrayText(merged.members)},
          gantt_enabled = ${!!merged.gantt_enabled},
          gantt_auto_schedule = false, workflow_notifications_enabled = ${!!merged.workflow_notifications_enabled},
          budget = ${merged.budget != null ? merged.budget : null}
        WHERE user_id = ${ownerId} AND name = ${name}
      `;
      if (newName !== name) {
        await db.sql`UPDATE tasks SET project = ${newName} WHERE user_id = ${ownerId} AND project = ${name}`;
        await db.sql`UPDATE project_members SET project = ${newName} WHERE owner_user_id = ${ownerId} AND project = ${name}`;
      }
      await logActivity(db, { userId: user.uid, project: newName, action: "update_project", description: `${user.username} updated project "${newName}"` });
      await notifyProjectMembers(db, ownerId, newName, user.uid, user.username,
        `Project "${newName}" was updated`, `${user.username} updated this project's details.`);
      const finalRows = await db.sql`SELECT * FROM projects WHERE user_id = ${ownerId} AND name = ${newName}`;
      return Response.json(serializeProject(finalRows[0], ownerId === user.uid ? "Owner" : "Member"));
    }

    if (req.method === "DELETE") {
      if (!name) return Response.json({ error: "Missing project name" }, { status: 400 });
      const memberRows = await db.sql`SELECT user_id FROM project_members WHERE owner_user_id = ${user.uid} AND project = ${name}`;
      await db.sql`DELETE FROM projects WHERE user_id = ${user.uid} AND name = ${name}`;
      await db.sql`DELETE FROM project_members WHERE owner_user_id = ${user.uid} AND project = ${name}`;
      await logActivity(db, { userId: user.uid, project: name, action: "delete_project", description: `${user.username} deleted project "${name}"` });
      for (const r of memberRows) {
        if (r.user_id === user.uid) continue;
        await createNotification(db, {
          userId: r.user_id, type: "deleted", title: `Project "${name}" was deleted`,
          message: `${user.username} deleted this project.`, entityType: "project", entityId: "", project: name
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
  path: ["/api/projects", "/api/projects/*"]
};
