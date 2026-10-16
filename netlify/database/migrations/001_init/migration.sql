CREATE TABLE IF NOT EXISTS projects (
  name TEXT PRIMARY KEY,
  deadline DATE
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  task TEXT NOT NULL,
  description TEXT DEFAULT '',
  project TEXT DEFAULT 'General',
  priority TEXT DEFAULT 'Medium',
  status TEXT DEFAULT 'Not Started',
  progress INTEGER DEFAULT 0,
  start_date DATE,
  due_date DATE,
  start_time TEXT DEFAULT '',
  end_time TEXT DEFAULT '',
  estimated_hours NUMERIC DEFAULT 0,
  actual_hours NUMERIC DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS worklogs (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  description TEXT DEFAULT '',
  hours NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project);
CREATE INDEX IF NOT EXISTS idx_worklogs_task_id ON worklogs(task_id);
CREATE INDEX IF NOT EXISTS idx_worklogs_date ON worklogs(date);
