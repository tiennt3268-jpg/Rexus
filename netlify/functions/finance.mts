import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { getUserFromRequest, unauthorized, verifyPassword } from "./lib/auth.mts";
import { getFullUser, isSystemAdmin, isManagerOrAdmin, serializeUserWithRole } from "./lib/rbac.mts";
import {
  getEffectiveSalary, setEmployeeSalary, getEmployeeSalaryHistory, serializeSalaryRow,
  getEffectiveDefaultRate, getEmployeeRateHistory, serializeRateRow,
  getManagerScopedEmployeeIds, logFinanceAudit
} from "./lib/payroll.mts";
import { createNotification } from "./lib/notify.mts";

const TODAY = () => new Date().toISOString().slice(0, 10);

export default async (req: Request, context: Context) => {
  const session = await getUserFromRequest(req);
  if (!session) return unauthorized();

  const db = getDatabase();
  const requester = await getFullUser(db, session.uid);

  // Finance is a Project-Manager-and-above module — plain Members have no
  // access at all, matching the Finance tab's own visibility rule.
  if (!isManagerOrAdmin(requester)) {
    return Response.json({ error: "Finance is only available to a Project Manager or System Admin." }, { status: 403 });
  }
  const admin = isSystemAdmin(requester);

  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean); // ["api","finance","employees", id?]
  const targetId = parts[3] ? decodeURIComponent(parts[3]) : null;

  try {
    // Which employees this requester (Manager or Admin) may see/edit.
    let scopedIds: string[] | null = null; // null = unrestricted (Admin)
    if (!admin) {
      scopedIds = await getManagerScopedEmployeeIds(db, session.uid);
    }

    if (req.method === "GET" && parts.length === 3) {
      // GET /api/finance/employees — overview list.
      const rows = await db.sql`
        SELECT id, username, email, full_name, avatar, role, position, department, status
        FROM users ORDER BY full_name ASC, username ASC
      `;
      const visible = scopedIds ? rows.filter((u: any) => scopedIds!.indexOf(u.id) !== -1) : rows;
      const today = TODAY();
      const list = [];
      for (const u of visible) {
        const salary = await getEffectiveSalary(db, u.id, today);
        const rate = await getEffectiveDefaultRate(db, u.id, today);
        list.push({
          ...serializeUserWithRole(u),
          base_salary: salary ? Number(salary.base_salary) : 0,
          allowances: salary ? Number(salary.allowances) : 0,
          hourly_rate: rate == null ? 0 : Number(rate)
        });
      }
      await logFinanceAudit(db, session.uid, "view", null, `${requester.username} viewed the Finance employee overview (${list.length} employees)`);
      return Response.json({ employees: list, scope: admin ? "all" : "managed" });
    }

    if (!targetId) return Response.json({ error: "Missing employee id" }, { status: 400 });
    if (scopedIds && scopedIds.indexOf(targetId) === -1) {
      return Response.json({ error: "You do not manage this employee." }, { status: 403 });
    }
    const targetRows = await db.sql`SELECT id, username, email, full_name, avatar, role, position, department, status FROM users WHERE id = ${targetId}`;
    if (!targetRows.length) return Response.json({ error: "Employee not found" }, { status: 404 });
    const target = targetRows[0];

    if (req.method === "GET") {
      const [salaryHistory, rateHistory] = await Promise.all([
        getEmployeeSalaryHistory(db, targetId),
        getEmployeeRateHistory(db, targetId)
      ]);
      await logFinanceAudit(db, session.uid, "view", targetId, `${requester.username} viewed financial detail for "${target.full_name || target.username}"`);
      return Response.json({
        employee: serializeUserWithRole(target),
        salary_history: salaryHistory.map(serializeSalaryRow),
        rate_history: rateHistory.map(serializeRateRow)
      });
    }

    if (req.method === "PUT") {
      const body = await req.json();
      const baseSalary = Number(body.base_salary);
      const allowances = Number(body.allowances || 0);
      const effectiveFrom = String(body.effective_from || TODAY());
      const confirmPassword = String(body.confirm_password || "");

      if (!(baseSalary >= 0)) return Response.json({ error: "Enter a valid base salary." }, { status: 400 });
      if (!(allowances >= 0)) return Response.json({ error: "Enter a valid allowances amount." }, { status: 400 });

      // Re-authentication: salary edits are sensitive, so we require the
      // acting user to re-enter their own password, even though they're
      // already signed in — protects against a hijacked/left-open session.
      // Note: deliberately not HTTP 401 — the frontend treats 401 as "session
      // expired" and redirects to the login screen, which would be wrong here
      // (the user IS signed in; they just typed their confirmation password wrong).
      const authRows = await db.sql`SELECT password_hash FROM users WHERE id = ${session.uid}`;
      if (!authRows.length || !confirmPassword || !verifyPassword(confirmPassword, authRows[0].password_hash)) {
        return Response.json({ error: "Incorrect password. Re-enter your password to confirm this change." }, { status: 403 });
      }

      const before = await getEffectiveSalary(db, targetId, TODAY());
      const saved = await setEmployeeSalary(db, targetId, baseSalary, allowances, effectiveFrom, session.uid);
      await logFinanceAudit(
        db, session.uid, "edit", targetId,
        `${requester.username} changed salary for "${target.full_name || target.username}": ` +
        `base ${before ? Number(before.base_salary) : 0} -> ${baseSalary}, allowances ${before ? Number(before.allowances) : 0} -> ${allowances} (effective ${effectiveFrom})`
      );
      if (targetId !== session.uid) {
        await createNotification(db, {
          userId: targetId, type: "finance", title: "Your salary was updated",
          message: `${requester.username} updated your base salary/allowances, effective ${effectiveFrom}.`,
          entityType: "finance", entityId: targetId, project: ""
        });
      }
      return Response.json({ salary: serializeSalaryRow(saved) });
    }

    return Response.json({ error: "Unsupported method" }, { status: 405 });
  } catch (err: any) {
    return Response.json({ error: "Server error: " + err.message }, { status: 500 });
  }
};

export const config: Config = {
  path: ["/api/finance/employees", "/api/finance/employees/*"]
};
