-- ============================================================
-- Performance-based pay (task #: "Tính lương theo hiệu suất").
--
-- Toggleable on/off from Configuration (company_settings.perf_pay_enabled),
-- with configurable weights for the three auto-computed metrics plus an
-- optional manual rating, and configurable score->bonus tiers.
--
-- employee_performance holds one row per (employee, period) where period
-- is a 'YYYY-MM' string. A 'draft' row only ever stores the manual rating
-- + notes an Admin/Manager typed in — the metrics/score/bonus are always
-- computed live from current task/work-log data while draft, so nothing
-- goes stale. Finalizing a period (Admin only, password-confirmed like a
-- salary edit) freezes a snapshot into the row: this is the same
-- "never retroactively rewrite a closed record" pattern used for cost
-- approvals and salary history elsewhere in the app, so a later task edit
-- or salary change never silently changes a bonus that was already paid.
-- ============================================================

ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS perf_pay_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS perf_weight_ontime INTEGER NOT NULL DEFAULT 40;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS perf_weight_completion INTEGER NOT NULL DEFAULT 30;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS perf_weight_hours INTEGER NOT NULL DEFAULT 20;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS perf_weight_manual INTEGER NOT NULL DEFAULT 10;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS perf_tiers TEXT NOT NULL DEFAULT
  '[{"min_score":90,"bonus_pct":15},{"min_score":75,"bonus_pct":8},{"min_score":60,"bonus_pct":3},{"min_score":0,"bonus_pct":0}]';

CREATE TABLE IF NOT EXISTS employee_performance (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  manual_rating NUMERIC,
  ontime_rate NUMERIC,
  completion_rate NUMERIC,
  hours_efficiency NUMERIC,
  score NUMERIC,
  bonus_pct NUMERIC,
  base_salary_snapshot NUMERIC,
  bonus_amount NUMERIC,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  notes TEXT DEFAULT '',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  finalized_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  finalized_at TIMESTAMPTZ,
  UNIQUE (employee_id, period)
);
CREATE INDEX IF NOT EXISTS idx_emp_perf_employee ON employee_performance(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_perf_period ON employee_performance(period);
