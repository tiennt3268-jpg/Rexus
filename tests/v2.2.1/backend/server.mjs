// TEST-ONLY server: serves public/ and dispatches /api/* to the real Netlify Function handlers on PGlite.
// /__test/login?uid=… issues a real signed session cookie for that existing user (no passwords needed in tests).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { boot, SRC } from './harness.mjs';
const PORT = +process.argv[2] || 8899;
const { db, route, tokenFor } = await boot();

// --- realistic seed for UI flows (all through SQL, mirrors what the app itself would create)
const q = (s, p = []) => db.query(s, p);
const ADMIN = 'ADMIN_TIENNT', PM = 'U_MINCT', MEM = 'U_TRUONGPN', PT = 'U_VYNHA';
const proj = (await q('SELECT name FROM projects WHERE user_id=$1', [ADMIN])).rows[0].name;
const today = new Date(); const iso = (d) => d.toISOString().slice(0, 10); const plus = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d); };
await q(`UPDATE projects SET workflow_notifications_enabled=TRUE, gantt_enabled=FALSE WHERE user_id=$1`, [ADMIN]);
await q(`UPDATE tasks SET start_date=COALESCE(start_date,$1::date), due_date=COALESCE(due_date,$2::date), estimated_hours=CASE WHEN COALESCE(estimated_hours,0)=0 THEN 8 ELSE estimated_hours END, assignee_id=COALESCE(assignee_id,$3) WHERE user_id=$4`, [plus(-3), plus(10), MEM, ADMIN]);
const tids = (await q('SELECT id FROM tasks WHERE user_id=$1 ORDER BY created_at LIMIT 3', [ADMIN])).rows.map(r => r.id);
await q(`INSERT INTO subtasks(id,task_id,user_id,name,status,estimated_hours,due_date,assignee_id) VALUES ('SX1',$1,$2,'Draft outline','In Progress',3,$3,$4),('SX2',$1,$2,'Peer review','Not Started',2,$5,$6) ON CONFLICT DO NOTHING`, [tids[0], ADMIN, plus(2), MEM, plus(5), PM]);
if (tids[1]) await q(`INSERT INTO rexus_task_dependencies(id,predecessor_id,successor_id) VALUES ('D1',$1,$2) ON CONFLICT DO NOTHING`, [tids[0], tids[1]]);
await q(`INSERT INTO rexus_resource_settings(user_id,hours_per_day,workdays,employment_type,capacity_method,manager_id,capacity_approver_id) VALUES ($1,8,'[1,2,3,4,5]','Full-time','schedule',$2,$2),($3,4,'[1,3,5]','Part-time','declaration',$2,$2) ON CONFLICT (user_id) DO NOTHING`, [MEM, PM, PT]);
await q(`INSERT INTO rexus_resource_days_off(id,user_id,day,reason,kind) VALUES ('H1',NULL,$1,'Company Foundation Day','holiday_company') ON CONFLICT DO NOTHING`, [plus(4)]);
await q(`INSERT INTO rexus_leave_requests(id,user_id,leave_type,start_date,end_date,unit,status,duration_hours,reason) VALUES ('LV1',$1,'Annual Leave',$2,$2,'full','Approved',8,'Family event')`, [MEM, plus(6)]);
await q(`INSERT INTO tasks(id,user_id,task,project,status,predecessors) VALUES ('TIMPL',$1,'Prepare venue','Student Conference','Not Started','[]')`, [PM]);
await q(`INSERT INTO project_members(owner_user_id,project,user_id,role) VALUES ($1,'Student Conference',$2,'Member') ON CONFLICT DO NOTHING`, [PM, ADMIN]).catch(() => {});

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname === '/__test/login') {
      const tok = await tokenFor(u.searchParams.get('uid'));
      res.writeHead(302, { 'Set-Cookie': `wm_session=${encodeURIComponent(tok)}; Path=/; HttpOnly; SameSite=Lax`, Location: u.searchParams.get('to') || '/' }); return res.end();
    }
    if (u.pathname.startsWith('/api/')) {
      const r = route(u.pathname); if (!r) { res.writeHead(404, { 'content-type': 'application/json' }); return res.end('{"error":"no route"}'); }
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
      const request = new Request('http://localhost' + req.url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
      const out = await r.m.handler(request, {});
      const h = {}; out.headers.forEach((v, k) => { if (k !== 'set-cookie') h[k] = v; });
      const cookies = out.headers.getSetCookie ? out.headers.getSetCookie() : [];
      if (cookies.length) h['set-cookie'] = cookies.map(c => c.replace('; Secure', ''));
      res.writeHead(out.status, h); return res.end(Buffer.from(await out.arrayBuffer()));
    }
    const PUB = process.env.REXUS_PUBLIC || path.join(SRC, 'public');   // REXUS_PUBLIC: serve another build (before/after evidence)
    let p = path.join(PUB, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
    if (!p.startsWith(PUB) || !fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
  } catch (e) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: String(e && e.stack || e) })); }
});
server.listen(PORT, () => console.log('READY ' + PORT));
