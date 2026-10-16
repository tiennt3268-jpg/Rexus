-- ============================================================
-- Phase 5 (part 1): file uploads + rich text.
--
-- 1) Subtasks and Projects gain an `attachments` JSON array column,
--    mirroring the one tasks already have. Existing rows default to '[]'.
--    Entry shape (all three entities, going forward):
--      { type: 'link' | 'file', name, url, size?, content_type? }
--    An entry with no `type` field is treated as 'link' for backward
--    compatibility with the attachments Tasks already stored before this
--    migration.
--
-- 2) A metadata table for uploaded files, so a download can be permission
--    checked against the entity it's attached to before streaming bytes
--    out of Netlify Blobs. The blob key itself is namespaced by id so two
--    uploads never collide.
-- ============================================================

ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS attachments TEXT DEFAULT '[]';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS attachments TEXT DEFAULT '[]';

CREATE TABLE IF NOT EXISTS uploaded_files (
  id TEXT PRIMARY KEY,
  blob_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  scope TEXT NOT NULL CHECK (scope IN ('project', 'task', 'subtask')),
  entity_id TEXT NOT NULL,
  uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_entity ON uploaded_files(scope, entity_id);
