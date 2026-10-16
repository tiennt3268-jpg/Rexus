-- New task-level fields
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type TEXT DEFAULT 'Task';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS labels TEXT DEFAULT '[]';        -- JSON array of strings
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS attachments TEXT DEFAULT '[]';  -- JSON array of {name,url}
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurring TEXT DEFAULT '';      -- '', 'daily', 'weekly', 'monthly'

-- Subtasks: each belongs to exactly one task, managed independently.
CREATE TABLE IF NOT EXISTS subtasks (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'Not Started',
  progress INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_user_id ON subtasks(user_id);
