-- ============================================================
-- Multi-user collaboration: projects/tasks/subtasks can now be
-- shared with other real accounts (not just free-text names).
-- ============================================================

ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES users(id);
UPDATE projects SET owner_id = user_id WHERE owner_id IS NULL;

CREATE TABLE IF NOT EXISTS project_members (
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'Member',
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (owner_user_id, project, user_id)
);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);

CREATE TABLE IF NOT EXISTS task_members (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id)
);
CREATE TABLE IF NOT EXISTS subtask_members (
  subtask_id TEXT NOT NULL REFERENCES subtasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (subtask_id, user_id)
);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_id TEXT REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_name TEXT DEFAULT '';
UPDATE tasks SET assignee_name = assignee WHERE assignee_name = '' AND assignee IS NOT NULL AND assignee != '';

ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS assignee_id TEXT REFERENCES users(id);
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS assignee_name TEXT DEFAULT '';
UPDATE subtasks SET assignee_name = assignee WHERE assignee_name = '' AND assignee IS NOT NULL AND assignee != '';

UPDATE tasks SET reporter = (
  SELECT COALESCE(json_agg(json_build_object('type','custom','name', elem)), '[]')::text
  FROM json_array_elements_text(
    CASE WHEN reporter IS NULL OR reporter = '' THEN '[]' ELSE reporter END::json
  ) AS elem
) WHERE reporter IS NULL OR reporter NOT LIKE '%"type"%';

UPDATE subtasks SET reporter = (
  SELECT COALESCE(json_agg(json_build_object('type','custom','name', elem)), '[]')::text
  FROM json_array_elements_text(
    CASE WHEN reporter IS NULL OR reporter = '' THEN '[]' ELSE reporter END::json
  ) AS elem
) WHERE reporter IS NULL OR reporter NOT LIKE '%"type"%';

CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);

ALTER TABLE worklogs ADD COLUMN IF NOT EXISTS logged_by TEXT REFERENCES users(id);
UPDATE worklogs SET logged_by = user_id WHERE logged_by IS NULL;
CREATE INDEX IF NOT EXISTS idx_worklogs_logged_by ON worklogs(logged_by);
