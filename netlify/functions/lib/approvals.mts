/* =============================================================================
   REXUS v2.2.1 — Central Approval Center core (Module 3).
   Shared by approval-center.mts, hr.mts and project-financials.mts so every
   approval — leave, capacity, finance, project, document — goes through the
   same request / step / event tables, routing, delegation and source updates.
   ========================================================================== */
import { randomUUID } from 'node:crypto';
import { createNotification } from './notify.mts';

export const CATEGORIES: Record<string, string[]> = {
  'Human Resources': ['leave_request', 'capacity_declaration'],
  'Project Management': ['project_change_review', 'project_budget_review'],
  'Project Finance': ['project_disbursement', 'project_expense'],
  'Documents': ['document_review']
};
/** Types created directly from the Approval Center UI. HR / finance types are created by their source modules only. */
export const DIRECT_TYPES = ['project_change_review', 'project_budget_review', 'document_review'];
export const TYPE_LABELS: Record<string, string> = {
  leave_request: 'Leave Request', capacity_declaration: 'Monthly Capacity Declaration',
  project_change_review: 'Project Change Request', project_budget_review: 'Budget Adjustment Review',
  project_disbursement: 'Disbursement Approval', project_expense: 'Expense Approval', document_review: 'Document Review'
};
export const SENSITIVE_CATEGORIES = ['Project Finance'];
export const categoryOf = (type: string) => Object.keys(CATEGORIES).find(c => CATEGORIES[c].includes(type)) || 'Project Management';
const id = () => randomUUID();
const today = () => new Date().toISOString().slice(0, 10);

export class ApprovalError extends Error { status: number; constructor(m: string, s = 400) { super(m); this.status = s; } }

/** An approver must be an active account other than the requester; finance approvals need a manager/admin role. */
export async function eligibleApprover(db: any, userId: string, requesterId: string, category: string): Promise<string | null> {
  if (!userId) return 'Approver is required';
  if (userId === requesterId) return 'Requesters cannot approve their own request';
  const rows = await db.sql`SELECT id, role, status FROM users WHERE id = ${userId}`;
  if (!rows.length || rows[0].status !== 'Active') return 'Approver must be an active REXUS user';
  if (SENSITIVE_CATEGORIES.includes(category) && !['System Admin', 'Project Manager'].includes(rows[0].role)) return 'Finance approvals require a Project Manager or System Admin approver';
  return null;
}

/**
 * Routing priority: 1) valid explicit approver(s)  2) active routing rule (most specific, lowest priority number)
 * 3) employee profile capacity approver / manager (HR)  4) department head.  Never silently picks an ineligible user.
 */
export async function resolveApprovers(db: any, o: { category: string; type: string; requesterId: string; department?: string; projectKey?: string; explicit?: string[] }): Promise<string[]> {
  const explicit = [...new Set((o.explicit || []).map(String).filter(Boolean))];
  if (explicit.length) {
    for (const a of explicit) { const bad = await eligibleApprover(db, a, o.requesterId, o.category); if (bad) throw new ApprovalError(bad); }
    return explicit;
  }
  const rules = await db.sql`SELECT * FROM rexus_approval_routing_rules WHERE active = TRUE ORDER BY priority ASC, created_at ASC`;
  const score = (r: any) => (r.request_type ? 8 : 0) + (r.project_key ? 4 : 0) + (r.department ? 2 : 0) + (r.category ? 1 : 0);
  const matching = rules.filter((r: any) => (!r.category || r.category === o.category) && (!r.request_type || r.request_type === o.type)
    && (!r.department || r.department === (o.department || '')) && (!r.project_key || r.project_key === (o.projectKey || '')))
    .sort((a: any, b: any) => (a.priority - b.priority) || (score(b) - score(a)));
  for (const r of matching) if (!(await eligibleApprover(db, r.approver_id, o.requesterId, o.category))) return [r.approver_id];
  if (o.category === 'Human Resources') {
    const prof = await db.sql`SELECT capacity_approver_id, manager_id FROM rexus_resource_settings WHERE user_id = ${o.requesterId}`;
    for (const cand of [o.type === 'capacity_declaration' ? prof[0]?.capacity_approver_id : null, prof[0]?.manager_id, prof[0]?.capacity_approver_id])
      if (cand && !(await eligibleApprover(db, cand, o.requesterId, o.category))) return [cand];
  }
  if (o.department) {
    const head = await db.sql`SELECT head_user_id FROM departments WHERE name = ${o.department}`;
    const h = head[0]?.head_user_id;
    if (h && !(await eligibleApprover(db, h, o.requesterId, o.category))) return [h];
  }
  throw new ApprovalError('No eligible approver could be routed. Choose an approver, or ask an administrator to add a routing rule / set your manager.', 422);
}

