/* REXUS v2.3.0 — REXUS Survey management (F01, F02, F05; spec §02–§06, §14).
   GET  /api/surveys                         → overview: surveys I manage (all for System Admin), surveys for me, KPIs
   GET  /api/surveys?id=                     → one survey for the builder / settings (owner or System Admin)
   GET  /api/surveys?id=&analytics=1[&from&to&department&position]  → summary per question, trend, responses
   GET  /api/surveys?id=&export=1            → table rows for CSV / Excel (respondent columns only where allowed)
   POST /api/surveys {action:'create'|'duplicate'|'publish'|'close'|'reopen'|'archive'|'void_response'|'estimate', …}
   PUT  /api/surveys {id, name, description, mode, questions}          → save the draft
   PUT  /api/surveys {id, action:'settings', mandatory, priority, target, opens_at, closes_at, max_responses}
   Creating surveys: System Admin and Project Manager. Mandatory on Login: System Admin only. */
import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { getUserFromRequest, unauthorized } from "./lib/auth.mts";
import { getFullUser, isSystemAdmin, PROJECT_MANAGER } from "./lib/rbac.mts";
import { logAudit } from "./lib/rexus-audit.mts";
import { tx } from "./lib/approvals.mts";
import { createNotification } from "./lib/notify.mts";
import { validateQuestions, realQuestions, effectiveStatus, cleanTarget, targetIsEmpty, newId, OPEN_SQL, TARGET_SQL } from "./lib/survey.mts";

const bad = (error: string, status = 400, extra: any = {}) => Response.json({ error, ...extra }, { status });
const parseJson = (v: any) => (typeof v === "string" ? JSON.parse(v) : v);
const iso = (v: any) => (v instanceof Date ? v.toISOString() : v || null);
// Inputs without an offset are wall-clock time in Asia/Ho_Chi_Minh (UTC+7, no daylight saving).
function parseWhen(v: any): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim(); const withTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + (s.length <= 16 ? ":00" : "") + "+07:00";
  const t = Date.parse(withTz); if (isNaN(t)) throw Object.assign(new Error("Invalid date/time."), { userError: true });
  return new Date(t).toISOString();
}
const uerr = (m: string) => Object.assign(new Error(m), { userError: true });

const q = (type: string, title: string, extra: any = {}) => ({ id: newId("q_").slice(0, 20), type, title, description: "", required: true, ...extra });
const TEMPLATES: Record<string, () => any[]> = {
  blank: () => [],
  engagement: () => [
    q("single", "How satisfied are you with your work environment?", { options: ["Very satisfied", "Satisfied", "Neutral", "Dissatisfied", "Very dissatisfied"] }),
    q("rating", "Rate your teamwork experience", { max: 5 }),
    q("scale", "How likely are you to recommend working here to a friend?", { min: 0, max: 10, min_label: "Not likely", max_label: "Very likely" }),
    q("multiple", "Which areas should we improve first?", { required: false, options: ["Workload", "Communication", "Tools", "Training", "Recognition"] }),
    q("long", "Anything else you would like to share?", { required: false, max_length: 2000 })
  ],
  training: () => [
    q("rating", "Overall, how would you rate the training?", { max: 5 }),
    q("single", "Was the content relevant to your work?", { options: ["Very relevant", "Somewhat relevant", "Not relevant"] }),
    q("short", "What was the most useful part?", { required: false, max_length: 300 }),
    q("long", "What should we change next time?", { required: false, max_length: 2000 })
  ]
};

