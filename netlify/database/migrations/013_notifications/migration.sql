-- ============================================================
-- In-app notifications: new assignment, due/overdue reminders,
-- and being shared a task/project.
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT DEFAULT '',
  entity_type TEXT DEFAULT '',
  entity_id TEXT DEFAULT '',
  project TEXT DEFAULT '',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read_at);

-- Tracks the last calendar day a due/overdue reminder was sent for a
-- task or subtask, so the daily reminder check never double-sends.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_notified_at DATE;
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS due_notified_at DATE;
