-- ============================================================
-- Lương theo giờ (effective-dated) + quy trình duyệt/khoá giờ khai
-- báo + chi phí dự án.
--
-- Effective-dated model: each rate change inserts a new row with
-- effective_from = the date it starts applying; the previously-open
-- row (effective_to IS NULL) is closed by setting its effective_to
-- to that same date. At any point in time there is at most one open
-- row (effective_to IS NULL) per employee (and, for overrides, per
-- employee+project).
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_rates (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hourly_rate NUMERIC NOT NULL DEFAULT 0,
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_employee_rates_employee_id ON employee_rates(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_rates_effective ON employee_rates(employee_id, effective_from, effective_to);

CREATE TABLE IF NOT EXISTS employee_project_rates (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_owner_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  hourly_rate NUMERIC NOT NULL DEFAULT 0,
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_employee_project_rates_employee_id ON employee_project_rates(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_project_rates_effective
  ON employee_project_rates(employee_id, project_owner_id, project_name, effective_from, effective_to);

-- Work-log lines move submitted -> approved when a project's costs are
-- "closed"; approved lines are locked until explicitly reopened.
ALTER TABLE worklogs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'submitted'
  CHECK (status IN ('submitted', 'approved'));
CREATE INDEX IF NOT EXISTS idx_worklogs_status ON worklogs(status);

-- Audit trail for close ("Chốt chi phí dự án") / reopen ("Mở lại")
-- actions — one row per work-log line affected by a single action.
CREATE TABLE IF NOT EXISTS worklog_status_log (
  id TEXT PRIMARY KEY,
  worklog_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('close', 'reopen')),
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  project_owner_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id),
  reason TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_worklog_status_log_worklog_id ON worklog_status_log(worklog_id);
CREATE INDEX IF NOT EXISTS idx_worklog_status_log_project ON worklog_status_log(project_owner_id, project_name);

-- Optional project budget, used to show remaining budget alongside cost.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget NUMERIC;
