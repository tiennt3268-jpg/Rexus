-- REXUS 2.1.1: Explicit sharing only. This intentionally changes visibility,
-- not ownership or document storage. No business data is deleted.
-- Back up DB before applying. Rollback instructions in RELEASE-NOTES.
CREATE TABLE IF NOT EXISTS rexus_acl_previous_modes_031 (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('space','document')),
  entity_id TEXT NOT NULL,
  previous_mode TEXT NOT NULL,
  migrated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(entity_type,entity_id)
);
INSERT INTO rexus_acl_previous_modes_031(entity_type,entity_id,previous_mode)
SELECT 'space',id,access_mode FROM rexus_spaces WHERE access_mode='organization'
ON CONFLICT DO NOTHING;
INSERT INTO rexus_acl_previous_modes_031(entity_type,entity_id,previous_mode)
SELECT 'document',id,access_mode FROM rexus_documents WHERE access_mode='organization'
ON CONFLICT DO NOTHING;
UPDATE rexus_spaces SET access_mode='restricted' WHERE access_mode='organization';
UPDATE rexus_documents SET access_mode='inherited' WHERE access_mode='organization';
ALTER TABLE rexus_spaces ALTER COLUMN access_mode SET DEFAULT 'restricted';
-- Shared Space, Folder, Page grants in rexus_document_shares are retained.
-- Created_by is retained; System Admin access is unchanged.
