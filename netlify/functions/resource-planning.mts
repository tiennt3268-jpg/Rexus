/* REXUS v2.2.1 — Resource Planning & Capacity API (Module 2).
   GET  /api/resource-planning?from&to&detail=1&user_id=&department=&employment_type=&project_owner=&project=
   GET  /api/resource-planning?availability=1&from&to&min_hours=   → employees with remaining confirmed capacity
   GET  /api/resource-planning?preview=1&user_id&task_id&from&to&hours → capacity impact of an allocation before saving
   POST {task_id,user_id,planned_hours,start_date,end_date}          → explicit allocation (multi-assignee effort split)
   POST {action:'estimate', kind:'task'|'subtask', id, estimated_hours} → fill a missing estimate
   DELETE {id}                                                        → remove an allocation
   Resource planning is advisory: nothing here reassigns, re-dates, blocks or edits tasks / worklogs. */
import type { Context, Config } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { randomUUID } from 'node:crypto';
import { getUserFromRequest, unauthorized } from './lib/auth.mts';
import { getFullUser, isSystemAdmin, isManagerOrAdmin, getEffectiveProjectRole, roleCanManage } from './lib/rbac.mts';
import { computeResourcePlan, isDay, eachDay } from './lib/capacity.mts';

const fail = (m: string, s = 400) => Response.json({ error: m }, { status: s });

async function visibleUserIds(db: any, me: any): Promise<string[] | null> {
  if (isManagerOrAdmin(me)) return null; // all
  const ids = new Set<string>([me.id]);
  (await db.sql`SELECT user_id FROM rexus_resource_settings WHERE manager_id = ${me.id} OR capacity_approver_id = ${me.id}`).forEach((r: any) => ids.add(r.user_id));
  (await db.sql`SELECT u.id FROM departments d JOIN users u ON u.department = d.name WHERE d.head_user_id = ${me.id}`).forEach((r: any) => ids.add(r.id));
  return [...ids];
}

