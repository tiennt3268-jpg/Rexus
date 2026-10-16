import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { getUserFromRequest, unauthorized, verifyPassword } from "./lib/auth.mts";
import { getFullUser, isSystemAdmin, isManagerOrAdmin, serializeUserWithRole } from "./lib/rbac.mts";
import { getEffectiveSalary, getManagerScopedEmployeeIds, logFinanceAudit } from "./lib/payroll.mts";
import {
  computeTaskMetrics, computeScore, bonusPctForScore, parseTiers, currentPeriod,
  getPerformanceRow, upsertDraft, serializePerformanceRow
} from "./lib/performance.mts";
import { createNotification } from "./lib/notify.mts";
import { randomUUID } from "node:crypto";

// Performance-based pay is an opt-in module (company_settings.perf_pay_enabled)
// layered on top of Finance: same audience (Manager/Admin), same
// manager-scoping, and salary edits' "re-enter your password to finalize"
// pattern for the one action (finalize) that actually locks in a number.
export default async (req: Request, context: Context) => {
  const session = await getUserFromRequest(req);
  if (!session) return unauthorized();

  const db = getDatabase();
  const requester = await getFullUser(db, session.uid);
  const admin = isSystemAdmin(requester);
  const managerOrAdmin = isManagerOrAdmin(requester);

  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean); // ["api","performance", employeeId?, "finalize"?]
  const employeeId = parts[2] ? decodeURIComponent(parts[2]) : null;
  const isFinalizeAction = parts[3] === "finalize";

  try {
    const settingsRows = await db.sql`SELECT * FROM company_settings WHERE id = 1`;
    const settings = settingsRows[0] || {};
    if (!settings.perf_pay_enabled) {
      return Response.json({ error: "Performance-based pay is not enabled. Turn it on in Configuration first." }, { status: 403 });
    }
    const weights = {
      ontime: Number(settings.perf_weight_ontime ?? 40),
      completion: Number(settings.perf_weight_completion ?? 30),
      hours: Number(settings.perf_weight_hours ?? 20),
      manual: Number(settings.perf_weight_manual ?? 10)
    };
    const tiers = parseTiers(settings.perf_tiers);

    // Self-view is always allowed (transparency about your own score); any
    // other target requires Manager/Admin, further scoped for a Manager.
    const isSelf = !!employeeId && employeeId === session.uid;
    if (!isSelf) {
      if (!managerOrAdmin) return Response.json({ error: "Performance is only available to a Project Manager or System Admin." }, { status: 403 });
      if (!admin) {
        const scopedIds = await getManagerScopedEmployeeIds(db, session.uid);
        if (employeeId && scopedIds.indexOf(employeeId) === -1) {
          return Response.json({ error: "You do not manage this employee." }, { status: 403 });
        }
      }
    }

    if (!employeeId) return Response.json({ error: "Missing employee id" }, { status: 400 });
    const targetRows = await db.sql`SELECT id, username, email, full_name, avatar, role, position, department, status FROM users WHERE id = ${employeeId}`;
    if (!targetRows.length) return Response.json({ error: "Employee not found" }, { status: 404 });
    const target = targetRows[0];

    if (req.method === "GET") {
      const period = url.searchParams.get("period") || currentPeriod();
      const saved = await getPerformanceRow(db, employeeId, period);

      if (saved && saved.status === "finalized") {
        return Response.json({
          employee: serializeUserWithRole(target), period, weights, tiers,
          record: serializePerformanceRow(saved)
        });
      }

      const metrics = await computeTaskMetrics(db, employeeId, period);
      const manualRating = saved ? (saved.manual_rating == null ? null : Number(saved.manual_rating)) : null;
      const score = computeScore(metrics, manualRating, weights);
      const bonusPct = bonusPctForScore(score, tiers);
      const today = new Date().toISOString().slice(0, 10);
      const salary = await getEffectiveSalary(db, employeeId, today);
      const baseSalary = salary ? Number(salary.base_salary) : 0;
      const bonusAmount = Math.round(baseSalary * (bonusPct / 100));

      return Response.json({
        employee: serializeUserWithRole(target), period, weights, tiers,
        record: {
          id: saved ? saved.id : null,
          employee_id: employeeId, period,
          manual_rating: manualRating,
          ontime_rate: metrics.ontime_rate, completion_rate: metrics.completion_rate, hours_efficiency: metrics.hours_efficiency,
          task_count: metrics.task_count,
          score, bonus_pct: bonusPct,
          base_salary_snapshot: baseSalary, bonus_amount: bonusAmount,
          status: "draft", notes: saved ? (saved.notes || "") : ""
        }
      });
    }

    if (req.method === "PUT") {
      if (!managerOrAdmin) return Response.json({ error: "Only a Project Manager or System Admin can edit performance ratings." }, { status: 403 });
      const body = await req.json();
      const period = String(body.period || currentPeriod());
      const manualRating = body.manual_rating === "" || body.manual_rating == null ? null : Number(body.manual_rating);
      if (manualRating != null && (isNaN(manualRating) || manualRating < 0 || manualRating > 100)) {
        return Response.json({ error: "Manual rating must be between 0 and 100." }, { status: 400 });
      }
      const notes = String(body.notes || "");
      try {
        const saved = await upsertDraft(db, employeeId, period, manualRating, notes, session.uid);
        await logFinanceAudit(db, session.uid, "edit", employeeId,
          `${requester!.username} set the ${period} performance manual rating for "${target.full_name || target.username}" to ${manualRating == null ? "—" : manualRating}`);
        if (employeeId !== session.uid) {
          await createNotification(db, {
            userId: employeeId, type: "performance", title: `Your ${period} performance rating was updated`,
            message: `${requester!.username} set your manual rating to ${manualRating == null ? "—" : manualRating}.`,
            entityType: "performance", entityId: employeeId, project: ""
          });
        }
        return Response.json({ record: serializePerformanceRow(saved) });
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 409 });
      }
    }

    if (req.method === "POST" && isFinalizeAction) {
      if (!admin) return Response.json({ error: "Only a System Admin can finalize a performance period." }, { status: 403 });
      const body = await req.json();
      const period = String(body.period || currentPeriod());
      const confirmPassword = String(body.confirm_password || "");
      const authRows = await db.sql`SELECT password_hash FROM users WHERE id = ${session.uid}`;
      if (!authRows.length || !confirmPassword || !verifyPassword(confirmPassword, authRows[0].password_hash)) {
        return Response.json({ error: "Incorrect password. Re-enter your password to confirm this change." }, { status: 403 });
      }

      const existing = await getPerformanceRow(db, employeeId, period);
      if (existing && existing.status === "finalized") {
        return Response.json({ error: "This period has already been finalized." }, { status: 409 });
      }

      const metrics = await computeTaskMetrics(db, employeeId, period);
      const manualRating = existing ? (existing.manual_rating == null ? null : Number(existing.manual_rating)) : null;
      const score = computeScore(metrics, manualRating, weights);
      const bonusPct = bonusPctForScore(score, tiers);
      const today = new Date().toISOString().slice(0, 10);
      const salary = await getEffectiveSalary(db, employeeId, today);
      const baseSalary = salary ? Number(salary.base_salary) : 0;
      const bonusAmount = Math.round(baseSalary * (bonusPct / 100));
      const notes = existing ? (existing.notes || "") : "";

      let saved;
      if (existing) {
        const rows = await db.sql`
          UPDATE employee_performance SET
            ontime_rate = ${metrics.ontime_rate}, completion_rate = ${metrics.completion_rate},
            hours_efficiency = ${metrics.hours_efficiency}, score = ${score}, bonus_pct = ${bonusPct},
            base_salary_snapshot = ${baseSalary}, bonus_amount = ${bonusAmount},
            status = 'finalized', finalized_by = ${session.uid}, finalized_at = NOW(), updated_at = NOW()
          WHERE id = ${existing.id}
          RETURNING *
        `;
        saved = rows[0];
      } else {
        const id = "EP" + randomUUID().slice(0, 8).toUpperCase();
        const rows = await db.sql`
          INSERT INTO employee_performance (
            id, employee_id, period, manual_rating, ontime_rate, completion_rate, hours_efficiency,
            score, bonus_pct, base_salary_snapshot, bonus_amount, status, notes, created_by,
            finalized_by, finalized_at
          )
          VALUES (
            ${id}, ${employeeId}, ${period}, ${manualRating}, ${metrics.ontime_rate}, ${metrics.completion_rate},
            ${metrics.hours_efficiency}, ${score}, ${bonusPct}, ${baseSalary}, ${bonusAmount}, 'finalized', ${notes},
            ${session.uid}, ${session.uid}, NOW()
          )
          RETURNING *
        `;
        saved = rows[0];
      }

      await logFinanceAudit(db, session.uid, "edit", employeeId,
        `${requester!.username} finalized the ${period} performance bonus for "${target.full_name || target.username}": ` +
        `score ${score == null ? "—" : score}, bonus ${bonusPct}% = ${bonusAmount}`);
      if (employeeId !== session.uid) {
        await createNotification(db, {
          userId: employeeId, type: "performance", title: `Your ${period} performance bonus was finalized`,
          message: `Score ${score == null ? "—" : score}/100 → ${bonusPct}% bonus (${bonusAmount.toLocaleString("vi-VN")}).`,
          entityType: "performance", entityId: employeeId, project: ""
        });
      }
      return Response.json({ record: serializePerformanceRow(saved) });
    }

    return Response.json({ error: "Unsupported method" }, { status: 405 });
  } catch (err: any) {
    return Response.json({ error: "Server error: " + err.message }, { status: 500 });
  }
};

export const config: Config = {
  path: ["/api/performance/*"]
};
