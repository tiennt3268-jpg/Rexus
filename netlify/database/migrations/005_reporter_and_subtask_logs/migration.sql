-- Reporter: default "Me", plus a self-growing list of reporters used so far.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reporter TEXT DEFAULT 'Me';
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS reporter TEXT DEFAULT 'Me';

CREATE TABLE IF NOT EXISTS reporters (
  name TEXT PRIMARY KEY
);
INSERT INTO reporters (name) VALUES ('Me') ON CONFLICT (name) DO NOTHING;

-- Subtasks can now have their own estimate, and work log entries can be
-- logged against a subtask directly (still tied to the parent task too,
-- so a task's Actual Hours always includes everything logged on its
-- subtasks without any extra rollup logic).
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC DEFAULT 0;
ALTER TABLE worklogs ADD COLUMN IF NOT EXISTS subtask_id TEXT REFERENCES subtasks(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_worklogs_subtask_id ON worklogs(subtask_id);
