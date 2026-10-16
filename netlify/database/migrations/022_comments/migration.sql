-- ============================================================
-- Comments/discussion thread on a Project, Task, or Subtask.
-- entity_id follows the same convention already used by "shares":
--   task/subtask -> the task/subtask's own id (e.g. "T3", "S7")
--   project      -> "<owner_user_id>::<project name>" (projects have
--                    no single-column id; they're keyed by owner+name)
-- ============================================================

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('project', 'task', 'subtask')),
  entity_id TEXT NOT NULL,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_entity ON comments(entity_type, entity_id, created_at);
