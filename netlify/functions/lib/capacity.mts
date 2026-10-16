/* =============================================================================
   REXUS v2.2.1 — capacity / planned / actual engine (Modules 2, 4, 10).

   Three independent quantities per employee and period:
     Capacity — confirmed available hours (schedule- or declaration-based)
     Planned  — allocated estimated effort from Tasks / Subtasks
     Actual   — recorded Worklog hours
   The pure functions below take plain rows so they can be unit-tested; the
   loader at the bottom reads them from the database. Nothing here writes.
   See docs/v2.2.1/03-CAPACITY-AND-LEAVE.md for the full rule set.
   ========================================================================== */

export type Profile = {
  user_id: string; employment_type: string; capacity_method: 'schedule' | 'declaration';
  hours_per_day: number; workdays: number[]; effective_from: string | null;
};
export type DayOff = { user_id: string | null; day: string; kind: string; hours: number | null };
export type Leave = { user_id: string; start_date: string; end_date: string; unit: 'full' | 'half' | 'hourly'; hours: number | null; status: string };
export type Declaration = { user_id: string; month: string; status: string; entries: { day: string; hours: number; availability: string }[]; total_hours: number };
export type TaskRow = { id: string; task: string; project: string; user_id: string; status: string; estimated_hours: number | null;
  start_date: string | null; due_date: string | null; assignee_id: string | null };
export type SubtaskRow = { id: string; task_id: string; name: string; status: string; estimated_hours: number | null; due_date: string | null; assignee_id: string | null };
export type Allocation = { task_id: string; user_id: string; planned_hours: number; start_date: string; end_date: string };
export type Worklog = { user_id: string; date: string; hours: number };

export const DEFAULT_PROFILE = (user_id: string): Profile => ({
  user_id, employment_type: 'Full-time', capacity_method: 'schedule', hours_per_day: 8, workdays: [1, 2, 3, 4, 5], effective_from: null
});
export const DECLARATION_TYPES = ['Part-time', 'Freelancer', 'Contractor', 'Collaborator'];
export const NEAR_CAPACITY_THRESHOLD = 85;   // % — configurable constant
export const OVERLOAD_THRESHOLD = 100;       // %

