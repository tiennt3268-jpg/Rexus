/* REXUS v2.2.1 — reusable task workflow templates (Module 5).
   GET    /api/workflow-templates                     → templates
   POST   {action:'save', id?, name, description, steps:[{name, description, offset_days, duration_days, depends_on:[stepIndex]}]}
   POST   {action:'apply', template_id, owner, project, start_date}  → creates NEW tasks (new IDs) + FS dependencies
   DELETE {id}
   Applying a template never completes tasks and never back-fills notifications. */
import type { Context, Config } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { randomUUID } from 'node:crypto';
import { getUserFromRequest, unauthorized } from './lib/auth.mts';
import { getFullUser, isManagerOrAdmin, isSystemAdmin, getEffectiveProjectRole, roleCanManage } from './lib/rbac.mts';
import { logActivity } from './lib/activity-log.mts';
import { tx } from './lib/approvals.mts';

const fail = (m: string, s = 400) => Response.json({ error: m }, { status: s });
const isDay = (s: any) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const addDays = (d: string, n: number) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

function validSteps(steps: any): any[] | string {
  if (!Array.isArray(steps) || !steps.length || steps.length > 60) return 'A template needs 1–60 steps';
  const out = steps.map((s: any, i: number) => ({ name: String(s?.name || '').trim().slice(0, 200), description: String(s?.description || '').slice(0, 1000),
    offset_days: Math.max(0, Math.min(3650, parseInt(s?.offset_days, 10) || 0)), duration_days: Math.max(0, Math.min(3650, parseInt(s?.duration_days, 10) || 0)),
    depends_on: [...new Set((Array.isArray(s?.depends_on) ? s.depends_on : []).map((n: any) => parseInt(n, 10)).filter((n: number) => Number.isInteger(n) && n >= 0 && n < steps.length && n !== i))] }));
  if (out.some(s => !s.name)) return 'Every step needs a name';
  // Reject cycles among steps (Kahn).
  const indeg = out.map(s => s.depends_on.length), adj = out.map(() => [] as number[]);
  out.forEach((s, i) => s.depends_on.forEach((d: number) => adj[d].push(i)));
  const q = indeg.map((d, i) => (d === 0 ? i : -1)).filter(i => i >= 0); let seen = 0;
  while (q.length) { const i = q.shift()!; seen++; for (const j of adj[i]) if (--indeg[j] === 0) q.push(j); }
  if (seen !== out.length) return 'Template steps contain a circular dependency';
  return out;
}

export default async (req: Request, _ctx: Context) => {
  const session = await getUserFromRequest(req); if (!session) return unauthorized();
  const db = getDatabase();
  try {
    const me = await getFullUser(db, session.uid); if (!me) return unauthorized();
    if (req.method === 'GET') {
      const rows = await db.sql`SELECT t.*, u.full_name AS created_by_name FROM rexus_workflow_templates t LEFT JOIN users u ON u.id = t.created_by ORDER BY t.name`;
      return Response.json({ templates: rows.map((r: any) => ({ ...r, steps: JSON.parse(r.steps || '[]') })), can_manage: isManagerOrAdmin(me) });
    }
    const b = await req.json().catch(() => ({}));
    if (req.method === 'DELETE') {
      const r = await db.sql`DELETE FROM rexus_workflow_templates WHERE id = ${String(b.id || '')} AND (${isSystemAdmin(me)} OR created_by = ${session.uid}) RETURNING id`;
      return r.length ? Response.json({ ok: true }) : fail('Template not found or not yours', 404);
    }
    if (req.method !== 'POST') return fail('Method not supported', 405);
    if (b.action === 'save') {
      if (!isManagerOrAdmin(me)) return fail('Project Manager or System Admin required', 403);
      const name = String(b.name || '').trim().slice(0, 200); if (!name) return fail('Template name required');
      const steps = validSteps(b.steps); if (typeof steps === 'string') return fail(steps);
      if (b.id) {
        const r = await db.sql`UPDATE rexus_workflow_templates SET name=${name}, description=${String(b.description || '').slice(0, 1000)}, steps=${JSON.stringify(steps)}, updated_at=NOW()
          WHERE id=${String(b.id)} AND (${isSystemAdmin(me)} OR created_by=${session.uid}) RETURNING id`;
        if (!r.length) return fail('Template not found or not yours', 404);
        return Response.json({ id: b.id });
      }
      const id = 'WT' + randomUUID().slice(0, 10).toUpperCase();
      await db.sql`INSERT INTO rexus_workflow_templates(id,name,description,steps,created_by) VALUES (${id},${name},${String(b.description || '').slice(0, 1000)},${JSON.stringify(steps)},${session.uid})`;
      return Response.json({ id }, { status: 201 });
    }
    if (b.action === 'apply') {
      const owner = String(b.owner || ''), project = String(b.project || '');
      if (!isDay(b.start_date)) return fail('Start date required');
      if (!roleCanManage(await getEffectiveProjectRole(db, owner, project, session.uid, me.role))) return fail('Project management access required', 403);
      const t = (await db.sql`SELECT * FROM rexus_workflow_templates WHERE id = ${String(b.template_id || '')}`)[0];
      if (!t) return fail('Template not found', 404);
      const steps = validSteps(JSON.parse(t.steps || '[]')); if (typeof steps === 'string') return fail(steps);
      const now = new Date().toISOString();
      const ids = steps.map(() => 'T' + randomUUID().slice(0, 8).toUpperCase());
      await tx(db, async c => {
        for (let i = 0; i < steps.length; i++) {
          const s = steps[i]; const start = addDays(b.start_date, s.offset_days), due = addDays(start, s.duration_days);
          const preds = s.depends_on.map((d: number) => ({ id: ids[d], type: 'FS', lag_days: 0 }));
          await c.query(`INSERT INTO tasks (id,user_id,task,description,project,priority,status,progress,start_date,due_date,start_time,end_time,estimated_hours,actual_hours,notes,task_type,labels,attachments,recurring,reporter,assignee_id,assignee_name,created_by,created_at,updated_at,predecessors,is_milestone)
            VALUES ($1,$2,$3,$4,$5,'Medium','Not Started',0,$6,$7,'','',0,0,'','Task','[]','[]','',$8,NULL,'',$9,$10,$10,$11,false)`,
            [ids[i], owner, s.name, s.description, project, start, due, JSON.stringify([{ type: 'user', id: session.uid, name: session.username }]), session.username, now, JSON.stringify(preds)]);
        }
        for (let i = 0; i < steps.length; i++) for (const d of steps[i].depends_on)
          await c.query('INSERT INTO rexus_task_dependencies(id,predecessor_id,successor_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [randomUUID(), ids[d], ids[i]]);
      });
      await logActivity(db, { userId: session.uid, project, taskId: ids[0], action: 'apply_template', description: `${session.username} applied workflow template "${t.name}" (${steps.length} tasks)` });
      return Response.json({ ok: true, task_ids: ids }, { status: 201 });
    }
    return fail('Unknown action');
  } catch (e: any) { return fail('Workflow template error: ' + (e?.message || 'unknown'), 500); }
};
export const config: Config = { path: '/api/workflow-templates' };
