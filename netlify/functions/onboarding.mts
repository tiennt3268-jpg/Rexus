/* REXUS v2.3.0 — First Login profile step + demographic fields (F06, F07; spec §09–§11).
   GET  /api/onboarding[?user_id=]     → own state, profile fields and values (+ pending mandatory surveys);
                                          another person's record: System Admin only (DOB is sensitive).
   POST /api/onboarding {values, user_id?} → save demographic values (self-service fields; admin: any field).
   GET  /api/profile-fields            → field configuration (admin sees hidden fields too)
   PUT  /api/profile-fields {fields}   → admin: label, visible, required, order, options
   POST /api/profile-fields {action:'apply_existing'} → admin: enforce required fields for all existing accounts
   Reachable while the account is gated (it is the profile step). Values are never written to logs. */
import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { getUserFromRequest, unauthorized } from "./lib/auth.mts";
import { getFullUser, isSystemAdmin } from "./lib/rbac.mts";
import { logAudit } from "./lib/rexus-audit.mts";
import { gateState } from "./lib/survey.mts";

const bad = (error: string, status = 400, extra: any = {}) => Response.json({ error, ...extra }, { status });
const parseJson = (v: any) => (typeof v === "string" ? JSON.parse(v) : v);
const userError = (m: string) => Object.assign(new Error(m), { userError: true });

export function fieldError(f: any, v: string): string | null {
  if (f.field_type === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v + "T00:00:00Z"))) return "Enter a valid date.";
    const y = +v.slice(0, 4); if (y < 1900) return "Enter a valid date.";
    if (f.key === "date_of_birth" && Date.parse(v + "T00:00:00Z") > Date.now()) return "The date of birth cannot be in the future.";
  }
  if (f.field_type === "year") { const y = Number(v), max = new Date().getFullYear() + 6; if (!/^\d{4}$/.test(v) || y < 1900 || y > max) return `Enter a year between 1900 and ${max}.`; }
  if (f.field_type === "dropdown" && !parseJson(f.options).includes(v)) return "Choose one of the options.";
  if (f.field_type === "text" && v.length > 200) return "At most 200 characters.";
  return null;
}

