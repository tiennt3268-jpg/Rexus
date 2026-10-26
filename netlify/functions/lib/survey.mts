/* =========================================================
   REXUS Survey v1.0.0 — shared rules (validation, availability, targeting, gate).
   Used by surveys.mts, survey-respond.mts, onboarding.mts and lib/auth.mts.
   ========================================================= */
import { randomUUID } from "node:crypto";

export const QUESTION_TYPES = ["short", "long", "single", "multiple", "dropdown", "rating", "scale", "date", "number"] as const;
export const MAX_QUESTIONS = 100;
export const newId = (p: string) => p + randomUUID().replace(/-/g, "").slice(0, 16);

/* ---------- availability: Scheduled is derived, never stored ---------- */
// SQL fragment: survey row `s` is currently accepting responses. Close rule: the first of
// due date / quota / manual close wins; re-evaluated on every request (F05, D3).
export const OPEN_SQL = `s.status = 'Active' AND s.current_version > 0
  AND (s.opens_at IS NULL OR s.opens_at <= NOW()) AND (s.closes_at IS NULL OR s.closes_at > NOW())
  AND (s.max_responses IS NULL OR (SELECT COUNT(*) FROM rexus_survey_responses rq WHERE rq.survey_id = s.id AND rq.status = 'valid') < s.max_responses)`;

// SQL fragment: user row `u` is in the survey's target (groups combined with OR — D2).
export const TARGET_SQL = `(COALESCE((s.target->>'all')::boolean, FALSE)
  OR (COALESCE(u.department, '') <> '' AND (s.target->'departments') ? u.department)
  OR (COALESCE(u.position, '') <> '' AND (s.target->'positions') ? u.position)
  OR (s.target->'users') ? u.id)`;

// Mandatory surveys the user ($1) still has to complete, highest priority first, then oldest publication.
export const PENDING_MANDATORY_SQL = `SELECT s.id FROM rexus_surveys s, users u
  WHERE u.id = $1 AND s.mandatory AND s.mode = 'authenticated' AND ${OPEN_SQL} AND ${TARGET_SQL}
    AND NOT EXISTS (SELECT 1 FROM rexus_survey_responses r WHERE r.survey_id = s.id AND r.user_id = u.id AND r.status = 'valid')
  ORDER BY s.priority ASC, s.published_at ASC`;

export function effectiveStatus(s: any, validCount: number): string {
  if (s.status !== "Active") return s.status;
  const now = Date.now();
  if (s.closes_at && new Date(s.closes_at).getTime() <= now) return "Closed";
  if (s.max_responses && validCount >= s.max_responses) return "Closed";
  if (s.opens_at && new Date(s.opens_at).getTime() > now) return "Scheduled";
  return "Active";
}
export function closedReason(s: any, validCount: number): string | null {
  if (s.status === "Draft" || !s.current_version) return "This survey has not been published.";
  if (s.status === "Closed") return "This survey has been closed.";
  if (s.status === "Archived") return "This survey is archived.";
  if (s.opens_at && new Date(s.opens_at).getTime() > Date.now()) return "This survey is not open yet.";
  if (s.closes_at && new Date(s.closes_at).getTime() <= Date.now()) return "This survey has reached its closing date.";
  if (s.max_responses && validCount >= s.max_responses) return "This survey has reached its response limit.";
  return null;
}

/* ---------- targeting ---------- */
export function cleanTarget(t: any) {
  const list = (v: any) => Array.from(new Set((Array.isArray(v) ? v : []).map((x: any) => String(x).trim()).filter(Boolean))).slice(0, 500);
  return { all: t?.all === true, departments: list(t?.departments), positions: list(t?.positions), users: list(t?.users) };
}
export const targetIsEmpty = (t: any) => !t.all && !t.departments.length && !t.positions.length && !t.users.length;

/* ---------- questions ---------- */
const str = (v: any, max: number) => String(v == null ? "" : v).trim().slice(0, max);
const int = (v: any, d: number) => (Number.isFinite(Number(v)) && v !== "" && v !== null ? Math.round(Number(v)) : d);

/* v2.3.4 SUR-04/05 — sections and single-choice branching.
   A form is a list of items: questions plus optional {type:"section"} separators. Questions before the first
   section form an implicit first page. A single-choice question may route each answer to "end" or to the id of a
   LATER section (forward only, so a path can never loop); anything else continues to the next section.
   The path is computed from the answers on both client and server: only questions on the path are validated
   and stored. A form without sections behaves exactly as before. */
