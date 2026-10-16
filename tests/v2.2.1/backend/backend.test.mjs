// REXUS v2.2.1 backend integration tests — real SQL (PGlite / PostgreSQL 16), real function handlers.
import { boot } from './harness.mjs';
const results = []; let section = '';
const ok = (name, cond, detail) => { results.push({ section, name, pass: !!cond, detail: cond ? undefined : detail }); console.log((cond ? 'PASS ' : 'FAIL ') + section + ' :: ' + name + (cond ? '' : '  → ' + JSON.stringify(detail).slice(0, 400))); };
const S = (s) => { section = s; };

const { db, call } = await boot();
const ADMIN = 'ADMIN_TIENNT', PM = 'U_MINCT', PM2 = 'U_TRANLN', MEM = 'U_TRUONGPN', PT = 'U_VYNHA', MEM2 = 'U_TOANTA', ADMIN2 = 'U_KHIEMNHL';
const q = async (sql, p = []) => (await db.query(sql, p)).rows;

/* ---------------------------------------------------------------- M10 migrations + identity */
S('Migrations');
const tables = (await q(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`)).map(r => r.table_name);
for (const t of ['rexus_user_preferences', 'rexus_leave_requests', 'rexus_capacity_declarations', 'rexus_capacity_entries', 'rexus_approval_delegations', 'rexus_approval_routing_rules', 'rexus_workflow_templates', 'rexus_resource_settings_history'])
  ok('table ' + t + ' exists', tables.includes(t));
const before = await q('SELECT (SELECT COUNT(*) FROM users) u, (SELECT COUNT(*) FROM tasks) t, (SELECT COUNT(*) FROM projects) p');
ok('existing users / tasks / projects untouched by 033', before[0].u >= 20 && before[0].t >= 7 && before[0].p >= 1, before);

/* ---------------------------------------------------------------- M9 preferences */
S('M9 Preferences');
let r = await call(MEM, 'GET', '/api/preferences'); ok('default theme is mono (unsaved)', r.json.theme === 'mono' && r.json.saved === false, r.json);
r = await call(MEM, 'PUT', '/api/preferences', { theme: 'navy' }); ok('save navy', r.status === 200 && r.json.theme === 'navy', r.json);
r = await call(MEM, 'GET', '/api/preferences'); ok('navy persists (server-side, per user id)', r.json.theme === 'navy' && r.json.saved, r.json);
r = await call(PM, 'GET', '/api/preferences'); ok('other user independent', r.json.theme === 'mono', r.json);
r = await call(MEM, 'PUT', '/api/preferences', { theme: 'pink' }); ok('unknown theme rejected', r.status === 400, r);
r = await call(null, 'GET', '/api/preferences'); ok('unauthenticated rejected', r.status === 401, r);

/* ---------------------------------------------------------------- M4 HR profile / holidays / leave */
S('M4 HR');
r = await call(MEM, 'PUT', '/api/hr/profile', { user_id: MEM, employment_type: 'Full-time', capacity_method: 'schedule', hours_per_day: 10, workdays: [1, 2, 3, 4, 5, 6] });
ok('member cannot change own schedule', r.status === 403, r);
r = await call(ADMIN, 'PUT', '/api/hr/profile', { user_id: MEM, employment_type: 'Full-time', capacity_method: 'schedule', hours_per_day: 8, workdays: [1, 2, 3, 4, 5], manager_id: PM, effective_from: '2026-01-01' });
ok('admin sets employment profile', r.status === 200, r.json);
const hist = await q('SELECT effective_from::text, hours_per_day FROM rexus_resource_settings_history WHERE user_id=$1 ORDER BY effective_from', [MEM]);
ok('first change records prior schedule (1900-01-01) + new row', hist.length === 2 && hist[0].effective_from === '1900-01-01', hist);
r = await call(MEM, 'GET', '/api/hr/profile'); ok('self can read own profile', r.status === 200 && r.json.profile.manager_id === PM, r.json);
r = await call(MEM2, 'GET', '/api/hr/profile?user_id=' + MEM); ok('unrelated member cannot read profile', r.status === 403, r);
r = await call(PM, 'GET', '/api/hr/profile?user_id=' + MEM); ok('manager can read report profile', r.status === 200, r);
const nov20dow = new Date('2026-11-20T12:00:00Z').getUTCDay();
r = await call(ADMIN, 'POST', '/api/hr/holidays', { day: '2026-11-20', name: 'Vietnamese Teachers Day (company)', kind: 'holiday_company' });
ok('admin adds holiday (Nov 20 weekday=' + nov20dow + ')', r.status === 201, r.json);
r = await call(ADMIN, 'POST', '/api/hr/holidays', { day: '2026-11-20', name: 'dup', kind: 'holiday_public' }); ok('duplicate company-wide day rejected', r.status === 409, r);
r = await call(MEM, 'POST', '/api/hr/holidays', { day: '2026-11-21', name: 'x' }); ok('member cannot add holiday', r.status === 403, r);

r = await call(MEM, 'POST', '/api/hr/leave', { action: 'save', leave_type: 'Annual Leave', start_date: '2026-11-03', end_date: '2026-11-04', unit: 'full', reason: 'Family' });
ok('leave draft saved, duration 16h', r.status === 201 && r.json.duration_hours === 16, r.json);
const leaveId = r.json.id;
r = await call(MEM, 'POST', '/api/hr/leave', { action: 'submit', id: leaveId, leave_type: 'Annual Leave', start_date: '2026-11-03', end_date: '2026-11-04', unit: 'full', reason: 'Family' });
ok('leave submitted → Pending Approval, routed to profile manager', r.status === 201 && r.json.status === 'Pending Approval', r.json);
const leaveApproval = r.json.approval_id;
const step = await q('SELECT approver_id FROM rexus_approval_steps WHERE request_id=$1', [leaveApproval]);
ok('approver = manager (U_MINCT)', step[0]?.approver_id === PM, step);
r = await call(MEM, 'POST', '/api/hr/leave', { action: 'submit', leave_type: 'Sick Leave', start_date: '2026-11-04', end_date: '2026-11-05', unit: 'full' });
ok('overlapping leave refused', r.status === 409, r.json);
r = await call(MEM, 'POST', '/api/hr/leave', { action: 'save', leave_type: 'Personal Leave', start_date: '2026-11-10', end_date: '2026-11-11', unit: 'half' });
ok('multi-day half-day refused', r.status === 400, r.json);

/* ---------------------------------------------------------------- M3 Approval Center */
S('M3 Approvals');
r = await call(MEM, 'POST', '/api/approval-center', { action: 'decide', id: leaveApproval, decision: 'Approved' }); ok('requester cannot decide own leave', r.status === 403, r.json);
r = await call(PM, 'POST', '/api/approval-center', { action: 'decide', id: leaveApproval, decision: 'Rejected' }); ok('reject without reason refused', r.status === 400, r.json);
r = await call(PM, 'GET', '/api/approval-center?tab=pending'); ok('pending tab shows leave for manager', r.json.requests?.some(x => x.id === leaveApproval && x.category === 'Human Resources'), r.json);
r = await call(PM, 'POST', '/api/approval-center', { action: 'decide', id: leaveApproval, decision: 'Approved' }); ok('manager approves leave', r.status === 200 && r.json.status === 'Approved', r.json);
r = await call(PM, 'POST', '/api/approval-center', { action: 'decide', id: leaveApproval, decision: 'Approved' }); ok('duplicate decision prevented', r.status === 409, r.json);
const lv = await q('SELECT status FROM rexus_leave_requests WHERE id=$1', [leaveId]); ok('leave source updated to Approved', lv[0].status === 'Approved', lv);
const notif = await q("SELECT title FROM notifications WHERE user_id=$1 AND entity_type='approval' AND entity_id=$2", [MEM, leaveApproval]); ok('requester notified of decision', notif.length === 1, notif);

// sequential + parallel
r = await call(MEM, 'POST', '/api/approval-center', { action: 'create', type: 'project_change_review', title: 'Scope change', approvers: [PM, PM2], mode: 'sequential' });
const seqId = r.json.id; ok('sequential request created', r.status === 201, r.json);
r = await call(PM2, 'POST', '/api/approval-center', { action: 'decide', id: seqId, decision: 'Approved' }); ok('stage 2 cannot act before stage 1', r.status === 403, r.json);
r = await call(PM, 'POST', '/api/approval-center', { action: 'decide', id: seqId, decision: 'Approved' }); ok('stage 1 approves → still Pending', r.json.status === 'Pending', r.json);
const n2 = await q("SELECT 1 FROM notifications WHERE user_id=$1 AND entity_id=$2", [PM2, seqId]); ok('stage 2 notified only after stage 1', n2.length === 1, n2);
r = await call(PM2, 'POST', '/api/approval-center', { action: 'decide', id: seqId, decision: 'Approved' }); ok('stage 2 approves → Approved', r.json.status === 'Approved', r.json);
r = await call(MEM, 'POST', '/api/approval-center', { action: 'create', type: 'project_change_review', title: 'Parallel', approvers: [PM, PM2], mode: 'parallel' });
const parId = r.json.id;
await call(PM2, 'POST', '/api/approval-center', { action: 'decide', id: parId, decision: 'Approved' });
r = await call(PM, 'GET', '/api/approval-center?id=' + parId); ok('parallel: one approval keeps Pending', r.json.request.status === 'Pending' && r.json.can_decide, r.json.request);
r = await call(PM, 'POST', '/api/approval-center', { action: 'decide', id: parId, decision: 'Changes Requested', reason: 'Clarify scope' }); ok('changes requested ends request', r.json.status === 'Changes Requested', r.json);
r = await call(MEM, 'POST', '/api/approval-center', { action: 'create', type: 'project_change_review', title: 'Self', approvers: [MEM] }); ok('self-approval refused at creation', r.status === 400, r.json);
r = await call(MEM, 'POST', '/api/approval-center', { action: 'create', type: 'leave_request', title: 'x', approvers: [PM] }); ok('source-backed types cannot be created directly', r.status === 400, r.json);

// reassign / assign
r = await call(MEM, 'POST', '/api/approval-center', { action: 'create', type: 'project_change_review', title: 'Reassign me', approvers: [PM] });
const raId = r.json.id;
r = await call(PM, 'POST', '/api/approval-center', { action: 'reassign', id: raId, approver_id: PM2 }); ok('reassign requires reason', r.status === 400, r.json);
r = await call(MEM2, 'POST', '/api/approval-center', { action: 'reassign', id: raId, approver_id: PM2, reason: 'x' }); ok('unrelated user cannot reassign', r.status === 403, r.json);
r = await call(PM, 'POST', '/api/approval-center', { action: 'reassign', id: raId, approver_id: MEM, reason: 'x' }); ok('cannot reassign to requester', r.status === 400, r.json);
r = await call(PM, 'POST', '/api/approval-center', { action: 'reassign', id: raId, approver_id: PM2, reason: 'On leave' }); ok('current approver hands off (non-finance)', r.status === 200, r.json);
const ev = await q("SELECT action, details FROM rexus_approval_events WHERE request_id=$1 ORDER BY created_at", [raId]);
ok('reassignment recorded with previous/new approver', ev.some(e => e.action === 'Reassign Approver' && JSON.parse(e.details).previous_approver === PM && JSON.parse(e.details).new_approver === PM2), ev);
r = await call(PM, 'POST', '/api/approval-center', { action: 'decide', id: raId, decision: 'Approved' }); ok('previous approver can no longer decide', r.status === 403, r.json);

// delegation
r = await call(PM2, 'POST', '/api/approval-center', { action: 'delegate', delegate_id: MEM2, start_date: '2020-01-01', end_date: '2099-12-31', categories: ['Project Management'] });
ok('delegation created (Project Management only)', r.status === 201, r.json); const delId = r.json.id;
r = await call(PM2, 'POST', '/api/approval-center', { action: 'delegate', delegate_id: MEM2, start_date: '2020-01-01', end_date: '2099-12-31', categories: [] });
ok('all-category delegation (incl. finance) to a Member refused', r.status === 400, r.json);
r = await call(MEM2, 'GET', '/api/approval-center?tab=delegated'); ok('delegated tab lists delegator requests', r.json.requests?.some(x => x.id === raId), r.json);
r = await call(MEM2, 'POST', '/api/approval-center', { action: 'decide', id: raId, decision: 'Approved' }); ok('delegate approves on behalf', r.json.status === 'Approved', r.json);
const st2 = await q('SELECT approver_id, acted_by FROM rexus_approval_steps WHERE request_id=$1', [raId]); ok('step keeps approver, records acted_by', st2[0].approver_id === PM2 && st2[0].acted_by === MEM2, st2);
await q("INSERT INTO rexus_approval_delegations(id,delegator_id,delegate_id,start_date,end_date,categories,status) VALUES ('old',$1,$2,'2020-01-01','2020-12-31','[]','Active')", [PM, MEM2]);
r = await call(MEM, 'POST', '/api/approval-center', { action: 'create', type: 'project_change_review', title: 'Expired delegation', approvers: [PM] }); const expId = r.json.id;
r = await call(MEM2, 'POST', '/api/approval-center', { action: 'decide', id: expId, decision: 'Approved' }); ok('expired delegation does not apply', r.status === 403, r.json);
r = await call(MEM2, 'POST', '/api/approval-center', { action: 'revoke_delegation', id: delId }); ok('delegate cannot revoke', r.status === 404, r.json);
r = await call(PM2, 'POST', '/api/approval-center', { action: 'revoke_delegation', id: delId }); ok('delegator revokes', r.status === 200, r.json);

// routing
r = await call(MEM2, 'POST', '/api/hr/leave', { action: 'submit', leave_type: 'Annual Leave', start_date: '2026-12-01', end_date: '2026-12-01', unit: 'full' });
ok('no manager / head / rule → actionable routing error', r.status === 422 && /approver/i.test(r.json.error), r.json);
r = await call(MEM, 'POST', '/api/approval-center', { action: 'routing_save', category: 'Human Resources', approver_id: PM2 }); ok('routing rules are admin-only', r.status === 403, r.json);
r = await call(ADMIN, 'POST', '/api/approval-center', { action: 'routing_save', category: 'Human Resources', request_type: 'leave_request', department: 'Vận hành', approver_id: PM2, priority: 10 });
ok('admin creates routing rule', r.status === 201, r.json);
r = await call(MEM2, 'POST', '/api/hr/leave', { action: 'submit', leave_type: 'Annual Leave', start_date: '2026-12-01', end_date: '2026-12-01', unit: 'full' });
const routed = r.status === 201 ? await q('SELECT approver_id FROM rexus_approval_steps WHERE request_id=$1', [r.json.approval_id]) : [];
ok('rule routes leave to configured approver', routed[0]?.approver_id === PM2, { r: r.json, routed });
r = await call(ADMIN, 'GET', '/api/approval-center?tab=all&category=Human%20Resources&page_size=5'); ok('admin "All" tab with category filter + pagination', r.status === 200 && r.json.page_size === 5 && r.json.requests.every(x => x.category === 'Human Resources'), r.json);

/* ---------------------------------------------------------------- M2 capacity declarations */
S('M2 Capacity declarations');
await call(ADMIN, 'PUT', '/api/hr/profile', { user_id: PT, employment_type: 'Part-time', capacity_method: 'declaration', hours_per_day: 4, workdays: [1, 3, 5], capacity_approver_id: PM, effective_from: '2026-01-01' });
let plan = await call(ADMIN, 'GET', '/api/resource-planning?from=2026-11-01&to=2026-11-30&user_id=' + PT);
let e = plan.json.employees?.[0];
ok('no declaration → Missing Declaration, capacity not treated as 0', e?.capacity_status === 'Missing Declaration' && e.approved_capacity === null && e.utilization === null, e);
const entries = ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09', '2026-11-11'].map(day => ({ day, hours: 4 }));
r = await call(PT, 'POST', '/api/hr/capacity', { action: 'save', month: '2026-11', entries }); ok('draft saved 20h', r.json.total_hours === 20, r.json);
r = await call(PT, 'POST', '/api/hr/capacity', { action: 'submit', month: '2026-11', entries }); ok('submitted → Pending Approval (routed to capacity approver)', r.json.status === 'Pending Approval', r.json);
const capDecl = r.json.id;
r = await call(PT, 'POST', '/api/hr/capacity', { action: 'save', month: '2026-11', entries }); ok('pending month cannot be edited', r.status === 409, r.json);
plan = await call(ADMIN, 'GET', '/api/resource-planning?from=2026-11-01&to=2026-11-30&user_id=' + PT); e = plan.json.employees[0];
ok('pending is not confirmed capacity', e.capacity_status === 'Pending Approval' && e.approved_capacity === null && e.pending_hours === 20, e);
let capReq = (await q("SELECT id FROM rexus_approval_requests WHERE source_id=$1", [capDecl]))[0].id;
r = await call(PM, 'POST', '/api/approval-center', { action: 'decide', id: capReq, decision: 'Approved' }); ok('approver approves declaration', r.json.status === 'Approved', r.json);
plan = await call(ADMIN, 'GET', '/api/resource-planning?from=2026-11-01&to=2026-11-30&user_id=' + PT); e = plan.json.employees[0];
ok('approved capacity = 20h', e.approved_capacity === 20 && e.capacity_status === 'Approved', e);
r = await call(PT, 'POST', '/api/hr/capacity', { action: 'save', month: '2026-11', entries: [...entries, { day: '2026-11-13', hours: 6 }] });
ok('revision creates version 2 draft', r.json.version === 2, r.json);
plan = await call(ADMIN, 'GET', '/api/resource-planning?from=2026-11-01&to=2026-11-30&user_id=' + PT);
ok('v1 stays effective while v2 is draft', plan.json.employees[0].approved_capacity === 20, plan.json.employees[0]);
r = await call(PT, 'POST', '/api/hr/capacity', { action: 'submit', month: '2026-11', entries: [...entries, { day: '2026-11-13', hours: 6 }] });
capReq = (await q("SELECT id FROM rexus_approval_requests WHERE source_id=$1", [r.json.id]))[0].id;
await call(PM, 'POST', '/api/approval-center', { action: 'decide', id: capReq, decision: 'Approved' });
const versions = await q("SELECT version, status FROM rexus_capacity_declarations WHERE user_id=$1 AND month='2026-11' ORDER BY version", [PT]);
ok('v1 Superseded, v2 Approved (history preserved)', versions[0].status === 'Superseded' && versions[1].status === 'Approved', versions);
plan = await call(ADMIN, 'GET', '/api/resource-planning?from=2026-11-01&to=2026-11-30&user_id=' + PT); ok('capacity now 26h', plan.json.employees[0].approved_capacity === 26, plan.json.employees[0]);
r = await call(PT, 'POST', '/api/hr/capacity', { action: 'copy_previous', month: '2026-12' }); ok('copy previous month by weekday', r.status === 201 && r.json.total_hours > 0, r.json);
r = await call(PM, 'GET', '/api/hr/team?month=2026-12'); ok('manager team view shows declaration status', r.json.employees?.some(x => x.id === PT && x.status === 'Draft'), r.json);

/* ---------------------------------------------------------------- M2 full-time capacity + planned/actual */
S('M2 Resource planning');
plan = await call(ADMIN, 'GET', '/api/resource-planning?from=2026-11-01&to=2026-11-30&user_id=' + MEM + '&detail=1'); e = plan.json.employees[0];
// Nov 2026: 21 weekdays; minus company holiday Fri 20th; minus approved leave 3–4 Nov (16h) → (21-1)*8-16 = 144
ok('full-time capacity = workdays×8 − holiday − approved leave = 144h', e.approved_capacity === 144 && e.leave_hours === 16, { cap: e.approved_capacity, leave: e.leave_hours });
ok('weekend days have 0 capacity', e.days.find(d => d.day === '2026-11-07').capacity === 0, e.days.find(d => d.day === '2026-11-07'));
// half-day leave on the holiday deducts nothing
await q("INSERT INTO rexus_leave_requests(id,user_id,leave_type,start_date,end_date,unit,status,duration_hours) VALUES ('LVH',$1,'Personal Leave','2026-11-20','2026-11-20','half','Approved',4)", [MEM]);
// overlapping approved leave on the same day as the full leave → no double deduction
await q("INSERT INTO rexus_leave_requests(id,user_id,leave_type,start_date,end_date,unit,status,duration_hours,hours) VALUES ('LVO',$1,'Other','2026-11-03','2026-11-03','hourly','Approved',2,2)", [MEM]);
plan = await call(ADMIN, 'GET', '/api/resource-planning?from=2026-11-01&to=2026-11-30&user_id=' + MEM); e = plan.json.employees[0];
ok('no double deduction (holiday + overlapping leave)', e.approved_capacity === 144, e.approved_capacity);
// schedule history: change to 6h from Dec 1 does not alter November
await call(ADMIN, 'PUT', '/api/hr/profile', { user_id: MEM, employment_type: 'Full-time', capacity_method: 'schedule', hours_per_day: 6, workdays: [1, 2, 3, 4, 5], manager_id: PM, effective_from: '2026-12-01' });
plan = await call(ADMIN, 'GET', '/api/resource-planning?from=2026-11-01&to=2026-11-30&user_id=' + MEM); ok('later schedule change does not rewrite November', plan.json.employees[0].approved_capacity === 144, plan.json.employees[0].approved_capacity);
plan = await call(ADMIN, 'GET', '/api/resource-planning?from=2026-12-01&to=2026-12-04&user_id=' + MEM); ok('December uses the new 6h schedule (Tue–Fri = 24h)', plan.json.employees[0].approved_capacity === 24, plan.json.employees[0].approved_capacity);
// cancelled leave restores capacity
await q("UPDATE rexus_leave_requests SET status='Cancelled' WHERE id='LVO'");

// planned hours
const mk = async (id, name, est, start, due, assignee) => q(`INSERT INTO tasks(id,user_id,task,project,status,estimated_hours,start_date,due_date,assignee_id,predecessors) VALUES ($1,$2,$3,'RP Test','Not Started',$4,$5,$6,$7,'[]')`, [id, ADMIN, name, est, start, due, assignee]);
await mk('TA', 'Plain task', 16, '2026-11-09', '2026-11-13', MEM);          // 5 workdays
await mk('TB', 'Rollup task', 10, '2026-11-16', '2026-11-19', MEM);          // 10 ≤ 6+6 → rollup
await q(`INSERT INTO subtasks(id,task_id,user_id,name,status,estimated_hours,due_date,assignee_id) VALUES ('SB1','TB',$1,'s1','Not Started',6,'2026-11-17',$2),('SB2','TB',$1,'s2','Not Started',6,'2026-11-19',$2)`, [ADMIN, MEM]);
await mk('TC', 'Independent remainder', 20, '2026-11-23', '2026-11-27', MEM); // 20 − 5 = 15 own
await q(`INSERT INTO subtasks(id,task_id,user_id,name,status,estimated_hours,due_date,assignee_id) VALUES ('SC1','TC',$1,'c1','Not Started',5,'2026-11-24',$2)`, [ADMIN, MEM]);
await mk('TD', 'Unestimated', 0, '2026-11-10', '2026-11-10', MEM);
await mk('TE', 'Shared task', 30, '2026-11-09', '2026-11-13', MEM);
await q(`INSERT INTO rexus_resource_allocations(id,task_id,user_id,planned_hours,start_date,end_date) VALUES ('A1','TE',$1,10,'2026-11-09','2026-11-13'),('A2','TE',$2,20,'2026-11-09','2026-11-13')`, [MEM, MEM2]);
await mk('TF', 'No dates', 7, null, null, MEM);
await q(`INSERT INTO worklogs(id,task_id,date,hours,user_id,logged_by,subtask_id) VALUES ('W1','TA','2026-11-09',3,$1,$1,NULL),('W2','TB','2026-11-17',2,$1,$1,'SB1')`, [MEM]);
plan = await call(ADMIN, 'GET', '/api/resource-planning?from=2026-11-01&to=2026-11-30&user_id=' + MEM); e = plan.json.employees[0];
// 16 (TA) + 12 (TB subtasks) + 15+5 (TC) + 10 (TE allocation) = 58 ; TF unscheduled; TD unestimated
ok('planned = 16 + 12 (rollup not double-counted) + 20 + 10 (allocation) = 58h', e.planned_hours === 58, { planned: e.planned_hours, a: e.assignments.map(a => [a.task_id, a.kind, a.planned_in_range]) });
ok('allocation split does not multiply the 30h total', plan.json.employees[0].assignments.filter(a => a.task_id === 'TE').reduce((s, a) => s + a.planned_in_range, 0) === 10, e.assignments);
ok('unestimated task listed (not zero effort)', plan.json.unestimated.some(u => u.id === 'TD'), plan.json.unestimated);
ok('undated estimate reported as unscheduled, not in this month', plan.json.unscheduled.some(u => u.task_id === 'TF'), plan.json.unscheduled);
ok('actual = worklogs (task+subtask row counted once) = 5h', e.actual_hours === 5, e.actual_hours);
ok('variance = actual − planned', e.variance_hours === 5 - 58, e.variance_hours);
ok('utilization = planned / approved capacity', Math.abs(e.utilization - (58 / 144) * 100) < 0.01 && e.status === 'Available', { u: e.utilization, s: e.status });
r = await call(ADMIN, 'GET', '/api/resource-planning?preview=1&from=2026-11-01&to=2026-11-30&user_id=' + MEM + '&hours=100');
ok('allocation preview shows overload impact', r.json.overload_after === 14 && r.json.planned_after === 158, r.json);
r = await call(MEM2, 'GET', '/api/resource-planning?from=2026-11-01&to=2026-11-30'); ok('member sees only self/managed', r.json.employees.length === 1 && r.json.employees[0].id === MEM2, r.json.employees?.map(x => x.id));
r = await call(ADMIN, 'GET', '/api/resource-planning?availability=1&from=2026-11-01&to=2026-11-30&min_hours=100'); ok('availability search returns confirmed remaining ≥ 100h', r.json.employees.every(x => x.remaining_hours >= 100) && r.json.employees.length > 0, r.json.employees?.slice(0, 3));
r = await call(MEM, 'POST', '/api/resource-planning', { action: 'estimate', kind: 'task', id: 'TD', estimated_hours: 4 }); ok('member cannot set estimates', r.status === 403, r.json);
r = await call(ADMIN, 'POST', '/api/resource-planning', { action: 'estimate', kind: 'task', id: 'TD', estimated_hours: 4 }); ok('owner fills missing estimate', r.status === 200, r.json);
const td = await q("SELECT status, assignee_id, due_date::text FROM tasks WHERE id='TD'"); ok('advisory: estimate fill did not change status/assignee/dates', td[0].status === 'Not Started' && td[0].assignee_id === MEM && td[0].due_date === '2026-11-10', td);

/* ---------------------------------------------------------------- M5 dependencies (notification only) */
S('M5 Workflow');
await q(`UPDATE projects SET workflow_notifications_enabled=TRUE, notify_assignee=TRUE, notify_project_manager=TRUE WHERE user_id=$1`, [ADMIN]);
const proj = (await q('SELECT name FROM projects WHERE user_id=$1', [ADMIN]))[0].name;
const mkT = async (id, name, assignee) => q(`INSERT INTO tasks(id,user_id,task,project,status,assignee_id,predecessors) VALUES ($1,$2,$3,$4,'Not Started',$5,'[]')`, [id, ADMIN, name, proj, assignee]);
await mkT('WA', 'Receive Documents', MEM); await mkT('WB', 'Verify Documents', MEM2); await mkT('WC', 'Process Documents', MEM);
r = await call(ADMIN, 'POST', '/api/task-dependencies', { predecessor_id: 'WA', successor_id: 'WC' }); ok('A→C added', r.status === 200, r.json);
r = await call(ADMIN, 'POST', '/api/task-dependencies', { predecessor_id: 'WB', successor_id: 'WC' }); ok('B→C added (multiple predecessors)', r.status === 200, r.json);
r = await call(ADMIN, 'POST', '/api/task-dependencies', { predecessor_id: 'WA', successor_id: 'WC' }); ok('duplicate dependency rejected', r.status === 409, r.json);
r = await call(ADMIN, 'POST', '/api/task-dependencies', { predecessor_id: 'WC', successor_id: 'WC' }); ok('self dependency rejected', r.status === 400, r.json);
await call(ADMIN, 'POST', '/api/task-dependencies', { predecessor_id: 'WC', successor_id: 'WB' }).then(x => ok('circular dependency rejected', x.status === 400 && /circular/i.test(x.json.error), x.json));
r = await call(MEM, 'PUT', '/api/tasks/WC', { status: 'In Progress' }); ok('successor can start before predecessors (no blocking)', r.status === 200, r.json);
r = await call(ADMIN, 'GET', '/api/task-dependencies?project=' + encodeURIComponent(proj) + '&owner=' + ADMIN); ok('dependency state independent of status', r.json.state.WC === 'Waiting for Predecessors', r.json.state);
const countReady = async () => (await q("SELECT COUNT(*)::int n FROM notifications WHERE type='task_ready' AND entity_id='WC'"))[0].n;
await call(ADMIN, 'PUT', '/api/tasks/WA', { status: 'Completed' }); ok('A done, B pending → no ready notification', await countReady() === 0, await countReady());
await call(ADMIN, 'PUT', '/api/tasks/WB', { status: 'Completed' });
const ready = await countReady(); ok('both done → notify C assignee + PM (2 recipients, once each)', ready === 2, ready);
const wc = await q("SELECT status FROM tasks WHERE id='WC'"); ok('successor status untouched', wc[0].status === 'In Progress', wc);
await call(ADMIN, 'PUT', '/api/tasks/WB', { status: 'Completed', progress: 100 }); ok('repeated save → no duplicate notification', await countReady() === 2, await countReady());
await call(ADMIN, 'PUT', '/api/tasks/WB', { status: 'In Progress' });
r = await call(ADMIN, 'GET', '/api/task-dependencies?project=' + encodeURIComponent(proj) + '&owner=' + ADMIN); ok('reopen → Waiting again', r.json.state.WC === 'Waiting for Predecessors', r.json.state);
await call(ADMIN, 'PUT', '/api/tasks/WB', { status: 'Completed' }); ok('genuine new transition → new notification', await countReady() === 4, await countReady());
r = await call(ADMIN, 'POST', '/api/task-dependencies', { action: 'settings', owner: ADMIN, project: proj, dependencies_enabled: true, workflow_notifications_enabled: false, notify_assignee: true, notify_project_manager: false });
ok('settings saved', r.status === 200, r.json);
const deps = await q("SELECT COUNT(*)::int n FROM rexus_task_dependencies WHERE successor_id='WC'"); ok('disabling notifications keeps dependencies', deps[0].n === 2, deps);
// templates
r = await call(PM, 'POST', '/api/workflow-templates', { action: 'save', name: 'Monthly Accounting', steps: [{ name: 'Receive' }, { name: 'Verify', depends_on: [0], offset_days: 1 }, { name: 'Close', depends_on: [1], offset_days: 2 }] });
ok('template saved', r.status === 201, r.json); const tplId = r.json.id;
r = await call(PM, 'POST', '/api/workflow-templates', { action: 'save', name: 'Loop', steps: [{ name: 'a', depends_on: [1] }, { name: 'b', depends_on: [0] }] }); ok('cyclic template rejected', r.status === 400, r.json);
r = await call(ADMIN, 'POST', '/api/workflow-templates', { action: 'apply', template_id: tplId, owner: ADMIN, project: proj, start_date: '2026-11-02' });
ok('template applied → 3 new tasks', r.status === 201 && r.json.task_ids.length === 3, r.json);
const newT = await q("SELECT id,status,start_date::text FROM tasks WHERE id = ANY($1) ORDER BY start_date", [r.json.task_ids]);
ok('new tasks Not Started, scheduled by offsets', newT.every(t => t.status === 'Not Started') && newT[1].start_date === '2026-11-03', newT);
const tdeps = await q("SELECT COUNT(*)::int n FROM rexus_task_dependencies WHERE successor_id = ANY($1)", [r.json.task_ids]); ok('template dependencies created', tdeps[0].n === 2, tdeps);
r = await call(MEM, 'POST', '/api/workflow-templates', { action: 'apply', template_id: tplId, owner: ADMIN, project: proj, start_date: '2026-11-02' }); ok('member cannot apply template', r.status === 403, r.json);

/* ---------------------------------------------------------------- M7 finance */
S('M7 Finance');
await q(`INSERT INTO tasks(id,user_id,task,project,status,predecessors) VALUES ('IMP1',$1,'implicit','Implicit Project','Not Started','[]')`, [PM]);
r = await call(ADMIN, 'GET', '/api/project-financials?list=1');
ok('registered projects appear', r.json.projects.some(p => p.name === proj && p.registered), r.json.projects?.map(p => p.name));
ok('task-only (unregistered) projects appear with zero totals', r.json.projects.some(p => p.name === 'Implicit Project' && !p.registered && p.total_income === 0 && p.cash_balance === 0), r.json.projects.filter(p => p.name === 'Implicit Project'));
r = await call(MEM2, 'GET', '/api/project-financials?list=1'); ok('member sees only accessible projects', !r.json.projects.some(p => p.name === 'Implicit Project'), r.json.projects?.map(p => p.name));
// same project name, two owners → no longer "ambiguous" when owner is passed
await q(`INSERT INTO projects(user_id,name,budget,budget_currency) VALUES ($1,$2,1000,'VND')`, [PM, proj]);
r = await call(ADMIN, 'GET', '/api/project-financials?owner=' + ADMIN + '&project=' + encodeURIComponent(proj)); ok('owner + name resolves duplicates', r.status === 200 && r.json.owner === ADMIN, r.json.error);
r = await call(ADMIN, 'GET', '/api/project-financials?project=' + encodeURIComponent(proj)); ok('legacy name-only call reports ambiguity clearly', r.status === 409, r.json);
const P = { owner: ADMIN, project: proj }; // budget 50,000,000 VND (seed)
r = await call(ADMIN, 'POST', '/api/project-financials', { ...P, action: 'add_transaction', type: 'Income', amount: 30000000, currency: 'VND', reference: 'INC-1', category: 'Client Payment', payment_method: 'Bank Transfer', transaction_date: '2026-11-02' });
ok('income draft created', r.status === 201, r.json); const inc = r.json.id;
r = await call(ADMIN, 'POST', '/api/project-financials', { ...P, action: 'add_transaction', type: 'Income', amount: 1, currency: 'VND', reference: 'INC-1' }); ok('duplicate reference rejected', r.status === 409, r.json);
let fin = await call(ADMIN, 'GET', '/api/project-financials?owner=' + ADMIN + '&project=' + encodeURIComponent(proj));
ok('draft does not affect cash', fin.json.summary.find(s => s.currency === 'VND').received === 0, fin.json.summary);
r = await call(ADMIN, 'POST', '/api/project-financials', { ...P, action: 'confirm_transaction', id: inc }); ok('income confirmed', r.json.status === 'Completed', r.json);
r = await call(ADMIN, 'POST', '/api/project-financials', { ...P, action: 'confirm_transaction', id: inc }); ok('double confirmation prevented', r.status === 409, r.json);
r = await call(ADMIN, 'POST', '/api/project-financials', { ...P, action: 'add_transaction', type: 'Expense', amount: 5000000, currency: 'VND', reference: 'EXP-1', category: 'Travel Expenses', submit_for_approval: true, approver_id: PM });
ok('expense submitted for approval', r.json.status === 'Pending Approval', r.json); const exp = r.json.id;
r = await call(ADMIN, 'POST', '/api/project-financials', { ...P, action: 'confirm_transaction', id: exp }); ok('pending expense cannot be confirmed', r.status === 409, r.json);
const expReq = (await q("SELECT id FROM rexus_approval_requests WHERE source_id=$1", [exp]))[0].id;
r = await call(PM, 'POST', '/api/approval-center', { action: 'decide', id: expReq, decision: 'Approved' }); ok('finance approval → Approved', r.json.status === 'Approved', r.json);
fin = await call(ADMIN, 'GET', '/api/project-financials?owner=' + ADMIN + '&project=' + encodeURIComponent(proj));
ok('approval alone is not cash movement', fin.json.summary.find(s => s.currency === 'VND').expenses === 0, fin.json.summary);
await call(ADMIN, 'POST', '/api/project-financials', { ...P, action: 'confirm_transaction', id: exp });
fin = await call(ADMIN, 'GET', '/api/project-financials?owner=' + ADMIN + '&project=' + encodeURIComponent(proj)); let sv = fin.json.summary.find(s => s.currency === 'VND');
ok('balances: received 30M, expenses 5M, net 25M, utilization 10%', sv.received === 30000000 && sv.expenses === 5000000 && sv.net_cash === 25000000 && sv.budget_utilization === 10, sv);
ok('approved budget stays separate from cash', fin.json.approved_budget === 50000000 && sv.received !== fin.json.approved_budget, fin.json.approved_budget);
r = await call(ADMIN, 'POST', '/api/project-financials', { ...P, action: 'reverse_transaction', id: exp }); ok('reversal requires reason', r.status === 400, r.json);
r = await call(ADMIN, 'POST', '/api/project-financials', { ...P, action: 'reverse_transaction', id: exp, reason: 'Booked twice' }); ok('reversal entry created', r.status === 201, r.json);
r = await call(ADMIN, 'POST', '/api/project-financials', { ...P, action: 'reverse_transaction', id: exp, reason: 'again' }); ok('cannot reverse twice', r.status === 409, r.json);
fin = await call(ADMIN, 'GET', '/api/project-financials?owner=' + ADMIN + '&project=' + encodeURIComponent(proj)); sv = fin.json.summary.find(s => s.currency === 'VND');
ok('reversed expense no longer counts; original kept', sv.expenses === 0 && fin.json.transactions.some(t => t.id === exp && t.status === 'Completed'), sv);
r = await call(ADMIN, 'POST', '/api/project-financials', { ...P, action: 'add_transaction', type: 'Income', amount: 100, currency: 'USD', reference: 'USD-1', exchange_rate: 25000 });
await call(ADMIN, 'POST', '/api/project-financials', { ...P, action: 'confirm_transaction', id: r.json.id });
fin = await call(ADMIN, 'GET', '/api/project-financials?owner=' + ADMIN + '&project=' + encodeURIComponent(proj));
ok('currencies are not summed together (grouped)', fin.json.summary.find(s => s.currency === 'USD').received === 100 && fin.json.summary.find(s => s.currency === 'VND').received === 30000000, fin.json.summary);
ok('converted base amount stored', fin.json.transactions.find(t => t.reference === 'USD-1').base_amount == 2500000, fin.json.transactions.find(t => t.reference === 'USD-1'));
// disbursement: request → approve → 3 partial payments
r = await call(ADMIN, 'POST', '/api/project-financials', { ...P, action: 'request_disbursement', amount: 30000000, currency: 'VND', purpose: 'Phase 1 vendor', recipient: 'Vendor A', approver_id: MEM });
ok('finance approver must be PM/Admin', r.status === 400, r.json);
const nDisb = (await q('SELECT COUNT(*)::int n FROM rexus_disbursements'))[0].n; ok('failed routing leaves no orphan disbursement', nDisb === 0, nDisb);
r = await call(ADMIN, 'POST', '/api/project-financials', { ...P, action: 'request_disbursement', amount: 30000000, currency: 'VND', purpose: 'Phase 1 vendor', recipient: 'Vendor A', approver_id: PM });
ok('disbursement + approval request created atomically', r.status === 201 && r.json.approval_id, r.json); const dId = r.json.id, dReq = r.json.approval_id;
r = await call(ADMIN, 'POST', '/api/project-financials', { ...P, action: 'pay_disbursement', id: dId, amount: 1000, reference: 'PAY-0' }); ok('payment before approval refused', r.status === 409, r.json);
await call(PM, 'POST', '/api/approval-center', { action: 'decide', id: dReq, decision: 'Approved' });
r = await call(ADMIN, 'POST', '/api/project-financials', { ...P, action: 'pay_disbursement', id: dId, amount: 10000000, reference: 'PAY-1', payment_date: '2026-11-05' }); ok('payment 1 → Partially Disbursed', r.json.status === 'Partially Disbursed', r.json);
r = await call(ADMIN, 'POST', '/api/project-financials', { ...P, action: 'pay_disbursement', id: dId, amount: 10000000, reference: 'PAY-1' }); ok('duplicate payment reference prevented', r.status === 409, r.json);
r = await call(ADMIN, 'POST', '/api/project-financials', { ...P, action: 'pay_disbursement', id: dId, amount: 25000000, reference: 'PAY-X' }); ok('payment above remaining approved refused', r.status === 409, r.json);
await call(ADMIN, 'POST', '/api/project-financials', { ...P, action: 'pay_disbursement', id: dId, amount: 15000000, reference: 'PAY-2' });
r = await call(ADMIN, 'POST', '/api/project-financials', { ...P, action: 'pay_disbursement', id: dId, amount: 5000000, reference: 'PAY-3' }); ok('payment 3 → Fully Disbursed', r.json.status === 'Fully Disbursed', r.json);
fin = await call(ADMIN, 'GET', '/api/project-financials?owner=' + ADMIN + '&project=' + encodeURIComponent(proj)); sv = fin.json.summary.find(s => s.currency === 'VND');
ok('total disbursed 30M, remaining budget 20M, payments kept separately', sv.disbursed === 30000000 && sv.remaining_budget_to_disburse === 20000000 && fin.json.payments.length === 3, sv);
ok('disbursement is not counted as an expense', sv.expenses === 0, sv);
r = await call(ADMIN, 'POST', '/api/project-financials', { ...P, action: 'request_disbursement', amount: 25000000, currency: 'VND', purpose: 'Phase 2', approver_id: PM });
await call(PM, 'POST', '/api/approval-center', { action: 'decide', id: r.json.approval_id, decision: 'Approved' });
r = await call(ADMIN, 'POST', '/api/project-financials', { ...P, action: 'pay_disbursement', id: r.json.id, amount: 25000000, reference: 'PAY-4' }); ok('release beyond approved budget refused', r.status === 409 && /budget/i.test(r.json.error), r.json);
r = await call(ADMIN, 'GET', '/api/project-financials?owner=' + ADMIN + '&project=' + encodeURIComponent(proj) + '&history=disbursement:' + dId);
ok('audit trail: request, approval events, payments', r.json.events.filter(x => x.action === 'payment').length === 3 && r.json.approval_events.length >= 2, r.json);
r = await call(MEM2, 'POST', '/api/project-financials', { ...P, action: 'add_transaction', type: 'Income', amount: 1, currency: 'VND', reference: 'HACK' }); ok('non-member cannot post transactions', r.status === 403, r.json);
r = await call(PM, 'POST', '/api/project-financials', { owner: PM, project: 'Implicit Project', action: 'request_disbursement', amount: 10, currency: 'VND', purpose: 'x', approver_id: ADMIN });
await call(ADMIN, 'POST', '/api/approval-center', { action: 'decide', id: r.json.approval_id, decision: 'Approved' });
r = await call(PM, 'POST', '/api/project-financials', { owner: PM, project: 'Implicit Project', action: 'pay_disbursement', id: r.json.id, amount: 10, reference: 'P' }); ok('unregistered project without budget cannot release funds', r.status === 409 && /budget/i.test(r.json.error), r.json);

/* ---------------------------------------------------------------- M1 Google linking removed (v2.2.1 final) */
S('M1 Google removed');
r = await call(MEM, 'GET', '/api/google/account'); ok('no function serves /api/google/*', r.status === 404, r.json);

/* ---------------------------------------------------------------- M10 concurrency */
S('M10 Concurrency');
r = await call(MEM, 'POST', '/api/approval-center', { action: 'create', type: 'project_change_review', title: 'Race', approvers: [PM] });
const race = await Promise.all([call(PM, 'POST', '/api/approval-center', { action: 'decide', id: r.json.id, decision: 'Approved' }), call(PM, 'POST', '/api/approval-center', { action: 'decide', id: r.json.id, decision: 'Approved' })]);
ok('two simultaneous decisions → exactly one succeeds', race.filter(x => x.status === 200).length === 1 && race.filter(x => x.status === 409).length === 1, race.map(x => [x.status, x.json]));
r = await call(ADMIN, 'POST', '/api/project-financials', { ...P, action: 'request_disbursement', amount: 2000000, currency: 'VND', purpose: 'Race pay', approver_id: PM });
await call(PM, 'POST', '/api/approval-center', { action: 'decide', id: r.json.approval_id, decision: 'Approved' });
const pays = await Promise.all([1, 2, 3].map(() => call(ADMIN, 'POST', '/api/project-financials', { ...P, action: 'pay_disbursement', id: r.json.id, amount: 1000000, reference: 'RACE-1' })));
ok('simultaneous identical payments → recorded once', pays.filter(x => x.status === 200).length === 1, pays.map(x => [x.status, x.json.error || x.json.status]));
const lr = await Promise.all([1, 2].map(() => call(MEM2, 'POST', '/api/hr/capacity', { action: 'save', month: '2027-01', entries: [{ day: '2027-01-04', hours: 3 }] })));
const openCount = (await q("SELECT COUNT(*)::int n FROM rexus_capacity_declarations WHERE user_id=$1 AND month='2027-01'", [MEM2]))[0].n;
ok('concurrent draft saves → a single open declaration', openCount === 1, { openCount, lr: lr.map(x => x.status) });

/* ---------------------------------------------------------------- summary */
const failed = results.filter(x => !x.pass);
console.log(`\n${results.length - failed.length}/${results.length} backend checks passed`);
import fs from 'node:fs'; fs.writeFileSync(new URL('./backend-results.json', import.meta.url), JSON.stringify(results, null, 1));
process.exit(failed.length ? 1 : 0);
