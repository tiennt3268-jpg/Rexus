-- Server-authoritative REXUS cross-application audit trail.
-- The account label is retained if a user is later deactivated/deleted.
CREATE TABLE IF NOT EXISTS rexus_audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_username TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rexus_audit_created ON rexus_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rexus_audit_actor_created ON rexus_audit_log(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rexus_audit_entity ON rexus_audit_log(entity_type, entity_id, created_at DESC);
