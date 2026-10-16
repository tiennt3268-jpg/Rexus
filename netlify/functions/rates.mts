import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { getUserFromRequest, unauthorized } from "./lib/auth.mts";
import { getFullUser, isSystemAdmin } from "./lib/rbac.mts";
import {
  setEmployeeRate, setEmployeeProjectRate,
  getEmployeeRateHistory, getEmployeeProjectRateHistory, serializeRateRow
} from "./lib/payroll.mts";
import { createNotification } from "./lib/notify.mts";

function todayStr() { return new Date().toISOString().slice(0, 10); }

// Quản lý lương/giờ (mặc định + override theo dự án) chỉ dành cho
// System Admin — kể cả Project Manager cũng không có quyền này.
export default async (req: Request, context: Context) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const db = getDatabase();
  const requester = await getFullUser(db, user.uid);
  if (!isSystemAdmin(requester)) {
    return Response.json({ error: "Only a System Admin can manage hourly rates." }, { status: 403 });
  }

  const url = new URL(req.url);

  try {
    if (req.method === "GET") {
      const employeeId = url.searchParams.get("employee_id");
      if (!employeeId) return Response.json({ error: "Missing employee_id" }, { status: 400 });
      const scope = url.searchParams.get("scope") || "default";

      if (scope === "project") {
        const projectOwnerId = url.searchParams.get("project_owner_id") || "";
        const projectName = url.searchParams.get("project_name") || "";
        if (!projectOwnerId || !projectName) {
          return Response.json({ error: "Missing project_owner_id or project_name" }, { status: 400 });
        }
        const rows = await getEmployeeProjectRateHistory(db, employeeId, projectOwnerId, projectName);
        return Response.json({ history: rows.map(serializeRateRow) });
      }

      const rows = await getEmployeeRateHistory(db, employeeId);
      return Response.json({ history: rows.map(serializeRateRow) });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const employeeId = body.employee_id;
      const hourlyRate = Number(body.hourly_rate);
      const effectiveFrom = body.effective_from || todayStr();
      if (!employeeId) return Response.json({ error: "Missing employee_id" }, { status: 400 });
      if (!(hourlyRate >= 0)) return Response.json({ error: "hourly_rate must be a non-negative number" }, { status: 400 });

      const scope = body.scope || "default";
      if (scope === "project") {
        const projectOwnerId = body.project_owner_id;
        const projectName = body.project_name;
        if (!projectOwnerId || !projectName) {
          return Response.json({ error: "Missing project_owner_id or project_name" }, { status: 400 });
        }
        const row = await setEmployeeProjectRate(db, employeeId, projectOwnerId, projectName, hourlyRate, effectiveFrom, user.uid);
        if (employeeId !== user.uid) {
          await createNotification(db, {
            userId: employeeId, type: "finance", title: "Your hourly rate was updated",
            message: `${user.username} updated your rate for project "${projectName}", effective ${effectiveFrom}.`,
            entityType: "finance", entityId: employeeId, project: projectName
          });
        }
        return Response.json(serializeRateRow(row));
      }

      const row = await setEmployeeRate(db, employeeId, hourlyRate, effectiveFrom, user.uid);
      if (employeeId !== user.uid) {
        await createNotification(db, {
          userId: employeeId, type: "finance", title: "Your hourly rate was updated",
          message: `${user.username} updated your default hourly rate, effective ${effectiveFrom}.`,
          entityType: "finance", entityId: employeeId, project: ""
        });
      }
      return Response.json(serializeRateRow(row));
    }

    return Response.json({ error: "Unsupported method" }, { status: 405 });
  } catch (err: any) {
    return Response.json({ error: "Server error: " + err.message }, { status: 500 });
  }
};

export const config: Config = {
  path: ["/api/rates", "/api/rates/*"]
};
