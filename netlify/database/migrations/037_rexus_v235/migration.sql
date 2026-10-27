-- REXUS v2.3.5 (REXUS_Requirements_v2.3.4 Detailed Addendum). Additive only: no DROP, no DELETE, no id changes.
-- LOG-01: the activity log becomes a per-entity timeline (project / task / subtask) with changed fields.
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS owner_id TEXT;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS subtask_id TEXT;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS entity_id TEXT;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS meta JSONB;
CREATE INDEX IF NOT EXISTS idx_activity_log_task ON activity_log(task_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_subtask ON activity_log(subtask_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_owner_project ON activity_log(owner_id, project);
-- existing task events: record which owner's project they belong to (project names are only unique per owner)
UPDATE activity_log a SET owner_id = t.user_id FROM tasks t WHERE a.owner_id IS NULL AND a.task_id = t.id;
-- project-level events: only where the project name is unambiguous (one owner)
UPDATE activity_log a SET owner_id = p.user_id FROM projects p
 WHERE a.owner_id IS NULL AND a.task_id IS NULL AND a.project = p.name
   AND (SELECT COUNT(*) FROM projects q WHERE q.name = p.name) = 1;

-- ACT-01: archive = reversible soft delete
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS archived_by TEXT;
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS archived_by TEXT;

-- ACT-02: old id -> new id after a type conversion, so old links still resolve
CREATE TABLE IF NOT EXISTS rexus_entity_aliases (
  old_type TEXT NOT NULL,
  old_id TEXT NOT NULL,
  new_type TEXT NOT NULL,
  new_id TEXT NOT NULL,
  new_owner TEXT,
  new_project TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (old_type, old_id)
);
CREATE INDEX IF NOT EXISTS idx_rexus_entity_aliases_new ON rexus_entity_aliases(new_type, new_id);
