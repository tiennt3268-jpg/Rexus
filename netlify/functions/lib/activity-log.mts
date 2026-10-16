import { logAudit } from "./rexus-audit.mts";
import { randomUUID } from "node:crypto";

export async function logActivity(db: any, params: {
  userId: string;
  project?: string | null;
  taskId?: string | null;
  action: string;
  description: string;
}) {
  try {
    const id = "A" + randomUUID().slice(0, 8).toUpperCase();
    const now = new Date().toISOString();
    await db.sql`
      INSERT INTO activity_log (id, user_id, project, task_id, action, description, created_at)
      VALUES (${id}, ${params.userId}, ${params.project || null}, ${params.taskId || null}, ${params.action}, ${params.description}, ${now})
    `;
    // Mirror the existing server-authored work events into the unified trail.
    await logAudit(db, { actorId: params.userId, actorName: params.userId,
      action: params.action, entityType: params.taskId ? 'task' : (params.project ? 'project' : 'work'),
      entityId: params.taskId || params.project || '', summary: params.description });
  } catch {
    // Activity logging must never break the action it's describing.
  }
}
