import { randomUUID } from "node:crypto";

/* =========================================================
   Effective-dated hourly rates.

   Priority when costing a work-log line dated X for employee E on
   project (ownerId, projectName):
     1. employee_project_rates row for (E, ownerId, projectName)
        effective at X
     2. employee_rates row for E effective at X
     3. no rate found -> caller treats cost as 0 (hours still count)
   ========================================================= */

function toDateStr(v: any): string {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

export interface RateLookup {
  rate: number;
  source: "override" | "default" | "none";
}

/** The project-override rate open/effective for employeeId on the given date, or null. */
export async function getEffectiveProjectRate(
  db: any, employeeId: string, projectOwnerId: string, projectName: string, date: string
): Promise<number | null> {
  const rows = await db.sql`
    SELECT hourly_rate FROM employee_project_rates
    WHERE employee_id = ${employeeId} AND project_owner_id = ${projectOwnerId} AND project_name = ${projectName}
      AND effective_from <= ${date}
      AND (effective_to IS NULL OR effective_to > ${date})
    ORDER BY effective_from DESC LIMIT 1
  `;
  return rows.length ? Number(rows[0].hourly_rate) : null;
}

/** The default rate open/effective for employeeId on the given date, or null. */
export async function getEffectiveDefaultRate(db: any, employeeId: string, date: string): Promise<number | null> {
  const rows = await db.sql`
    SELECT hourly_rate FROM employee_rates
    WHERE employee_id = ${employeeId}
      AND effective_from <= ${date}
      AND (effective_to IS NULL OR effective_to > ${date})
    ORDER BY effective_from DESC LIMIT 1
  `;
  return rows.length ? Number(rows[0].hourly_rate) : null;
}

/** Full priority lookup: override -> default -> none (rate 0). */
export async function getEffectiveRate(
  db: any, employeeId: string, projectOwnerId: string, projectName: string, date: string
): Promise<RateLookup> {
  const override = await getEffectiveProjectRate(db, employeeId, projectOwnerId, projectName, date);
  if (override !== null) return { rate: override, source: "override" };
  const def = await getEffectiveDefaultRate(db, employeeId, date);
  if (def !== null) return { rate: def, source: "default" };
  return { rate: 0, source: "none" };
}

/** Records a new default hourly rate for an employee, closing the previously-open one. */
export async function setEmployeeRate(
  db: any, employeeId: string, hourlyRate: number, effectiveFrom: string, actorUserId: string
) {
  await db.sql`
    UPDATE employee_rates SET effective_to = ${effectiveFrom}
    WHERE employee_id = ${employeeId} AND effective_to IS NULL AND effective_from < ${effectiveFrom}
  `;
  const id = "ER" + randomUUID().slice(0, 8).toUpperCase();
  const rows = await db.sql`
    INSERT INTO employee_rates (id, employee_id, hourly_rate, effective_from, created_by)
    VALUES (${id}, ${employeeId}, ${hourlyRate}, ${effectiveFrom}, ${actorUserId})
    RETURNING *
  `;
  return rows[0];
}

/** Records a new project-override hourly rate for an employee, closing the previously-open one. */
export async function setEmployeeProjectRate(
  db: any, employeeId: string, projectOwnerId: string, projectName: string,
  hourlyRate: number, effectiveFrom: string, actorUserId: string
) {
  await db.sql`
    UPDATE employee_project_rates SET effective_to = ${effectiveFrom}
    WHERE employee_id = ${employeeId} AND project_owner_id = ${projectOwnerId} AND project_name = ${projectName}
      AND effective_to IS NULL AND effective_from < ${effectiveFrom}
  `;
  const id = "EPR" + randomUUID().slice(0, 8).toUpperCase();
  const rows = await db.sql`
    INSERT INTO employee_project_rates (id, employee_id, project_owner_id, project_name, hourly_rate, effective_from, created_by)
    VALUES (${id}, ${employeeId}, ${projectOwnerId}, ${projectName}, ${hourlyRate}, ${effectiveFrom}, ${actorUserId})
    RETURNING *
  `;
  return rows[0];
}

export async function getEmployeeRateHistory(db: any, employeeId: string) {
  return db.sql`
    SELECT * FROM employee_rates WHERE employee_id = ${employeeId}
    ORDER BY effective_from DESC
  `;
}

export async function getEmployeeProjectRateHistory(
  db: any, employeeId: string, projectOwnerId: string, projectName: string
) {
  return db.sql`
    SELECT * FROM employee_project_rates
    WHERE employee_id = ${employeeId} AND project_owner_id = ${projectOwnerId} AND project_name = ${projectName}
    ORDER BY effective_from DESC
  `;
}

/* =========================================================
   Effective-dated base salary + allowances (Finance module).
   Same temporal pattern as the hourly-rate functions above: a new
   row per change, with the previously-open row closed off, so past
   payroll figures never move when today's salary changes.
   ========================================================= */

export async function getEffectiveSalary(db: any, employeeId: string, date: string) {
  const rows = await db.sql`
    SELECT * FROM employee_salaries
    WHERE employee_id = ${employeeId}
      AND effective_from <= ${date}
      AND (effective_to IS NULL OR effective_to > ${date})
    ORDER BY effective_from DESC LIMIT 1
  `;
  return rows.length ? rows[0] : null;
}

export async function setEmployeeSalary(
  db: any, employeeId: string, baseSalary: number, allowances: number, effectiveFrom: string, actorUserId: string
) {
  await db.sql`
    UPDATE employee_salaries SET effective_to = ${effectiveFrom}
    WHERE employee_id = ${employeeId} AND effective_to IS NULL AND effective_from < ${effectiveFrom}
  `;
  const id = "ES" + randomUUID().slice(0, 8).toUpperCase();
  const rows = await db.sql`
    INSERT INTO employee_salaries (id, employee_id, base_salary, allowances, effective_from, created_by)
    VALUES (${id}, ${employeeId}, ${baseSalary}, ${allowances}, ${effectiveFrom}, ${actorUserId})
    RETURNING *
  `;
  return rows[0];
}

export async function getEmployeeSalaryHistory(db: any, employeeId: string) {
  return db.sql`
    SELECT * FROM employee_salaries WHERE employee_id = ${employeeId}
    ORDER BY effective_from DESC
  `;
}

export function serializeSalaryRow(r: any) {
  return {
    id: r.id,
    employee_id: r.employee_id,
    base_salary: r.base_salary == null ? 0 : Number(r.base_salary),
    allowances: r.allowances == null ? 0 : Number(r.allowances),
    effective_from: toDateStr(r.effective_from),
    effective_to: r.effective_to ? toDateStr(r.effective_to) : null,
    created_by: r.created_by || "",
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at
  };
}

/** Employee ids visible to a Project Manager for Finance: everyone on a
 *  project they own or manage, plus everyone in a department they head. */
export async function getManagerScopedEmployeeIds(db: any, managerId: string): Promise<string[]> {
  const rows = await db.sql`
    WITH managed_projects AS (
      SELECT user_id AS owner_user_id, name AS project FROM projects WHERE user_id = ${managerId}
      UNION
      SELECT owner_user_id, project FROM project_members WHERE user_id = ${managerId} AND role = 'Manager'
    )
    SELECT DISTINCT u.id AS id
    FROM users u
    WHERE u.id IN (
      SELECT pm.user_id FROM project_members pm
      JOIN managed_projects mp ON pm.owner_user_id = mp.owner_user_id AND pm.project = mp.project
      UNION
      SELECT owner_user_id FROM managed_projects
    )
    OR u.department IN (SELECT name FROM departments WHERE head_user_id = ${managerId})
  `;
  return rows.map((r: any) => r.id);
}

export async function logFinanceAudit(
  db: any, actorUserId: string, action: "view" | "edit", targetEmployeeId: string | null, detail: string
) {
  const id = "FAL" + randomUUID().slice(0, 8).toUpperCase();
  await db.sql`
    INSERT INTO finance_audit_log (id, actor_user_id, action, target_employee_id, detail)
    VALUES (${id}, ${actorUserId}, ${action}, ${targetEmployeeId}, ${detail})
  `;
}

export function serializeRateRow(r: any) {
  return {
    id: r.id,
    employee_id: r.employee_id,
    project_owner_id: r.project_owner_id || undefined,
    project_name: r.project_name || undefined,
    hourly_rate: r.hourly_rate == null ? 0 : Number(r.hourly_rate),
    effective_from: toDateStr(r.effective_from),
    effective_to: r.effective_to ? toDateStr(r.effective_to) : null,
    created_by: r.created_by || "",
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at
  };
}
