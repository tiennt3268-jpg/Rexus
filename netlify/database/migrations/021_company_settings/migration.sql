-- ============================================================
-- Company / organization info shown in the app footer and used
-- to seed the Configuration page. A single fixed row (id = 1) —
-- there is only ever one "company" for this deployment. Seeded
-- with the values that used to be hard-coded in the footer HTML,
-- so nothing visibly changes until a System Admin edits them.
-- ============================================================

CREATE TABLE IF NOT EXISTS company_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  company_name TEXT NOT NULL DEFAULT 'Work Management',
  office_address TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  working_hours TEXT NOT NULL DEFAULT '',
  campus_name TEXT NOT NULL DEFAULT '',
  org_name TEXT NOT NULL DEFAULT '',
  copyright_text TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT company_settings_single_row CHECK (id = 1)
);

INSERT INTO company_settings (
  id, company_name, office_address, contact_email, working_hours, campus_name, org_name, copyright_text
) VALUES (
  1,
  'Work Management',
  'University of Economics Ho Chi Minh City, Campus A, 59C Nguyen Dinh Chieu, Xuan Hoa Ward, Ho Chi Minh City',
  'tiennt.3268@ueh.edu.vn',
  '07:30 - 16:30, lunch break from 11:30 – 13:30, Monday to Friday',
  'UEH Nexus Campus Nha Trang',
  'University of Economics Ho Chi Minh City',
  '© 2026 Kennethtienngo. All rights reserved.'
)
ON CONFLICT (id) DO NOTHING;
