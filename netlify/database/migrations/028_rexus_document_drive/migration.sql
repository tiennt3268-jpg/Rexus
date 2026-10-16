-- v2.0.6: non-destructive evolution of existing REXUS Document data.
-- Pages remain independent rexus_documents rows, folder is a kind of rexus_documents.
-- Existing uploads retain document_id and task/subtask links; new uploads may target a folder directly.
ALTER TABLE rexus_doc_files ADD COLUMN IF NOT EXISTS folder_id TEXT REFERENCES rexus_documents(id) ON DELETE RESTRICT;
ALTER TABLE rexus_doc_files ALTER COLUMN document_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS rexus_doc_files_folder ON rexus_doc_files(folder_id);
CREATE TABLE IF NOT EXISTS rexus_folder_comments (
  id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL REFERENCES rexus_documents(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES rexus_folder_comments(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rexus_folder_comments_folder ON rexus_folder_comments(folder_id,created_at);
-- Invariant: one owner: page attachment (old format), or direct folder upload (new format).
-- NOT VALID permits review of any unexpected legacy rows before validation.
ALTER TABLE rexus_doc_files DROP CONSTRAINT IF EXISTS rexus_doc_file_parent_check;
ALTER TABLE rexus_doc_files ADD CONSTRAINT rexus_doc_file_parent_check
  CHECK ((document_id IS NOT NULL) <> (folder_id IS NOT NULL)) NOT VALID;
-- To validate after rollout and inspecting any legacy anomalies:
-- ALTER TABLE rexus_doc_files VALIDATE CONSTRAINT rexus_doc_file_parent_check;
