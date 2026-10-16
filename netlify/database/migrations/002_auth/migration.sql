CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shared/default owner — used for any row created before accounts existed,
-- and now also the only owner in use since per-account login was removed.
INSERT INTO users (id, email, password_hash)
VALUES ('DEFAULT_USER', 'default@local', 'disabled')
ON CONFLICT (id) DO NOTHING;

-- Tasks and worklogs: add an owner column, backfilling existing rows so
-- nothing is left with a null owner.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
UPDATE tasks SET user_id = 'DEFAULT_USER' WHERE user_id IS NULL;

ALTER TABLE worklogs ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
UPDATE worklogs SET user_id = 'DEFAULT_USER' WHERE user_id IS NULL;

-- Projects: a project name is only unique *within* one account, so the
-- primary key becomes (user_id, name) instead of just (name). Existing rows
-- must be backfilled first — a primary key column can never contain NULL.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
UPDATE projects SET user_id = 'DEFAULT_USER' WHERE user_id IS NULL;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_pkey;
ALTER TABLE projects ADD PRIMARY KEY (user_id, name);

CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_worklogs_user_id ON worklogs(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
