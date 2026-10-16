import { randomUUID } from "node:crypto";

export interface NotifyInput {
  userId: string;
  type: string; // 'assigned' | 'due_soon' | 'overdue' | 'shared'
  title: string;
  message?: string;
  entityType?: string; // 'task' | 'subtask' | 'project'
  entityId?: string;
  project?: string;
}

/** Creates one in-app notification. Never throws — a notification failure should not break the action that triggered it. */
export async function createNotification(db: any, input: NotifyInput): Promise<void> {
  if (!input.userId) return;
  try {
    const id = "N" + randomUUID().slice(0, 10).toUpperCase();
    await db.sql`
      INSERT INTO notifications (id, user_id, type, title, message, entity_type, entity_id, project)
      VALUES (${id}, ${input.userId}, ${input.type}, ${input.title}, ${input.message || ""}, ${input.entityType || ""}, ${input.entityId || ""}, ${input.project || ""})
    `;
  } catch {
    // best-effort
  }
}
