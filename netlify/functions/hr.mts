/* REXUS v2.2.1 — Human Resources Management API (Modules 2 + 4).
   /api/hr/profile    GET ?user_id=          PUT {user_id, employment_type, capacity_method, hours_per_day, workdays, manager_id, capacity_approver_id, effective_from}
   /api/hr/holidays   GET ?from&to           POST {day, name, kind, hours?}   DELETE {id}
   /api/hr/leave      GET ?scope=mine|team|all&from&to&user_id
                      POST {action:'save'|'submit'|'cancel', id?, leave_type, start_date, end_date, unit, half_part, hours, reason, attachment_url, approver_id}
   /api/hr/capacity   GET ?user_id&month     POST {action:'save'|'submit'|'revise'|'copy_previous', month, entries:[{day,hours,start_time,end_time,availability,note}], note, approver_id}
   /api/hr/team       GET ?month             → per person: schedule status, regular capacity, overtime, minimum, request (people the caller manages)
   /api/hr/requests   POST {month, scope:'all'|'selected', user_ids, note, due_date}   → ask people you manage to register a month (v2.2.2)
   /api/hr/settings   GET | PUT {part_time_min_monthly_hours}                         → company default minimum (admin) (v2.2.2) */
import type { Context, Config } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { randomUUID } from 'node:crypto';
import { getUserFromRequest, unauthorized } from './lib/auth.mts';
import { getFullUser, isSystemAdmin } from './lib/rbac.mts';
import { logAudit } from './lib/rexus-audit.mts';
import { resolveApprovers, insertRequest, notifyApprovers, tx, ApprovalError } from './lib/approvals.mts';
import { toProfile, leaveDuration, dayStr, eachDay, isDay, DECLARATION_TYPES, dailyCapacity, computeResourcePlan } from './lib/capacity.mts';
import { createNotification } from './lib/notify.mts';

const fail = (m: string, s = 400) => Response.json({ error: m }, { status: s });
const TYPES = ['Full-time', 'Part-time', 'Freelancer', 'Contractor', 'Collaborator', 'Other'];
const LEAVE_TYPES = ['Annual Leave', 'Sick Leave', 'Unpaid Leave', 'Personal Leave', 'Other'];
const isMonth = (s: any) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const monthDays = (m: string) => { const [y, mo] = m.split('-').map(Number); const last = new Date(Date.UTC(y, mo, 0)).getUTCDate(); return eachDay(m + '-01', m + '-' + String(last).padStart(2, '0')); };
const prevMonth = (m: string) => { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 2, 1)); return d.toISOString().slice(0, 7); };

/** Who manages whom: profile manager_id / capacity_approver_id, or head of the employee's department. Admin manages all. */
async function managedIds(db: any, me: any): Promise<Set<string> | 'all'> {
  if (isSystemAdmin(me)) return 'all';
  const ids = new Set<string>();
  const prof = await db.sql`SELECT user_id FROM rexus_resource_settings WHERE manager_id = ${me.id} OR capacity_approver_id = ${me.id}`;
  prof.forEach((r: any) => ids.add(r.user_id));
  const heads = await db.sql`SELECT u.id FROM departments d JOIN users u ON u.department = d.name WHERE d.head_user_id = ${me.id}`;
  heads.forEach((r: any) => ids.add(r.id));
  ids.delete(me.id);
  return ids;
}
const manages = (set: Set<string> | 'all', id: string) => set === 'all' || set.has(id);

async function companyMinimum(db: any): Promise<number> {
  const r = await db.sql`SELECT part_time_min_monthly_hours FROM rexus_hr_settings WHERE id = 1`;
  return r.length ? Number(r[0].part_time_min_monthly_hours) || 0 : 0;
}
/** Working-schedule hours per day of a month (holidays and personal days off are 0) plus the effective part-time minimum. */
async function scheduleContext(db: any, userId: string, month: string) {
  const days = monthDays(month), from = days[0], to = days[days.length - 1];
  const row = (await db.sql`SELECT * FROM rexus_resource_settings WHERE user_id = ${userId}`)[0];
  const current = toProfile(row, userId);
  const history = (await db.sql`SELECT * FROM rexus_resource_settings_history WHERE user_id = ${userId} ORDER BY effective_from`).map((h: any) => toProfile(h, userId));
  const off = (await db.sql`SELECT user_id, day, kind, hours FROM rexus_resource_days_off WHERE (user_id IS NULL OR user_id = ${userId}) AND day >= ${from} AND day <= ${to}`)
    .map((d: any) => ({ user_id: d.user_id ?? null, day: dayStr(d.day)!, kind: d.kind || '', hours: d.hours === null ? null : Number(d.hours) }));
  const sched = dailyCapacity({ userId, from, to, current: { ...current, capacity_method: 'schedule' }, history: history.map((h: any) => ({ ...h, capacity_method: 'schedule' })), daysOff: off, leaves: [], declarations: [] });
  const schedule: Record<string, number> = {}; for (const c of sched.cells) schedule[c.day] = c.scheduled;
  let minimum: { hours: number; source: string } | null = null;
  if (current.capacity_method === 'declaration') {
    const personal = row && row.min_monthly_hours !== null && row.min_monthly_hours !== undefined ? Number(row.min_monthly_hours) : null;
    const v = personal !== null ? personal : await companyMinimum(db);
    if (v > 0) minimum = { hours: v, source: personal !== null ? 'personal' : 'company' };
  }
  return { profile: { ...current, min_monthly_hours: row?.min_monthly_hours === null || row?.min_monthly_hours === undefined ? null : Number(row.min_monthly_hours) }, schedule, minimum,
    holidays: new Set(off.filter((d: any) => d.user_id === null && !d.hours).map((d: any) => d.day)) };
}

