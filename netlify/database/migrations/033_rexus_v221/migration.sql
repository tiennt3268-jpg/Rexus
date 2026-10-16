-- REXUS v2.2.1 — additive-only schema extension.
-- No DROP of business tables, no ID changes, no rewrite of historical rows.
-- Back up the database (and Netlify Blobs) before applying in production.

-- ---------------------------------------------------------------------------
-- Module 9: per-user appearance preferences (keyed by existing users.id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rexus_user_preferences (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme      TEXT NOT NULL DEFAULT 'mono' CHECK (theme IN ('mono','navy')),
  density    TEXT NOT NULL DEFAULT 'compact' CHECK (density IN ('compact','comfortable')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Modules 2 + 4: employment / schedule profile.
-- rexus_resource_settings (v2.1.0) already holds hours_per_day + workdays;
-- it is extended rather than duplicated.
-- ---------------------------------------------------------------------------
ALTER TABLE rexus_resource_settings ADD COLUMN IF NOT EXISTS employment_type TEXT NOT NULL DEFAULT 'Full-time';
ALTER TABLE rexus_resource_settings ADD COLUMN IF NOT EXISTS capacity_method TEXT NOT NULL DEFAULT 'schedule';
ALTER TABLE rexus_resource_settings ADD COLUMN IF NOT EXISTS capacity_approver_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE rexus_resource_settings ADD COLUMN IF NOT EXISTS manager_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE rexus_resource_settings ADD COLUMN IF NOT EXISTS effective_from DATE;
ALTER TABLE rexus_resource_settings ADD COLUMN IF NOT EXISTS updated_by TEXT REFERENCES users(id) ON DELETE SET NULL;
DO $$ BEGIN
  ALTER TABLE rexus_resource_settings ADD CONSTRAINT rexus_resource_settings_method_chk CHECK (capacity_method IN ('schedule','declaration'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE rexus_resource_settings ADD CONSTRAINT rexus_resource_settings_type_chk
    CHECK (employment_type IN ('Full-time','Part-time','Freelancer','Contractor','Collaborator','Other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Append-only history: every profile change keeps the previous effective schedule,
-- so capacity for past periods is computed with the schedule that applied then.
CREATE TABLE IF NOT EXISTS rexus_resource_settings_history (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employment_type TEXT NOT NULL,
  capacity_method TEXT NOT NULL,
  hours_per_day   NUMERIC NOT NULL,
  workdays        TEXT NOT NULL,
  capacity_approver_id TEXT,
  manager_id      TEXT,
  effective_from  DATE NOT NULL,
  changed_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rexus_settings_hist_user ON rexus_resource_settings_history(user_id, effective_from DESC);

-- Holidays and non-working days. Existing rexus_resource_days_off rows keep working:
-- user_id NULL = company-wide day; kind distinguishes public / company holidays.
ALTER TABLE rexus_resource_days_off ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'unavailable';
ALTER TABLE rexus_resource_days_off ADD COLUMN IF NOT EXISTS hours NUMERIC;           -- NULL = whole day
ALTER TABLE rexus_resource_days_off ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES users(id) ON DELETE SET NULL;
-- NULL user_id rows are not covered by UNIQUE(user_id,day) (NULLs are distinct): add a partial index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rexus_days_off_global ON rexus_resource_days_off(day) WHERE user_id IS NULL;

-- ---------------------------------------------------------------------------
-- Module 4: leave management
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rexus_leave_requests (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leave_type     TEXT NOT NULL CHECK (leave_type IN ('Annual Leave','Sick Leave','Unpaid Leave','Personal Leave','Other')),
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  unit           TEXT NOT NULL DEFAULT 'full' CHECK (unit IN ('full','half','hourly')),
  half_part      TEXT CHECK (half_part IN ('AM','PM')),
  hours          NUMERIC CHECK (hours IS NULL OR (hours > 0 AND hours <= 24)),
  duration_hours NUMERIC NOT NULL DEFAULT 0,
  reason         TEXT NOT NULL DEFAULT '',
  attachment_url TEXT NOT NULL DEFAULT '',
  approver_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'Draft'
                 CHECK (status IN ('Draft','Pending Approval','Approved','Rejected','Changes Requested','Cancelled')),
  approval_request_id TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at     TIMESTAMPTZ,
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_rexus_leave_user_dates ON rexus_leave_requests(user_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_rexus_leave_status ON rexus_leave_requests(status);

-- ---------------------------------------------------------------------------
-- Module 2: monthly capacity declarations (versioned; separate from worklogs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rexus_capacity_declarations (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month         TEXT NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  version       INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  status        TEXT NOT NULL DEFAULT 'Draft'
                CHECK (status IN ('Draft','Pending Approval','Approved','Rejected','Changes Requested','Superseded')),
  note          TEXT NOT NULL DEFAULT '',
  total_hours   NUMERIC NOT NULL DEFAULT 0,
  approval_request_id TEXT,
  submitted_at  TIMESTAMPTZ,
  decided_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, month, version)
);
-- At most one open (editable / under review) version per employee-month.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rexus_capacity_open ON rexus_capacity_declarations(user_id, month)
  WHERE status IN ('Draft','Pending Approval','Changes Requested');
-- At most one effective approved version per employee-month.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rexus_capacity_approved ON rexus_capacity_declarations(user_id, month)
  WHERE status = 'Approved';
CREATE TABLE IF NOT EXISTS rexus_capacity_entries (
  declaration_id TEXT NOT NULL REFERENCES rexus_capacity_declarations(id) ON DELETE CASCADE,
  day            DATE NOT NULL,
  hours          NUMERIC NOT NULL DEFAULT 0 CHECK (hours >= 0 AND hours <= 24),
  start_time     TEXT NOT NULL DEFAULT '',
  end_time       TEXT NOT NULL DEFAULT '',
  availability   TEXT NOT NULL DEFAULT 'available' CHECK (availability IN ('available','unavailable')),
  note           TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (declaration_id, day)
);

-- ---------------------------------------------------------------------------
-- Module 3: approval categories, assignment, delegation, routing
-- ---------------------------------------------------------------------------
ALTER TABLE rexus_approval_requests ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Project Management';
ALTER TABLE rexus_approval_requests ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'Normal';
ALTER TABLE rexus_approval_requests ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT '';
ALTER TABLE rexus_approval_requests ADD COLUMN IF NOT EXISTS project_key TEXT NOT NULL DEFAULT '';
ALTER TABLE rexus_approval_requests ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;
ALTER TABLE rexus_approval_requests ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
-- Existing v2.1.0 rows: derive a category from their type (presentation metadata only).
UPDATE rexus_approval_requests SET category = 'Project Finance'
  WHERE request_type = 'project_disbursement' AND category = 'Project Management';
UPDATE rexus_approval_requests SET category = 'Documents'
  WHERE request_type = 'document_review' AND category = 'Project Management';
ALTER TABLE rexus_approval_steps ADD COLUMN IF NOT EXISTS acted_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE rexus_approval_steps ADD COLUMN IF NOT EXISTS assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE rexus_approval_steps ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE rexus_approval_events ADD COLUMN IF NOT EXISTS details TEXT NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_rexus_approvals_status_cat ON rexus_approval_requests(status, category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rexus_approvals_source ON rexus_approval_requests(source_type, source_id);

CREATE TABLE IF NOT EXISTS rexus_approval_delegations (
  id           TEXT PRIMARY KEY,
  delegator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delegate_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  categories   TEXT NOT NULL DEFAULT '[]',      -- JSON array; [] = all categories
  status       TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Revoked')),
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  revoked_at   TIMESTAMPTZ,
  CHECK (end_date >= start_date),
  CHECK (delegator_id <> delegate_id)
);
CREATE INDEX IF NOT EXISTS idx_rexus_delegations_delegate ON rexus_approval_delegations(delegate_id, status, start_date, end_date);

CREATE TABLE IF NOT EXISTS rexus_approval_routing_rules (
  id           TEXT PRIMARY KEY,
  category     TEXT NOT NULL DEFAULT '',        -- '' = any
  request_type TEXT NOT NULL DEFAULT '',
  department   TEXT NOT NULL DEFAULT '',
  project_key  TEXT NOT NULL DEFAULT '',
  approver_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  priority     INTEGER NOT NULL DEFAULT 100,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Module 5: workflow notification settings + reusable templates
-- ---------------------------------------------------------------------------
ALTER TABLE projects ADD COLUMN IF NOT EXISTS dependencies_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS notify_assignee BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS notify_project_manager BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS rexus_workflow_templates (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  steps       TEXT NOT NULL DEFAULT '[]',   -- JSON: [{name, description, offset_days, duration_days, depends_on:[index]}]
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Module 7: richer ledger / disbursement records (all additive, nullable or defaulted)
-- ---------------------------------------------------------------------------
ALTER TABLE rexus_project_transactions ADD COLUMN IF NOT EXISTS transaction_date DATE;
ALTER TABLE rexus_project_transactions ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT '';
ALTER TABLE rexus_project_transactions ADD COLUMN IF NOT EXISTS counterparty TEXT NOT NULL DEFAULT '';
ALTER TABLE rexus_project_transactions ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
ALTER TABLE rexus_project_transactions ADD COLUMN IF NOT EXISTS attachment_url TEXT NOT NULL DEFAULT '';
ALTER TABLE rexus_project_transactions ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,6);
ALTER TABLE rexus_project_transactions ADD COLUMN IF NOT EXISTS base_amount NUMERIC(18,2);
ALTER TABLE rexus_project_transactions ADD COLUMN IF NOT EXISTS approval_request_id TEXT;
ALTER TABLE rexus_project_transactions ADD COLUMN IF NOT EXISTS reverses_id TEXT REFERENCES rexus_project_transactions(id);
ALTER TABLE rexus_project_transactions ADD COLUMN IF NOT EXISTS updated_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE rexus_project_transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE rexus_disbursements ADD COLUMN IF NOT EXISTS requested_date DATE;
ALTER TABLE rexus_disbursements ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT '';
ALTER TABLE rexus_disbursements ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
ALTER TABLE rexus_disbursements ADD COLUMN IF NOT EXISTS attachment_url TEXT NOT NULL DEFAULT '';
ALTER TABLE rexus_disbursements ADD COLUMN IF NOT EXISTS approval_request_id TEXT;
ALTER TABLE rexus_disbursement_payments ADD COLUMN IF NOT EXISTS payment_date DATE;
ALTER TABLE rexus_disbursement_payments ADD COLUMN IF NOT EXISTS recipient TEXT NOT NULL DEFAULT '';
ALTER TABLE rexus_disbursement_payments ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_rexus_disb_project ON rexus_disbursements(project_owner_id, project_name, created_at DESC);
