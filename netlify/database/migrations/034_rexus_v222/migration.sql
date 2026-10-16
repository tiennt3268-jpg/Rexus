-- REXUS v2.2.2 — additive-only schema extension (Requirement V2.1.2).
-- No DROP of business tables, no ID changes, no rewrite of historical rows.
-- Back up the database before applying in production.

-- GEN-03: Light / Dark / System mode, saved per account next to the colour theme.
ALTER TABLE rexus_user_preferences ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'light';
DO $$ BEGIN
  ALTER TABLE rexus_user_preferences ADD CONSTRAINT rexus_user_preferences_mode_chk CHECK (mode IN ('light','dark','system'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ACC-02: soft delete. The account is hidden and locked; tasks, worklogs, documents,
-- HR records and audit history keep pointing at the same users.id.
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_by TEXT;

-- HRM-02/03/04: monthly schedule for every employee — regular hours and overtime kept apart.
ALTER TABLE rexus_capacity_entries ADD COLUMN IF NOT EXISTS ot_hours NUMERIC NOT NULL DEFAULT 0;
DO $$ BEGIN
  ALTER TABLE rexus_capacity_entries ADD CONSTRAINT rexus_capacity_entries_ot_chk CHECK (ot_hours >= 0 AND ot_hours <= 24 AND hours + ot_hours <= 24);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE rexus_capacity_declarations ADD COLUMN IF NOT EXISTS ot_total_hours NUMERIC NOT NULL DEFAULT 0;
-- Minimum monthly hours in force when the month was submitted; later settings changes never rewrite it.
ALTER TABLE rexus_capacity_declarations ADD COLUMN IF NOT EXISTS min_hours_snapshot NUMERIC;

-- HRM-04: part-time minimum. Company default (single row) + optional per-person override.
CREATE TABLE IF NOT EXISTS rexus_hr_settings (
  id                          SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  part_time_min_monthly_hours NUMERIC NOT NULL DEFAULT 0 CHECK (part_time_min_monthly_hours >= 0 AND part_time_min_monthly_hours <= 744),
  updated_by                  TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO rexus_hr_settings(id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE rexus_resource_settings ADD COLUMN IF NOT EXISTS min_monthly_hours NUMERIC;
DO $$ BEGIN
  ALTER TABLE rexus_resource_settings ADD CONSTRAINT rexus_resource_settings_min_chk CHECK (min_monthly_hours IS NULL OR (min_monthly_hours >= 0 AND min_monthly_hours <= 744));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- HRM-05: a manager's request to an employee to register a month. One row per employee-month;
-- re-sending updates the same row (send_count / last_sent_at) instead of creating duplicates.
CREATE TABLE IF NOT EXISTS rexus_schedule_requests (
  id           TEXT PRIMARY KEY,
  month        TEXT NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  note         TEXT NOT NULL DEFAULT '',
  due_date     DATE,
  send_count   INTEGER NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (month, user_id)
);
CREATE INDEX IF NOT EXISTS idx_rexus_schedule_requests_user ON rexus_schedule_requests(user_id, month);