export default async (req: Request, _ctx: Context) => {
  const session = await getUserFromRequest(req); if (!session) return unauthorized();
  const db = getDatabase(), url = new URL(req.url);
  try {
    const me = await getFullUser(db, session.uid); if (!me) return unauthorized();
    if (req.method === 'GET') {
      const today = new Date();
      const from = url.searchParams.get('from') || today.toISOString().slice(0, 7) + '-01';
      const to = url.searchParams.get('to') || new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
      if (!isDay(from) || !isDay(to) || to < from || eachDay(from, to).length > 366) return fail('Invalid date interval (max 366 days)');
      const visible = await visibleUserIds(db, me);
      let ids = visible;
      const one = url.searchParams.get('user_id');
      if (one) { if (visible && !visible.includes(one)) return fail('Not permitted', 403); ids = [one]; }
      const projectOwner = url.searchParams.get('project_owner'), projectName = url.searchParams.get('project');
      if (url.searchParams.get('preview')) {
        const uid = String(one || ''); const hours = Number(url.searchParams.get('hours'));
        if (!uid || !(hours >= 0)) return fail('user_id and hours required');
        const base = await computeResourcePlan(db, { from, to, userIds: [uid] });
        const e = base.employees[0]; if (!e) return fail('Employee not found', 404);
        const workDays = eachDay(from, to).length;
        const afterPlanned = e.planned_hours + hours;
        return Response.json({ employee: e.name, capacity: e.approved_capacity, capacity_status: e.capacity_status, planned_before: e.planned_hours, planned_after: Math.round(afterPlanned * 100) / 100,
          utilization_before: e.utilization, utilization_after: e.approved_capacity ? Math.round((afterPlanned / e.approved_capacity) * 10000) / 100 : null,
          overload_after: e.approved_capacity === null ? null : Math.max(0, Math.round((afterPlanned - e.approved_capacity) * 100) / 100), days: workDays });
      }
      const plan = await computeResourcePlan(db, { from, to, userIds: ids || undefined, detail: url.searchParams.get('detail') === '1',
        project: projectOwner && projectName ? { owner: projectOwner, name: projectName } : null });
      let employees = plan.employees;
      const dep = url.searchParams.get('department'), et = url.searchParams.get('employment_type'), cs = url.searchParams.get('capacity_status'), st = url.searchParams.get('status');
      if (dep) employees = employees.filter((e: any) => e.department === dep);
      if (et) employees = employees.filter((e: any) => e.employment_type === et);
      if (cs) employees = employees.filter((e: any) => e.capacity_status === cs);
      if (st) employees = employees.filter((e: any) => e.status === st);
      if (projectOwner && projectName) employees = employees.filter((e: any) => e.projects.includes(projectName) || e.planned_hours > 0);
      if (url.searchParams.get('availability')) {
        const min = Number(url.searchParams.get('min_hours') || 1);
        employees = employees.filter((e: any) => e.remaining_hours !== null && e.remaining_hours >= min).sort((a: any, b: any) => b.remaining_hours - a.remaining_hours);
      }
      const pendingApprovals = (await db.sql`SELECT COUNT(*)::int AS n FROM rexus_capacity_declarations WHERE status = 'Pending Approval'`)[0].n;
      const visibleIds = new Set(employees.map((e: any) => e.id));
      const summary = {
        approved_capacity: Math.round(employees.reduce((s: number, e: any) => s + (e.approved_capacity ?? e.approved_capacity_partial ?? 0), 0) * 100) / 100,
        planned_hours: Math.round(employees.reduce((s: number, e: any) => s + e.planned_hours, 0) * 100) / 100,
        actual_hours: Math.round(employees.reduce((s: number, e: any) => s + e.actual_hours, 0) * 100) / 100,
        remaining_hours: Math.round(employees.reduce((s: number, e: any) => s + (e.remaining_hours || 0), 0) * 100) / 100,
        overloaded: employees.filter((e: any) => e.status === 'Overloaded').length,
        underutilized: employees.filter((e: any) => e.utilization !== null && e.utilization < 50).length,
        pending_capacity_approvals: pendingApprovals,
        missing_declarations: employees.filter((e: any) => e.capacity_status === 'Missing Declaration').length,
        unconfirmed_capacity_employees: employees.filter((e: any) => e.approved_capacity === null).length
      };
      return Response.json({ ...plan, employees, summary, unestimated: plan.unestimated.filter((u: any) => !u.assignee_id || visibleIds.has(u.assignee_id) || !visible), can_manage: isManagerOrAdmin(me) });
    }

    if (req.method !== 'POST' && req.method !== 'DELETE') return fail('Method not supported', 405);
    const b = await req.json().catch(() => ({}));
    if (req.method === 'DELETE') {
      if (!b.id) return fail('Missing allocation id');
      const exists = await db.sql`SELECT a.id, t.user_id, t.project FROM rexus_resource_allocations a JOIN tasks t ON t.id = a.task_id WHERE a.id = ${String(b.id)}`;
      if (!exists.length) return fail('Allocation not found', 404);
      if (!roleCanManage(await getEffectiveProjectRole(db, exists[0].user_id, exists[0].project, session.uid, me.role))) return fail('Project management access required', 403);
      await db.sql`DELETE FROM rexus_resource_allocations WHERE id = ${String(b.id)}`;
      return Response.json({ ok: true });
    }
    if (b.action === 'estimate') {
      const hours = Number(b.estimated_hours); if (!(hours > 0 && hours < 10000)) return fail('Estimate must be a positive number of hours');
      const row = b.kind === 'subtask'
        ? (await db.sql`SELECT t.user_id, t.project FROM subtasks s JOIN tasks t ON t.id = s.task_id WHERE s.id = ${String(b.id || '')}`)[0]
        : (await db.sql`SELECT user_id, project FROM tasks WHERE id = ${String(b.id || '')}`)[0];
      if (!row) return fail('Not found', 404);
      if (!roleCanManage(await getEffectiveProjectRole(db, row.user_id, row.project, session.uid, me.role))) return fail('Project management access required', 403);
      if (b.kind === 'subtask') await db.sql`UPDATE subtasks SET estimated_hours = ${hours}, updated_at = NOW() WHERE id = ${String(b.id)}`;
      else await db.sql`UPDATE tasks SET estimated_hours = ${hours}, updated_at = NOW() WHERE id = ${String(b.id)}`;
      return Response.json({ ok: true });
    }
    if (b.action === 'settings' || b.action === 'day_off') {
      // v2.1.0 compatibility: schedule changes now live in /api/hr/profile and /api/hr/holidays (with history).
      if (!isSystemAdmin(me)) return fail('System Admin access required', 403);
      if (b.action === 'day_off') {
        if (!isDay(b.day) || !b.user_id) return fail('Invalid unavailable day');
        await db.sql`INSERT INTO rexus_resource_days_off(id,user_id,day,reason,kind,hours,created_by) VALUES (${randomUUID()},${b.user_id},${b.day},${String(b.reason || '').slice(0, 200)},'unavailable',${b.hours ? Number(b.hours) : null},${session.uid}) ON CONFLICT(user_id,day) DO NOTHING`;
        return Response.json({ ok: true });
      }
      return fail('Use /api/hr/profile to change schedules (keeps capacity history)', 410);
    }
    const hours = Number(b.planned_hours);
    if (!b.task_id || !b.user_id || !isDay(b.start_date) || !isDay(b.end_date) || b.end_date < b.start_date || !Number.isFinite(hours) || hours < 0) return fail('Invalid allocation');
    const task = await db.sql`SELECT id, user_id, project FROM tasks WHERE id = ${String(b.task_id)}`;
    if (!task.length) return fail('Task does not exist', 404);
    if (!roleCanManage(await getEffectiveProjectRole(db, task[0].user_id, task[0].project, session.uid, me.role))) return fail('Project management access required', 403);
    const target = await db.sql`SELECT id FROM users WHERE id = ${String(b.user_id)} AND status = 'Active'`;
    if (!target.length) return fail('Employee account must be active');
    await db.sql`INSERT INTO rexus_resource_allocations(id,task_id,user_id,planned_hours,start_date,end_date,created_by) VALUES (${randomUUID()},${String(b.task_id)},${String(b.user_id)},${hours},${b.start_date},${b.end_date},${session.uid})
      ON CONFLICT(task_id,user_id,start_date,end_date) DO UPDATE SET planned_hours = EXCLUDED.planned_hours, updated_at = NOW()`;
    return Response.json({ ok: true });
  } catch (e: any) { return fail('Resource planning error: ' + (e?.message || 'unknown'), 500); }
};
export const config: Config = { path: '/api/resource-planning' };
