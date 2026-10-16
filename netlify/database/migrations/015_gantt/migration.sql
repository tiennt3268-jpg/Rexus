-- ============================================================
-- Gantt chart: dependency relationships between tasks in the same
-- project (predecessor -> successor), milestones, and a per-project
-- on/off switch so simple projects aren't forced into Gantt fields.
--
-- Scope: Gantt applies to top-level Tasks (not Subtasks) for now.
--
-- predecessors is a JSON array of:
--   { "id": "<task id>", "type": "FS"|"SS"|"FF"|"SF", "lag_days": <number> }
-- ============================================================

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS predecessors TEXT DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_milestone BOOLEAN DEFAULT false;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS gantt_enabled BOOLEAN DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS gantt_auto_schedule BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_tasks_project_gantt ON tasks(project) WHERE predecessors <> '[]';
