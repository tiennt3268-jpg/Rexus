-- Add a short description field to departments, for the Add/Edit
-- Department screen.
ALTER TABLE departments ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
