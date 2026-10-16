import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { getUserFromRequest, unauthorized } from "./lib/auth.mts";
import { getFullUser, getEffectiveProjectRole, roleCanManage } from "./lib/rbac.mts";
import { findProjectOwnerAccessibleToUser } from "./lib/collab.mts";
import { getEffectiveRate } from "./lib/payroll.mts";

function toDateStr(v: any): string {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}
function round2(n: number) { return Math.round(n * 100) / 100; }

// Chi phí dự án: chính thức (chỉ dòng approved) + tạm tính (approved +
// submitted), theo đúng chi phí = số giờ × mức lương hiệu lực TẠI NGÀY
// của từng dòng — không dùng mức lương hiện tại. Chỉ PM (dự án mình
// quản lý) hoặc Admin xem được.
export default async (req: Request, context: Context) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();
  if (req.method !== "GET") return Response.json({ error: "Unsupported method" }, { status: 405 });

  const db = getDatabase();
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean); // ["api","project-cost", "<project name>"]
  const projectName = parts[2] ? decodeURIComponent(parts[2]) : null;
  if (!projectName) return Response.json({ error: "Missing project name" }, { status: 400 });

  try {
    const ownerId = await findProjectOwnerAccessibleToUser(db, projectName, user.uid);
    if (!ownerId) return Response.json({ error: "Project not found or not accessible." }, { status: 404 });

    const requester = await getFullUser(db, user.uid);
    const effRole = await getEffectiveProjectRole(db, ownerId, projectName, user.uid, requester?.role);
    if (!roleCanManage(effRole)) {
      return Response.json({ error: "Only this project's Manager/Owner or a System Admin can view its cost." }, { status: 403 });
    }

    const projRows = await db.sql`SELECT budget FROM projects WHERE user_id = ${ownerId} AND name = ${projectName}`;
    const budget = projRows.length && projRows[0].budget != null ? Number(projRows[0].budget) : null;

    const rows = await db.sql`
      SELECT l.id, l.hours, l.date, l.status, l.logged_by, l.description, t.task AS task_name,
             u.full_name AS employee_name, u.username AS employee_username, u.avatar AS employee_avatar
      FROM worklogs l
      JOIN tasks t ON t.id = l.task_id
      LEFT JOIN users u ON u.id = l.logged_by
      WHERE t.user_id = ${ownerId} AND t.project = ${projectName}
      ORDER BY l.date ASC
    `;

    let officialHours = 0, officialCost = 0, provisionalHours = 0, provisionalCost = 0;
    const byEmployee: Record<string, any> = {};
    const lines: any[] = [];

    for (const r of rows) {
      const hours = r.hours == null ? 0 : Number(r.hours);
      const dateStr = toDateStr(r.date);
      const { rate } = await getEffectiveRate(db, r.logged_by, ownerId, projectName, dateStr);
      const cost = round2(hours * rate);
      const isApproved = r.status === "approved";

      lines.push({
        id: r.id, date: dateStr, status: r.status, hours, rate, cost,
        employee_id: r.logged_by || "", employee_name: r.employee_name || r.employee_username || r.logged_by || "",
        task_name: r.task_name || "", description: r.description || ""
      });

      provisionalHours += hours;
      provisionalCost += cost;
      if (isApproved) { officialHours += hours; officialCost += cost; }

      const empId = r.logged_by || "unknown";
      if (!byEmployee[empId]) {
        byEmployee[empId] = {
          employee_id: empId,
          name: r.employee_name || r.employee_username || empId,
          official_hours: 0, official_cost: 0,
          provisional_hours: 0, provisional_cost: 0,
          rate_segments: {} as Record<string, { rate: number; hours: number; cost: number }>
        };
      }
      const e = byEmployee[empId];
      e.provisional_hours += hours;
      e.provisional_cost += cost;
      if (isApproved) { e.official_hours += hours; e.official_cost += cost; }
      const rateKey = String(rate);
      if (!e.rate_segments[rateKey]) e.rate_segments[rateKey] = { rate, hours: 0, cost: 0 };
      e.rate_segments[rateKey].hours += hours;
      e.rate_segments[rateKey].cost += cost;
    }

    const by_employee = Object.values(byEmployee).map((e: any) => ({
      employee_id: e.employee_id,
      name: e.name,
      official_hours: round2(e.official_hours),
      official_cost: round2(e.official_cost),
      provisional_hours: round2(e.provisional_hours),
      provisional_cost: round2(e.provisional_cost),
      rate_segments: Object.values(e.rate_segments).map((s: any) => ({
        rate: s.rate, hours: round2(s.hours), cost: round2(s.cost)
      }))
    })).sort((a: any, b: any) => a.name.localeCompare(b.name));

    return Response.json({
      project: projectName,
      budget,
      official: { total_hours: round2(officialHours), total_cost: round2(officialCost) },
      provisional: { total_hours: round2(provisionalHours), total_cost: round2(provisionalCost) },
      official_remaining_budget: budget != null ? round2(budget - officialCost) : null,
      provisional_remaining_budget: budget != null ? round2(budget - provisionalCost) : null,
      by_employee,
      lines
    });
  } catch (err: any) {
    return Response.json({ error: "Server error: " + err.message }, { status: 500 });
  }
};

export const config: Config = {
  path: ["/api/project-cost/*"]
};
