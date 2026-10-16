-- ============================================================
-- Notifications: "mark as important" (starred) flag, and widen
-- the set of events that create a notification (project/subtask
-- updates, finance/salary, personal-info, performance changes).
-- "Mark as unread" needs no new column — it just clears read_at,
-- same column the existing mark-read path already uses.
-- ============================================================

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS important BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_notifications_important ON notifications(user_id, important);
