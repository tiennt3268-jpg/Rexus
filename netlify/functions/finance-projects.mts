import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { getUserFromRequest, unauthorized } from "./lib/auth.mts";
import { getFullUser, isSystemAdmin, isManagerOrAdmin } from "./lib/rbac.mts";
import { getEffectiveRate } from "./lib/payroll.mts";

function round2(n: number) { return Math.round(n * 100) / 100; }
function toDateStr(v: any): string {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

// Finance — "by project" mode (see finance.mts for the "by personnel" mode).
// System Admin: every project in the system. Project Manager: only the
// projects THEY OWN (not merely projects they manage as a member) — a
// narrower scope than Finance's personnel view, by explicit request, so a
// Manager never sees another Manager's budget/spend here. Also rolls up
// a per-employee total across every project this requester can see, plus
// that total's project-by-project breakdown.
export default async (req: Request, context: Context) => {
  const session = await getUserFromRequest(req);
  if (!session) return unauthorized();
  if (req.method !== "GET") return Response.json({ error: "Unsupported method" }, { status: 405 });

  const db = getDatabase();
  const requester = await getFullUser(db, session.uid);
  if (!isManagerOrAdmin(requester)) {
    return Response.json({ error: "Finance is only available to a Project Manager or System Admin." }, { status: 403 });
  }
  const admin = isSystemAdmin(requester);

  try {
    const projectRows = admin
      ? await db.sql`SELECT user_id AS owner_id, owner, name, status, budget FROM projects ORDER BY name ASC`
      : await db.sql`SELECT user_id AS owner_id, owner, name, status, budget FROM projects WHERE user_id = ${session.uid} ORDER BY name ASC`;

    const projects: any[] = [];
    const byEmployee: Record<string, any> = {};

    for (const p of projectRows) {
      const budget = p.budget == null ? null : Number(p.budget);
      const rows = await db.sql`
        SELECT l.hours, l.date, l.status, l.logged_by, u.full_name AS employee_name, u.username AS employee_username
        FROM worklogs l
        JOIN tasks t ON t.id = l.task_id
        LEFT JOIN users u ON u.id = l.logged_by
        WHERE t.user_id = ${p.owner_id} AND t.project = ${p.name}
      `;

      let officialCost = 0, provisionalCost = 0;
      for (const r of rows) {
        const hours = r.hours == null ? 0 : Number(r.hours);
        const dateStr = toDateStr(r.date);
        const { rate } = await getEffectiveRate(db, r.logged_by, p.owner_id, p.name, dateStr);
        const cost = round2(hours * rate);
        provisionalCost += cost;
        if (r.status === "approved") officialCost += cost;

        const empId = r.logged_by || "unknown";
        if (!byEmployee[empId]) {
          byEmployee[empId] = {
            employee_id: empId,
            name: r.employee_name || r.employee_username || empId,
            total_official_cost: 0, total_provisional_cost: 0,
            by_project: {} as Record<string, { official_cost: number; provisional_cost: number }>
          };
        }
        const e = byEmployee[empId];
        e.total_provisional_cost += cost;
        if (r.status === "approved") e.total_official_cost += cost;
        if (!e.by_project[p.name]) e.by_project[p.name] = { official_cost: 0, provisional_cost: 0 };
        e.by_project[p.name].provisional_cost += cost;
        if (r.status === "approved") e.by_project[p.name].official_cost += cost;
      }

      projects.push({
        name: p.name,
        owner: p.owner || "",
        owner_id: p.owner_id,
        status: p.status || "Active",
        budget,
        official_cost: round2(officialCost),
        provisional_cost: round2(provisionalCost),
        official_remaining_budget: budget != null ? round2(budget - officialCost) : null,
        provisional_remaining_budget: budget != null ? round2(budget - provisionalCost) : null
      });
    }

    const by_employee = Object.values(byEmployee).map((e: any) => ({
      employee_id: e.employee_id,
      name: e.name,
      total_official_cost: round2(e.total_official_cost),
      total_provisional_cost: round2(e.total_provisional_cost),
      by_project: Object.keys(e.by_project).sort().map((proj) => ({
        project: proj,
        official_cost: round2(e.by_project[proj].official_cost),
        provisional_cost: round2(e.by_project[proj].provisional_cost)
      }))
    })).sort((a: any, b: any) => b.total_provisional_cost - a.total_provisional_cost);

    return Response.json({ scope: admin ? "all" : "owned", projects, by_employee });
  } catch (err: any) {
    return Response.json({ error: "Server error: " + err.message }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/finance/projects"
};
