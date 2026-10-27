import { logAudit } from "./rexus-audit.mts";
import { randomUUID } from "node:crypto";

/* v2.3.5 LOG-01: every server-side change writes one timeline event.
   ownerId + project identify the project (names are unique per owner only); taskId / subtaskId the item;
   meta carries the changed fields ({changes:[{field, from, to}]}) or source/destination of a move/convert.
   Events are append-only: there is no API to edit or delete them. */
export async function logActivity(db: any, params: {
  userId: string;
  project?: string | null;
  taskId?: string | null;
  subtaskId?: string | null;
  ownerId?: string | null;
  entityType?: "project" | "task" | "subtask" | null;
  entityId?: string | null;
  action: string;
  description: string;
  meta?: Record<string, unknown> | null;
}) {
  try {
    const id = "A" + randomUUID().replace(/-/g, "").slice(0, 15).toUpperCase();
    const now = new Date().toISOString();
    let owner = params.ownerId || null;
    let taskId = params.taskId || null;
    if (!taskId && params.subtaskId) taskId = (await db.sql`SELECT task_id FROM subtasks WHERE id = ${params.subtaskId}`)[0]?.task_id || null;
    if (!owner && taskId) owner = (await db.sql`SELECT user_id FROM tasks WHERE id = ${taskId}`)[0]?.user_id || null;
    const entityType = params.entityType || (params.subtaskId ? "subtask" : taskId ? "task" : "project");
    const entityId = params.entityId || params.subtaskId || taskId || (owner && params.project ? owner + "::" + params.project : params.project || null);
    const meta = params.meta ? JSON.stringify(params.meta).slice(0, 8000) : null;
    await db.sql`
      INSERT INTO activity_log (id, user_id, project, task_id, subtask_id, owner_id, entity_type, entity_id, action, description, meta, created_at)
      VALUES (${id}, ${params.userId}, ${params.project || null}, ${taskId}, ${params.subtaskId || null}, ${owner},
        ${entityType}, ${entityId}, ${params.action}, ${params.description}, ${meta}::jsonb, ${now})
    `;
    // Mirror the existing server-authored work events into the unified trail.
    await logAudit(db, { actorId: params.userId, actorName: params.userId,
      action: params.action, entityType, entityId: entityId || "", summary: params.description });
  } catch {
    // Activity logging must never break the action it's describing.
  }
}

/** Field-level differences for the timeline. Long text fields record only that they changed. */
const QUIET = new Set(["description", "notes"]);
export function changedFields(before: any, after: any, fields: string[]) {
  const norm = (v: any) => v instanceof Date ? v.toISOString().slice(0, 10) : (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
  const out: { field: string; from?: string; to?: string }[] = [];
  for (const f of fields) {
    if (!(f in after)) continue;
    const a = norm(before[f]), b = norm(after[f]);
    if (a === b) continue;
    out.push(QUIET.has(f) ? { field: f } : { field: f, from: a.slice(0, 120), to: b.slice(0, 120) });
  }
  return out;
}
