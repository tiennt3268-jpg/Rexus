-- ============================================================
-- Task Type becomes a managed dropdown instead of free text.
-- Admin can add more from Settings; existing task/subtask rows
-- keep whatever string they already have (validated client-side
-- against this list going forward).
-- ============================================================

CREATE TABLE IF NOT EXISTS task_types (
  name TEXT PRIMARY KEY,
  color TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO task_types (name, color) VALUES
  ('Task', '#2E7DD6'),
  ('Bug', '#D6425B'),
  ('Feature', '#2FA76B'),
  ('Improvement', '#E8AA1F')
ON CONFLICT (name) DO NOTHING;
