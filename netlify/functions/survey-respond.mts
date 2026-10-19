/* REXUS v2.3.0 — answering a survey (F03, F04, F05; spec §12–§13, §15).
   GET  /api/survey-respond?id=           → questions of the published version + availability for this person
   POST /api/survey-respond {id, client_token, answers}
   Authenticated surveys: the respondent is always the signed-in account (never taken from the request),
   reachable while the account is gated so mandatory surveys can be completed. Public surveys: no account,
   no user id stored. A response is counted only after it is saved; re-sending the same client_token is
   idempotent; the response limit is checked inside the same transaction as the insert. */
import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { getUserFromRequest } from "./lib/auth.mts";
import { logAudit } from "./lib/rexus-audit.mts";
import { tx } from "./lib/approvals.mts";
import { validateAnswers, closedReason, cleanTarget, targetIsEmpty, gateState, newId } from "./lib/survey.mts";

const bad = (error: string, status = 400, extra: any = {}) => Response.json({ error, ...extra }, { status });
const parseJson = (v: any) => (typeof v === "string" ? JSON.parse(v) : v);
const iso = (v: any) => (v instanceof Date ? v.toISOString() : v || null);

async function eligible(db: any, s: any, uid: string): Promise<boolean> {
  const t = cleanTarget(parseJson(s.target));
  if (targetIsEmpty(t)) return !s.mandatory;
  const u = (await db.sql`SELECT id, department, position FROM users WHERE id = ${uid}`)[0];
  return !!u && (t.all || t.users.includes(u.id) || (!!u.department && t.departments.includes(u.department)) || (!!u.position && t.positions.includes(u.position)));
}

export default async (req: Request, _ctx: Context) => {
  const db = getDatabase();
  const session = await getUserFromRequest(req, { allowGate: true });
  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const id = String((req.method === "POST" ? body.id : url.searchParams.get("id")) || "");
    const s = (await db.sql`SELECT * FROM rexus_surveys WHERE id = ${id}`)[0];
    if (!s || !s.current_version) return bad("This survey is not available.", 404);
    if (s.mode === "authenticated" && !session) return bad("Sign in to REXUS to answer this survey.", 401);
    const uid = s.mode === "authenticated" ? session!.uid : null;
    if (uid && !(await eligible(db, s, uid))) return bad("This survey is not assigned to you.", 403);
    const version = (await db.sql`SELECT id, questions FROM rexus_survey_versions WHERE survey_id = ${s.id} AND version = ${s.current_version}`)[0];
    const questions = parseJson(version.questions);
    const validCount = async () => (await db.sql`SELECT COUNT(*)::int AS n FROM rexus_survey_responses WHERE survey_id = ${s.id} AND status = 'valid'`)[0].n;

    if (req.method === "GET") {
      const answered = uid ? (await db.sql`SELECT submitted_at FROM rexus_survey_responses WHERE survey_id = ${s.id} AND user_id = ${uid} AND status = 'valid'`)[0] : null;
      const who = uid ? (await db.sql`SELECT full_name, username, department, position FROM users WHERE id = ${uid}`)[0] : null;
      return Response.json({
        survey: { id: s.id, name: s.name, description: s.description, mode: s.mode, mandatory: s.mandatory, closes_at: iso(s.closes_at), version_id: version.id,
          question_count: questions.length, estimated_minutes: Math.max(1, Math.ceil(questions.length * 0.5)) },
        questions, closed_reason: closedReason(s, await validCount()), answered_at: answered ? iso(answered.submitted_at) : null,
        respondent: who ? { name: who.full_name || who.username, department: who.department || "", position: who.position || "" } : null
      });
    }
    if (req.method !== "POST") return bad("Unsupported method", 405);

    // shortcut: public surveys have no per-IP rate limit or CAPTCHA (quota + idempotent token only); add one before using public links for sensitive data.
    const token = String(body.client_token || "");
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(token)) return bad("Missing submission token.");
    let answers;
    try { answers = validateAnswers(questions, body.answers); } catch (e: any) { return bad(e.message, 400, { question: e.question }); }
    if (body.version_id && body.version_id !== version.id) return bad("This survey was updated while you were answering. Reload it to see the current questions.", 409, { reload: true });

    const result = await tx(db, async (c: any) => {
      const cur = (await c.query("SELECT * FROM rexus_surveys WHERE id = $1 FOR UPDATE", [s.id])).rows[0];   // serialises quota checks
      const dup = (await c.query("SELECT id FROM rexus_survey_responses WHERE survey_id = $1 AND client_token = $2", [s.id, token])).rows[0];
      if (dup) return { id: dup.id, duplicate: true };
      if (uid && (await c.query("SELECT 1 FROM rexus_survey_responses WHERE survey_id = $1 AND user_id = $2 AND status = 'valid'", [s.id, uid])).rows.length) return { already: true };
      const n = (await c.query("SELECT COUNT(*)::int AS n FROM rexus_survey_responses WHERE survey_id = $1 AND status = 'valid'", [s.id])).rows[0].n;
      const closed = closedReason(cur, n); if (closed) return { closed };
      const org = uid ? (await c.query("SELECT department, position FROM users WHERE id = $1", [uid])).rows[0] : null;
      const rid = newId("SR");
      await c.query("INSERT INTO rexus_survey_responses (id, survey_id, version_id, user_id, client_token, answers, department, position) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)",
        [rid, s.id, version.id, uid, token, JSON.stringify(answers), org?.department || null, org?.position || null]);
      return { id: rid };
    });
    if ((result as any).closed) return bad((result as any).closed, 409, { closed: true });
    if ((result as any).already) return bad("You have already answered this survey.", 409, { already: true });
    if (uid && !(result as any).duplicate) await logAudit(db, { actorId: uid, actorName: session!.username, action: "survey_response", entityType: "survey", entityId: s.id, summary: `Answered "${s.name}"${s.mandatory ? " (mandatory)" : ""}` });
    return Response.json({ ok: true, response_id: (result as any).id, onboarding: uid ? await gateState(db, uid) : null });
  } catch (e: any) {
    return bad("Server error: " + e.message, 500);
  }
};

export const config: Config = { path: "/api/survey-respond" };