const r2 = (n: number) => Math.round(n * 100) / 100;
export const isDay = (s: any) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
export const dayStr = (v: any): string | null => { if (!v) return null; const s = v instanceof Date ? v.toISOString() : String(v); return isDay(s.slice(0, 10)) ? s.slice(0, 10) : null; };
export function eachDay(from: string, to: string, max = 400): string[] {
  const out: string[] = [];
  for (let d = new Date(from + 'T12:00:00Z'); d <= new Date(to + 'T12:00:00Z') && out.length < max; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}
const weekday = (day: string) => new Date(day + 'T12:00:00Z').getUTCDay();
export const monthOf = (day: string) => day.slice(0, 7);

/** The schedule in force on a given day: the newest history row whose effective_from ≤ day. */
export function profileOn(history: Profile[], current: Profile, day: string): Profile {
  let best: Profile | null = null;
  for (const h of history) if (h.effective_from && h.effective_from <= day && (!best || (best.effective_from || '') < h.effective_from)) best = h;
  // The first profile change also records the prior schedule with effective_from 1900-01-01 (see hr.mts),
  // so a day before every recorded change falls back to the current row only when there is no history at all.
  return best || current;
}

export type DayCell = { day: string; scheduled: number; capacity: number | null; leave: number; holiday: string | null; off: boolean; planned: number; actual: number; source: 'schedule' | 'declaration' };

/**
 * Daily capacity for one employee.
 *  schedule method:    workday? hours_per_day : 0, minus holidays, personal days off and approved leave.
 *  declaration method: approved declared hours for that day (unconfirmed month → capacity null),
 *                      minus approved leave; company-wide holidays force 0.
 * Overlapping leave on one day never deducts more than the day's hours (no double deduction),
 * and leave falling on a holiday / rest day deducts nothing.
 */
export function dailyCapacity(opts: { userId: string; from: string; to: string; current: Profile; history: Profile[]; daysOff: DayOff[]; leaves: Leave[]; declarations: Declaration[] }): { cells: DayCell[]; months: Record<string, string> } {
  const { userId, from, to, current, history, daysOff, leaves, declarations } = opts;
  const global = new Map<string, DayOff>(), personal = new Map<string, DayOff>();
  for (const d of daysOff) { if (d.user_id === null || d.user_id === undefined) global.set(d.day, d); else if (d.user_id === userId) personal.set(d.day, d); }
  const approvedDecl = new Map<string, Declaration>(); const monthStatus: Record<string, string> = {};
  for (const d of declarations.filter(x => x.user_id === userId)) {
    if (d.status === 'Approved') approvedDecl.set(d.month, d);
    else if (['Pending Approval'].includes(d.status) && !monthStatus[d.month]) monthStatus[d.month] = 'Pending Approval';
    else if (['Rejected', 'Changes Requested'].includes(d.status) && !monthStatus[d.month]) monthStatus[d.month] = d.status;
    else if (d.status === 'Draft' && !monthStatus[d.month]) monthStatus[d.month] = 'Draft';
  }
  const myLeaves = leaves.filter(l => l.user_id === userId && l.status === 'Approved');
  const cells: DayCell[] = [];
  for (const day of eachDay(from, to)) {
    const p = profileOn(history, current, day);
    const hol = global.get(day);
    const isHoliday = !!hol && (hol.hours === null || hol.hours === undefined);
    let base = 0, source: 'schedule' | 'declaration' = p.capacity_method;
    let confirmed = true;
    if (p.capacity_method === 'declaration') {
      const decl = approvedDecl.get(monthOf(day));
      if (!decl) { confirmed = false; monthStatus[monthOf(day)] = monthStatus[monthOf(day)] || 'Missing Declaration'; }
      else {
        monthStatus[monthOf(day)] = 'Approved';
        const e = decl.entries.find(x => x.day === day);
        base = e && e.availability !== 'unavailable' ? Math.max(0, Math.min(24, Number(e.hours) || 0)) : 0;
      }
    } else {
      monthStatus[monthOf(day)] = monthStatus[monthOf(day)] || 'Approved';
      base = p.workdays.includes(weekday(day)) ? Math.max(0, Math.min(24, Number(p.hours_per_day) || 0)) : 0;
    }
    if (isHoliday) base = 0;
    else if (hol && hol.hours) base = Math.max(0, base - Number(hol.hours));
    const off = personal.get(day);
    if (off) base = off.hours ? Math.max(0, base - Number(off.hours)) : 0;
    // Approved leave: take the LARGEST deduction among overlapping leaves for the day (not the sum).
    let leaveH = 0;
    if (base > 0) for (const l of myLeaves) {
      if (day < l.start_date || day > l.end_date) continue;
      const hpd = p.capacity_method === 'declaration' ? base : Number(p.hours_per_day) || 0;
      const h = l.unit === 'full' ? hpd : l.unit === 'half' ? hpd / 2 : Math.min(hpd, Number(l.hours) || 0);
      leaveH = Math.max(leaveH, h);
    }
    leaveH = Math.min(leaveH, base);
    cells.push({ day, scheduled: base, capacity: confirmed ? r2(base - leaveH) : null, leave: r2(leaveH), holiday: isHoliday ? (hol!.kind || 'holiday') : null, off: !!off && !off.hours, planned: 0, actual: 0, source });
  }
  return { cells, months: monthStatus };
}

/** Duration of a leave request in hours (used for display + validation), using the employee's schedule. */
export function leaveDuration(l: Pick<Leave, 'start_date' | 'end_date' | 'unit' | 'hours'>, profile: Profile, holidays: DayOff[]): number {
  const globalHol = new Set(holidays.filter(h => h.user_id === null && !h.hours).map(h => h.day));
  let total = 0;
  for (const day of eachDay(l.start_date, l.end_date)) {
    if (globalHol.has(day)) continue;
    if (profile.capacity_method === 'schedule' && !profile.workdays.includes(weekday(day))) continue;
    const hpd = Number(profile.hours_per_day) || 8;
    total += l.unit === 'full' ? hpd : l.unit === 'half' ? hpd / 2 : Math.min(hpd, Number(l.hours) || 0);
  }
  return r2(total);
}

export type PlanItem = { kind: 'task' | 'subtask' | 'allocation'; task_id: string; subtask_id?: string; name: string; project: string; owner_id: string;
  user_id: string; hours: number; start: string | null; end: string | null; rollup?: boolean };

/**
 * Planned-effort items, avoiding double counting:
 *  - Subtask estimates are counted for the subtask assignee (falls back to the task assignee).
 *  - A parent task estimate ≤ the sum of its subtask estimates is a roll-up → not counted again.
 *    A parent estimate larger than that sum counts only the independent remainder.
 *  - Explicit allocations (rexus_resource_allocations) for a task REPLACE the task's own portion,
 *    which is how effort is split across several people. Total estimates are never multiplied.
 *  - Missing estimates are reported as "unestimated", never as zero effort.
 *  - Cancelled tasks/subtasks are excluded.
 */
export function planItems(tasks: TaskRow[], subtasks: SubtaskRow[], allocations: Allocation[]): { items: PlanItem[]; unestimated: any[] } {
  const items: PlanItem[] = []; const unestimated: any[] = [];
  const subsByTask = new Map<string, SubtaskRow[]>();
  for (const s of subtasks) { if (!subsByTask.has(s.task_id)) subsByTask.set(s.task_id, []); subsByTask.get(s.task_id)!.push(s); }
  const allocByTask = new Map<string, Allocation[]>();
  for (const a of allocations) { if (!allocByTask.has(a.task_id)) allocByTask.set(a.task_id, []); allocByTask.get(a.task_id)!.push(a); }
  for (const t of tasks) {
    if (t.status === 'Cancelled') continue;
    const subs = (subsByTask.get(t.id) || []).filter(s => s.status !== 'Cancelled');
    let subSum = 0;
    for (const s of subs) {
      const est = Number(s.estimated_hours) || 0;
      const who = s.assignee_id || t.assignee_id;
      if (est <= 0) { unestimated.push({ kind: 'subtask', id: s.id, task_id: t.id, name: s.name, project: t.project, owner_id: t.user_id, assignee_id: who }); continue; }
      subSum += est;
      if (who) items.push({ kind: 'subtask', task_id: t.id, subtask_id: s.id, name: s.name, project: t.project, owner_id: t.user_id, user_id: who, hours: est,
        start: dayStr(t.start_date) || dayStr(s.due_date), end: dayStr(s.due_date) || dayStr(t.due_date) });
    }
    const est = Number(t.estimated_hours) || 0;
    const explicit = allocByTask.get(t.id) || [];
    if (explicit.length) {
      for (const a of explicit) items.push({ kind: 'allocation', task_id: t.id, name: t.task, project: t.project, owner_id: t.user_id, user_id: a.user_id, hours: Number(a.planned_hours) || 0, start: dayStr(a.start_date), end: dayStr(a.end_date) });
      continue;
    }
    if (est <= 0) { if (!subs.length || subSum === 0) unestimated.push({ kind: 'task', id: t.id, name: t.task, project: t.project, owner_id: t.user_id, assignee_id: t.assignee_id }); continue; }
    const own = subs.length && subSum > 0 ? Math.max(0, est - subSum) : est;
    if (own > 0 && t.assignee_id) items.push({ kind: 'task', task_id: t.id, name: t.task, project: t.project, owner_id: t.user_id, user_id: t.assignee_id, hours: r2(own),
      start: dayStr(t.start_date) || dayStr(t.due_date), end: dayStr(t.due_date) || dayStr(t.start_date), rollup: subs.length > 0 && est <= subSum });
  }
  return { items, unestimated };
}

/**
 * Spread one item's hours across the assignee's working days in [start,end].
 * Unscheduled items (no dates) are returned separately and never pushed into "this month".
 * If the range contains no working day, the effort lands on the end date (it is still owed).
 */
export function distribute(item: PlanItem, isWorking: (day: string) => boolean): Map<string, number> | null {
  if (!item.start && !item.end) return null;
  const start = item.start || item.end!, end = item.end && item.end >= start ? item.end : start;
  const days = eachDay(start, end, 3700);
  const work = days.filter(isWorking);
  const target = work.length ? work : [end];
  const per = item.hours / target.length;
  const m = new Map<string, number>();
  for (const d of target) m.set(d, (m.get(d) || 0) + per);
  return m;
}

export function statusFor(capacity: number | null, planned: number, monthStates: string[]): { status: string; utilization: number | null } {
  if (capacity === null) {
    if (monthStates.includes('Pending Approval')) return { status: 'Pending Approval', utilization: null };
    return { status: 'Missing Declaration', utilization: null };
  }
  if (capacity <= 0) return { status: planned > 0 ? 'Overloaded' : 'Unavailable', utilization: null };
  const u = (planned / capacity) * 100;
  return { status: u > OVERLOAD_THRESHOLD ? 'Overloaded' : u >= NEAR_CAPACITY_THRESHOLD ? 'Near Capacity' : 'Available', utilization: r2(u) };
}

/* ----------------------------------------------------------------- loader */
const num = (v: any) => (v === null || v === undefined ? null : Number(v));
function parseWorkdays(s: any): number[] { try { const v = JSON.parse(s || '[]'); if (Array.isArray(v)) return v.map(Number).filter(x => Number.isInteger(x) && x >= 0 && x <= 6); } catch {} return [1, 2, 3, 4, 5]; }
export function toProfile(row: any, userId: string): Profile {
  if (!row) return DEFAULT_PROFILE(userId);
  return { user_id: userId, employment_type: row.employment_type || 'Full-time', capacity_method: row.capacity_method === 'declaration' ? 'declaration' : 'schedule',
    hours_per_day: Number(row.hours_per_day ?? 8), workdays: parseWorkdays(row.workdays), effective_from: dayStr(row.effective_from) };
}

export async function computeResourcePlan(db: any, opts: { from: string; to: string; userIds?: string[]; detail?: boolean; project?: { owner: string; name: string } | null }) {
  const { from, to } = opts;
  const users = await db.sql`SELECT id,username,full_name,department,position,status FROM users WHERE status='Active' ORDER BY full_name`;
  const wanted = opts.userIds && opts.userIds.length ? users.filter((u: any) => opts.userIds!.includes(u.id)) : users;
  const ids = wanted.map((u: any) => u.id);
  if (!ids.length) return { from, to, employees: [], unestimated: [], unscheduled: [] };
  const settings = await db.sql`SELECT * FROM rexus_resource_settings WHERE user_id = ANY(${ids})`;
  const hist = await db.sql`SELECT * FROM rexus_resource_settings_history WHERE user_id = ANY(${ids}) ORDER BY effective_from`;
  const daysOff = await db.sql`SELECT user_id,day,kind,hours FROM rexus_resource_days_off WHERE day >= ${from} AND day <= ${to}`;
  const leaves = await db.sql`SELECT * FROM rexus_leave_requests WHERE status='Approved' AND user_id = ANY(${ids}) AND start_date <= ${to} AND end_date >= ${from}`;
  const months = [...new Set(eachDay(from, to).map(monthOf))];
  const decls = await db.sql`SELECT * FROM rexus_capacity_declarations WHERE user_id = ANY(${ids}) AND month = ANY(${months}) AND status <> 'Superseded'`;
  const declIds = decls.filter((d: any) => d.status === 'Approved').map((d: any) => d.id);
  const entries = declIds.length ? await db.sql`SELECT * FROM rexus_capacity_entries WHERE declaration_id = ANY(${declIds})` : [];
  // Planned: every task whose window can touch the period (unscheduled ones are reported separately).
  let tasks = await db.sql`SELECT id,task,project,user_id,status,estimated_hours,start_date,due_date,assignee_id FROM tasks
    WHERE (start_date IS NULL OR start_date <= ${to}) AND (due_date IS NULL OR due_date >= ${from} OR start_date >= ${from})`;
  if (opts.project) tasks = tasks.filter((t: any) => t.user_id === opts.project!.owner && t.project === opts.project!.name);
  const taskIds = tasks.map((t: any) => t.id);
  const subtasks = taskIds.length ? await db.sql`SELECT id,task_id,name,status,estimated_hours,due_date,assignee_id FROM subtasks WHERE task_id = ANY(${taskIds})` : [];
  const allocations = taskIds.length ? await db.sql`SELECT task_id,user_id,planned_hours,start_date,end_date FROM rexus_resource_allocations WHERE task_id = ANY(${taskIds})` : [];
  // Actual: one worklog row = one record (a row referencing both task and subtask is still counted once).
  const logs = await db.sql`SELECT COALESCE(NULLIF(logged_by,''),user_id) AS uid, date, COALESCE(hours,0)::float AS hours FROM worklogs WHERE date >= ${from} AND date <= ${to} AND COALESCE(status,'') <> 'rejected'`;

  const D = (x: any) => dayStr(x)!;
  const offRows: DayOff[] = daysOff.map((d: any) => ({ user_id: d.user_id ?? null, day: D(d.day), kind: d.kind || 'unavailable', hours: num(d.hours) }));
  const leaveRows: Leave[] = leaves.map((l: any) => ({ user_id: l.user_id, start_date: D(l.start_date), end_date: D(l.end_date), unit: l.unit, hours: num(l.hours), status: l.status }));
  const declRows: Declaration[] = decls.map((d: any) => ({ user_id: d.user_id, month: d.month, status: d.status, total_hours: Number(d.total_hours) || 0,
    entries: entries.filter((e: any) => e.declaration_id === d.id).map((e: any) => ({ day: D(e.day), hours: Number(e.hours) || 0, availability: e.availability })) }));
  const { items, unestimated } = planItems(
    tasks.map((t: any) => ({ ...t, estimated_hours: num(t.estimated_hours) })),
    subtasks.map((s: any) => ({ ...s, estimated_hours: num(s.estimated_hours) })),
    allocations.map((a: any) => ({ ...a, planned_hours: Number(a.planned_hours), start_date: D(a.start_date), end_date: D(a.end_date) })));
  const unscheduled: PlanItem[] = [];
  const employees = wanted.map((u: any) => {
    const current = toProfile(settings.find((s: any) => s.user_id === u.id), u.id);
    const history = hist.filter((h: any) => h.user_id === u.id).map((h: any) => toProfile(h, u.id));
    const { cells, months: monthStates } = dailyCapacity({ userId: u.id, from, to, current, history, daysOff: offRows, leaves: leaveRows, declarations: declRows });
    const byDay = new Map(cells.map(c => [c.day, c]));
    const isWorking = (day: string) => { const p = profileOn(history, current, day); const g = offRows.find(o => o.user_id === null && o.day === day && !o.hours); return !g && (p.capacity_method === 'declaration' || p.workdays.includes(weekday(day))); };
    const mine = items.filter(i => i.user_id === u.id);
    const assignments: any[] = [];
    for (const it of mine) {
      const spread = distribute(it, isWorking);
      if (!spread) { unscheduled.push(it); continue; }
      let inRange = 0;
      for (const [d, h] of spread) { const c = byDay.get(d); if (c) { c.planned += h; inRange += h; } }
      if (inRange > 0) assignments.push({ ...it, planned_in_range: r2(inRange) });
    }
    for (const l of logs) if (l.uid === u.id) { const c = byDay.get(D(l.date)); if (c) c.actual += Number(l.hours) || 0; }
    const confirmedCells = cells.filter(c => c.capacity !== null);
    const allConfirmed = confirmedCells.length === cells.length;
    const capacity = allConfirmed ? r2(cells.reduce((s, c) => s + (c.capacity || 0), 0)) : null;
    const approvedPart = r2(confirmedCells.reduce((s, c) => s + (c.capacity || 0), 0));
    const planned = r2(cells.reduce((s, c) => s + c.planned, 0));
    const actual = r2(cells.reduce((s, c) => s + c.actual, 0));
    const states = Object.values(monthStates);
    const st = statusFor(capacity, planned, states);
    const pendingHours = r2(declRows.filter(d => d.user_id === u.id && d.status === 'Pending Approval').reduce((s, d) => s + d.total_hours, 0));
    const projects = [...new Set(assignments.map(a => a.project))];
    return {
      id: u.id, name: u.full_name || u.username, department: u.department || '', position: u.position || '',
      employment_type: current.employment_type, capacity_method: current.capacity_method,
      capacity_status: current.capacity_method === 'schedule' ? 'Approved' : (allConfirmed ? 'Approved' : states.includes('Pending Approval') ? 'Pending Approval' : states.includes('Rejected') ? 'Rejected Declaration' : 'Missing Declaration'),
      month_states: monthStates,
      approved_capacity: capacity, approved_capacity_partial: approvedPart, pending_hours: pendingHours,
      leave_hours: r2(cells.reduce((s, c) => s + c.leave, 0)),
      planned_hours: planned, actual_hours: actual,
      remaining_hours: capacity === null ? null : r2(capacity - planned),
      overload_hours: capacity === null ? null : r2(Math.max(0, planned - capacity)),
      variance_hours: r2(actual - planned),
      utilization: st.utilization, status: st.status,
      projects, assignments,
      days: opts.detail ? cells.map(c => ({ ...c, planned: r2(c.planned), actual: r2(c.actual) })) : undefined
    };
  });
  return { from, to, employees, unestimated: unestimated.filter((u: any) => !u.assignee_id || ids.includes(u.assignee_id)), unscheduled,
    thresholds: { near: NEAR_CAPACITY_THRESHOLD, overload: OVERLOAD_THRESHOLD } };
}