export const isSection = (q: any) => q?.type === "section";
export const realQuestions = (items: any[]) => items.filter((q) => !isSection(q));

/** Pages of a form: [{section, questions[]}], first page may have no section. */
export function pages(items: any[]) {
  const out: { section: any; questions: any[] }[] = [{ section: null, questions: [] }];
  for (const q of items) { if (isSection(q)) out.push({ section: q, questions: [] }); else out[out.length - 1].questions.push(q); }
  return out[0].questions.length || out.length === 1 ? out : out.slice(1);
}

/** Ids of the questions a respondent passes through, given their answers (raw values). */
export function answerPath(items: any[], answers: Record<string, any>): string[] {
  const ps = pages(items), idx = new Map(ps.map((p, i) => [p.section?.id, i])), path: string[] = [];
  for (let i = 0; i < ps.length && i >= 0;) {
    let next: number = i + 1;
    for (const q of ps[i].questions) {
      path.push(q.id);
      const r = q.type === "single" && q.routes ? q.routes[String(answers?.[q.id] ?? "")] : undefined;
      if (r === "end") next = ps.length; else if (r && idx.has(r) && (idx.get(r) as number) > i) next = idx.get(r) as number;
    }
    i = next;
  }
  return path;
}

/** Normalises builder input; throws a readable error on invalid questions. */
export function validateQuestions(input: any): any[] {
  if (!Array.isArray(input)) throw new Error("Questions must be a list.");
  if (input.length > MAX_QUESTIONS) throw new Error(`A survey can have at most ${MAX_QUESTIONS} questions.`);
  const ids = new Set<string>();
  let qn = 0, sn = 0;
  const items = input.map((q: any) => {
    if (isSection(q)) {   // section separator: stable id, optional title/description
      sn++;
      let id = str(q.id, 40);
      if (!/^s_[a-z0-9]{4,32}$/i.test(id) || ids.has(id)) id = "s_" + newId("").slice(0, 16).toLowerCase();
      ids.add(id);
      return { id, type: "section", title: str(q.title, 300), description: str(q.description, 2000) };
    }
    const n = ++qn;
    const type = String(q?.type || "");
    if (!(QUESTION_TYPES as readonly string[]).includes(type)) throw new Error(`Question ${n}: unknown type.`);
    let id = str(q.id, 40);
    if (!/^q_[a-z0-9]{4,32}$/i.test(id) || ids.has(id)) id = newId("q_").slice(0, 20);
    ids.add(id);
    const out: any = { id, type, title: str(q.title, 500), description: str(q.description, 1000), required: q.required === true };
    if (!out.title) throw new Error(`Question ${n}: the question text is required.`);
    if (type === "single" || type === "multiple" || type === "dropdown") {
      const opts = (Array.isArray(q.options) ? q.options : []).map((o: any) => str(o, 200)).filter(Boolean);
      if (opts.length < 2) throw new Error(`Question ${n}: add at least two answer options.`);
      if (new Set(opts.map((o: string) => o.toLowerCase())).size !== opts.length) throw new Error(`Question ${n}: answer options must be different.`);
      if (opts.length > 50) throw new Error(`Question ${n}: at most 50 options.`);
      out.options = opts;
    }
    if (type === "short" || type === "long") {
      const cap = type === "short" ? 300 : 5000;
      out.max_length = Math.min(cap, Math.max(1, int(q.max_length, cap)));
    }
    if (type === "rating") out.max = Math.min(10, Math.max(3, int(q.max, 5)));
    if (type === "scale") {
      out.min = Math.min(1, Math.max(0, int(q.min, 1)));
      out.max = Math.min(10, Math.max(out.min + 2, int(q.max, 5)));
      out.min_label = str(q.min_label, 60); out.max_label = str(q.max_label, 60);
    }
    if (type === "number") {
      const mn = q.min === "" || q.min == null ? null : Number(q.min), mx = q.max === "" || q.max == null ? null : Number(q.max);
      if ((mn !== null && !Number.isFinite(mn)) || (mx !== null && !Number.isFinite(mx)) || (mn !== null && mx !== null && mn > mx)) throw new Error(`Question ${n}: invalid number range.`);
      out.min = mn; out.max = mx;
    }
    if (type === "single" && q.routes && typeof q.routes === "object") out.routes = q.routes;   // checked below, once all section ids are known
    return out;
  });
  // Branching targets: "end" or a section that comes after the question (no loops, no deleted sections).
  const sectionAt = new Map<string, number>(); items.forEach((q, i) => { if (isSection(q)) sectionAt.set(q.id, i); });
  let n = 0;
  items.forEach((q: any, i: number) => {
    if (isSection(q)) return; n++;
    if (!q.routes) return;
    const routes: Record<string, string> = {};
    for (const [opt, target] of Object.entries(q.routes)) {
      const t = String(target);
      if (!q.options.includes(opt) || t === "next" || t === "") continue;
      if (t !== "end" && !(sectionAt.has(t) && (sectionAt.get(t) as number) > i))
        throw new Error(`Question ${n}: the answer "${opt}" goes to a section that was deleted or comes before this question. Choose another section, "Continue" or "Submit form".`);
      routes[opt] = t;
    }
    if (Object.keys(routes).length) q.routes = routes; else delete q.routes;
  });
  return items;
}

