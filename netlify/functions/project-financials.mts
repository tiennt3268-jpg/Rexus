/* REXUS v2.2.1 — Project Finance, Budget & Cash Flow API (Module 7).
   Projects are identified by (owner, name) — the real primary key of `projects`. Projects that exist
   only as a task's project name (not registered in `projects`) are listed too, which is why some
   projects used to be missing from Project Finance. No duplicate finance "project" records are created.

   GET  ?list=1[&q=&status=&page=&page_size=&sort=]  → accessible projects with totals (zero totals when no transactions)
   GET  ?owner=&project=                             → summary + ledger + disbursements + payments
   GET  ?owner=&project=&history=<entity_type>:<id>   → audit trail for one transaction / disbursement
   POST {owner, project, action:
         'add_transaction'      {type, amount, currency, category, description, payment_method, reference, counterparty, transaction_date, notes, attachment_url, exchange_rate?, submit_for_approval?, approver_id?}
         'confirm_transaction'  {id}           Draft (income) / Approved (expense) → Completed
         'cancel_transaction'   {id}           Draft / Pending Approval → Cancelled
         'reverse_transaction'  {id, reason}   Completed → correcting reversal entry (history is never edited)
         'request_disbursement' {amount, currency, purpose, recipient, payment_method, requested_date, notes, attachment_url, approver_id?}
         'pay_disbursement'     {id, amount, reference, payment_date, recipient, payment_method}} */
import type { Context, Config } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { randomUUID } from 'node:crypto';
import { getUserFromRequest, unauthorized } from './lib/auth.mts';
import { getFullUser, isSystemAdmin, getEffectiveProjectRole, roleCanManage } from './lib/rbac.mts';
import { logAudit } from './lib/rexus-audit.mts';
import { resolveApprovers, insertRequest, notifyApprovers, tx, ApprovalError } from './lib/approvals.mts';

const fail = (m: string, s = 400) => Response.json({ error: m }, { status: s });
const finite = (x: any) => typeof x === 'number' && Number.isFinite(x) && x > 0 && x < 1e15;
const isDay = (s: any) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const r2 = (n: number) => Math.round(n * 100) / 100;
const CATEGORIES = { Income: ['Client Payment', 'Project Funding', 'Reimbursement', 'Other Income'], Expense: ['Operating Costs', 'Supplier Payments', 'Travel Expenses', 'Project Advances', 'Other Project Costs'] };
const METHODS = ['Bank Transfer', 'Cash', 'Card', 'E-wallet', 'Cheque', 'Other'];

/** Every project the user can see: registered rows they own / are members of / admin, plus implicit task-name projects. */
async function accessibleProjects(db: any, me: any) {
  const admin = isSystemAdmin(me);
  const reg = admin ? await db.sql`SELECT p.*, u.full_name AS owner_name FROM projects p LEFT JOIN users u ON u.id = p.user_id`
    : await db.sql`SELECT p.*, u.full_name AS owner_name FROM projects p LEFT JOIN users u ON u.id = p.user_id
        WHERE p.user_id = ${me.id} OR EXISTS (SELECT 1 FROM project_members m WHERE m.owner_user_id = p.user_id AND m.project = p.name AND m.user_id = ${me.id})`;
  const keys = new Set(reg.map((p: any) => p.user_id + '::' + p.name));
  const implicit = admin ? await db.sql`SELECT DISTINCT t.user_id, t.project AS name, u.full_name AS owner_name FROM tasks t LEFT JOIN users u ON u.id = t.user_id WHERE COALESCE(t.project,'') <> ''`
    : await db.sql`SELECT DISTINCT t.user_id, t.project AS name, u.full_name AS owner_name FROM tasks t LEFT JOIN users u ON u.id = t.user_id
        WHERE COALESCE(t.project,'') <> '' AND (t.user_id = ${me.id} OR EXISTS (SELECT 1 FROM project_members m WHERE m.owner_user_id = t.user_id AND m.project = t.project AND m.user_id = ${me.id}))`;
  const list = reg.map((p: any) => ({ owner: p.user_id, name: p.name, owner_name: p.owner_name || '', status: p.status || 'Active', budget: p.budget === null || p.budget === undefined ? null : Number(p.budget),
    budget_currency: p.budget_currency || 'VND', registered: true, project_manager: p.owner || '' }));
  for (const t of implicit) if (!keys.has(t.user_id + '::' + t.name)) { keys.add(t.user_id + '::' + t.name); list.push({ owner: t.user_id, name: t.name, owner_name: t.owner_name || '', status: 'Active', budget: null, budget_currency: 'VND', registered: false, project_manager: '' }); }
  return list;
}