export default async (req: Request, _ctx: Context) => {
  const session = await getUserFromRequest(req, { allowGate: true });
  if (!session) return unauthorized();
  const db = getDatabase();
  const url = new URL(req.url);
  const me = await getFullUser(db, session.uid);
  const admin = isSystemAdmin(me);
  try {
    const fields = (await db.sql`SELECT key, label, field_type, options, visible, required, self_service, sort_order FROM rexus_demographic_fields ORDER BY sort_order, key`)
      .map((f: any) => ({ ...f, options: parseJson(f.options) }));

    /* ------------------------------------------------ field configuration */
    if (url.pathname.endsWith("/profile-fields")) {
      if (req.method === "GET") return Response.json({ fields: admin ? fields : fields.filter((f: any) => f.visible), can_manage: admin });
      if (!admin) return bad("Only a System Admin can configure profile fields.", 403);
      const body = await req.json().catch(() => ({}));
      if (req.method === "POST" && body.action === "apply_existing") {
        // Rollout campaign (spec §07 "existing accounts"): explicit admin action, never automatic.
        const r = await db.sql`UPDATE users SET profile_gate = TRUE WHERE profile_gate = FALSE AND deleted_at IS NULL AND COALESCE(status, 'Active') = 'Active' RETURNING id`;
        await logAudit(db, { actorId: session.uid, actorName: me.username, action: "profile_fields_apply_existing", entityType: "profile_fields", summary: `Required profile fields now enforced for ${r.length} existing accounts` });
        return Response.json({ ok: true, accounts: r.length });
      }
      if (req.method !== "PUT" || !Array.isArray(body.fields)) return bad("Unsupported request.");
      const byKey: any = Object.fromEntries(fields.map((f: any) => [f.key, f]));
      const updates = body.fields.map((x: any) => {
        const f = byKey[x.key]; if (!f) throw userError("Unknown field: " + x.key);
        const label = String(x.label ?? f.label).trim().slice(0, 80); if (!label) throw userError("Every field needs a label.");
        const visible = x.visible === undefined ? f.visible : x.visible === true, required = visible && (x.required === undefined ? f.required : x.required === true);
        let options = f.options;
        if (f.field_type === "dropdown" && x.options !== undefined) {
          options = (Array.isArray(x.options) ? x.options : []).map((o: any) => String(o).trim().slice(0, 80)).filter(Boolean);
          if (options.length < 2 || new Set(options).size !== options.length) throw userError(`${label}: give at least two different options.`);
        }
        const sort = Number.isFinite(Number(x.sort_order)) ? Math.round(Number(x.sort_order)) : f.sort_order;
        return { key: f.key, label, visible, required, options, sort, newlyRequired: required && !f.required };
      });
      for (const u of updates) await db.sql`UPDATE rexus_demographic_fields SET label = ${u.label}, visible = ${u.visible}, required = ${u.required}, options = ${JSON.stringify(u.options)}::jsonb, sort_order = ${u.sort}, updated_by = ${session.uid}, updated_at = NOW() WHERE key = ${u.key}`;
      const affected = (await db.sql`SELECT COUNT(*)::int AS n FROM users u WHERE u.profile_gate AND u.deleted_at IS NULL AND EXISTS (SELECT 1 FROM rexus_demographic_fields f WHERE f.visible AND f.required AND NOT EXISTS (SELECT 1 FROM rexus_user_demographics d WHERE d.user_id = u.id AND d.field_key = f.key))`)[0].n;
      await logAudit(db, { actorId: session.uid, actorName: me.username, action: "profile_fields_update", entityType: "profile_fields", summary: "Profile field settings changed", details: { newly_required: updates.filter((u: any) => u.newlyRequired).map((u: any) => u.key) } });
      return Response.json({ ok: true, accounts_now_incomplete: affected });
    }

    /* ------------------------------------------------ a person's profile */
    const targetId = url.searchParams.get("user_id") || "";
    let body: any = {};
    if (req.method === "POST") body = await req.json().catch(() => ({}));
    const uid = String((req.method === "POST" ? body.user_id : targetId) || session.uid);
    const self = uid === session.uid;
    if (!self && !admin) return bad("You can only view and edit your own personal information.", 403);
    const target = (await db.sql`SELECT id, username, email, full_name, position, department, must_change_password, profile_gate, onboarding_completed_at, deleted_at FROM users WHERE id = ${uid}`)[0];
    if (!target || target.deleted_at) return bad("Employee not found.", 404);
    const visibleFields = fields.filter((f: any) => f.visible);
    const values = async () => Object.fromEntries((await db.sql`SELECT field_key, value FROM rexus_user_demographics WHERE user_id = ${uid}`).map((r: any) => [r.field_key, r.value]));

    if (req.method === "GET") {
      const gate = self ? await gateState(db, uid) : null;
      let surveys: any[] = [];
      if (gate && gate.surveys.length) {
        const rows = await db.sql`SELECT s.id, s.name, s.description, s.closes_at, v.questions FROM rexus_surveys s JOIN rexus_survey_versions v ON v.survey_id = s.id AND v.version = s.current_version WHERE s.id = ANY(${gate.surveys})`;
        surveys = gate.surveys.map((id) => rows.find((r: any) => r.id === id)).filter(Boolean).map((r: any) => {
          const n = parseJson(r.questions).length;
          return { id: r.id, name: r.name, description: r.description, closes_at: r.closes_at, question_count: n, estimated_minutes: Math.max(1, Math.ceil(n * 0.5)) };
        });
      }
      return Response.json({
        user: { id: target.id, username: target.username, email: target.email, full_name: target.full_name, position: target.position || "", department: target.department || "" },
        onboarding: gate, surveys, fields: visibleFields, values: await values(),
        status: { must_change_password: target.must_change_password, profile_gate: target.profile_gate, onboarding_completed_at: target.onboarding_completed_at },
        can_edit_managed: admin
      });
    }

    if (req.method !== "POST") return bad("Unsupported method", 405);
    if (self && target.must_change_password) return bad("Change your temporary password first.", 403);
    const input = body.values && typeof body.values === "object" ? body.values : {};
    const current = await values();
    const errors: Record<string, string> = {};
    const changes: Array<[string, string]> = [];
    for (const [key, raw] of Object.entries(input)) {
      const f = visibleFields.find((x: any) => x.key === key);
      if (!f) { errors[key] = "This field cannot be edited."; continue; }
      if (!f.self_service && !admin) { if (String(raw ?? "") !== String(current[key] ?? "")) errors[key] = "Managed by HR — ask a System Admin to change it."; continue; }
      const v = String(raw ?? "").trim();
      if (v) { const e = fieldError(f, v); if (e) { errors[key] = e; continue; } }
      if (v !== String(current[key] ?? "")) changes.push([key, v]);
    }
    const merged: any = { ...current }; changes.forEach(([k, v]) => { merged[k] = v; });
    visibleFields.filter((f: any) => f.required && !merged[f.key] && !errors[f.key]).forEach((f: any) => { errors[f.key] = "This field is required."; });
    if (Object.keys(errors).length) return bad("Please check the highlighted fields.", 400, { fields: errors });
    for (const [k, v] of changes) {
      if (v) await db.sql`INSERT INTO rexus_user_demographics (user_id, field_key, value, updated_by, updated_at) VALUES (${uid}, ${k}, ${v}, ${session.uid}, NOW())
        ON CONFLICT (user_id, field_key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`;
      else await db.sql`DELETE FROM rexus_user_demographics WHERE user_id = ${uid} AND field_key = ${k}`;  // clearing an optional value
    }
    await db.sql`UPDATE users SET onboarding_completed_at = COALESCE(onboarding_completed_at, NOW()) WHERE id = ${uid}`;
    if (changes.length) await logAudit(db, { actorId: session.uid, actorName: me.username, action: "demographics_update", entityType: "employee", entityId: uid, summary: `${self ? "Updated own" : "Updated"} personal information (${changes.length} field${changes.length > 1 ? "s" : ""})`, details: { fields: changes.map(([k]) => k) } });
    return Response.json({ ok: true, onboarding: self ? await gateState(db, uid) : null });
  } catch (e: any) {
    return e.userError ? bad(e.message) : bad("Server error: " + e.message, 500);
  }
};

export const config: Config = { path: ["/api/onboarding", "/api/profile-fields"] };
