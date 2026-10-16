-- REXUS v2.1.2 hotfix: signing key persisted in existing database.
-- Additive, no changes to users, passwords or business records.
CREATE TABLE IF NOT EXISTS rexus_session_signing_keys (
    key_id TEXT PRIMARY KEY,
    secret_hex TEXT NOT NULL CHECK (secret_hex ~ '^[0-9a-f]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- An application instance creates the random key on first login/use.
-- Never seed a fixed/default signing secret in migration scripts.
