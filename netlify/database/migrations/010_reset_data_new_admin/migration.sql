-- ============================================================
-- Full data reset, per explicit user request: the old database
-- is no longer used, so every existing row is wiped and a single
-- fresh System Admin account is created to start clean.
--
-- Username: tiennt
-- Temp password: 123456789  (change this after first login)
-- ============================================================

TRUNCATE TABLE
  worklogs,
  subtask_members,
  subtasks,
  task_members,
  tasks,
  project_members,
  projects,
  reporters,
  activity_log,
  users
RESTART IDENTITY CASCADE;

INSERT INTO users (id, email, username, full_name, password_hash, status, role, position, department, created_at, updated_at)
VALUES (
  'ADMIN_TIENNT',
  'tiennt.3268@ueh.edu.vn',
  'tiennt',
  'Ngo Trong Tien',
  '4a017c95bf6fc618cd4dcbbdbaa3dbd9:ec195e10578ea7521e7e9d9a7d0d03b871a9db76bc6f5d6894751f1886b0d17edceb4a0dab4c50f59617fc02dbe00437a62b22a3efc4d4d9227e103174e3f38a',
  'Active',
  'System Admin',
  '',
  '',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;