/** Validates answers against a published question set; returns the cleaned answers or throws. */
export function validateAnswers(questions: any[], input: any): Record<string, any> {
  const a = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const out: Record<string, any> = {};
  const onPath = new Set(answerPath(questions, a));   // questions skipped by branching are neither required nor stored
  for (const [i, q] of realQuestions(questions).entries()) {
    if (!onPath.has(q.id)) continue;
    const n = i + 1, v = a[q.id];
    const blank = v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
    if (blank) { if (q.required) throw Object.assign(new Error(`Question ${n} is required.`), { question: q.id }); continue; }
    const bad = (m: string) => { throw Object.assign(new Error(`Question ${n}: ${m}`), { question: q.id }); };
    switch (q.type) {
      case "short": case "long": { const s = String(v).trim(); if (!s) { if (q.required) bad("an answer is required."); continue; } if (s.length > q.max_length) bad(`at most ${q.max_length} characters.`); out[q.id] = s; break; }
      case "single": case "dropdown": { if (!q.options.includes(String(v))) bad("choose one of the options."); out[q.id] = String(v); break; }
      case "multiple": { const arr = Array.isArray(v) ? v.map(String) : [String(v)]; if (arr.some((x) => !q.options.includes(x))) bad("choose from the options."); out[q.id] = q.options.filter((o: string) => arr.includes(o)); break; }
      case "rating": case "scale": { const x = Number(v), lo = q.type === "rating" ? 1 : q.min; if (!Number.isInteger(x) || x < lo || x > q.max) bad(`choose a value from ${lo} to ${q.max}.`); out[q.id] = x; break; }
      case "number": { const x = Number(v); if (!Number.isFinite(x)) bad("enter a number."); if ((q.min !== null && x < q.min) || (q.max !== null && x > q.max)) bad("the number is out of range."); out[q.id] = x; break; }
      case "date": { const s = String(v); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s + "T00:00:00Z"))) bad("enter a valid date."); out[q.id] = s; break; }
    }
  }
  return out;
}

/* ---------- First Login / mandatory gate (F07, F02–F04) ---------- */
export type Gate = { step: "password" | "profile" | "survey" | null; missing: string[]; surveys: string[] };

/** Outstanding obligations for a user, in the order they must be completed. */
export async function gateState(db: any, uid: string): Promise<Gate> {
  try {
    const r = await db.pool.query(`SELECT u.must_change_password AS pw, u.profile_gate AS pg,
        (SELECT COALESCE(json_agg(f.key ORDER BY f.sort_order), '[]'::json) FROM rexus_demographic_fields f
          WHERE f.visible AND f.required AND NOT EXISTS (SELECT 1 FROM rexus_user_demographics d WHERE d.user_id = u.id AND d.field_key = f.key AND d.value <> '')) AS missing,
        (SELECT COALESCE(json_agg(p.id), '[]'::json) FROM (${PENDING_MANDATORY_SQL}) p) AS surveys
      FROM users u WHERE u.id = $1`, [uid]);
    const row = r.rows[0]; if (!row) return { step: null, missing: [], surveys: [] };
    const missing: string[] = row.pg ? (typeof row.missing === "string" ? JSON.parse(row.missing) : row.missing) : [];
    const surveys: string[] = typeof row.surveys === "string" ? JSON.parse(row.surveys) : row.surveys;
    return { step: row.pw ? "password" : missing.length ? "profile" : surveys.length ? "survey" : null, missing, surveys };
  } catch (e: any) {
    // Only before migration 035 (missing table/column): nobody can have an obligation yet.
    const code = e?.code || e?.cause?.code;
    if (code === "42P01" || code === "42703") return { step: null, missing: [], surveys: [] };
    throw e;
  }
}
