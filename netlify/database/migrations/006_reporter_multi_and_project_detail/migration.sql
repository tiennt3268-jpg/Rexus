-- Reporter becomes multi-select (like Labels): stored as a JSON array of
-- names instead of a single string. Convert any existing plain-text values
-- (e.g. "Me") into a one-item JSON array so nothing is lost.
UPDATE tasks SET reporter = '["' || replace(reporter, '"', '\"') || '"]'
  WHERE reporter IS NOT NULL AND reporter != '' AND left(reporter, 1) != '[';
UPDATE subtasks SET reporter = '["' || replace(reporter, '"', '\"') || '"]'
  WHERE reporter IS NOT NULL AND reporter != '' AND left(reporter, 1) != '[';

ALTER TABLE tasks ALTER COLUMN reporter SET DEFAULT '["Me"]';
ALTER TABLE subtasks ALTER COLUMN reporter SET DEFAULT '["Me"]';

-- Project Detail page needs: an activity/history log, and Owner + Members
-- on projects (used by the new Edit Project form).
CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  project TEXT,
  task_id TEXT,
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_log_project ON activity_log(project);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner TEXT DEFAULT 'Me';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS members TEXT DEFAULT '[]';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date DATE;

-- Subtasks gain the same task-like fields as their parent Task, at a smaller scope.
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'Medium';
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS labels TEXT DEFAULT '[]';