/** Inserts request + steps + submit event inside an open transaction client. Returns {id, approvers}. */
export async function insertRequest(client: any, o: { type: string; title: string; requesterId: string; approvers: string[]; mode?: string; sourceType?: string; sourceId?: string;
  payload?: any; priority?: string; department?: string; projectKey?: string; dueAt?: string | null }) {
  const reqId = id(); const mode = ['single', 'sequential', 'parallel'].includes(o.mode || '') ? o.mode! : (o.approvers.length > 1 ? 'parallel' : 'single');
  if (mode === 'single' && o.approvers.length !== 1) throw new ApprovalError('Single approval needs exactly one approver');
  if (o.approvers.length > 15) throw new ApprovalError('Too many approvers');
  const category = categoryOf(o.type);
  await client.query(`INSERT INTO rexus_approval_requests(id,request_type,title,payload,source_type,source_id,requester_id,status,mode,category,priority,department,project_key,due_at,submitted_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,'Pending',$8,$9,$10,$11,$12,$13,NOW())`,
    [reqId, o.type, o.title.slice(0, 200), JSON.stringify(o.payload || {}).slice(0, 4000), o.sourceType || '', o.sourceId || '', o.requesterId, mode, category,
      ['Low', 'Normal', 'High', 'Urgent'].includes(o.priority || '') ? o.priority : 'Normal', o.department || '', o.projectKey || '', o.dueAt || null]);
  for (let i = 0; i < o.approvers.length; i++)
    await client.query('INSERT INTO rexus_approval_steps(id,request_id,approver_id,sequence_num,assigned_at) VALUES ($1,$2,$3,$4,NOW())', [id(), reqId, o.approvers[i], mode === 'sequential' ? i + 1 : 1]);
  await client.query('INSERT INTO rexus_approval_events(id,request_id,actor_id,action,previous_status,new_status) VALUES ($1,$2,$3,$4,$5,$6)', [id(), reqId, o.requesterId, 'Submit', 'Draft', 'Pending']);
  return { id: reqId, mode, category, firstApprovers: mode === 'sequential' ? o.approvers.slice(0, 1) : o.approvers };
}

export async function notifyApprovers(db: any, requestId: string, title: string, approvers: string[]) {
  for (const who of approvers) await createNotification(db, { userId: who, type: 'approval', title: 'Approval required: ' + title, entityType: 'approval', entityId: requestId });
}

/** Active delegations where `userId` is the delegate, valid today, for the category. */
export async function delegatorsFor(db: any, userId: string, category?: string): Promise<string[]> {
  const rows = await db.sql`SELECT delegator_id, categories FROM rexus_approval_delegations WHERE delegate_id = ${userId} AND status = 'Active' AND start_date <= ${today()} AND end_date >= ${today()}`;
  return rows.filter((r: any) => { if (!category) return true; try { const c = JSON.parse(r.categories || '[]'); return !c.length || c.includes(category); } catch { return true; } }).map((r: any) => r.delegator_id);
}