export default async (req: Request, _ctx: Context) => {
  const session = await getUserFromRequest(req);
  if (!session) return unauthorized();
  const db = getDatabase();
  const me = await getFullUser(db, session.uid);
  const admin = isSystemAdmin(me);
  const canCreate = admin || me?.role === PROJECT_MANAGER;
  const url = new URL(req.url);
  const P = url.searchParams;

  const counts = async (ids: string[]) => {
    if (!ids.length) return {} as Record<string, number>;
    const r = await db.sql`SELECT survey_id, COUNT(*)::int AS n FROM rexus_survey_responses WHERE status = 'valid' AND survey_id = ANY(${ids}) GROUP BY survey_id`;
    return Object.fromEntries(r.map((x: any) => [x.survey_id, x.n])) as Record<string, number>;
  };
  const load = async (id: string) => (await db.sql`SELECT * FROM rexus_surveys WHERE id = ${id}`)[0];
  const canManage = (s: any) => !!s && (admin || s.owner_id === session.uid);
  const summary = (s: any, n: number, owners: any = {}) => ({
    id: s.id, name: s.name, description: s.description, owner_id: s.owner_id, owner_name: owners[s.owner_id] || "", status: s.status,
    effective_status: effectiveStatus(s, n), mode: s.mode, mandatory: s.mandatory, priority: s.priority, responses: n, max_responses: s.max_responses,
    opens_at: iso(s.opens_at), closes_at: iso(s.closes_at), version: s.current_version, published_at: iso(s.published_at), updated_at: iso(s.updated_at),
    question_count: realQuestions(parseJson(s.draft_questions)).length, target: parseJson(s.target)
  });
  const targetCount = async (target: any) => (await db.pool.query(`SELECT COUNT(*)::int AS n FROM users u, (SELECT $1::jsonb AS target) s WHERE u.deleted_at IS NULL AND COALESCE(u.status, 'Active') = 'Active' AND ${TARGET_SQL}`, [JSON.stringify(target)])).rows[0].n;

  try {
    /* ============================================================ GET */
    if (req.method === "GET") {
      const id = P.get("id");
      if (!id) {
        const managed = admin ? await db.sql`SELECT * FROM rexus_surveys ORDER BY updated_at DESC` : await db.sql`SELECT * FROM rexus_surveys WHERE owner_id = ${session.uid} ORDER BY updated_at DESC`;
        const n = await counts(managed.map((s: any) => s.id));
        const owners = Object.fromEntries((await db.sql`SELECT id, full_name, username FROM users WHERE id = ANY(${Array.from(new Set(managed.map((s: any) => s.owner_id)))})`).map((u: any) => [u.id, u.full_name || u.username]));
        const surveys = managed.map((s: any) => summary(s, n[s.id] || 0, owners));
        // Surveys I can answer: authenticated, open, targeted at me (or not targeted), not answered yet.
        const mine = (await db.pool.query(`SELECT s.id, s.name, s.description, s.closes_at, s.mandatory FROM rexus_surveys s, users u
          WHERE u.id = $1 AND s.mode = 'authenticated' AND ${OPEN_SQL}
            AND (${TARGET_SQL} OR (NOT COALESCE((s.target->>'all')::boolean, FALSE) AND jsonb_array_length(s.target->'departments') = 0 AND jsonb_array_length(s.target->'positions') = 0 AND jsonb_array_length(s.target->'users') = 0))
            AND NOT EXISTS (SELECT 1 FROM rexus_survey_responses r WHERE r.survey_id = s.id AND r.user_id = u.id AND r.status = 'valid')
          ORDER BY s.closes_at NULLS LAST`, [session.uid])).rows.map((s: any) => ({ ...s, closes_at: iso(s.closes_at) }));
        const ids = managed.map((s: any) => s.id);
        const activity = ids.length ? (await db.sql`SELECT to_char(submitted_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS day, COUNT(*)::int AS n FROM rexus_survey_responses
          WHERE status = 'valid' AND survey_id = ANY(${ids}) AND submitted_at > NOW() - INTERVAL '7 days' GROUP BY 1 ORDER BY 1`) : [];
        // Mandatory coverage: valid responses ÷ people currently in the target, over my open mandatory surveys.
        let covered = 0, expected = 0;
        for (const s of surveys.filter((x: any) => x.mandatory && x.effective_status === "Active")) { expected += await targetCount(s.target); covered += s.responses; }
        const soon = Date.now() + 3 * 864e5;
        const attention = surveys.filter((s: any) => (s.effective_status === "Active" && ((s.closes_at && Date.parse(s.closes_at) < soon) || (s.max_responses && s.responses >= 0.9 * s.max_responses)))
          || s.effective_status === "Scheduled" || (s.status === "Draft" && s.question_count === 0));
        return Response.json({ can_create: canCreate, is_admin: admin, surveys, for_me: mine, activity, attention: attention.map((s: any) => s.id),
          kpi: { active: surveys.filter((s: any) => s.effective_status === "Active").length, responses: surveys.reduce((a: number, s: any) => a + (s.effective_status === "Active" ? s.responses : 0), 0),
                 completion: expected ? Math.round(Math.min(covered, expected) * 100 / expected) : null, attention: attention.length } });
      }
      const s = await load(id);
      if (!canManage(s)) return bad("Survey not found or you do not manage it.", 404);
      const n = (await counts([s.id]))[s.id] || 0;
      const version = s.current_version ? (await db.sql`SELECT id, questions FROM rexus_survey_versions WHERE survey_id = ${s.id} AND version = ${s.current_version}`)[0] : null;

      if (P.get("analytics") || P.get("export")) {
        const from = P.get("from"), to = P.get("to"), dep = P.get("department") || "", pos = P.get("position") || "";
        let rows = await db.sql`SELECT r.id, r.user_id, r.answers, r.department, r.position, r.status, r.void_reason, r.submitted_at, r.version_id, u.full_name, u.username
          FROM rexus_survey_responses r LEFT JOIN users u ON u.id = r.user_id WHERE r.survey_id = ${s.id} ORDER BY r.submitted_at DESC`;
        rows = rows.filter((r: any) => (!from || iso(r.submitted_at)! >= parseWhen(from + "T00:00")!) && (!to || iso(r.submitted_at)! < new Date(Date.parse(parseWhen(to + "T00:00")!) + 864e5).toISOString())
          && (!dep || r.department === dep) && (!pos || r.position === pos));
        const questions = realQuestions(version ? parseJson(version.questions) : validateQuestions(parseJson(s.draft_questions)));   // section separators carry no answers
        const showWho = s.mode === "authenticated";   // public surveys never store who answered
        const valid = rows.filter((r: any) => r.status === "valid");
        if (P.get("export")) {
          const columns = ["Response ID", "Submitted (UTC)"].concat(showWho ? ["User ID", "Respondent", "Department", "Job position"] : [], questions.map((x: any, i: number) => `Q${i + 1}. ${x.title}`));
          const data = valid.map((r: any) => { const a = parseJson(r.answers); return [r.id, iso(r.submitted_at)].concat(showWho ? [r.user_id || "", r.full_name || r.username || "", r.department || "", r.position || ""] : [], questions.map((x: any) => Array.isArray(a[x.id]) ? a[x.id].join("; ") : a[x.id] ?? "")); });
          await logAudit(db, { actorId: session.uid, actorName: me.username, action: "survey_export", entityType: "survey", entityId: s.id, summary: `Exported ${data.length} responses of "${s.name}"` });
          return Response.json({ name: s.name, columns, rows: data });
        }
        const perQ = questions.map((x: any) => {
          const vals = valid.map((r: any) => parseJson(r.answers)[x.id]).filter((v: any) => v !== undefined && v !== null && v !== "");
          const out: any = { id: x.id, type: x.type, title: x.title, answered: vals.length };
          if (["single", "dropdown", "multiple"].includes(x.type)) out.options = x.options.map((o: string) => ({ label: o, count: vals.filter((v: any) => (Array.isArray(v) ? v.includes(o) : v === o)).length }));
          else if (["rating", "scale", "number"].includes(x.type)) {
            const nums = vals.map(Number); out.average = nums.length ? Math.round(nums.reduce((a: number, b: number) => a + b, 0) / nums.length * 100) / 100 : null;
            if (x.type !== "number") { const lo = x.type === "rating" ? 1 : x.min; out.distribution = Array.from({ length: x.max - lo + 1 }, (_, i) => ({ label: String(lo + i), count: nums.filter((v: number) => v === lo + i).length })); }
            else { out.min = nums.length ? Math.min(...nums) : null; out.max = nums.length ? Math.max(...nums) : null; }
          } else out.latest = vals.slice(0, 20).map(String);
          return out;
        });
        const trend: Record<string, number> = {};
        valid.forEach((r: any) => { const d = new Date(Date.parse(iso(r.submitted_at)!) + 7 * 3600e3).toISOString().slice(0, 10); trend[d] = (trend[d] || 0) + 1; });
        return Response.json({
          survey: summary(s, n), questions: perQ, trend: Object.entries(trend).sort().map(([day, count]) => ({ day, count })),
          filters: { departments: Array.from(new Set(rows.map((r: any) => r.department).filter(Boolean))).sort(), positions: Array.from(new Set(rows.map((r: any) => r.position).filter(Boolean))).sort() },
          shows_respondent: showWho, valid: valid.length, void: rows.length - valid.length,
          responses: rows.slice(0, 200).map((r: any) => ({ id: r.id, submitted_at: iso(r.submitted_at), status: r.status, void_reason: r.void_reason, answers: parseJson(r.answers),
            respondent: showWho ? (r.full_name || r.username || r.user_id || "") : null, department: showWho ? r.department : null, position: showWho ? r.position : null }))
        });
      }
      return Response.json({ survey: { ...summary(s, n), questions: parseJson(s.draft_questions), published_questions: version ? parseJson(version.questions) : null,
        target_count: await targetCount(parseJson(s.target)), has_unpublished_changes: !!version && JSON.stringify(parseJson(version.questions)) !== JSON.stringify(parseJson(s.draft_questions)) },
        is_admin: admin });
    }

    const body = await req.json().catch(() => ({}));
    /* ============================================================ PUT */
    if (req.method === "PUT") {
      const s = await load(String(body.id || ""));
      if (!canManage(s)) return bad("Survey not found or you do not manage it.", 404);
      if (s.status === "Archived") return bad("Archived surveys cannot be edited.");
      if (body.action === "settings") {
        const mandatory = body.mandatory === true, target = cleanTarget(body.target), priority = Math.min(1000, Math.max(1, Math.round(Number(body.priority) || 100)));
        if (mandatory && !admin) return bad("Only a System Admin can make a survey mandatory on login.", 403);
        if (mandatory && s.mode !== "authenticated") return bad("Mandatory surveys must be linked to REXUS accounts (authenticated mode).");
        if (mandatory && targetIsEmpty(target)) return bad("Choose who must answer: all employees, departments, job positions or specific employees.");
        if (!admin && s.mandatory && !mandatory) return bad("Only a System Admin can change the mandatory setting.", 403);
        const opens = parseWhen(body.opens_at), closes = parseWhen(body.closes_at);
        if (opens && closes && closes <= opens) return bad("The closing time must be after the opening time.");
        const max = body.max_responses === null || body.max_responses === "" || body.max_responses === undefined ? null : Math.round(Number(body.max_responses));
        if (max !== null && !(max > 0)) return bad("The response limit must be a positive number.");
        if (target.users.length) {
          const found = await db.sql`SELECT id FROM users WHERE id = ANY(${target.users}) AND deleted_at IS NULL`;
          if (found.length !== target.users.length) return bad("Some selected employees no longer exist.");
        }
        await db.sql`UPDATE rexus_surveys SET mandatory = ${mandatory}, priority = ${priority}, target = ${JSON.stringify(target)}::jsonb, opens_at = ${opens}, closes_at = ${closes}, max_responses = ${max}, updated_at = NOW() WHERE id = ${s.id}`;
        await logAudit(db, { actorId: session.uid, actorName: me.username, action: "survey_settings", entityType: "survey", entityId: s.id, summary: `Settings of "${s.name}" changed`, details: { mandatory, target: { all: target.all, departments: target.departments.length, positions: target.positions.length, users: target.users.length }, opens, closes, max } });
        return Response.json({ ok: true, target_count: await targetCount(target) });
      }
      const name = String(body.name ?? s.name).trim().slice(0, 200), description = String(body.description ?? s.description).trim().slice(0, 4000);
      if (!name) return bad("The survey needs a name.", 400, { field: "name" });
      const mode = body.mode === undefined ? s.mode : body.mode === "public" ? "public" : "authenticated";
      if (mode !== s.mode) {
        const any = (await counts([s.id]))[s.id] || (await db.sql`SELECT 1 FROM rexus_survey_responses WHERE survey_id = ${s.id} LIMIT 1`).length;
        if (any) return bad("The response mode cannot change after responses were received.");
        if (mode === "public" && s.mandatory) return bad("Turn off Mandatory on Login before making the survey public.");
      }
      let questions;
      try { questions = body.questions === undefined ? parseJson(s.draft_questions) : validateQuestions(body.questions); } catch (e: any) { return bad(e.message); }
      await db.sql`UPDATE rexus_surveys SET name = ${name}, description = ${description}, mode = ${mode}, draft_questions = ${JSON.stringify(questions)}::jsonb, updated_at = NOW() WHERE id = ${s.id}`;
      return Response.json({ ok: true, questions });
    }

    /* ============================================================ POST */
    if (req.method !== "POST") return bad("Unsupported method", 405);
    const action = String(body.action || "");
    if (action === "create" || action === "duplicate") {
      if (!canCreate) return bad("Only a System Admin or Project Manager can create surveys.", 403);
      let name = String(body.name || "").trim().slice(0, 200), description = String(body.description || "").trim().slice(0, 4000), questions: any[] = [], mode = body.mode === "public" ? "public" : "authenticated";
      if (action === "duplicate") {
        const src = await load(String(body.id || "")); if (!canManage(src)) return bad("Survey not found or you do not manage it.", 404);
        name = ("Copy of " + src.name).slice(0, 200); description = src.description; mode = src.mode;
        questions = parseJson(src.draft_questions).map((x: any) => ({ ...x, id: newId("q_").slice(0, 20) }));
      } else {
        if (!name) return bad("The survey needs a name.", 400, { field: "name" });
        questions = (TEMPLATES[String(body.template || "blank")] || TEMPLATES.blank)();
      }
      const id = newId("SV");
      await db.sql`INSERT INTO rexus_surveys (id, owner_id, name, description, mode, draft_questions) VALUES (${id}, ${session.uid}, ${name}, ${description}, ${mode}, ${JSON.stringify(questions)}::jsonb)`;
      await logAudit(db, { actorId: session.uid, actorName: me.username, action: "survey_create", entityType: "survey", entityId: id, summary: `Created survey "${name}"` });
      return Response.json({ ok: true, id });
    }
    if (action === "estimate") return Response.json({ count: await targetCount(cleanTarget(body.target)) });

    const s = await load(String(body.id || ""));
    if (!canManage(s)) return bad("Survey not found or you do not manage it.", 404);
    if (action === "publish") {
      if (s.status === "Archived") return bad("Archived surveys cannot be published.");
      let questions; try { questions = validateQuestions(parseJson(s.draft_questions)); } catch (e: any) { return bad(e.message); }
      if (!realQuestions(questions).length) return bad("Add at least one question before publishing.");
      if (s.mandatory && targetIsEmpty(cleanTarget(parseJson(s.target)))) return bad("A mandatory survey needs at least one target group.");
      const out = await tx(db, async (c: any) => {
        const cur = (await c.query("SELECT * FROM rexus_surveys WHERE id = $1 FOR UPDATE", [s.id])).rows[0];
        const last = cur.current_version ? (await c.query("SELECT questions FROM rexus_survey_versions WHERE survey_id = $1 AND version = $2", [s.id, cur.current_version])).rows[0] : null;
        let version = cur.current_version;
        if (!last || JSON.stringify(parseJson(last.questions)) !== JSON.stringify(questions)) {
          version += 1;   // published versions are immutable: answers stay linked to the questions they answered
          await c.query("INSERT INTO rexus_survey_versions (id, survey_id, version, questions, created_by) VALUES ($1, $2, $3, $4::jsonb, $5)", [newId("SVV"), s.id, version, JSON.stringify(questions), session.uid]);
        }
        await c.query("UPDATE rexus_surveys SET status = 'Active', current_version = $2, published_at = COALESCE(published_at, NOW()), closed_at = NULL, closed_by = NULL, updated_at = NOW() WHERE id = $1", [s.id, version]);
        return { version, isNew: version !== cur.current_version, first: !cur.published_at };
      });
      await logAudit(db, { actorId: session.uid, actorName: me.username, action: "survey_publish", entityType: "survey", entityId: s.id, summary: `Published "${s.name}" (version ${out.version})` });
      if (out.first && s.mode === "authenticated" && !s.mandatory) {
        const t = cleanTarget(parseJson(s.target));
        if (!targetIsEmpty(t)) {
          const people = (await db.pool.query(`SELECT u.id FROM users u, (SELECT $1::jsonb AS target) s WHERE u.deleted_at IS NULL AND COALESCE(u.status, 'Active') = 'Active' AND ${TARGET_SQL} LIMIT 2000`, [JSON.stringify(t)])).rows;
          for (const p of people) await createNotification(db, { userId: p.id, type: "survey", title: `New survey: ${s.name}`, message: "Open REXUS Survey to answer it.", entityType: "survey", entityId: s.id });
        }
      }
      return Response.json({ ok: true, version: out.version, new_version: out.isNew });
    }
    if (action === "close" || action === "reopen" || action === "archive") {
      const next = action === "close" ? "Closed" : action === "archive" ? "Archived" : "Active";
      if (action === "close" && s.status !== "Active") return bad("Only an active survey can be closed.");
      if (action === "reopen" && (s.status !== "Closed" || !s.current_version)) return bad("Only a closed survey can be reopened.");
      if (action === "archive" && s.status === "Archived") return bad("The survey is already archived.");
      await db.sql`UPDATE rexus_surveys SET status = ${next}, closed_at = ${next === "Closed" ? new Date().toISOString() : null}, closed_by = ${next === "Closed" ? session.uid : null}, mandatory = ${next === "Archived" ? false : s.mandatory}, updated_at = NOW() WHERE id = ${s.id}`;
      await logAudit(db, { actorId: session.uid, actorName: me.username, action: "survey_" + action, entityType: "survey", entityId: s.id, summary: `${next} "${s.name}"` });
      return Response.json({ ok: true, status: next });
    }
    if (action === "void_response") {
      const reason = String(body.reason || "").trim().slice(0, 500);
      if (!reason) return bad("A reason is required to exclude a response.");
      const r = await db.sql`UPDATE rexus_survey_responses SET status = 'void', void_reason = ${reason}, voided_by = ${session.uid}, voided_at = NOW() WHERE id = ${String(body.response_id || "")} AND survey_id = ${s.id} AND status = 'valid' RETURNING id`;
      if (!r.length) return bad("Response not found or already excluded.", 404);
      await logAudit(db, { actorId: session.uid, actorName: me.username, action: "survey_response_void", entityType: "survey_response", entityId: r[0].id, summary: `Excluded a response of "${s.name}"`, details: { reason } });
      return Response.json({ ok: true });
    }
    return bad("Unknown action.");
  } catch (e: any) {
    return e.userError ? bad(e.message) : bad("Server error: " + e.message, 500);
  }
};

export const config: Config = { path: "/api/surveys" };
