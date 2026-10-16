-- REXUS Document v2.0.2: separate document library, using existing login.
-- Files are stored in Netlify Blobs; relational metadata & versions live here.
CREATE TABLE IF NOT EXISTS rexus_spaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS rexus_documents (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES rexus_spaces(id) ON DELETE RESTRICT,
  parent_id TEXT REFERENCES rexus_documents(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL DEFAULT 'page' CHECK (kind IN ('page','folder')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  labels TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rexus_doc_not_self_parent CHECK (id <> parent_id)
);
CREATE INDEX IF NOT EXISTS rexus_documents_tree ON rexus_documents(space_id, parent_id);
CREATE INDEX IF NOT EXISTS rexus_documents_updated ON rexus_documents(updated_at DESC);
CREATE TABLE IF NOT EXISTS rexus_doc_revisions (
  document_id TEXT NOT NULL REFERENCES rexus_documents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  labels TEXT NOT NULL DEFAULT '[]',
  edited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (document_id, version)
);
CREATE TABLE IF NOT EXISTS rexus_doc_files (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES rexus_documents(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  current_version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rexus_doc_files_document ON rexus_doc_files(document_id);
CREATE TABLE IF NOT EXISTS rexus_doc_file_versions (
  file_id TEXT NOT NULL REFERENCES rexus_doc_files(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  blob_key TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (file_id, version)
);
