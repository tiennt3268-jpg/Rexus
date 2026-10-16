-- ============================================================
-- View-only sharing of a Task or Project with someone who is not
-- otherwise an assignee/reporter/project member.
--
-- entity_id for a task share is the task's id; for a project share
-- it is "<owner_user_id>::<project name>" since projects are keyed
-- by (user_id, name) rather than a single id column.
-- ============================================================

CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('task', 'project')),
  entity_id TEXT NOT NULL,
  shared_with_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shared_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (entity_type, entity_id, shared_with_user_id)
);

CREATE INDEX IF NOT EXISTS idx_shares_lookup ON shares(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_shares_shared_with ON shares(shared_with_user_id);
