-- REXUS v2.3.0 — REXUS Survey v1.0.0 + First Login onboarding (RS-SPEC-1.0-UIUX-BC-FS-REV1).
-- Additive only: new columns default to "no obligation", so existing accounts are not locked out.
-- No DROP, no DELETE, no ID changes. Back up the database before applying in production.

-- F07 First Login gate. Only accounts created (or password-reset) from this release get the flags.
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_gate BOOLEAN NOT NULL DEFAULT FALSE;     -- required demographic fields are enforced for this account
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- F06 Demographic field configuration (admin-controlled) and values (sensitive: separate table, own access rules).
CREATE TABLE IF NOT EXISTS rexus_demographic_fields (
  key          TEXT PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  label        TEXT NOT NULL,
  field_type   TEXT NOT NULL CHECK (field_type IN ('date','dropdown','text','year')),
  options      JSONB NOT NULL DEFAULT '[]'::jsonb,
  visible      BOOLEAN NOT NULL DEFAULT TRUE,
  required     BOOLEAN NOT NULL DEFAULT FALSE,
  self_service BOOLEAN NOT NULL DEFAULT TRUE,                     -- FALSE = admin-managed
  sort_order   INTEGER NOT NULL DEFAULT 100,
  updated_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (visible OR NOT required)                                 -- a hidden field can never be required
);
INSERT INTO rexus_demographic_fields (key, label, field_type, options, visible, required, self_service, sort_order) VALUES
  ('date_of_birth',    'Date of Birth',         'date',     '[]', TRUE, TRUE,  TRUE,  10),
  ('education_level',  'Education Level',       'dropdown', '["High school","Vocational","College","Bachelor","Postgraduate","Other"]', TRUE, TRUE, TRUE, 20),
  ('gender',           'Gender',                'dropdown', '["Female","Male","Other","Prefer not to say"]', TRUE, FALSE, TRUE, 30),
  ('field_of_study',   'Field of Study',        'text',     '[]', TRUE, FALSE, TRUE,  40),
  ('graduation_year',  'Graduation Year',       'year',     '[]', TRUE, FALSE, TRUE,  50),
  ('province',         'Current Province/City', 'text',     '[]', TRUE, FALSE, TRUE,  60),
  ('employment_start', 'Employment Start Date', 'date',     '[]', TRUE, FALSE, FALSE, 70)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS rexus_user_demographics (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  field_key  TEXT NOT NULL REFERENCES rexus_demographic_fields(key) ON DELETE CASCADE,
  value      TEXT NOT NULL CHECK (char_length(value) <= 500),
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, field_key)
);

-- F01 Surveys. Status Scheduled is derived (Active + opens_at in the future).
CREATE TABLE IF NOT EXISTS rexus_surveys (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL REFERENCES users(id),
  name            TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description     TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 4000),
  status          TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Active','Closed','Archived')),
  mode            TEXT NOT NULL DEFAULT 'authenticated' CHECK (mode IN ('authenticated','public')),
  mandatory       BOOLEAN NOT NULL DEFAULT FALSE,
  priority        INTEGER NOT NULL DEFAULT 100 CHECK (priority BETWEEN 1 AND 1000),
  target          JSONB NOT NULL DEFAULT '{"all":false,"departments":[],"positions":[],"users":[]}'::jsonb,
  opens_at        TIMESTAMPTZ,
  closes_at       TIMESTAMPTZ,
  max_responses   INTEGER CHECK (max_responses IS NULL OR max_responses > 0),
  draft_questions JSONB NOT NULL DEFAULT '[]'::jsonb,             -- working copy edited in the builder
  current_version INTEGER NOT NULL DEFAULT 0,                     -- 0 = never published
  published_at    TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ,
  closed_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (NOT mandatory OR mode = 'authenticated'),
  CHECK (closes_at IS NULL OR opens_at IS NULL OR closes_at > opens_at)
);
CREATE INDEX IF NOT EXISTS rexus_surveys_mandatory_idx ON rexus_surveys (status) WHERE mandatory;

-- Published question sets are immutable; every response points at the version it answered.
CREATE TABLE IF NOT EXISTS rexus_survey_versions (
  id         TEXT PRIMARY KEY,
  survey_id  TEXT NOT NULL REFERENCES rexus_surveys(id) ON DELETE CASCADE,
  version    INTEGER NOT NULL CHECK (version > 0),
  questions  JSONB NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (survey_id, version)
);

CREATE TABLE IF NOT EXISTS rexus_survey_responses (
  id           TEXT PRIMARY KEY,
  survey_id    TEXT NOT NULL REFERENCES rexus_surveys(id) ON DELETE CASCADE,
  version_id   TEXT NOT NULL REFERENCES rexus_survey_versions(id),
  user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,      -- NULL for public / anonymous surveys
  client_token TEXT NOT NULL CHECK (char_length(client_token) BETWEEN 8 AND 80),  -- idempotent re-submit
  answers      JSONB NOT NULL,
  department   TEXT,                                               -- organisation context at submit time (no demographics copied)
  position     TEXT,
  status       TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','void')),
  void_reason  TEXT,
  voided_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  voided_at    TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (survey_id, client_token)
);
-- One valid response per user per survey.
CREATE UNIQUE INDEX IF NOT EXISTS rexus_survey_responses_one_per_user ON rexus_survey_responses (survey_id, user_id) WHERE user_id IS NOT NULL AND status = 'valid';
CREATE INDEX IF NOT EXISTS rexus_survey_responses_survey_idx ON rexus_survey_responses (survey_id, submitted_at);
