-- REXUS v2.1.0: additive-only schema. Take database/Blob backups before use.
CREATE TABLE IF NOT EXISTS user_google_accounts (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 google_sub TEXT NOT NULL UNIQUE, google_email TEXT NOT NULL,
 google_avatar_url TEXT NOT NULL DEFAULT '', linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS oauth_pending_states (
 state_hash TEXT PRIMARY KEY, nonce TEXT NOT NULL, code_verifier TEXT NOT NULL,
 purpose TEXT NOT NULL CHECK (purpose IN ('login','link')),
 user_id TEXT REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 consumed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_oauth_pending_created ON oauth_pending_states(created_at);
CREATE TABLE IF NOT EXISTS rexus_resource_settings (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 hours_per_day NUMERIC NOT NULL DEFAULT 8 CHECK(hours_per_day>=0 AND hours_per_day<=24),
 workdays TEXT NOT NULL DEFAULT '[1,2,3,4,5]', updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS rexus_resource_allocations (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 planned_hours NUMERIC NOT NULL CHECK(planned_hours>=0),
 start_date DATE NOT NULL, end_date DATE NOT NULL CHECK(end_date>=start_date),
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL, updated_at TIMESTAMPTZ DEFAULT NOW(),
 UNIQUE(task_id,user_id,start_date,end_date)
);
CREATE INDEX IF NOT EXISTS idx_resource_allocations_user_dates ON rexus_resource_allocations(user_id,start_date,end_date);
CREATE TABLE IF NOT EXISTS rexus_approval_requests (
 id TEXT PRIMARY KEY, request_type TEXT NOT NULL,
 title TEXT NOT NULL, payload TEXT NOT NULL DEFAULT '{}', source_type TEXT NOT NULL DEFAULT '', source_id TEXT NOT NULL DEFAULT '',
 requester_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL DEFAULT 'Draft',
 mode TEXT NOT NULL DEFAULT 'single' CHECK(mode IN ('single','sequential','parallel')),
 created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS rexus_approval_steps (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES rexus_approval_requests(id) ON DELETE CASCADE,
 approver_id TEXT NOT NULL REFERENCES users(id), sequence_num INTEGER NOT NULL DEFAULT 1,
 decision TEXT NOT NULL DEFAULT 'Pending', decided_at TIMESTAMPTZ, reason TEXT NOT NULL DEFAULT '', UNIQUE(request_id,approver_id,sequence_num)
);
CREATE TABLE IF NOT EXISTS rexus_approval_events (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES rexus_approval_requests(id) ON DELETE CASCADE,
 actor_id TEXT REFERENCES users(id), action TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '',
 previous_status TEXT NOT NULL DEFAULT '', new_status TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_approvals_requester ON rexus_approval_requests(requester_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_steps_assignee ON rexus_approval_steps(approver_id,decision);
CREATE TABLE IF NOT EXISTS rexus_task_dependencies (
 id TEXT PRIMARY KEY, predecessor_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 successor_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 dependency_type TEXT NOT NULL DEFAULT 'FS' CHECK(dependency_type='FS'),
 CHECK(predecessor_id<>successor_id), UNIQUE(predecessor_id,successor_id)
);
CREATE INDEX IF NOT EXISTS idx_task_dependency_successor ON rexus_task_dependencies(successor_id);
CREATE TABLE IF NOT EXISTS rexus_workflow_events (
 id TEXT PRIMARY KEY, successor_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 dependency_signature TEXT NOT NULL, triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(successor_id,dependency_signature)
);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS workflow_notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget_currency TEXT NOT NULL DEFAULT 'VND';
CREATE TABLE IF NOT EXISTS rexus_project_transactions (
 id TEXT PRIMARY KEY, project_owner_id TEXT NOT NULL, project_name TEXT NOT NULL,
 type TEXT NOT NULL CHECK(type IN ('Income','Expense')), amount NUMERIC(18,2) NOT NULL CHECK(amount>0),
 currency TEXT NOT NULL, category TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
 reference TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Draft',
 created_by TEXT REFERENCES users(id), approved_by TEXT REFERENCES users(id),
 confirmed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(project_owner_id, project_name, reference, type)
);
CREATE INDEX IF NOT EXISTS idx_rexus_financial_project ON rexus_project_transactions(project_owner_id,project_name,created_at DESC);
CREATE TABLE IF NOT EXISTS rexus_disbursements (
 id TEXT PRIMARY KEY, project_owner_id TEXT NOT NULL, project_name TEXT NOT NULL,
 requested_amount NUMERIC(18,2) NOT NULL CHECK(requested_amount>0), approved_amount NUMERIC(18,2) CHECK(approved_amount>=0),
 currency TEXT NOT NULL, purpose TEXT NOT NULL DEFAULT '', recipient TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'Draft', requested_by TEXT NOT NULL REFERENCES users(id),
 approved_by TEXT REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS rexus_disbursement_payments (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES rexus_disbursements(id) ON DELETE RESTRICT,
 amount NUMERIC(18,2) NOT NULL CHECK(amount>0), reference TEXT NOT NULL,
 paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), recorded_by TEXT NOT NULL REFERENCES users(id),
 UNIQUE(request_id,reference)
);
CREATE TABLE IF NOT EXISTS rexus_financial_events (
 id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
 actor_id TEXT REFERENCES users(id), action TEXT NOT NULL, details TEXT NOT NULL DEFAULT '{}',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rexus_fin_events_entity ON rexus_financial_events(entity_type,entity_id,created_at DESC);
CREATE TABLE IF NOT EXISTS rexus_resource_days_off (
 id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
 day DATE NOT NULL, reason TEXT NOT NULL DEFAULT '',
 UNIQUE(user_id,day)
);