export default async (req: Request, _ctx: Context) => {
  const session = await getUserFromRequest(req); if (!session) return unauthorized();
  const db = getDatabase(), url = new URL(req.url);
  const section = url.pathname.split('/').filter(Boolean)[2] || '';
  try {
    const me = await getFullUser(db, session.uid); if (!me) return unauthorized();
    const admin = isSystemAdmin(me);
    const body = req.method === 'GET' ? {} : await req.json().catch(() => ({}));

    /* ------------------------------------------------------------ profile */
    if (section === 'profile') {
      const target = String((req.method === 'GET' ? url.searchParams.get('user_id') : body.user_id) || session.uid);
      const team = await managedIds(db, me);
      if (target !== session.uid && !manages(team, target)) return fail('You can only view your own HR profile or people you manage', 403);
      if (req.method === 'GET') {
        const u = await db.sql`SELECT id, username, full_name, email, avatar, role, position, department, status FROM users WHERE id = ${target}`;
        if (!u.length) return fail('Employee not found', 404);
        const s = (await db.sql`SELECT s.*, m.full_name AS manager_name, a.full_name AS approver_name FROM rexus_resource_settings s LEFT JOIN users m ON m.id = s.manager_id LEFT JOIN users a ON a.id = s.capacity_approver_id WHERE s.user_id = ${target}`)[0] || null;
        const history = await db.sql`SELECT h.*, u.full_name AS changed_by_name FROM rexus_resource_settings_history h LEFT JOIN users u ON u.id = h.changed_by WHERE h.user_id = ${target} ORDER BY effective_from DESC, changed_at DESC LIMIT 50`;
        const year = new Date().getUTCFullYear();
        const leave = await db.sql`SELECT leave_type, status, COALESCE(SUM(duration_hours),0)::float AS hours, COUNT(*)::int AS n FROM rexus_leave_requests WHERE user_id = ${target} AND start_date >= ${year + '-01-01'} GROUP BY leave_type, status`;
        const month = new Date().toISOString().slice(0, 7);
        const decl = await db.sql`SELECT status FROM rexus_capacity_declarations WHERE user_id = ${target} AND month = ${month} AND status <> 'Superseded' ORDER BY version DESC`;
        const p = toProfile(s, target);
        const capStatus = p.capacity_method === 'schedule' ? 'Schedule-based' : decl.some((d: any) => d.status === 'Approved') ? 'Approved' : decl.some((d: any) => d.status === 'Pending Approval') ? 'Pending Approval' : 'Missing Declaration';
        return Response.json({ user: u[0], profile: { ...p, min_monthly_hours: s?.min_monthly_hours === null || s?.min_monthly_hours === undefined ? null : Number(s.min_monthly_hours), manager_id: s?.manager_id || null, manager_name: s?.manager_name || null, capacity_approver_id: s?.capacity_approver_id || null, approver_name: s?.approver_name || null },
          history, leave_summary: leave, capacity_status: capStatus, can_edit: admin });
      }
      if (req.method === 'PUT') {
        if (!admin) return fail('Only a System Admin (HR) can change employment and schedule settings', 403);
        const type = TYPES.includes(body.employment_type) ? body.employment_type : null;
        const method = body.capacity_method === 'declaration' ? 'declaration' : body.capacity_method === 'schedule' ? 'schedule' : null;
        const hours = Number(body.hours_per_day);
        const wd = Array.isArray(body.workdays) ? body.workdays.map(Number) : null;
        const eff = isDay(body.effective_from) ? body.effective_from : new Date().toISOString().slice(0, 10);
        if (!type || !method || !Number.isFinite(hours) || hours < 0 || hours > 24 || !wd || wd.some((n: number) => !Number.isInteger(n) || n < 0 || n > 6)) return fail('Invalid employment / schedule settings');
        const minRaw = body.min_monthly_hours, minH = minRaw === undefined || minRaw === null || minRaw === '' ? null : Number(minRaw);
        if (minH !== null && (!Number.isFinite(minH) || minH < 0 || minH > 744)) return fail('Minimum monthly hours must be between 0 and 744');
        for (const k of ['manager_id', 'capacity_approver_id']) if (body[k]) {
          if (body[k] === target) return fail('An employee cannot be their own manager or capacity approver');
          const ok = await db.sql`SELECT 1 FROM users WHERE id = ${body[k]} AND status = 'Active'`; if (!ok.length) return fail('Manager / approver must be an active user');
        }
        const exists = await db.sql`SELECT 1 FROM users WHERE id = ${target}`; if (!exists.length) return fail('Employee not found', 404);
        await tx(db, async c => {
          const prev = (await c.query('SELECT * FROM rexus_resource_settings WHERE user_id=$1 FOR UPDATE', [target])).rows[0];
          const anyHist = (await c.query('SELECT 1 FROM rexus_resource_settings_history WHERE user_id=$1 LIMIT 1', [target])).rows.length;
          // First change: preserve the schedule that applied until now so historical capacity is unchanged.
          if (!anyHist) {
            const p = toProfile(prev, target);
            await c.query('INSERT INTO rexus_resource_settings_history(id,user_id,employment_type,capacity_method,hours_per_day,workdays,capacity_approver_id,manager_id,effective_from,changed_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
              [randomUUID(), target, p.employment_type, p.capacity_method, p.hours_per_day, JSON.stringify(p.workdays), prev?.capacity_approver_id || null, prev?.manager_id || null, '1900-01-01', session.uid]);
          }
          await c.query(`INSERT INTO rexus_resource_settings(user_id,hours_per_day,workdays,employment_type,capacity_method,capacity_approver_id,manager_id,effective_from,updated_by,updated_at,min_monthly_hours)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),$10) ON CONFLICT(user_id) DO UPDATE SET hours_per_day=EXCLUDED.hours_per_day, workdays=EXCLUDED.workdays, employment_type=EXCLUDED.employment_type,
            capacity_method=EXCLUDED.capacity_method, capacity_approver_id=EXCLUDED.capacity_approver_id, manager_id=EXCLUDED.manager_id, effective_from=EXCLUDED.effective_from, updated_by=EXCLUDED.updated_by, updated_at=NOW(),
            min_monthly_hours=EXCLUDED.min_monthly_hours`,
            [target, hours, JSON.stringify(wd), type, method, body.capacity_approver_id || null, body.manager_id || null, eff, session.uid, minH]);
          await c.query('INSERT INTO rexus_resource_settings_history(id,user_id,employment_type,capacity_method,hours_per_day,workdays,capacity_approver_id,manager_id,effective_from,changed_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
            [randomUUID(), target, type, method, hours, JSON.stringify(wd), body.capacity_approver_id || null, body.manager_id || null, eff, session.uid]);
        });
        await logAudit(db, { actorId: session.uid, actorName: session.username, action: 'hr_profile_update', entityType: 'employee', entityId: target, summary: type + ' / ' + method + ' from ' + eff });
        return Response.json({ ok: true });
      }
      return fail('Method not supported', 405);
    }

    /* ----------------------------------------------------------- holidays */
    if (section === 'holidays') {
      if (req.method === 'GET') {
        const from = isDay(url.searchParams.get('from')) ? url.searchParams.get('from')! : new Date().getUTCFullYear() + '-01-01';
        const to = isDay(url.searchParams.get('to')) ? url.searchParams.get('to')! : new Date().getUTCFullYear() + '-12-31';
        const rows = await db.sql`SELECT id, day, kind, reason AS name, hours FROM rexus_resource_days_off WHERE user_id IS NULL AND day >= ${from} AND day <= ${to} ORDER BY day`;
        return Response.json({ holidays: rows.map((r: any) => ({ ...r, day: dayStr(r.day) })) });
      }
      if (!admin) return fail('Only a System Admin (HR) can manage holiday calendars', 403);
      if (req.method === 'POST') {
        if (!isDay(body.day)) return fail('Valid date required');
        const kind = ['holiday_public', 'holiday_company', 'non_working'].includes(body.kind) ? body.kind : 'holiday_public';
        const name = String(body.name || '').trim().slice(0, 200); if (!name) return fail('Holiday name required');
        const r = await db.sql`INSERT INTO rexus_resource_days_off(id,user_id,day,reason,kind,created_by) VALUES (${randomUUID()},NULL,${body.day},${name},${kind},${session.uid}) ON CONFLICT DO NOTHING RETURNING id`;
        if (!r.length) return fail('A company-wide day already exists on that date', 409);
        await logAudit(db, { actorId: session.uid, actorName: session.username, action: 'hr_holiday_add', entityType: 'holiday', entityId: r[0].id, summary: body.day + ' ' + name });
        return Response.json({ id: r[0].id }, { status: 201 });
      }
      if (req.method === 'DELETE') {
        await db.sql`DELETE FROM rexus_resource_days_off WHERE id = ${String(body.id || '')} AND user_id IS NULL`;
        return Response.json({ ok: true });
      }
      return fail('Method not supported', 405);
    }

    /* -------------------------------------------------------------- leave */
    if (section === 'leave') {
      const team = await managedIds(db, me);
      if (req.method === 'GET') {
        const scope = url.searchParams.get('scope') || 'mine';
        const from = isDay(url.searchParams.get('from')) ? url.searchParams.get('from')! : '1900-01-01';
        const to = isDay(url.searchParams.get('to')) ? url.searchParams.get('to')! : '9999-12-31';
        let rows = await db.sql`SELECT l.*, u.full_name, u.department, a.full_name AS approver_name FROM rexus_leave_requests l JOIN users u ON u.id = l.user_id LEFT JOIN users a ON a.id = l.approver_id
          WHERE l.start_date <= ${to} AND l.end_date >= ${from} ORDER BY l.start_date DESC LIMIT 1000`;
        if (scope === 'mine') rows = rows.filter((r: any) => r.user_id === session.uid);
        else if (scope === 'team') {
          // Team calendar: managers see their people; reason is withheld unless the viewer manages them.
          rows = rows.filter((r: any) => r.user_id === session.uid || manages(team, r.user_id)).filter((r: any) => r.status !== 'Draft' || r.user_id === session.uid);
        } else if (scope === 'all') { if (!admin) return fail('Not permitted', 403); }
        const uid = url.searchParams.get('user_id'); if (uid) rows = rows.filter((r: any) => r.user_id === uid);
        return Response.json({ leave: rows.map((r: any) => ({ ...r, start_date: dayStr(r.start_date), end_date: dayStr(r.end_date) })), types: LEAVE_TYPES });
      }
      if (req.method !== 'POST') return fail('Method not supported', 405);
      const action = String(body.action || 'save');
      if (action === 'cancel') {
        const r = await db.sql`UPDATE rexus_leave_requests SET status='Cancelled', updated_at=NOW() WHERE id=${String(body.id || '')} AND user_id=${session.uid} AND status IN ('Draft','Changes Requested','Pending Approval','Approved') RETURNING id, approval_request_id, status`;
        if (!r.length) return fail('Leave request not found or cannot be cancelled', 404);
        if (r[0].approval_request_id) await db.sql`UPDATE rexus_approval_requests SET status='Cancelled', updated_at=NOW() WHERE id=${r[0].approval_request_id} AND status='Pending'`;
        await logAudit(db, { actorId: session.uid, actorName: session.username, action: 'leave_cancel', entityType: 'leave', entityId: String(body.id), summary: 'Cancelled leave' });
        return Response.json({ ok: true });
      }
      // save (draft) / submit — always for the signed-in employee (self-service)
      const lt = LEAVE_TYPES.includes(body.leave_type) ? body.leave_type : null;
      const unit = ['full', 'half', 'hourly'].includes(body.unit) ? body.unit : 'full';
      if (!lt || !isDay(body.start_date) || !isDay(body.end_date) || body.end_date < body.start_date) return fail('Leave type and a valid date range are required');
      if (unit !== 'full' && body.start_date !== body.end_date) return fail('Half-day and hourly leave must be a single day');
      const hours = unit === 'hourly' ? Number(body.hours) : null;
      if (unit === 'hourly' && !(hours! > 0 && hours! <= 24)) return fail('Hourly leave needs a number of hours between 0 and 24');
      if (eachDay(body.start_date, body.end_date).length > 366) return fail('Leave cannot exceed one year');
      const profRow = (await db.sql`SELECT * FROM rexus_resource_settings WHERE user_id=${session.uid}`)[0];
      const hol = (await db.sql`SELECT user_id, day, kind, hours FROM rexus_resource_days_off WHERE user_id IS NULL AND day >= ${body.start_date} AND day <= ${body.end_date}`).map((h: any) => ({ ...h, day: dayStr(h.day) }));
      const duration = leaveDuration({ start_date: body.start_date, end_date: body.end_date, unit, hours }, toProfile(profRow, session.uid), hol);
      // Overlap with another live request (not cancelled / rejected) is refused — prevents double deductions.
      const overlap = await db.sql`SELECT id FROM rexus_leave_requests WHERE user_id=${session.uid} AND id <> ${String(body.id || '')} AND status IN ('Pending Approval','Approved') AND start_date <= ${body.end_date} AND end_date >= ${body.start_date}`;
      if (overlap.length && unit === 'full') return fail('These dates overlap another pending or approved leave request', 409);
      const fields = { lt, s: body.start_date, e: body.end_date, unit, half: unit === 'half' ? (body.half_part === 'PM' ? 'PM' : 'AM') : null, hours, duration,
        reason: String(body.reason || '').slice(0, 1000), att: String(body.attachment_url || '').slice(0, 500), approver: body.approver_id ? String(body.approver_id) : null };
      let id = String(body.id || '');
      if (id) {
        const r = await db.sql`UPDATE rexus_leave_requests SET leave_type=${fields.lt}, start_date=${fields.s}, end_date=${fields.e}, unit=${fields.unit}, half_part=${fields.half}, hours=${fields.hours},
          duration_hours=${fields.duration}, reason=${fields.reason}, attachment_url=${fields.att}, approver_id=${fields.approver}, status='Draft', updated_at=NOW()
          WHERE id=${id} AND user_id=${session.uid} AND status IN ('Draft','Changes Requested') RETURNING id`;
        if (!r.length) return fail('Only your draft or returned requests can be edited', 409);
      } else {
        id = 'LV' + randomUUID().slice(0, 10).toUpperCase();
        await db.sql`INSERT INTO rexus_leave_requests(id,user_id,leave_type,start_date,end_date,unit,half_part,hours,duration_hours,reason,attachment_url,approver_id,status)
          VALUES (${id},${session.uid},${fields.lt},${fields.s},${fields.e},${fields.unit},${fields.half},${fields.hours},${fields.duration},${fields.reason},${fields.att},${fields.approver},'Draft')`;
      }
      if (action !== 'submit') return Response.json({ id, status: 'Draft', duration_hours: duration }, { status: 201 });
      const approvers = await resolveApprovers(db, { category: 'Human Resources', type: 'leave_request', requesterId: session.uid, department: me.department || '', explicit: fields.approver ? [fields.approver] : [] });
      const title = `${fields.lt}: ${me.full_name || me.username} (${fields.s}${fields.e !== fields.s ? ' – ' + fields.e : ''})`;
      const created = await tx(db, async c => {
        const r = await c.query("UPDATE rexus_leave_requests SET status='Pending Approval', approver_id=$1, updated_at=NOW() WHERE id=$2 AND user_id=$3 AND status IN ('Draft','Changes Requested') RETURNING id", [approvers[0], id, session.uid]);
        if (!r.rows.length) throw new ApprovalError('Leave request was already submitted', 409);
        const out = await insertRequest(c, { type: 'leave_request', title, requesterId: session.uid, approvers, sourceType: 'leave', sourceId: id, department: me.department || '',
          payload: { leave_type: fields.lt, start_date: fields.s, end_date: fields.e, unit: fields.unit, hours: fields.hours, duration_hours: duration } });
        await c.query('UPDATE rexus_leave_requests SET approval_request_id=$1 WHERE id=$2', [out.id, id]);
        return out;
      });
      await notifyApprovers(db, created.id, title, created.firstApprovers);
      await logAudit(db, { actorId: session.uid, actorName: session.username, action: 'leave_submit', entityType: 'leave', entityId: id, summary: title });
      return Response.json({ id, status: 'Pending Approval', approval_id: created.id, duration_hours: duration }, { status: 201 });
    }

    /* ----------------------------------------------------------- capacity */
    // v2.2.2 HRM-02/03/04: every employee can register a monthly schedule. Regular hours come from the
    // declaration for declaration-based staff and from the working schedule for schedule-based staff
    // (never auto-filled on rest days or holidays); overtime is always declared separately.
    if (section === 'capacity') {
      const team = await managedIds(db, me);
      if (req.method === 'GET') {
        const target = String(url.searchParams.get('user_id') || session.uid);
        if (target !== session.uid && !manages(team, target)) return fail('Not permitted', 403);
        const month = isMonth(url.searchParams.get('month')) ? url.searchParams.get('month')! : new Date().toISOString().slice(0, 7);
        const versions = await db.sql`SELECT d.*, u.full_name AS approver_name FROM rexus_capacity_declarations d LEFT JOIN rexus_approval_requests r ON r.id = d.approval_request_id
          LEFT JOIN rexus_approval_steps s ON s.request_id = r.id LEFT JOIN users u ON u.id = s.approver_id WHERE d.user_id = ${target} AND d.month = ${month} ORDER BY d.version DESC`;
        const ids = versions.map((v: any) => v.id);
        const entries = ids.length ? await db.sql`SELECT * FROM rexus_capacity_entries WHERE declaration_id = ANY(${ids}) ORDER BY day` : [];
        const ctx = await scheduleContext(db, target, month);
        const hol = await db.sql`SELECT day, reason AS name, kind FROM rexus_resource_days_off WHERE user_id IS NULL AND day >= ${month + '-01'} AND day <= ${monthDays(month).slice(-1)[0]}`;
        const reqs = await db.sql`SELECT r.*, u.full_name AS requested_by_name FROM rexus_schedule_requests r LEFT JOIN users u ON u.id = r.requested_by WHERE r.user_id = ${target} AND r.month >= ${month} ORDER BY r.month LIMIT 6`;
        const uniq = new Map(); for (const v of versions) if (!uniq.has(v.id)) uniq.set(v.id, v);
        return Response.json({ month, user_id: target, profile: ctx.profile, method: ctx.profile.capacity_method, requires_declaration: ctx.profile.capacity_method === 'declaration',
          schedule_hours: ctx.schedule, minimum: ctx.minimum,
          versions: [...uniq.values()].map((v: any) => ({ ...v, total_hours: Number(v.total_hours) || 0, ot_total_hours: Number(v.ot_total_hours) || 0, min_hours_snapshot: v.min_hours_snapshot === null ? null : Number(v.min_hours_snapshot),
            entries: entries.filter((e: any) => e.declaration_id === v.id).map((e: any) => ({ ...e, day: dayStr(e.day), hours: Number(e.hours) || 0, ot_hours: Number(e.ot_hours) || 0 })) })),
          holidays: hol.map((h: any) => ({ ...h, day: dayStr(h.day) })),
          requests: reqs.map((r: any) => ({ id: r.id, month: r.month, note: r.note, due_date: dayStr(r.due_date), requested_by_name: r.requested_by_name, send_count: r.send_count, last_sent_at: r.last_sent_at })) });
      }
      if (req.method !== 'POST') return fail('Method not supported', 405);
      const action = String(body.action || 'save');
      const month = String(body.month || ''); if (!isMonth(month)) return fail('Month (YYYY-MM) required');
      const valid = new Set(monthDays(month));
      const byDay = new Map<string, any>();   // one entry per day: duplicates in the payload can never double-count
      for (const e of (Array.isArray(body.entries) ? body.entries : [])) {
        if (!valid.has(e?.day)) continue;
        const off = e.availability === 'unavailable';
        const hours = off ? 0 : Math.max(0, Math.min(24, Number(e.hours) || 0)), ot = off ? 0 : Math.max(0, Math.min(24, Number(e.ot_hours) || 0));
        byDay.set(e.day, { day: e.day, hours, ot_hours: ot, start_time: /^\d{2}:\d{2}$/.test(e.start_time || '') ? e.start_time : '',
          end_time: /^\d{2}:\d{2}$/.test(e.end_time || '') ? e.end_time : '', availability: off ? 'unavailable' : 'available', note: String(e.note || '').slice(0, 300) });
      }
      let clean = [...byDay.values()];
      if (clean.some((e: any) => e.start_time && e.end_time && e.end_time <= e.start_time)) return fail('End time must be after start time');
      const ctx = await scheduleContext(db, session.uid, month);
      const scheduleBased = ctx.profile.capacity_method === 'schedule';
      if (scheduleBased) {
        // Regular hours follow the working schedule; only overtime and notes are declared.
        clean = monthDays(month).map(d => { const e = byDay.get(d) || {}; return { day: d, hours: ctx.schedule[d] || 0, ot_hours: e.ot_hours || 0, start_time: '', end_time: '', availability: 'available', note: e.note || '' }; })
          .filter(e => e.hours > 0 || e.ot_hours > 0 || e.note);
      }
      const over = clean.find((e: any) => e.hours + e.ot_hours > 24); if (over) return fail('Regular hours plus overtime cannot exceed 24 h on ' + over.day);
      const result = await tx(db, async c => {
        const open = (await c.query("SELECT * FROM rexus_capacity_declarations WHERE user_id=$1 AND month=$2 AND status IN ('Draft','Changes Requested','Pending Approval') FOR UPDATE", [session.uid, month])).rows[0];
        if (open && open.status === 'Pending Approval') throw new ApprovalError('This month is awaiting approval and cannot be edited', 409);
        let decl = open;
        if (!decl) {
          const v = (await c.query('SELECT COALESCE(MAX(version),0)+1 AS v FROM rexus_capacity_declarations WHERE user_id=$1 AND month=$2', [session.uid, month])).rows[0].v;
          decl = (await c.query("INSERT INTO rexus_capacity_declarations(id,user_id,month,version,status,note) VALUES ($1,$2,$3,$4,'Draft',$5) RETURNING *", ['CD' + randomUUID().slice(0, 10).toUpperCase(), session.uid, month, v, String(body.note || '').slice(0, 1000)])).rows[0];
        }
        let entries = clean;
        if (action === 'copy_previous') {
          const src = (await c.query("SELECT id FROM rexus_capacity_declarations WHERE user_id=$1 AND month=$2 AND status IN ('Approved','Superseded') ORDER BY (status='Approved') DESC, version DESC LIMIT 1", [session.uid, prevMonth(month)])).rows[0];
          if (!src) throw new ApprovalError('No approved schedule for the previous month to copy', 404);
          const prev = (await c.query('SELECT * FROM rexus_capacity_entries WHERE declaration_id=$1', [src.id])).rows;
          // Same weekday pattern: copy the hours of the matching weekday occurrence (regular hours of schedule-based staff stay on the schedule).
          const byWeekday = new Map<number, any>(); for (const e of prev) { const wd = new Date(dayStr(e.day) + 'T12:00:00Z').getUTCDay(); if (!byWeekday.has(wd)) byWeekday.set(wd, e); }
          entries = [...valid].map(d => { const p = byWeekday.get(new Date(d + 'T12:00:00Z').getUTCDay()); if (!p) return null;
            const hours = scheduleBased ? (ctx.schedule[d] || 0) : (ctx.holidays.has(d) ? 0 : Number(p.hours)); const ot = Number(p.ot_hours) || 0;
            return { day: d, hours, ot_hours: ot, start_time: p.start_time, end_time: p.end_time, availability: p.availability, note: '' }; })
            .filter((e: any) => e && (e.hours > 0 || e.ot_hours > 0 || e.availability === 'unavailable'));
        }
        if (action === 'save' || action === 'copy_previous' || (action === 'submit' && clean.length)) {
          await c.query('DELETE FROM rexus_capacity_entries WHERE declaration_id=$1', [decl.id]);
          for (const e of entries) await c.query('INSERT INTO rexus_capacity_entries(declaration_id,day,hours,ot_hours,start_time,end_time,availability,note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [decl.id, e.day, e.hours, e.ot_hours, e.start_time, e.end_time, e.availability, e.note]);
        }
        const tot = (await c.query("SELECT COALESCE(SUM(hours) FILTER (WHERE availability='available'),0)::float AS t, COALESCE(SUM(ot_hours) FILTER (WHERE availability='available'),0)::float AS o FROM rexus_capacity_entries WHERE declaration_id=$1", [decl.id])).rows[0];
        const total = Number(tot.t), otTotal = Number(tot.o);
        await c.query('UPDATE rexus_capacity_declarations SET total_hours=$1, ot_total_hours=$2, note=COALESCE(NULLIF($3,\'\'),note), updated_at=NOW() WHERE id=$4', [total, otTotal, String(body.note || ''), decl.id]);
        const below = ctx.minimum && total < ctx.minimum.hours;
        if (action !== 'submit') return { id: decl.id, status: decl.status === 'Changes Requested' ? 'Changes Requested' : 'Draft', total_hours: total, ot_total_hours: otTotal, version: decl.version, below_minimum: !!below };
        const approvers = await resolveApprovers(db, { category: 'Human Resources', type: 'capacity_declaration', requesterId: session.uid, department: me.department || '', explicit: body.approver_id ? [String(body.approver_id)] : [] });
        await c.query("UPDATE rexus_capacity_declarations SET status='Pending Approval', submitted_at=NOW(), updated_at=NOW(), min_hours_snapshot=$2 WHERE id=$1", [decl.id, ctx.minimum ? ctx.minimum.hours : null]);
        const title = `Schedule ${month} v${decl.version}: ${me.full_name || me.username} (${total} h regular${otTotal ? ' + ' + otTotal + ' h OT' : ''})`;
        const out = await insertRequest(c, { type: 'capacity_declaration', title, requesterId: session.uid, approvers, sourceType: 'capacity_declaration', sourceId: decl.id, department: me.department || '',
          payload: { month, version: decl.version, total_hours: total, ot_hours: otTotal, minimum_hours: ctx.minimum ? ctx.minimum.hours : null, below_minimum: !!below } });
        await c.query('UPDATE rexus_capacity_declarations SET approval_request_id=$1 WHERE id=$2', [out.id, decl.id]);
        return { id: decl.id, status: 'Pending Approval', total_hours: total, ot_total_hours: otTotal, version: decl.version, below_minimum: !!below, approval: out, title };
      });
      if ((result as any).approval) await notifyApprovers(db, (result as any).approval.id, (result as any).title, (result as any).approval.firstApprovers);
      await logAudit(db, { actorId: session.uid, actorName: session.username, action: 'capacity_' + action, entityType: 'capacity_declaration', entityId: result.id, summary: month + ' ' + result.total_hours + 'h + OT ' + result.ot_total_hours + 'h' });
      return Response.json({ id: result.id, status: result.status, total_hours: result.total_hours, ot_total_hours: result.ot_total_hours, version: result.version, below_minimum: result.below_minimum }, { status: 201 });
    }

    /* --------------------------------------------------------------- team */
    // HRM-02/03: managers see each person's regular capacity, overtime and schedule status for a month.
    if (section === 'team') {
      const team = await managedIds(db, me);
      const month = isMonth(url.searchParams.get('month')) ? url.searchParams.get('month')! : new Date().toISOString().slice(0, 7);
      const users = await db.sql`SELECT u.id, u.full_name, u.username, u.department, s.employment_type, s.capacity_method, s.min_monthly_hours FROM users u LEFT JOIN rexus_resource_settings s ON s.user_id = u.id WHERE u.status = 'Active' AND u.deleted_at IS NULL ORDER BY u.full_name`;
      const mine = users.filter((u: any) => u.id !== me.id && manages(team, u.id));
      const ids = mine.map((u: any) => u.id);
      const decls = ids.length ? await db.sql`SELECT user_id, status, version, total_hours, ot_total_hours, min_hours_snapshot FROM rexus_capacity_declarations WHERE user_id = ANY(${ids}) AND month = ${month} AND status <> 'Superseded'` : [];
      const reqs = ids.length ? await db.sql`SELECT user_id, send_count, last_sent_at, due_date FROM rexus_schedule_requests WHERE month = ${month} AND user_id = ANY(${ids})` : [];
      const plan = ids.length ? await computeResourcePlan(db, { from: month + '-01', to: monthDays(month).slice(-1)[0], userIds: ids }) : { employees: [] };
      const companyMin = await companyMinimum(db);
      const rows = mine.map((u: any) => {
        const d = decls.filter((x: any) => x.user_id === u.id), approved = d.find((x: any) => x.status === 'Approved'), open = d.find((x: any) => ['Draft', 'Pending Approval', 'Changes Requested', 'Rejected'].includes(x.status));
        const method = u.capacity_method || 'schedule';
        const status = approved && !open ? 'Approved' : open ? open.status : (method === 'schedule' ? 'Schedule-based' : 'Missing Declaration');
        const p = (plan.employees as any[]).find(e => e.id === u.id) || {};
        const minimum = method === 'declaration' ? (approved && approved.min_hours_snapshot !== null ? Number(approved.min_hours_snapshot) : (u.min_monthly_hours !== null && u.min_monthly_hours !== undefined ? Number(u.min_monthly_hours) : companyMin)) : null;
        const declared = open ? Number(open.total_hours) : approved ? Number(approved.total_hours) : 0;
        const r = reqs.find((x: any) => x.user_id === u.id);
        return { id: u.id, name: u.full_name || u.username, department: u.department, employment_type: u.employment_type || 'Full-time', capacity_method: method, status,
          approved_hours: Number(approved?.total_hours || 0), pending_hours: Number(d.find((x: any) => x.status === 'Pending Approval')?.total_hours || 0),
          regular_capacity: p.approved_capacity ?? null, ot_hours: p.ot_hours || 0, declared_hours: declared, declared_ot_hours: open ? Number(open.ot_total_hours) : Number(approved?.ot_total_hours || 0),
          minimum_hours: minimum || null, below_minimum: !!(minimum && method === 'declaration' && declared < minimum),
          request: r ? { send_count: r.send_count, last_sent_at: r.last_sent_at, due_date: dayStr(r.due_date) } : null };
      });
      return Response.json({ month, employees: rows, is_admin: admin, declaration_types: DECLARATION_TYPES, company_minimum_hours: companyMin });
    }

    /* ----------------------------------------------------------- requests */
    // HRM-05: a manager asks all / selected people they manage to register a month. Re-sending updates
    // the same employee-month row (no duplicates) and sends a fresh in-app notification.
    if (section === 'requests') {
      if (req.method !== 'POST') return fail('Method not supported', 405);
      const team = await managedIds(db, me);
      if (team !== 'all' && !team.size) return fail('Only managers and HR admins can request schedules', 403);
      const month = String(body.month || ''); if (!isMonth(month)) return fail('Month (YYYY-MM) required');
      const due = body.due_date ? (isDay(body.due_date) ? body.due_date : null) : null; if (body.due_date && !due) return fail('Invalid due date');
      const active = await db.sql`SELECT id FROM users WHERE status = 'Active' AND deleted_at IS NULL`;
      const pool = active.map((u: any) => u.id).filter((id: string) => id !== me.id && manages(team, id));
      let targets: string[];
      if (body.scope === 'all') targets = pool;
      else {
        targets = [...new Set((Array.isArray(body.user_ids) ? body.user_ids : []).map(String))] as string[];
        if (!targets.length) return fail('Choose at least one employee');
        const outside = targets.filter(id => !pool.includes(id)); if (outside.length) return fail('You can only request schedules from active people you manage', 403);
      }
      const note = String(body.note || '').slice(0, 500), label = new Date(month + '-01T12:00:00Z').toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      let created = 0, resent = 0;
      for (const uid of targets) {
        const r = await db.sql`INSERT INTO rexus_schedule_requests(id, month, user_id, requested_by, note, due_date) VALUES (${'SR' + randomUUID().slice(0, 10).toUpperCase()}, ${month}, ${uid}, ${me.id}, ${note}, ${due})
          ON CONFLICT (month, user_id) DO UPDATE SET requested_by = EXCLUDED.requested_by, note = CASE WHEN EXCLUDED.note <> '' THEN EXCLUDED.note ELSE rexus_schedule_requests.note END, due_date = COALESCE(EXCLUDED.due_date, rexus_schedule_requests.due_date), send_count = rexus_schedule_requests.send_count + 1, last_sent_at = NOW()
          RETURNING send_count`;
        if (r[0].send_count > 1) resent++; else created++;
        await createNotification(db, { userId: uid, type: 'hr', title: 'Please register your work schedule for ' + label, message: (me.full_name || me.username) + (due ? ' · due ' + due : '') + (note ? ' — ' + note : ''),
          entityType: 'schedule_request', entityId: month, project: '' });
      }
      await logAudit(db, { actorId: session.uid, actorName: session.username, action: 'schedule_request', entityType: 'schedule_request', entityId: month, summary: `${month}: ${created} new, ${resent} re-sent` });
      return Response.json({ month, created, resent, recipients: targets.length });
    }

    /* ----------------------------------------------------------- settings */
    if (section === 'settings') {
      if (req.method === 'GET') return Response.json({ part_time_min_monthly_hours: await companyMinimum(db) });
      if (req.method !== 'PUT') return fail('Method not supported', 405);
      if (!admin) return fail('Only a System Admin (HR) can change HR settings', 403);
      const v = Number(body.part_time_min_monthly_hours);
      if (!Number.isFinite(v) || v < 0 || v > 744) return fail('Minimum monthly hours must be between 0 and 744');
      await db.sql`INSERT INTO rexus_hr_settings(id, part_time_min_monthly_hours, updated_by, updated_at) VALUES (1, ${v}, ${me.id}, NOW())
        ON CONFLICT (id) DO UPDATE SET part_time_min_monthly_hours = EXCLUDED.part_time_min_monthly_hours, updated_by = EXCLUDED.updated_by, updated_at = NOW()`;
      await logAudit(db, { actorId: session.uid, actorName: session.username, action: 'hr_settings_update', entityType: 'hr_settings', entityId: '1', summary: 'Part-time minimum ' + v + ' h/month' });
      return Response.json({ part_time_min_monthly_hours: v });
    }
    return fail('Unknown HR section', 404);
  } catch (e: any) {
    if (e instanceof ApprovalError) return fail(e.message, e.status);
    return fail('HR error: ' + (e?.message || 'unknown'), 500);
  }
};
export const config: Config = { path: ['/api/hr/profile', '/api/hr/holidays', '/api/hr/leave', '/api/hr/capacity', '/api/hr/team', '/api/hr/requests', '/api/hr/settings'] };
