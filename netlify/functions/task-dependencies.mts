/* REXUS v2.2.1 — Task dependencies (Module 5, NOTIFICATION ONLY).
   GET  ?project=&owner=           → dependencies + per-task dependency state + workflow settings
   POST {predecessor_id, successor_id}                → add FS dependency (self / duplicate / circular rejected)
   POST {action:'settings', owner, project, dependencies_enabled, workflow_notifications_enabled, notify_assignee, notify_project_manager}
   DELETE {predecessor_id, successor_id}
   Dependencies never block, start, complete, re-date or reassign tasks. */
import type { Context, Config } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { randomUUID } from 'node:crypto';
import { getUserFromRequest, unauthorized } from './lib/auth.mts';
import { getFullUser, getEffectiveProjectRole, roleCanManage } from './lib/rbac.mts';
const fail = (m: string, s = 400) => Response.json({ error: m }, { status: s });
const parsed = (s: any): any[] => { try { const a = typeof s === 'string' ? JSON.parse(s) : s; return Array.isArray(a) ? a : []; } catch { return []; } };

export default async (req: Request, _ctx: Context) => {
  const user = await getUserFromRequest(req); if (!user) return unauthorized();
  const db = getDatabase();
  try {
    const me = await getFullUser(db, user.uid);
    if (req.method === 'GET') {
      const url = new URL(req.url); const project = url.searchParams.get('project'); const ownerParam = url.searchParams.get('owner');
      if (!project) return fail('Project required');
      const candidates = ownerParam ? [{ user_id: ownerParam }] : await db.sql`SELECT DISTINCT user_id FROM tasks WHERE project = ${project}`;
      const visible: string[] = [];
      for (const p of candidates) if (await getEffectiveProjectRole(db, p.user_id, project, user.uid, me?.role)) visible.push(p.user_id);
      if (!visible.length) return fail('Forbidden', 403);
      const deps = await db.sql`SELECT d.* FROM rexus_task_dependencies d JOIN tasks t ON t.id = d.successor_id WHERE t.project = ${project} AND t.user_id = ANY(${visible})`;
      const tasks = await db.sql`SELECT id, status, predecessors FROM tasks WHERE project = ${project} AND user_id = ANY(${visible})`;
      const statusOf = new Map(tasks.map((t: any) => [t.id, t.status]));
      const state: Record<string, string> = {};
      for (const t of tasks) {
        const preds = [...new Set([...deps.filter((d: any) => d.successor_id === t.id).map((d: any) => d.predecessor_id),
          ...parsed(t.predecessors).filter((p: any) => p?.id && (!p.type || p.type === 'FS')).map((p: any) => String(p.id))])];
        state[t.id] = !preds.length ? 'No Dependencies' : preds.every(id => statusOf.get(id) === 'Completed') ? 'Dependencies Satisfied' : 'Waiting for Predecessors';
      }
      const cfg = (await db.sql`SELECT workflow_notifications_enabled, dependencies_enabled, notify_assignee, notify_project_manager FROM projects WHERE user_id = ${visible[0]} AND name = ${project}`)[0] || null;
      const canManage = roleCanManage(await getEffectiveProjectRole(db, visible[0], project, user.uid, me?.role));
      return Response.json({ dependencies: deps, state, settings: cfg, owner: visible[0], can_manage: canManage });
    }
    if (!['POST', 'DELETE'].includes(req.method)) return fail('Method not supported', 405);
    const b = await req.json().catch(() => ({}));
    if (b.action === 'settings') {
      const owner = String(b.owner || ''), project = String(b.project || '');
      if (!roleCanManage(await getEffectiveProjectRole(db, owner, project, user.uid, me?.role))) return fail('Not permitted', 403);
      const r = await db.sql`UPDATE projects SET dependencies_enabled = ${!!b.dependencies_enabled}, workflow_notifications_enabled = ${!!b.workflow_notifications_enabled},
        notify_assignee = ${!!b.notify_assignee}, notify_project_manager = ${!!b.notify_project_manager} WHERE user_id = ${owner} AND name = ${project} RETURNING name`;
      if (!r.length) return fail('Register this project (Edit Project → Save) before changing workflow settings', 404);
      return Response.json({ ok: true });
    }
    const nextId = String(b.successor_id || ''), prevId = String(b.predecessor_id || '');
    if (!prevId || !nextId) return fail('Choose both tasks');
    if (prevId === nextId) return fail('A task cannot depend on itself');
    const rows = await db.sql`SELECT id, user_id, project FROM tasks WHERE id = ${nextId} OR id = ${prevId}`;
    const next = rows.find((t: any) => t.id === nextId), prev = rows.find((t: any) => t.id === prevId);
    if (!next || !prev || next.user_id !== prev.user_id || next.project !== prev.project) return fail('Tasks must belong to the same project');
    if (!roleCanManage(await getEffectiveProjectRole(db, next.user_id, next.project, user.uid, me?.role))) return fail('Not permitted', 403);
    if (req.method === 'POST') {
      const existing = await db.sql`SELECT 1 FROM rexus_task_dependencies WHERE predecessor_id = ${prevId} AND successor_id = ${nextId}`;
      if (existing.length) return fail('This dependency already exists', 409);
      const links = await db.sql`SELECT predecessor_id, successor_id FROM rexus_task_dependencies`;
      const adj = new Map<string, string[]>(); for (const l of links) adj.set(l.predecessor_id, [...(adj.get(l.predecessor_id) || []), l.successor_id]);
      // prev→next creates a cycle if next already reaches prev.
      const todo = [nextId], seen = new Set<string>();
      while (todo.length) { const x = todo.pop()!; if (x === prevId) return fail('Circular dependency rejected'); if (seen.has(x)) continue; seen.add(x); todo.push(...(adj.get(x) || [])); }
      await db.sql`INSERT INTO rexus_task_dependencies(id, predecessor_id, successor_id) VALUES (${randomUUID()}, ${prevId}, ${nextId}) ON CONFLICT(predecessor_id, successor_id) DO NOTHING`;
    } else {
      await db.sql`DELETE FROM rexus_task_dependencies WHERE predecessor_id = ${prevId} AND successor_id = ${nextId}`;
    }
    // Keep the legacy Gantt predecessor JSON in sync (display only; the scheduler is not invoked).
    const deps = await db.sql`SELECT predecessor_id FROM rexus_task_dependencies WHERE successor_id = ${nextId}`;
    await db.sql`UPDATE tasks SET predecessors = ${JSON.stringify(deps.map((r: any) => ({ id: r.predecessor_id, type: 'FS', lag_days: 0 })))} WHERE id = ${nextId}`;
    return Response.json({ ok: true });
  } catch (e: any) { return fail('Dependency error: ' + (e?.message || 'unknown'), 500); }
};
export const config: Config = { path: '/api/task-dependencies' };