/** Applies an approval outcome to its business source inside the same transaction. Unknown sources are a no-op. */
export async function applySource(client: any, request: any, newStatus: string, actorId: string) {
  const src = request.source_id;
  if (request.request_type === 'leave_request') {
    const map: Record<string, string> = { Approved: 'Approved', Rejected: 'Rejected', 'Changes Requested': 'Changes Requested' };
    if (!map[newStatus]) return;
    const r = await client.query("UPDATE rexus_leave_requests SET status=$1, decided_at=NOW(), updated_at=NOW() WHERE id=$2 AND status='Pending Approval' RETURNING id", [map[newStatus], src]);
    if (!r.rows.length) throw new ApprovalError('Leave request is no longer pending; approval rolled back', 409);
  }
  if (request.request_type === 'capacity_declaration') {
    if (newStatus === 'Approved') {
      const d = await client.query("SELECT user_id, month FROM rexus_capacity_declarations WHERE id=$1 AND status='Pending Approval' FOR UPDATE", [src]);
      if (!d.rows.length) throw new ApprovalError('Declaration is no longer pending; approval rolled back', 409);
      // The previously approved version stays effective until this one is approved, then it is superseded.
      await client.query("UPDATE rexus_capacity_declarations SET status='Superseded', updated_at=NOW() WHERE user_id=$1 AND month=$2 AND status='Approved'", [d.rows[0].user_id, d.rows[0].month]);
      await client.query("UPDATE rexus_capacity_declarations SET status='Approved', decided_at=NOW(), updated_at=NOW() WHERE id=$1", [src]);
    } else if (newStatus === 'Rejected' || newStatus === 'Changes Requested') {
      await client.query("UPDATE rexus_capacity_declarations SET status=$1, decided_at=NOW(), updated_at=NOW() WHERE id=$2 AND status='Pending Approval'", [newStatus, src]);
    }
  }
  if (request.request_type === 'project_disbursement') {
    if (newStatus === 'Approved') {
      const r = await client.query("UPDATE rexus_disbursements SET status='Approved', approved_amount=COALESCE(approved_amount, requested_amount), approved_by=$1 WHERE id=$2 AND status='Pending Approval' RETURNING id", [actorId, src]);
      if (!r.rows.length) throw new ApprovalError('Financial source status changed; approval rolled back', 409);
    } else if (newStatus === 'Rejected' || newStatus === 'Changes Requested') {
      await client.query("UPDATE rexus_disbursements SET status=$1 WHERE id=$2 AND status='Pending Approval'", [newStatus === 'Rejected' ? 'Rejected' : 'Draft', src]);
    }
  }
  if (request.request_type === 'project_expense') {
    // Approval authorises the expense; it is NOT cash movement. Confirmation is a separate, audited step.
    if (newStatus === 'Approved') {
      const r = await client.query("UPDATE rexus_project_transactions SET status='Approved', approved_by=$1, updated_at=NOW() WHERE id=$2 AND status='Pending Approval' RETURNING id", [actorId, src]);
      if (!r.rows.length) throw new ApprovalError('Transaction status changed; approval rolled back', 409);
    } else if (newStatus === 'Rejected' || newStatus === 'Changes Requested') {
      await client.query("UPDATE rexus_project_transactions SET status=$1, updated_at=NOW() WHERE id=$2 AND status='Pending Approval'", [newStatus === 'Rejected' ? 'Rejected' : 'Draft', src]);
    }
    await client.query('INSERT INTO rexus_financial_events(id,entity_type,entity_id,actor_id,action,details) VALUES ($1,$2,$3,$4,$5,$6)', [id(), 'transaction', src, actorId, 'approval_' + newStatus.toLowerCase().replace(/\s+/g, '_'), JSON.stringify({ request: request.id })]);
  }
}

/** Runs fn inside BEGIN/COMMIT on a pooled client (ROLLBACK on any error). */
export async function tx<T>(db: any, fn: (c: any) => Promise<T>): Promise<T> {
  const client = await db.pool.connect();
  try { await client.query('BEGIN'); const out = await fn(client); await client.query('COMMIT'); return out; }
  catch (e) { try { await client.query('ROLLBACK'); } catch {} throw e; }
  finally { client.release(); }
}
