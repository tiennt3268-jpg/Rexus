/* REXUS v2.2.1 — Central Approval Center API (Module 3).
   GET  /api/approval-center?tab=&category=&type=&status=&q=&priority=&requester=&approver=&department=&project=&from=&to=&page=&page_size=
   GET  /api/approval-center?id=<request>                  → detail + steps + events
   GET  /api/approval-center?meta=1                        → categories, types, delegations, routing rules (admin)
   POST {action:'create'|'decide'|'assign'|'reassign'|'delegate'|'revoke_delegation'|'routing_save'|'routing_delete'} */
import type { Context, Config } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { randomUUID } from 'node:crypto';
import { getUserFromRequest, unauthorized } from './lib/auth.mts';
import { getFullUser, isSystemAdmin } from './lib/rbac.mts';
import { createNotification } from './lib/notify.mts';
import { logAudit } from './lib/rexus-audit.mts';
import { CATEGORIES, DIRECT_TYPES, TYPE_LABELS, SENSITIVE_CATEGORIES, categoryOf, eligibleApprover, resolveApprovers, insertRequest, notifyApprovers,
  delegatorsFor, applySource, tx, ApprovalError } from './lib/approvals.mts';

const fail = (m: string, s = 400) => Response.json({ error: m }, { status: s });
const isDay = (s: any) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

async function canView(db: any, r: any, uid: string, admin: boolean, delegators: string[]) {
  if (admin || r.requester_id === uid) return true;
  const steps = await db.sql`SELECT approver_id FROM rexus_approval_steps WHERE request_id = ${r.id}`;
  return steps.some((s: any) => s.approver_id === uid || delegators.includes(s.approver_id));
}

