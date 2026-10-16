-- REXUS v2.0.8: additive collaboration tables. All existing content preserved.
-- Existing Spaces/Documents retain organization-wide access until an owner explicitly restricts them.
ALTER TABLE rexus_spaces ADD COLUMN IF NOT EXISTS access_mode TEXT NOT NULL DEFAULT 'organization';
ALTER TABLE rexus_documents ADD COLUMN IF NOT EXISTS access_mode TEXT NOT NULL DEFAULT 'inherited';
-- Only existing Spaces get organization default. New Spaces are private by API.
CREATE TABLE IF NOT EXISTS rexus_document_shares (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('space','folder','page')),
  target_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK (permission IN ('view','comment','edit')),
  granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(target_type,target_id,user_id)
);
CREATE INDEX IF NOT EXISTS rexus_document_shares_user ON rexus_document_shares(user_id,target_type,target_id);
-- Comment threads are anchored to a selected passage, not to a Folder comment sidebar.
CREATE TABLE IF NOT EXISTS rexus_document_threads (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES rexus_documents(id) ON DELETE CASCADE,
  anchor_text TEXT NOT NULL,
  anchor_prefix TEXT NOT NULL DEFAULT '',
  anchor_suffix TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS rexus_document_threads_page ON rexus_document_threads(document_id,created_at);
CREATE TABLE IF NOT EXISTS rexus_document_thread_replies (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES rexus_document_threads(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rexus_document_replies_thread ON rexus_document_thread_replies(thread_id,created_at);
