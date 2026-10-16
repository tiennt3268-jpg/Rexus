-- User profile fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- All data created while login was switched off belongs to the shared
-- "DEFAULT_USER" account. Nothing is deleted or reassigned — instead this
-- account gets real, known credentials so it becomes a normal, usable admin
-- account. Temp password: ChangeMe123! — change it via Change Password
-- immediately after logging in.
UPDATE users SET
  username = 'admin',
  full_name = 'Admin',
  password_hash = '89f9b22b9c327716f1209a9634a2fb3d:c184b5dbebcc249ac20a4be14b5c0417e4954c5b28956ea921058bc6086842d00b3755d7249b1df6cc82ad91f3d1adc2de61c2fdf364838c1fd00f4a269c1209'
WHERE id = 'DEFAULT_USER';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL;

-- Tasks/Subtasks: separate "Created By" (auto, the creator) from Reporter
-- (who asked for the work) and the new Assignee (who is doing the work).
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee TEXT DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by TEXT;
UPDATE tasks SET created_by = user_id WHERE created_by IS NULL;

ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS assignee TEXT DEFAULT '';
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS created_by TEXT;
UPDATE subtasks SET created_by = user_id WHERE created_by IS NULL;