export default async (req: Request, _ctx: Context) => {
  const session = await getUserFromRequest(req); if (!session) return unauthorized();
  const db = getDatabase(), url = new URL(req.url);
  try {
    const me = await getFullUser(db, session.uid); if (!me) return unauthorized();
    const admin = isSystemAdmin(me);
    const delegatorsAll = await delegatorsFor(db, session.uid);

    if (req.method === 'GET') {
      if (url.searchParams.get('meta')) {
        const delegations = await db.sql`SELECT d.*, a.full_name AS delegator_name, b.full_name AS delegate_name FROM rexus_approval_delegations d
          LEFT JOIN users a ON a.id = d.delegator_id LEFT JOIN users b ON b.id = d.delegate_id
          WHERE ${admin} OR d.delegator_id = ${session.uid} OR d.delegate_id = ${session.uid} ORDER BY d.created_at DESC LIMIT 200`;
        const rules = admin ? await db.sql`SELECT r.*, u.full_name AS approver_name FROM rexus_approval_routing_rules r LEFT JOIN users u ON u.id = r.approver_id ORDER BY priority, created_at` : [];
        return Response.json({ categories: CATEGORIES, labels: TYPE_LABELS, direct_types: DIRECT_TYPES, delegations, routing_rules: rules, is_admin: admin });
      }
      const one = url.searchParams.get('id');
      if (one) {
        const rows = await db.sql`SELECT r.*, u.full_name AS requester_name FROM rexus_approval_requests r LEFT JOIN users u ON u.id = r.requester_id WHERE r.id = ${one}`;
        if (!rows.length) return fail('Request not found', 404);
        const cat = rows[0].category;
        const dels = await delegatorsFor(db, session.uid, cat);
        if (!(await canView(db, rows[0], session.uid, admin, dels))) return fail('Not permitted', 403);
        const steps = await db.sql`SELECT s.*, u.full_name, a.full_name AS acted_by_name FROM rexus_approval_steps s LEFT JOIN users u ON u.id = s.approver_id LEFT JOIN users a ON a.id = s.acted_by WHERE s.request_id = ${one} ORDER BY s.sequence_num, s.assigned_at`;
        const events = await db.sql`SELECT e.*, u.full_name AS actor_name FROM rexus_approval_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.request_id = ${one} ORDER BY e.created_at`;
        const r = rows[0];
        const activeSteps = steps.filter((s: any) => s.decision === 'Pending' && (r.mode !== 'sequential' || !steps.some((o: any) => o.sequence_num < s.sequence_num && o.decision !== 'Approved')));
        const canDecide = r.status === 'Pending' && activeSteps.some((s: any) => s.approver_id === session.uid || dels.includes(s.approver_id));
        const canReassign = r.status === 'Pending' && (admin || (!SENSITIVE_CATEGORIES.includes(cat) && activeSteps.some((s: any) => s.approver_id === session.uid)));
        let source: any = null;
        if (r.request_type === 'leave_request') source = (await db.sql`SELECT * FROM rexus_leave_requests WHERE id = ${r.source_id}`)[0] || null;
        if (r.request_type === 'capacity_declaration') {
          const d = (await db.sql`SELECT * FROM rexus_capacity_declarations WHERE id = ${r.source_id}`)[0];
          if (d) source = { ...d, entries: await db.sql`SELECT * FROM rexus_capacity_entries WHERE declaration_id = ${d.id} ORDER BY day` };
        }
        if (r.request_type === 'project_disbursement') source = (await db.sql`SELECT * FROM rexus_disbursements WHERE id = ${r.source_id}`)[0] || null;
        if (r.request_type === 'project_expense') source = (await db.sql`SELECT * FROM rexus_project_transactions WHERE id = ${r.source_id}`)[0] || null;
        return Response.json({ request: { ...r, type_label: TYPE_LABELS[r.request_type] || r.request_type }, steps, events, source, can_decide: canDecide, can_reassign: canReassign });
      }
      // ---- list
      const tab = url.searchParams.get('tab') || 'pending';
      const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
      const size = Math.min(100, Math.max(5, parseInt(url.searchParams.get('page_size') || '25', 10) || 25));
      const f = (k: string) => (url.searchParams.get(k) || '').trim();
      const rows = await db.sql`SELECT r.*, u.full_name AS requester_name, u.department AS requester_department FROM rexus_approval_requests r LEFT JOIN users u ON u.id = r.requester_id
        WHERE ${admin && tab === 'all'} OR r.requester_id = ${session.uid}
          OR EXISTS (SELECT 1 FROM rexus_approval_steps s WHERE s.request_id = r.id AND (s.approver_id = ${session.uid} OR s.approver_id = ANY(${delegatorsAll.length ? delegatorsAll : ['']})))
        ORDER BY r.created_at DESC LIMIT 2000`;
      const ids = rows.map((r: any) => r.id);
      const steps = ids.length ? await db.sql`SELECT s.*, u.full_name FROM rexus_approval_steps s LEFT JOIN users u ON u.id = s.approver_id WHERE s.request_id = ANY(${ids}) ORDER BY s.sequence_num` : [];
      const out: any[] = [];
      for (const r of rows) {
        const st = steps.filter((s: any) => s.request_id === r.id);
        const active = st.filter((s: any) => s.decision === 'Pending' && (r.mode !== 'sequential' || !st.some((o: any) => o.sequence_num < s.sequence_num && o.decision !== 'Approved')));
        const dels = delegatorsAll.length ? await delegatorsFor(db, session.uid, r.category) : [];
        const mineActive = r.status === 'Pending' && active.some((s: any) => s.approver_id === session.uid);
        const delegatedActive = r.status === 'Pending' && active.some((s: any) => dels.includes(s.approver_id));
        if (tab === 'pending' && !(mineActive || delegatedActive)) continue;
        if (tab === 'assigned' && !st.some((s: any) => s.approver_id === session.uid)) continue;
        if (tab === 'mine' && r.requester_id !== session.uid) continue;
        if (tab === 'delegated' && !st.some((s: any) => dels.includes(s.approver_id))) continue;
        if (tab === 'approved' && r.status !== 'Approved') continue;
        if (tab === 'rejected' && r.status !== 'Rejected') continue;
        if (f('category') && r.category !== f('category')) continue;
        if (f('type') && r.request_type !== f('type')) continue;
        if (f('status') && r.status !== f('status')) continue;
        if (f('priority') && r.priority !== f('priority')) continue;
        if (f('requester') && r.requester_id !== f('requester')) continue;
        if (f('approver') && !st.some((s: any) => s.approver_id === f('approver'))) continue;
        if (f('department') && (r.department || r.requester_department || '') !== f('department')) continue;
        if (f('project') && r.project_key !== f('project')) continue;
        const created = String(r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at).slice(0, 10);
        if (isDay(f('from')) && created < f('from')) continue;
        if (isDay(f('to')) && created > f('to')) continue;
        if (f('q')) { const q = f('q').toLowerCase(); if (![r.id, r.title, r.requester_name, TYPE_LABELS[r.request_type]].some(v => String(v || '').toLowerCase().includes(q))) continue; }
        out.push({ ...r, type_label: TYPE_LABELS[r.request_type] || r.request_type, steps: st, current_approvers: active.map((s: any) => ({ id: s.approver_id, name: s.full_name })),
          can_decide: mineActive || delegatedActive });
      }
      const sort = f('sort') || 'created_desc';
      const key: Record<string, (r: any) => any> = { created: r => String(r.created_at), title: r => r.title, status: r => r.status, priority: r => ['Low', 'Normal', 'High', 'Urgent'].indexOf(r.priority) };
      const [k, dir] = sort.split('_'); if (key[k]) out.sort((a, b) => (key[k](a) > key[k](b) ? 1 : key[k](a) < key[k](b) ? -1 : 0) * (dir === 'asc' ? 1 : -1));
      return Response.json({ requests: out.slice((page - 1) * size, page * size), total: out.length, page, page_size: size });
    }

    if (req.method !== 'POST') return fail('Method not supported', 405);
    const b = await req.json().catch(() => ({}));
    const action = String(b.action || '');

    if (action === 'create') {
      const type = String(b.type || '');
      if (!DIRECT_TYPES.includes(type)) return fail('This approval type is created from its source module, or is not activated');
      const title = String(b.title || '').trim(); if (!title) return fail('Title is required');
      const category = categoryOf(type);
      const approvers = await resolveApprovers(db, { category, type, requesterId: session.uid, department: me.department || '', projectKey: String(b.project_key || ''), explicit: Array.isArray(b.approvers) ? b.approvers : [] });
      const created = await tx(db, c => insertRequest(c, { type, title, requesterId: session.uid, approvers, mode: b.mode, payload: { description: String(b.description || '').slice(0, 2000) },
        priority: b.priority, department: me.department || '', projectKey: String(b.project_key || '').slice(0, 300), sourceType: String(b.source_type || '').slice(0, 80), sourceId: String(b.source_id || '').slice(0, 120) }));
      await notifyApprovers(db, created.id, title, created.firstApprovers);
      await logAudit(db, { actorId: session.uid, actorName: session.username, action: 'approval_submit', entityType: 'approval', entityId: created.id, summary: title });
      return Response.json({ id: created.id, status: 'Pending' }, { status: 201 });
    }

    if (action === 'decide') {
      const reqId = String(b.id || ''), decision = String(b.decision || ''), reason = String(b.reason || '').trim().slice(0, 1000);
      if (!['Approved', 'Rejected', 'Changes Requested'].includes(decision)) return fail('Invalid decision');
      if (decision !== 'Approved' && !reason) return fail('A reason is required to reject or request changes');
      let request: any, newStatus = 'Pending', notifyNext: string[] = [];
      await tx(db, async c => {
        const rr = await c.query('SELECT * FROM rexus_approval_requests WHERE id=$1 FOR UPDATE', [reqId]);
        if (!rr.rows.length || rr.rows[0].status !== 'Pending') throw new ApprovalError('Request is not pending or no longer available', 409);
        request = rr.rows[0];
        const dels = await delegatorsFor(db, session.uid, request.category);
        const all = (await c.query('SELECT * FROM rexus_approval_steps WHERE request_id=$1 ORDER BY sequence_num FOR UPDATE', [reqId])).rows;
        const isActive = (s: any) => s.decision === 'Pending' && (request.mode !== 'sequential' || !all.some((o: any) => o.sequence_num < s.sequence_num && o.decision !== 'Approved'));
        const mine = all.find((s: any) => isActive(s) && s.approver_id === session.uid) || all.find((s: any) => isActive(s) && dels.includes(s.approver_id));
        if (!mine) throw new ApprovalError('You are not an active approver for this request (or an earlier stage is still pending)', 403);
        if (request.requester_id === session.uid) throw new ApprovalError('Requesters cannot approve their own request', 403);
        // Conditional update = idempotency guard against double submission.
        const upd = await c.query("UPDATE rexus_approval_steps SET decision=$1, reason=$2, decided_at=NOW(), acted_by=$3 WHERE id=$4 AND decision='Pending' RETURNING id", [decision, reason, session.uid, mine.id]);
        if (!upd.rows.length) throw new ApprovalError('This step was already decided', 409);
        const decisions = all.map((s: any) => (s.id === mine.id ? decision : s.decision));
        newStatus = decision === 'Approved' ? (decisions.every((d: string) => d === 'Approved') ? 'Approved' : 'Pending') : decision;
        await c.query('UPDATE rexus_approval_requests SET status=$1, updated_at=NOW() WHERE id=$2', [newStatus, reqId]);
        await c.query('INSERT INTO rexus_approval_events(id,request_id,actor_id,action,reason,previous_status,new_status,details) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [randomUUID(), reqId, session.uid, decision, reason, 'Pending', newStatus, JSON.stringify(mine.approver_id !== session.uid ? { on_behalf_of: mine.approver_id } : {})]);
        if (newStatus !== 'Pending') await applySource(c, request, newStatus, session.uid);
        if (newStatus === 'Pending' && request.mode === 'sequential') {
          const remaining = all.filter((s: any) => s.id !== mine.id && s.decision === 'Pending');
          const nextSeq = Math.min(...remaining.map((s: any) => s.sequence_num));
          if (mine.sequence_num < nextSeq) notifyNext = remaining.filter((s: any) => s.sequence_num === nextSeq).map((s: any) => s.approver_id);
        }
      });
      await logAudit(db, { actorId: session.uid, actorName: session.username, action: 'approval_decision', entityType: 'approval', entityId: reqId, summary: decision + ' ' + request.title });
      if (newStatus !== 'Pending') await createNotification(db, { userId: request.requester_id, type: 'approval', title: request.title + ' — ' + newStatus, message: reason, entityType: 'approval', entityId: reqId });
      if (notifyNext.length) await notifyApprovers(db, reqId, request.title, notifyNext);
      return Response.json({ ok: true, status: newStatus });
    }

    if (action === 'assign' || action === 'reassign') {
      const reqId = String(b.id || ''), to = String(b.approver_id || ''), reason = String(b.reason || '').trim().slice(0, 500);
      if (action === 'reassign' && !reason) return fail('A reason is required to reassign');
      let request: any, from = '';
      await tx(db, async c => {
        const rr = await c.query('SELECT * FROM rexus_approval_requests WHERE id=$1 FOR UPDATE', [reqId]);
        if (!rr.rows.length || rr.rows[0].status !== 'Pending') throw new ApprovalError('Only pending requests can be (re)assigned', 409);
        request = rr.rows[0];
        const all = (await c.query('SELECT * FROM rexus_approval_steps WHERE request_id=$1 ORDER BY sequence_num FOR UPDATE', [reqId])).rows;
        const stepId = String(b.step_id || '');
        const step = all.find((s: any) => s.id === stepId) || all.find((s: any) => s.decision === 'Pending' && (request.mode !== 'sequential' || !all.some((o: any) => o.sequence_num < s.sequence_num && o.decision !== 'Approved')));
        if (!step || step.decision !== 'Pending') throw new ApprovalError('No pending step to reassign (completed decisions are never removed)', 409);
        const ownStep = step.approver_id === session.uid;
        if (!admin && !(ownStep && !SENSITIVE_CATEGORIES.includes(request.category))) throw new ApprovalError('Only a System Admin can reassign this approval', 403);
        const bad = await eligibleApprover(db, to, request.requester_id, request.category); if (bad) throw new ApprovalError(bad);
        if (all.some((s: any) => s.approver_id === to && s.sequence_num === step.sequence_num)) throw new ApprovalError('That user is already an approver at this stage');
        from = step.approver_id;
        await c.query('UPDATE rexus_approval_steps SET approver_id=$1, assigned_by=$2, assigned_at=NOW() WHERE id=$3', [to, session.uid, step.id]);
        await c.query('INSERT INTO rexus_approval_events(id,request_id,actor_id,action,reason,previous_status,new_status,details) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [randomUUID(), reqId, session.uid, action === 'assign' ? 'Assign Approver' : 'Reassign Approver', reason, 'Pending', 'Pending', JSON.stringify({ previous_approver: from, new_approver: to })]);
      });
      await createNotification(db, { userId: to, type: 'approval', title: 'Approval assigned to you: ' + request.title, entityType: 'approval', entityId: reqId });
      if (from && from !== to) await createNotification(db, { userId: from, type: 'approval', title: 'Approval reassigned: ' + request.title, message: reason, entityType: 'approval', entityId: reqId });
      await logAudit(db, { actorId: session.uid, actorName: session.username, action: 'approval_reassign', entityType: 'approval', entityId: reqId, summary: from + ' → ' + to });
      return Response.json({ ok: true });
    }

    if (action === 'delegate') {
      const delegator = admin && b.delegator_id ? String(b.delegator_id) : session.uid;
      const delegate = String(b.delegate_id || '');
      if (!isDay(b.start_date) || !isDay(b.end_date) || b.end_date < b.start_date) return fail('Valid start and end dates are required');
      if (!delegate || delegate === delegator) return fail('Choose a different delegate');
      const cats = (Array.isArray(b.categories) ? b.categories : []).filter((c: string) => CATEGORIES[c]);
      const u = await db.sql`SELECT id, role, status FROM users WHERE id = ${delegate}`;
      if (!u.length || u[0].status !== 'Active') return fail('Delegate must be an active user');
      if ((!cats.length || cats.some((c: string) => SENSITIVE_CATEGORIES.includes(c))) && !['System Admin', 'Project Manager'].includes(u[0].role))
        return fail('Finance approvals can only be delegated to a Project Manager or System Admin. Limit the categories.');
      const did = randomUUID();
      await db.sql`INSERT INTO rexus_approval_delegations(id,delegator_id,delegate_id,start_date,end_date,categories,created_by) VALUES (${did},${delegator},${delegate},${b.start_date},${b.end_date},${JSON.stringify(cats)},${session.uid})`;
      await createNotification(db, { userId: delegate, type: 'approval', title: 'Approval delegation granted to you', message: b.start_date + ' – ' + b.end_date, entityType: 'delegation', entityId: did });
      await logAudit(db, { actorId: session.uid, actorName: session.username, action: 'approval_delegate', entityType: 'delegation', entityId: did, summary: delegator + ' → ' + delegate });
      return Response.json({ id: did }, { status: 201 });
    }
    if (action === 'revoke_delegation') {
      const r = await db.sql`UPDATE rexus_approval_delegations SET status='Revoked', revoked_by=${session.uid}, revoked_at=NOW() WHERE id=${String(b.id || '')} AND status='Active' AND (${admin} OR delegator_id=${session.uid}) RETURNING id`;
      if (!r.length) return fail('Delegation not found or not revocable', 404);
      await logAudit(db, { actorId: session.uid, actorName: session.username, action: 'approval_delegation_revoke', entityType: 'delegation', entityId: String(b.id), summary: 'Revoked' });
      return Response.json({ ok: true });
    }
    if (action === 'routing_save' || action === 'routing_delete') {
      if (!admin) return fail('System Admin access required', 403);
      if (action === 'routing_delete') { await db.sql`UPDATE rexus_approval_routing_rules SET active=FALSE WHERE id=${String(b.id || '')}`; return Response.json({ ok: true }); }
      const category = CATEGORIES[b.category] ? b.category : '';
      const type = Object.values(CATEGORIES).flat().includes(b.request_type) ? b.request_type : '';
      const approver = String(b.approver_id || '');
      const u = await db.sql`SELECT id, role, status FROM users WHERE id = ${approver}`;
      if (!u.length || u[0].status !== 'Active') return fail('Approver must be an active user');
      if (SENSITIVE_CATEGORIES.includes(category || categoryOf(type)) && (category || type) && !['System Admin', 'Project Manager'].includes(u[0].role)) return fail('Finance routing needs a Project Manager or System Admin approver');
      const rid = randomUUID();
      await db.sql`INSERT INTO rexus_approval_routing_rules(id,category,request_type,department,project_key,approver_id,priority,created_by)
        VALUES (${rid},${category},${type},${String(b.department || '').slice(0, 120)},${String(b.project_key || '').slice(0, 300)},${approver},${Math.max(1, Math.min(1000, parseInt(b.priority, 10) || 100))},${session.uid})`;
      return Response.json({ id: rid }, { status: 201 });
    }
    return fail('Unknown action');
  } catch (e: any) {
    if (e instanceof ApprovalError) return fail(e.message, e.status);
    return fail('Approval error: ' + (e?.message || 'unknown'), 500);
  }
};
export const config: Config = { path: '/api/approval-center' };