/** Totals per currency. Only Completed entries move cash; reversals subtract; pending/rejected/cancelled never count. */
function summarize(tx: any[], requests: any[], payments: any[], budget: number | null, budgetCurrency: string) {
  const currencies = [...new Set([budgetCurrency, ...tx.map(x => x.currency), ...requests.map(x => x.currency)])];
  const reversed = new Set(tx.filter(x => x.reverses_id && x.status === 'Completed').map(x => x.reverses_id));
  return currencies.map(currency => {
    const done = tx.filter(x => x.currency === currency && x.status === 'Completed' && !x.reverses_id && !reversed.has(x.id));
    const income = done.filter(x => x.type === 'Income').reduce((n, x) => n + Number(x.amount), 0);
    const expense = done.filter(x => x.type === 'Expense').reduce((n, x) => n + Number(x.amount), 0);
    const reqs = requests.filter(d => d.currency === currency);
    const disbursed = payments.filter(p => reqs.some(d => d.id === p.request_id)).reduce((n, p) => n + Number(p.amount), 0);
    const approvedAlloc = reqs.filter(d => ['Approved', 'Partially Disbursed', 'Fully Disbursed'].includes(d.status)).reduce((n, d) => n + Number(d.approved_amount || 0), 0);
    const pendingApproval = tx.filter(x => x.currency === currency && x.status === 'Pending Approval').reduce((n, x) => n + Number(x.amount), 0);
    const b = currency === budgetCurrency ? budget : null;
    return { currency, approved_budget: b, received: r2(income), expenses: r2(expense), net_cash: r2(income - expense), disbursed: r2(disbursed),
      approved_disbursement_allocation: r2(approvedAlloc), remaining_undisbursed_allocation: r2(approvedAlloc - disbursed),
      remaining_budget_to_disburse: b === null ? null : r2(b - disbursed), budget_utilization: b ? r2((expense / b) * 100) : null, pending_approval: r2(pendingApproval) };
  });
}

async function resolveProject(db: any, me: any, owner: string, name: string) {
  if (!name) throw new ApprovalError('Project required');
  let candidates: any[] = [];
  if (owner) candidates = [{ user_id: owner, name }];
  else candidates = await db.sql`SELECT user_id, name FROM projects WHERE name = ${name}`; // legacy callers (name only)
  const ok: any[] = [];
  for (const p of candidates) { const role = await getEffectiveProjectRole(db, p.user_id, p.name, me.id, me.role); if (role) ok.push({ ...p, role }); }
  if (!ok.length) throw new ApprovalError('Project not found or not accessible', 403);
  if (ok.length > 1) throw new ApprovalError('Several accessible projects share this name — pass the owner', 409);
  const row = (await db.sql`SELECT * FROM projects WHERE user_id = ${ok[0].user_id} AND name = ${name}`)[0] || null;
  if (!row) { const t = await db.sql`SELECT 1 FROM tasks WHERE user_id = ${ok[0].user_id} AND project = ${name} LIMIT 1`; if (!t.length) throw new ApprovalError('Project not found', 404); }
  return { owner: ok[0].user_id, name, role: ok[0].role, row };
}

