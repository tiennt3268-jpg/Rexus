-- ============================================================
-- Role-based access control + centralized account management.
--
-- Roles: 'System Admin' (full control, manages all accounts/roles),
-- 'Project Manager' (manages assigned projects, creates/assigns work
-- within them), 'Member' (views/acts only on work assigned to them).
--
-- Also extends the user profile with Position (chuc vu) and
-- Department (phong ban), shown on the profile screen and usable to
-- filter/search people when assigning work.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'Member';
ALTER TABLE users ADD COLUMN IF NOT EXISTS position TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT DEFAULT '';

-- The original shared/admin account (created before real per-user auth
-- existed) becomes the first System Admin, so someone can always manage
-- accounts and roles after this migration runs.
UPDATE users SET role = 'System Admin' WHERE id = 'DEFAULT_USER';

-- Every account that already existed before roles were introduced
-- defaults to Member (safest default); a System Admin can promote
-- people afterwards from the new Manage Accounts screen.
UPDATE users SET role = 'Member' WHERE role IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department);

-- Per-project role already existed on project_members (default 'Member');
-- make sure every existing row has an explicit value so role checks never
-- see NULL.
UPDATE project_members SET role = 'Member' WHERE role IS NULL;
