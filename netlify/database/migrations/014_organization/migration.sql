-- ============================================================
-- Organization structure: departments (optionally nested under a
-- parent department) with a head. Which users belong to a
-- department is still driven by users.department (free text, added
-- in migration 009) so moving someone between departments is just
-- editing their account from Manage Accounts — no separate
-- membership table needed.
-- ============================================================

CREATE TABLE IF NOT EXISTS departments (
  name TEXT PRIMARY KEY,
  parent_department TEXT REFERENCES departments(name) ON DELETE SET NULL,
  head_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed a department for everyone whose account already names one, so
-- the Organization tab isn't empty on first use.
INSERT INTO departments (name)
SELECT DISTINCT department FROM users WHERE department IS NOT NULL AND department <> ''
ON CONFLICT (name) DO NOTHING;
