import type { Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { createNotification } from "./lib/notify.mts";

// Runs once a day. Notifies the assignee (falling back to the task/subtask
// owner) when a task is due tomorrow, or is overdue, at most once per
// calendar day per item (tracked via due_notified_at).
export default async () => {
  const db = getDatabase();
  const notifiableStatuses = ["Not Started", "In Progress", "Review", "Urgent"];

  const dueTasks = await db.sql`
    SELECT * FROM tasks
    WHERE due_date IS NOT NULL
      AND status = ANY(${notifiableStatuses})
      AND (due_notified_at IS NULL OR due_notified_at <> CURRENT_DATE)
      AND due_date <= (CURRENT_DATE + INTERVAL '1 day')
  `;
  for (const t of dueTasks) {
    const recipient = t.assignee_id || t.user_id;
    const isOverdue = new Date(t.due_date) < new Date(new Date().toDateString());
    await createNotification(db, {
      userId: recipient,
      type: isOverdue ? "overdue" : "due_soon",
      title: isOverdue ? `"${t.task}" is overdue` : `"${t.task}" is due tomorrow`,
      message: isOverdue ? "This task's due date has passed." : "This task is due tomorrow.",
      entityType: "task", entityId: t.id, project: t.project
    });
    await db.sql`UPDATE tasks SET due_notified_at = CURRENT_DATE WHERE id = ${t.id}`;
  }

  const dueSubtasks = await db.sql`
    SELECT s.*, t.project AS parent_project FROM subtasks s
    JOIN tasks t ON t.id = s.task_id
    WHERE s.due_date IS NOT NULL
      AND s.status = ANY(${notifiableStatuses})
      AND (s.due_notified_at IS NULL OR s.due_notified_at <> CURRENT_DATE)
      AND s.due_date <= (CURRENT_DATE + INTERVAL '1 day')
  `;
  for (const s of dueSubtasks) {
    const recipient = s.assignee_id || s.user_id;
    const isOverdue = new Date(s.due_date) < new Date(new Date().toDateString());
    await createNotification(db, {
      userId: recipient,
      type: isOverdue ? "overdue" : "due_soon",
      title: isOverdue ? `"${s.name}" is overdue` : `"${s.name}" is due tomorrow`,
      message: isOverdue ? "This subtask's due date has passed." : "This subtask is due tomorrow.",
      entityType: "subtask", entityId: s.id, project: s.parent_project
    });
    await db.sql`UPDATE subtasks SET due_notified_at = CURRENT_DATE WHERE id = ${s.id}`;
  }

  return new Response("ok");
};

export const config: Config = {
  schedule: "0 0 * * *"
};
