import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { randomUUID } from "node:crypto";
import { getUserFromRequest, unauthorized } from "./lib/auth.mts";
import { getFullUser, isSystemAdmin, getEffectiveProjectRole, roleCanManage } from "./lib/rbac.mts";
import { findProjectOwnerAccessibleToUser } from "./lib/collab.mts";
import { logActivity } from "./lib/activity-log.mts";
import { createNotification } from "./lib/notify.mts";

async function logStatusChange(db: any, params: {
  worklogId: string; action: "close" | "reopen"; fromStatus: string; toStatus: string;
  projectOwnerId: string; projectName: string; actorUserId: string; reason?: string;
}) {
  const id = "WSL" + randomUUID().slice(0, 8).toUpperCase();
  await db.sql`
    INSERT INTO worklog_status_log (id, worklog_id, action, from_status, to_status, project_owner_id, project_name, actor_user_id, reason)
    VALUES (${id}, ${params.worklogId}, ${params.action}, ${params.fromStatus}, ${params.toStatus},
      ${params.projectOwnerId}, ${params.projectName}, ${params.actorUserId}, ${params.reason || ""})
  `;
}

// "Chốt chi phí dự án" (close) and "Mở lại" (reopen) — the two actions
// that move work-log lines between submitted and approved. Both are
// scoped to a single project and require the caller to manage it
// (owner/Manager of that project, or System Admin); reopening is
// further restricted to System Admin only, per the access table in
// the spec, and always requires a reason for the audit trail.
export default async (req: Request, context: Context) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();
  if (req.method !== "POST") return Response.json({ error: "Unsupported method" }, { status: 405 });

  const db = getDatabase();
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean); // ["api","cost-approvals","close"|"reopen"]
  const action = parts[2];

  try {
    const requester = await getFullUser(db, user.uid);

    if (action === "close") {
      const body = await req.json();
      const projectName = body.project;
      if (!projectName) return Response.json({ error: "Missing project" }, { status: 400 });
      const ownerId = await findProjectOwnerAccessibleToUser(db, projectName, user.uid);
      if (!ownerId) return Response.json({ error: "Project not found or not accessible." }, { status: 404 });

      const effRole = await getEffectiveProjectRole(db, ownerId, projectName, user.uid, requester?.role);
      if (!roleCanManage(effRole)) {
        return Response.json({ error: "Only the project's Manager/Owner or a System Admin can close its costs." }, { status: 403 });
      }

      const rows = await db.sql`
        SELECT l.id FROM worklogs l
        JOIN tasks t ON t.id = l.task_id
        WHERE t.user_id = ${ownerId} AND t.project = ${projectName} AND l.status = 'submitted'
      `;
      if (!rows.length) {
        return Response.json({ closed: 0, message: "No submitted log entries to close." });
      }
      const ids: string[] = rows.map((r: any) => r.id);
      await db.sql`UPDATE worklogs SET status = 'approved' WHERE id = ANY(${ids})`;
      for (const wid of ids) {
        await logStatusChange(db, {
          worklogId: wid, action: "close", fromStatus: "submitted", toStatus: "approved",
          projectOwnerId: ownerId, projectName, actorUserId: user.uid
        });
      }
      await logActivity(db, {
        userId: user.uid, project: projectName, action: "close_project_costs",
        description: `${user.username} closed costs for project "${projectName}" (${ids.length} log ${ids.length === 1 ? "entry" : "entries"} approved)`
      });
      const loggerRows = await db.sql`SELECT DISTINCT logged_by FROM worklogs WHERE id = ANY(${ids})`;
      for (const r of loggerRows) {
        if (!r.logged_by || r.logged_by === user.uid) continue;
        await createNotification(db, {
          userId: r.logged_by, type: "cost_approval", title: `Costs closed for "${projectName}"`,
          message: `${user.username} approved your logged hours on this project.`, entityType: "project", entityId: projectName, project: projectName
        });
      }
      return Response.json({ closed: ids.length });
    }

    if (action === "reopen") {
      if (!isSystemAdmin(requester)) {
        return Response.json({ error: "Only a System Admin can reopen approved log entries." }, { status: 403 });
      }
      const body = await req.json();
      const worklogIds: string[] = Array.isArray(body.worklog_ids) ? body.worklog_ids : (body.worklog_id ? [body.worklog_id] : []);
      const reason = (body.reason || "").trim();
      if (!worklogIds.length) return Response.json({ error: "Missing worklog_ids" }, { status: 400 });
      if (!reason) return Response.json({ error: "A reason is required to reopen a closed log entry." }, { status: 400 });

      const rows = await db.sql`
        SELECT l.id, l.status, t.user_id AS project_owner_id, t.project AS project_name
        FROM worklogs l JOIN tasks t ON t.id = l.task_id
        WHERE l.id = ANY(${worklogIds})
      `;
      const approvedIds = rows.filter((r: any) => r.status === "approved").map((r: any) => r.id);
      if (!approvedIds.length) {
        return Response.json({ reopened: 0, message: "None of the selected entries are currently approved." });
      }
      await db.sql`UPDATE worklogs SET status = 'submitted' WHERE id = ANY(${approvedIds})`;
      for (const r of rows) {
        if (r.status !== "approved") continue;
        await logStatusChange(db, {
          worklogId: r.id, action: "reopen", fromStatus: "approved", toStatus: "submitted",
          projectOwnerId: r.project_owner_id, projectName: r.project_name, actorUserId: user.uid, reason
        });
      }
      const projectsTouched = Array.from(new Set(rows.map((r: any) => r.project_name))).join(", ");
      await logActivity(db, {
        userId: user.uid, project: projectsTouched || null, action: "reopen_log_entries",
        description: `${user.username} reopened ${approvedIds.length} log ${approvedIds.length === 1 ? "entry" : "entries"} (reason: ${reason})`
      });
      const reopenedLoggerRows = await db.sql`SELECT DISTINCT w.logged_by AS logged_by, t.project AS project_name FROM worklogs w JOIN tasks t ON t.id = w.task_id WHERE w.id = ANY(${approvedIds})`;
      for (const r of reopenedLoggerRows as any[]) {
        if (!r.logged_by || r.logged_by === user.uid) continue;
        await createNotification(db, {
          userId: r.logged_by, type: "cost_approval", title: `Costs reopened for "${r.project_name}"`,
          message: `${user.username} reopened previously approved hours (reason: ${reason}).`, entityType: "project", entityId: r.project_name, project: r.project_name
        });
      }
      return Response.json({ reopened: approvedIds.length });
    }

    return Response.json({ error: "Unknown action" }, { status: 404 });
  } catch (err: any) {
    return Response.json({ error: "Server error: " + err.message }, { status: 500 });
  }
};

export const config: Config = {
  path: ["/api/cost-approvals/*"]
};
