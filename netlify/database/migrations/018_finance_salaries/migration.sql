-- Finance module: effective-dated base salary + allowances per employee
-- (mirrors employee_rates' temporal pattern), plus an audit trail of who
-- viewed/edited financial data and when.

CREATE TABLE IF NOT EXISTS employee_salaries (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  base_salary NUMERIC NOT NULL DEFAULT 0,
  allowances NUMERIC NOT NULL DEFAULT 0,
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employee_salaries_employee ON employee_salaries (employee_id, effective_from);

CREATE TABLE IF NOT EXISTS finance_audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('view', 'edit')),
  target_employee_id TEXT,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_finance_audit_log_target ON finance_audit_log (target_employee_id, created_at);
