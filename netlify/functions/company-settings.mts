import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { getUserFromRequest, unauthorized } from "./lib/auth.mts";
import { getFullUser, isSystemAdmin } from "./lib/rbac.mts";
import { DEFAULT_TIERS, parseTiers } from "./lib/performance.mts";

const FIELDS = [
  "company_name", "office_address", "contact_email",
  "working_hours", "campus_name", "org_name", "copyright_text"
] as const;

function serialize(row: any) {
  const out: any = {};
  for (const f of FIELDS) out[f] = row ? (row[f] || "") : "";
  out.perf_pay_enabled = row ? !!row.perf_pay_enabled : false;
  out.perf_weight_ontime = row && row.perf_weight_ontime != null ? Number(row.perf_weight_ontime) : 40;
  out.perf_weight_completion = row && row.perf_weight_completion != null ? Number(row.perf_weight_completion) : 30;
  out.perf_weight_hours = row && row.perf_weight_hours != null ? Number(row.perf_weight_hours) : 20;
  out.perf_weight_manual = row && row.perf_weight_manual != null ? Number(row.perf_weight_manual) : 10;
  out.perf_tiers = row && row.perf_tiers ? parseTiers(row.perf_tiers) : DEFAULT_TIERS;
  return out;
}

// Single-row company profile — shown in the app footer, editable only by
// a System Admin from the Configuration page. Read is open to any signed-in
// user since the footer renders for everyone, not just admins.
export default async (req: Request, context: Context) => {
  const session = await getUserFromRequest(req);
  if (!session) return unauthorized();

  const db = getDatabase();

  try {
    if (req.method === "GET") {
      const rows = await db.sql`SELECT * FROM company_settings WHERE id = 1`;
      return Response.json(serialize(rows[0]));
    }

    if (req.method === "PUT") {
      const requester = await getFullUser(db, session.uid);
      if (!isSystemAdmin(requester)) {
        return Response.json({ error: "Only a System Admin can update company settings." }, { status: 403 });
      }
      const rows0 = await db.sql`SELECT * FROM company_settings WHERE id = 1`;
      const current = serialize(rows0[0]);
      const body = await req.json();
      const merged: Record<string, string> = {};
      for (const f of FIELDS) {
        merged[f] = body[f] !== undefined ? String(body[f]).trim() : current[f];
      }

      const perfEnabled = body.perf_pay_enabled !== undefined ? !!body.perf_pay_enabled : current.perf_pay_enabled;
      function clampWeight(v: any, fallback: number): number {
        const n = Number(v);
        return v === undefined || isNaN(n) ? fallback : Math.max(0, Math.min(100, Math.round(n)));
      }
      const perfWeightOntime = clampWeight(body.perf_weight_ontime, current.perf_weight_ontime);
      const perfWeightCompletion = clampWeight(body.perf_weight_completion, current.perf_weight_completion);
      const perfWeightHours = clampWeight(body.perf_weight_hours, current.perf_weight_hours);
      const perfWeightManual = clampWeight(body.perf_weight_manual, current.perf_weight_manual);
      let perfTiers = current.perf_tiers;
      if (Array.isArray(body.perf_tiers)) {
        const valid = body.perf_tiers.every((t: any) => t && typeof t.min_score === "number" && typeof t.bonus_pct === "number" && t.min_score >= 0 && t.min_score <= 100 && t.bonus_pct >= 0);
        if (!valid) return Response.json({ error: "Each performance tier needs a min_score (0-100) and a bonus_pct (>= 0)." }, { status: 400 });
        perfTiers = body.perf_tiers;
      }

      await db.sql`
        UPDATE company_settings SET
          company_name = ${merged.company_name},
          office_address = ${merged.office_address},
          contact_email = ${merged.contact_email},
          working_hours = ${merged.working_hours},
          campus_name = ${merged.campus_name},
          org_name = ${merged.org_name},
          copyright_text = ${merged.copyright_text},
          perf_pay_enabled = ${perfEnabled},
          perf_weight_ontime = ${perfWeightOntime},
          perf_weight_completion = ${perfWeightCompletion},
          perf_weight_hours = ${perfWeightHours},
          perf_weight_manual = ${perfWeightManual},
          perf_tiers = ${JSON.stringify(perfTiers)},
          updated_at = NOW()
        WHERE id = 1
      `;
      const rows = await db.sql`SELECT * FROM company_settings WHERE id = 1`;
      return Response.json(serialize(rows[0]));
    }

    return Response.json({ error: "Unsupported method" }, { status: 405 });
  } catch (err: any) {
    return Response.json({ error: "Server error: " + err.message }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/company-settings"
};
