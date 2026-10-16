/* REXUS v2.2.1 — Human Resources Management API (Modules 2 + 4).
   /api/hr/profile    GET ?user_id=          PUT {user_id, employment_type, capacity_method, hours_per_day, workdays, manager_id, capacity_approver_id, effective_from}
   /api/hr/holidays   GET ?from&to           POST {day, name, kind, hours?}   DELETE {id}
   /api/hr/leave      GET ?scope=mine|team|all&from&to&user_id
                      POST {action:'save'|'submit'|'cancel', id?, leave_type, start_date, end_date, unit, half_part, hours, reason, attachment_url, approver_id}
   /api/hr/capacity   GET ?user_id&month     POST {action:'save'|'submit'|'revise'|'copy_previous', month, entries:[{day,hours,start_time,end_time,availability,note}], note, approver_id}
   /api/hr/team       GET ?month             → pending declarations / missing declarations / leave for people the caller manages */
import type { Context, Config } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { randomUUID } from 'node:crypto';
import { getUserFromRequest, unauthorized } from './lib/auth.mts';
import { getFullUser, isSystemAdmin } from './lib/rbac.mts';
import { logAudit } from './lib/rexus-audit.mts';
import { resolveApprovers, insertRequest, notifyApprovers, tx, ApprovalError } from './lib/approvals.mts';
import { toProfile, leaveDuration, dayStr, eachDay, isDay, DECLARATION_TYPES } from './lib/capacity.mts';

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
        return Response.json({ user: u[0], profile: { ...p, manager_id: s?.manager_id || null, manager_name: s?.manager_name || null, capacity_approver_id: s?.capacity_approver_id || null, approver_name: s?.approver_name || null },
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
          await c.query(`INSERT INTO rexus_resource_settings(user_id,hours_per_day,workdays,employment_type,capacity_method,capacity_approver_id,manager_id,effective_from,updated_by,updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) ON CONFLICT(user_id) DO UPDATE SET hours_per_day=EXCLUDED.hours_per_day, workdays=EXCLUDED.workdays, employment_type=EXCLUDED.employment_type,
            capacity_method=EXCLUDED.capacity_method, capacity_approver_id=EXCLUDED.capacity_approver_id, manager_id=EXCLUDED.manager_id, effective_from=EXCLUDED.effective_from, updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
            [target, hours, JSON.stringify(wd), type, method, body.capacity_approver_id || null, body.manager_id || null, eff, session.uid]);
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
        const prof = toProfile((await db.sql`SELECT * FROM rexus_resource_settings WHERE user_id=${target}`)[0], target);
        const hol = await db.sql`SELECT day, reason AS name, kind FROM rexus_resource_days_off WHERE user_id IS NULL AND day >= ${month + '-01'} AND day <= ${monthDays(month).slice(-1)[0]}`;
        const uniq = new Map(); for (const v of versions) if (!uniq.has(v.id)) uniq.set(v.id, v);
        return Response.json({ month, user_id: target, profile: prof, requires_declaration: prof.capacity_method === 'declaration',
          versions: [...uniq.values()].map((v: any) => ({ ...v, entries: entries.filter((e: any) => e.declaration_id === v.id).map((e: any) => ({ ...e, day: dayStr(e.day) })) })),
          holidays: hol.map((h: any) => ({ ...h, day: dayStr(h.day) })) });
      }
      if (req.method !== 'POST') return fail('Method not supported', 405);
      const action = String(body.action || 'save');
      const month = String(body.month || ''); if (!isMonth(month)) return fail('Month (YYYY-MM) required');
      const valid = new Set(monthDays(month));
      const clean = (Array.isArray(body.entries) ? body.entries : []).filter((e: any) => valid.has(e?.day)).map((e: any) => ({
        day: e.day, hours: Math.max(0, Math.min(24, Number(e.hours) || 0)), start_time: /^\d{2}:\d{2}$/.test(e.start_time || '') ? e.start_time : '',
        end_time: /^\d{2}:\d{2}$/.test(e.end_time || '') ? e.end_time : '', availability: e.availability === 'unavailable' ? 'unavailable' : 'available', note: String(e.note || '').slice(0, 300) }));
      if (clean.some((e: any) => e.start_time && e.end_time && e.end_time <= e.start_time)) return fail('End time must be after start time');
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
          if (!src) throw new ApprovalError('No approved declaration for the previous month to copy', 404);
          const prev = (await c.query('SELECT * FROM rexus_capacity_entries WHERE declaration_id=$1', [src.id])).rows;
          // Same weekday pattern: copy the hours of the matching weekday occurrence.
          const byWeekday = new Map<number, any>(); for (const e of prev) { const wd = new Date(dayStr(e.day) + 'T12:00:00Z').getUTCDay(); if (!byWeekday.has(wd)) byWeekday.set(wd, e); }
          entries = [...valid].map(d => { const p = byWeekday.get(new Date(d + 'T12:00:00Z').getUTCDay()); return p ? { day: d, hours: Number(p.hours), start_time: p.start_time, end_time: p.end_time, availability: p.availability, note: '' } : null; }).filter(Boolean) as any[];
        }
        if (action === 'save' || action === 'copy_previous' || (action === 'submit' && clean.length)) {
          await c.query('DELETE FROM rexus_capacity_entries WHERE declaration_id=$1', [decl.id]);
          for (const e of entries) await c.query('INSERT INTO rexus_capacity_entries(declaration_id,day,hours,start_time,end_time,availability,note) VALUES ($1,$2,$3,$4,$5,$6,$7)', [decl.id, e.day, e.hours, e.start_time, e.end_time, e.availability, e.note]);
        }
        const total = Number((await c.query("SELECT COALESCE(SUM(hours),0)::float AS t FROM rexus_capacity_entries WHERE declaration_id=$1 AND availability='available'", [decl.id])).rows[0].t);
        await c.query('UPDATE rexus_capacity_declarations SET total_hours=$1, note=COALESCE(NULLIF($2,\'\'),note), updated_at=NOW() WHERE id=$3', [total, String(body.note || ''), decl.id]);
        if (action !== 'submit') return { id: decl.id, status: decl.status === 'Changes Requested' ? 'Changes Requested' : 'Draft', total_hours: total, version: decl.version };
        const approvers = await resolveApprovers(db, { category: 'Human Resources', type: 'capacity_declaration', requesterId: session.uid, department: me.department || '', explicit: body.approver_id ? [String(body.approver_id)] : [] });
        await c.query("UPDATE rexus_capacity_declarations SET status='Pending Approval', submitted_at=NOW(), updated_at=NOW() WHERE id=$1", [decl.id]);
        const title = `Capacity ${month} v${decl.version}: ${me.full_name || me.username} (${total} h)`;
        const out = await insertRequest(c, { type: 'capacity_declaration', title, requesterId: session.uid, approvers, sourceType: 'capacity_declaration', sourceId: decl.id, department: me.department || '',
          payload: { month, version: decl.version, total_hours: total } });
        await c.query('UPDATE rexus_capacity_declarations SET approval_request_id=$1 WHERE id=$2', [out.id, decl.id]);
        return { id: decl.id, status: 'Pending Approval', total_hours: total, version: decl.version, approval: out, title };
      });
      if ((result as any).approval) await notifyApprovers(db, (result as any).approval.id, (result as any).title, (result as any).approval.firstApprovers);
      await logAudit(db, { actorId: session.uid, actorName: session.username, action: 'capacity_' + action, entityType: 'capacity_declaration', entityId: result.id, summary: month + ' ' + result.total_hours + 'h' });
      return Response.json({ id: result.id, status: result.status, total_hours: result.total_hours, version: result.version }, { status: 201 });
    }

    /* --------------------------------------------------------------- team */
    if (section === 'team') {
      const team = await managedIds(db, me);
      const month = isMonth(url.searchParams.get('month')) ? url.searchParams.get('month')! : new Date().toISOString().slice(0, 7);
      const users = await db.sql`SELECT u.id, u.full_name, u.username, u.department, s.employment_type, s.capacity_method FROM users u LEFT JOIN rexus_resource_settings s ON s.user_id = u.id WHERE u.status = 'Active' ORDER BY u.full_name`;
      const mine = users.filter((u: any) => manages(team, u.id));
      const ids = mine.map((u: any) => u.id);
      const decls = ids.length ? await db.sql`SELECT user_id, status, version, total_hours FROM rexus_capacity_declarations WHERE user_id = ANY(${ids}) AND month = ${month} AND status <> 'Superseded'` : [];
      const rows = mine.map((u: any) => {
        const d = decls.filter((x: any) => x.user_id === u.id);
        const needs = u.capacity_method === 'declaration';
        const status = !needs ? 'Schedule-based' : d.some((x: any) => x.status === 'Approved') ? 'Approved' : d.some((x: any) => x.status === 'Pending Approval') ? 'Pending Approval' : d.some((x: any) => x.status === 'Rejected') ? 'Rejected' : d.some((x: any) => x.status === 'Changes Requested') ? 'Changes Requested' : d.length ? 'Draft' : 'Missing Declaration';
        return { id: u.id, name: u.full_name || u.username, department: u.department, employment_type: u.employment_type || 'Full-time', capacity_method: u.capacity_method || 'schedule', status,
          approved_hours: Number(d.find((x: any) => x.status === 'Approved')?.total_hours || 0), pending_hours: Number(d.find((x: any) => x.status === 'Pending Approval')?.total_hours || 0) };
      });
      return Response.json({ month, employees: rows, is_admin: admin, declaration_types: DECLARATION_TYPES });
    }
    return fail('Unknown HR section', 404);
  } catch (e: any) {
    if (e instanceof ApprovalError) return fail(e.message, e.status);
    return fail('HR error: ' + (e?.message || 'unknown'), 500);
  }
};
export const config: Config = { path: ['/api/hr/profile', '/api/hr/holidays', '/api/hr/leave', '/api/hr/capacity', '/api/hr/team'] };