export default async (req: Request, _context: Context) => {
  const session = await getUserFromRequest(req); if (!session) return unauthorized();
  const db = getDatabase(), url = new URL(req.url);
  try {
    const me = await getFullUser(db, session.uid); if (!me) return unauthorized();
    if (req.method === 'GET' && url.searchParams.get('list')) {
      const projects = await accessibleProjects(db, me);
      const q = (url.searchParams.get('q') || '').toLowerCase(), status = url.searchParams.get('status') || '';
      let rows = projects.filter(p => (!q || p.name.toLowerCase().includes(q) || p.owner_name.toLowerCase().includes(q)) && (!status || p.status === status));
      const txAll = await db.sql`SELECT project_owner_id, project_name, type, amount, currency, status, reverses_id, id FROM rexus_project_transactions`;
      const reqAll = await db.sql`SELECT id, project_owner_id, project_name, currency, status, approved_amount FROM rexus_disbursements`;
      const payAll = await db.sql`SELECT request_id, amount FROM rexus_disbursement_payments`;
      const out = rows.map(p => {
        const t = txAll.filter((x: any) => x.project_owner_id === p.owner && x.project_name === p.name);
        const d = reqAll.filter((x: any) => x.project_owner_id === p.owner && x.project_name === p.name);
        const s = summarize(t, d, payAll.filter((x: any) => d.some((r: any) => r.id === x.request_id)), p.budget, p.budget_currency);
        const main = s.find(x => x.currency === p.budget_currency) || s[0];
        return { ...p, total_income: main.received, total_expenses: main.expenses, cash_balance: main.net_cash, total_disbursed: main.disbursed, budget_utilization: main.budget_utilization,
          other_currencies: s.filter(x => x.currency !== p.budget_currency && (x.received || x.expenses || x.disbursed)).map(x => x.currency), transaction_count: t.length };
      });
      const sort = url.searchParams.get('sort') || 'name_asc'; const [k, dir] = sort.split('_');
      out.sort((a: any, b: any) => { const av = a[k === 'name' ? 'name' : k] ?? -Infinity, bv = b[k === 'name' ? 'name' : k] ?? -Infinity; return (av > bv ? 1 : av < bv ? -1 : 0) * (dir === 'desc' ? -1 : 1); });
      const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1), size = Math.min(200, Math.max(5, parseInt(url.searchParams.get('page_size') || '50', 10) || 50));
      return Response.json({ projects: out.slice((page - 1) * size, page * size), total: out.length, page, page_size: size, categories: CATEGORIES, methods: METHODS });
    }

    const b = req.method === 'GET' ? {} : await req.json().catch(() => ({}));
    const P = await resolveProject(db, me, String((b as any).owner || url.searchParams.get('owner') || ''), String((b as any).project || url.searchParams.get('project') || ''));
    const { owner, name } = P;
    const budget = P.row?.budget === null || P.row?.budget === undefined ? null : Number(P.row.budget);
    const budgetCurrency = P.row?.budget_currency || 'VND';
    const canManage = roleCanManage(P.role);

    if (req.method === 'GET') {
      const hist = url.searchParams.get('history');
      if (hist) {
        const [etype, eid] = hist.split(':');
        if (!['transaction', 'disbursement'].includes(etype)) return fail('Unknown history entity');
        const belongs = etype === 'transaction' ? await db.sql`SELECT 1 FROM rexus_project_transactions WHERE id = ${eid} AND project_owner_id = ${owner} AND project_name = ${name}`
          : await db.sql`SELECT 1 FROM rexus_disbursements WHERE id = ${eid} AND project_owner_id = ${owner} AND project_name = ${name}`;
        if (!belongs.length) return fail('Not found', 404);
        const events = await db.sql`SELECT e.*, u.full_name AS actor_name FROM rexus_financial_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.entity_type = ${etype} AND e.entity_id = ${eid} ORDER BY e.created_at`;
        const approvals = await db.sql`SELECT ev.*, u.full_name AS actor_name, r.title FROM rexus_approval_requests r JOIN rexus_approval_events ev ON ev.request_id = r.id LEFT JOIN users u ON u.id = ev.actor_id WHERE r.source_id = ${eid} ORDER BY ev.created_at`;
        return Response.json({ events, approval_events: approvals });
      }
      const tx = await db.sql`SELECT t.*, c.full_name AS created_by_name, a.full_name AS approved_by_name FROM rexus_project_transactions t LEFT JOIN users c ON c.id = t.created_by LEFT JOIN users a ON a.id = t.approved_by
        WHERE t.project_owner_id = ${owner} AND t.project_name = ${name} ORDER BY COALESCE(t.transaction_date, t.created_at::date) DESC, t.created_at DESC LIMIT 1000`;
      const requests = await db.sql`SELECT d.*, u.full_name AS requested_by_name FROM rexus_disbursements d LEFT JOIN users u ON u.id = d.requested_by WHERE d.project_owner_id = ${owner} AND d.project_name = ${name} ORDER BY d.created_at DESC LIMIT 500`;
      const payments = await db.sql`SELECT pay.*, u.full_name AS recorded_by_name FROM rexus_disbursement_payments pay JOIN rexus_disbursements d ON d.id = pay.request_id LEFT JOIN users u ON u.id = pay.recorded_by WHERE d.project_owner_id = ${owner} AND d.project_name = ${name} ORDER BY pay.paid_at`;
      return Response.json({ project: name, owner, registered: !!P.row, status: P.row?.status || 'Active', approved_budget: budget, budget_currency: budgetCurrency,
        summary: summarize(tx, requests, payments, budget, budgetCurrency), transactions: tx, disbursements: requests, payments, can_manage: canManage, categories: CATEGORIES, methods: METHODS });
    }
    if (req.method !== 'POST') return fail('POST required', 405);
    if (!canManage) return fail('Project finance management access required', 403);
    const action = String((b as any).action || '');
    const B: any = b;
    const event = (c: any, etype: string, eid: string, act: string, details: any = {}) =>
      c.query('INSERT INTO rexus_financial_events(id,entity_type,entity_id,actor_id,action,details) VALUES ($1,$2,$3,$4,$5,$6)', [randomUUID(), etype, eid, session.uid, act, JSON.stringify(details)]);

    if (action === 'add_transaction') {
      const type = String(B.type || ''), currency = String(B.currency || '').toUpperCase(), amount = Number(B.amount);
      if (!['Income', 'Expense'].includes(type) || !finite(amount) || !/^[A-Z]{3}$/.test(currency)) return fail('Type, a positive amount and a 3-letter currency are required');
      const ref = String(B.reference || '').trim().slice(0, 120); if (!ref) return fail('A unique reference number is required');
      const rate = B.exchange_rate === undefined || B.exchange_rate === null || B.exchange_rate === '' ? null : Number(B.exchange_rate);
      if (rate !== null && !(rate > 0)) return fail('Exchange rate must be positive');
      if (currency !== budgetCurrency && rate === null && B.require_rate) return fail('Provide an exchange rate to convert into ' + budgetCurrency);
      const id = 'FT' + randomUUID().slice(0, 12).toUpperCase();
      const submit = type === 'Expense' && !!B.submit_for_approval;
      try {
        const out = await tx(db, async c => {
          await c.query(`INSERT INTO rexus_project_transactions(id,project_owner_id,project_name,type,amount,currency,category,description,reference,status,created_by,transaction_date,payment_method,counterparty,notes,attachment_url,exchange_rate,base_amount)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Draft',$10,$11,$12,$13,$14,$15,$16,$17)`,
            [id, owner, name, type, amount, currency, String(B.category || '').slice(0, 100), String(B.description || '').slice(0, 1500), ref, session.uid, isDay(B.transaction_date) ? B.transaction_date : null,
              METHODS.includes(B.payment_method) ? B.payment_method : '', String(B.counterparty || '').slice(0, 200), String(B.notes || '').slice(0, 1500), String(B.attachment_url || '').slice(0, 500),
              rate, rate === null ? (currency === budgetCurrency ? amount : null) : r2(amount * rate)]);
          await event(c, 'transaction', id, 'create', { type, amount, currency, reference: ref });
          if (!submit) return null;
          const approvers = await resolveApprovers(db, { category: 'Project Finance', type: 'project_expense', requesterId: session.uid, projectKey: owner + '::' + name, explicit: B.approver_id ? [String(B.approver_id)] : [] });
          const title = `Expense ${amount.toLocaleString('en-US')} ${currency} — ${name}`;
          const r = await insertRequest(c, { type: 'project_expense', title, requesterId: session.uid, approvers, sourceType: 'transaction', sourceId: id, projectKey: owner + '::' + name, payload: { amount, currency, reference: ref } });
          await c.query("UPDATE rexus_project_transactions SET status='Pending Approval', approval_request_id=$1 WHERE id=$2", [r.id, id]);
          await event(c, 'transaction', id, 'submit_for_approval', { request: r.id });
          return { ...r, title };
        });
        if (out) await notifyApprovers(db, out.id, out.title, out.firstApprovers);
      } catch (e: any) {
        if (e instanceof ApprovalError) throw e;
        if (String(e?.message || '').includes('duplicate') || e?.code === '23505') return fail('A transaction with this reference already exists for this project', 409);
        throw e;
      }
      await logAudit(db, { actorId: session.uid, actorName: session.username, action: 'finance_transaction_create', entityType: 'transaction', entityId: id, summary: type + ' ' + amount + ' ' + currency + ' — ' + name });
      return Response.json({ id, status: submit ? 'Pending Approval' : 'Draft' }, { status: 201 });
    }

    if (action === 'confirm_transaction' || action === 'cancel_transaction') {
      const id = String(B.id || '');
      const res = await tx(db, async c => {
        const row = (await c.query('SELECT * FROM rexus_project_transactions WHERE id=$1 AND project_owner_id=$2 AND project_name=$3 FOR UPDATE', [id, owner, name])).rows[0];
        if (!row) throw new ApprovalError('Transaction not found', 404);
        if (action === 'cancel_transaction') {
          if (!['Draft', 'Pending Approval'].includes(row.status)) throw new ApprovalError('Only draft or pending transactions can be cancelled; use a reversal for completed ones', 409);
          await c.query("UPDATE rexus_project_transactions SET status='Cancelled', updated_by=$1, updated_at=NOW() WHERE id=$2", [session.uid, id]);
          if (row.approval_request_id) await c.query("UPDATE rexus_approval_requests SET status='Cancelled', updated_at=NOW() WHERE id=$1 AND status='Pending'", [row.approval_request_id]);
          await event(c, 'transaction', id, 'cancel', { previous_status: row.status });
          return 'Cancelled';
        }
        // Expenses routed for approval must be Approved first; a Draft expense confirmed directly is an owner/admin decision.
        if (row.status === 'Pending Approval') throw new ApprovalError('Awaiting approval in the Approval Center', 409);
        if (!['Draft', 'Approved'].includes(row.status)) throw new ApprovalError('Transaction already processed', 409);
        if (row.type === 'Expense' && row.status === 'Draft' && P.role === 'Member') throw new ApprovalError('Submit this expense for approval', 403);
        const u = await c.query("UPDATE rexus_project_transactions SET status='Completed', confirmed_at=NOW(), approved_by=COALESCE(approved_by,$1), updated_by=$1, updated_at=NOW() WHERE id=$2 AND status IN ('Draft','Approved') RETURNING id", [session.uid, id]);
        if (!u.rows.length) throw new ApprovalError('Concurrent confirmation conflict', 409);
        await event(c, 'transaction', id, 'confirm', { previous_status: row.status, amount: row.amount, currency: row.currency });
        return 'Completed';
      });
      await logAudit(db, { actorId: session.uid, actorName: session.username, action: 'finance_' + action, entityType: 'transaction', entityId: id, summary: res + ' — ' + name });
      return Response.json({ ok: true, status: res });
    }

    if (action === 'reverse_transaction') {
      const id = String(B.id || ''), reason = String(B.reason || '').trim().slice(0, 500);
      if (!reason) return fail('A reason is required for a correction');
      const rid = 'FT' + randomUUID().slice(0, 12).toUpperCase();
      await tx(db, async c => {
        const row = (await c.query('SELECT * FROM rexus_project_transactions WHERE id=$1 AND project_owner_id=$2 AND project_name=$3 FOR UPDATE', [id, owner, name])).rows[0];
        if (!row || row.status !== 'Completed' || row.reverses_id) throw new ApprovalError('Only completed original entries can be reversed', 409);
        const dup = await c.query("SELECT 1 FROM rexus_project_transactions WHERE reverses_id=$1 AND status <> 'Cancelled'", [id]);
        if (dup.rows.length) throw new ApprovalError('This entry has already been reversed', 409);
        await c.query(`INSERT INTO rexus_project_transactions(id,project_owner_id,project_name,type,amount,currency,category,description,reference,status,created_by,approved_by,confirmed_at,transaction_date,notes,reverses_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Completed',$10,$10,NOW(),CURRENT_DATE,$11,$12)`,
          [rid, owner, name, row.type, row.amount, row.currency, row.category, 'Reversal of ' + row.reference, 'REV-' + row.reference, session.uid, reason, id]);
        await event(c, 'transaction', id, 'reversed', { reversal_id: rid, reason });
        await event(c, 'transaction', rid, 'create_reversal', { reverses: id, reason });
      });
      await logAudit(db, { actorId: session.uid, actorName: session.username, action: 'finance_reverse', entityType: 'transaction', entityId: id, summary: 'Reversed — ' + reason });
      return Response.json({ ok: true, reversal_id: rid }, { status: 201 });
    }

    if (action === 'request_disbursement') {
      const amount = Number(B.amount), currency = String(B.currency || budgetCurrency).toUpperCase();
      if (!finite(amount) || !/^[A-Z]{3}$/.test(currency)) return fail('A positive amount and currency are required');
      const purpose = String(B.purpose || '').trim().slice(0, 1000); if (!purpose) return fail('Purpose is required');
      const id = 'DB' + randomUUID().slice(0, 12).toUpperCase();
      const out = await tx(db, async c => {
        await c.query(`INSERT INTO rexus_disbursements(id,project_owner_id,project_name,requested_amount,currency,purpose,recipient,requested_by,status,requested_date,payment_method,notes,attachment_url)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Pending Approval',$9,$10,$11,$12)`,
          [id, owner, name, amount, currency, purpose, String(B.recipient || '').slice(0, 200), session.uid, isDay(B.requested_date) ? B.requested_date : new Date().toISOString().slice(0, 10),
            METHODS.includes(B.payment_method) ? B.payment_method : '', String(B.notes || '').slice(0, 1500), String(B.attachment_url || '').slice(0, 500)]);
        await event(c, 'disbursement', id, 'request', { amount, currency, purpose });
        // Approval request is created in the SAME transaction: no orphaned disbursement if routing fails.
        const approvers = await resolveApprovers(db, { category: 'Project Finance', type: 'project_disbursement', requesterId: session.uid, projectKey: owner + '::' + name, explicit: B.approver_id ? [String(B.approver_id)] : [] });
        const title = `Disbursement ${amount.toLocaleString('en-US')} ${currency} — ${name}: ${purpose.slice(0, 60)}`;
        const r = await insertRequest(c, { type: 'project_disbursement', title, requesterId: session.uid, approvers, sourceType: 'disbursement', sourceId: id, projectKey: owner + '::' + name, payload: { amount, currency, purpose } });
        await c.query('UPDATE rexus_disbursements SET approval_request_id=$1 WHERE id=$2', [r.id, id]);
        return { ...r, title };
      });
      await notifyApprovers(db, out.id, out.title, out.firstApprovers);
      await logAudit(db, { actorId: session.uid, actorName: session.username, action: 'finance_disbursement_request', entityType: 'disbursement', entityId: id, summary: out.title });
      return Response.json({ id, status: 'Pending Approval', approval_id: out.id }, { status: 201 });
    }

    if (action === 'pay_disbursement') {
      const id = String(B.id || ''), amount = Number(B.amount), reference = String(B.reference || '').trim().slice(0, 120);
      if (!finite(amount) || !reference) return fail('Amount and a unique payment reference are required');
      let status = '';
      await tx(db, async c => {
        // Serialise releases per project: lock the project row, then re-check every limit inside the transaction.
        const lp = await c.query('SELECT budget, budget_currency FROM projects WHERE user_id=$1 AND name=$2 FOR UPDATE', [owner, name]);
        if (!lp.rows.length || lp.rows[0].budget === null) throw new ApprovalError('Register the project and set an approved budget before releasing funds', 409);
        const d = (await c.query('SELECT * FROM rexus_disbursements WHERE id=$1 AND project_owner_id=$2 AND project_name=$3 FOR UPDATE', [id, owner, name])).rows[0];
        if (!d) throw new ApprovalError('Disbursement not found', 404);
        if (!['Approved', 'Partially Disbursed'].includes(d.status)) throw new ApprovalError('Disbursement must be approved before payment (current: ' + d.status + ')', 409);
        if (d.currency !== (lp.rows[0].budget_currency || 'VND')) throw new ApprovalError('Disbursement currency does not match the project budget currency', 409);
        const approval = await c.query("SELECT 1 FROM rexus_approval_requests WHERE source_type='disbursement' AND source_id=$1 AND status='Approved' LIMIT 1", [id]);
        if (!approval.rows.length) throw new ApprovalError('Approval Center authorization required', 409);
        const paid = Number((await c.query('SELECT COALESCE(SUM(amount),0)::float AS t FROM rexus_disbursement_payments WHERE request_id=$1', [id])).rows[0].t);
        const approved = Number(d.approved_amount);
        if (!finite(approved) || paid + amount > approved + 0.0001) throw new ApprovalError('Payment exceeds the remaining approved amount (' + r2(approved - paid) + ')', 409);
        const all = Number((await c.query('SELECT COALESCE(SUM(p.amount),0)::float AS t FROM rexus_disbursement_payments p JOIN rexus_disbursements x ON x.id=p.request_id WHERE x.project_owner_id=$1 AND x.project_name=$2 AND x.currency=$3', [owner, name, d.currency])).rows[0].t);
        if (all + amount > Number(lp.rows[0].budget) + 0.0001) throw new ApprovalError('Release exceeds the authorized project budget', 409);
        try {
          await c.query('INSERT INTO rexus_disbursement_payments(id,request_id,amount,reference,recorded_by,payment_date,recipient,payment_method) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
            [randomUUID(), id, amount, reference, session.uid, isDay(B.payment_date) ? B.payment_date : new Date().toISOString().slice(0, 10), String(B.recipient || d.recipient || '').slice(0, 200), METHODS.includes(B.payment_method) ? B.payment_method : (d.payment_method || '')]);
        } catch (e: any) { if (e?.code === '23505' || String(e?.message).includes('duplicate')) throw new ApprovalError('This payment reference was already recorded (duplicate prevented)', 409); throw e; }
        status = paid + amount >= approved - 0.0001 ? 'Fully Disbursed' : 'Partially Disbursed';
        await c.query('UPDATE rexus_disbursements SET status=$1 WHERE id=$2', [status, id]);
        await event(c, 'disbursement', id, 'payment', { amount, reference, status });
      });
      await logAudit(db, { actorId: session.uid, actorName: session.username, action: 'finance_disbursement_payment', entityType: 'disbursement', entityId: id, summary: amount + ' ' + reference });
      return Response.json({ ok: true, status });
    }
    return fail('Unknown action');
  } catch (e: any) {
    if (e instanceof ApprovalError) return fail(e.message, e.status);
    return fail('Financial request failed: ' + (e?.message || 'unknown'), 500);
  }
};
export const config: Config = { path: '/api/project-financials' };
