import { randomUUID } from "node:crypto";

/* =========================================================
   Performance-based pay.

   Score (0-100) blends up to four components, each optional — any
   component with no data for the period (e.g. no tasks were due, or no
   manual rating was given) drops out and the remaining weights are
   renormalized, so a quiet period never drags the score to 0:
     - on-time rate:     % of tasks due in the period that were completed
                          by their due date
     - completion rate:  % of tasks due in the period that got completed
                          at all
     - hours efficiency: estimated vs. actual hours on completed tasks
                          in the period (capped at 100%, so finishing
                          early doesn't inflate the score further)
     - manual rating:    an optional 0-100 score a Manager/Admin enters
                          by hand, for things the numbers can't see
   ========================================================= */

export interface PerfWeights {
  ontime: number;
  completion: number;
  hours: number;
  manual: number;
}
export interface PerfTier {
  min_score: number;
  bonus_pct: number;
}

export const DEFAULT_TIERS: PerfTier[] = [
  { min_score: 90, bonus_pct: 15 },
  { min_score: 75, bonus_pct: 8 },
  { min_score: 60, bonus_pct: 3 },
  { min_score: 0, bonus_pct: 0 }
];

/** 'YYYY-MM' -> ['YYYY-MM-01', 'YYYY-(MM+1)-01'] as ISO date strings. */
export function periodBounds(period: string): [string, string] {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw new Error("Invalid period, expected YYYY-MM");
  const year = Number(m[1]), month = Number(m[2]);
  const start = `${m[1]}-${m[2]}-01`;
  const endDate = new Date(Date.UTC(year, month, 1)); // month is 0-based-next since m[2] is 1-based current
  const end = endDate.toISOString().slice(0, 10);
  return [start, end];
}

export function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

export interface TaskMetrics {
  ontime_rate: number | null;
  completion_rate: number | null;
  hours_efficiency: number | null;
  task_count: number;
}

/** Pulls the three auto-computed metrics for one employee/period from tasks + worklogs. */
export async function computeTaskMetrics(db: any, employeeId: string, period: string): Promise<TaskMetrics> {
  const [start, end] = periodBounds(period);

  const tasks = await db.sql`
    SELECT id, status, due_date, estimated_hours, updated_at
    FROM tasks
    WHERE assignee_id = ${employeeId} AND due_date >= ${start} AND due_date < ${end}
  `;
  if (!tasks.length) {
    return { ontime_rate: null, completion_rate: null, hours_efficiency: null, task_count: 0 };
  }

  const completed = tasks.filter((t: any) => t.status === "Completed");
  const ontime = completed.filter((t: any) => {
    const updated = t.updated_at instanceof Date ? t.updated_at.toISOString().slice(0, 10) : String(t.updated_at).slice(0, 10);
    const due = t.due_date instanceof Date ? t.due_date.toISOString().slice(0, 10) : String(t.due_date).slice(0, 10);
    return updated <= due;
  });
  const completionRate = (completed.length / tasks.length) * 100;
  const ontimeRate = (ontime.length / tasks.length) * 100;

  let hoursEfficiency: number | null = null;
  if (completed.length) {
    const ids = completed.map((t: any) => t.id);
    const hourRows = ids.length ? await db.sql`
      SELECT task_id, COALESCE(SUM(hours), 0) AS actual FROM worklogs WHERE task_id = ANY(${ids}) GROUP BY task_id
    ` : [];
    const actualByTask: Record<string, number> = {};
    hourRows.forEach((r: any) => { actualByTask[r.task_id] = Number(r.actual) || 0; });
    const ratios: number[] = [];
    for (const t of completed) {
      const est = Number(t.estimated_hours) || 0;
      const actual = actualByTask[t.id] || 0;
      if (est > 0 && actual > 0) ratios.push(Math.min(100, (est / actual) * 100));
    }
    if (ratios.length) hoursEfficiency = ratios.reduce((s, v) => s + v, 0) / ratios.length;
  }

  return { ontime_rate: ontimeRate, completion_rate: completionRate, hours_efficiency: hoursEfficiency, task_count: tasks.length };
}

/** Blends the metrics + optional manual rating into one 0-100 score, using
 *  only the components that have data (renormalizing the remaining weights). */
export function computeScore(metrics: TaskMetrics, manualRating: number | null, weights: PerfWeights): number | null {
  const parts: Array<[number, number]> = []; // [value, weight]
  if (metrics.ontime_rate != null) parts.push([metrics.ontime_rate, weights.ontime]);
  if (metrics.completion_rate != null) parts.push([metrics.completion_rate, weights.completion]);
  if (metrics.hours_efficiency != null) parts.push([metrics.hours_efficiency, weights.hours]);
  if (manualRating != null) parts.push([Math.max(0, Math.min(100, manualRating)), weights.manual]);
  const totalWeight = parts.reduce((s, [, w]) => s + w, 0);
  if (!totalWeight) return null;
  const weighted = parts.reduce((s, [v, w]) => s + v * w, 0);
  return Math.round((weighted / totalWeight) * 10) / 10;
}

export function bonusPctForScore(score: number | null, tiers: PerfTier[]): number {
  if (score == null) return 0;
  const sorted = [...tiers].sort((a, b) => b.min_score - a.min_score);
  for (const tier of sorted) {
    if (score >= tier.min_score) return tier.bonus_pct;
  }
  return 0;
}

export function parseTiers(text: string): PerfTier[] {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.every((t) => typeof t.min_score === "number" && typeof t.bonus_pct === "number")) {
      return parsed;
    }
  } catch { /* fall through to default */ }
  return DEFAULT_TIERS;
}

export async function getPerformanceRow(db: any, employeeId: string, period: string) {
  const rows = await db.sql`SELECT * FROM employee_performance WHERE employee_id = ${employeeId} AND period = ${period}`;
  return rows.length ? rows[0] : null;
}

/** Creates/updates the draft row for a period (manual rating + notes only —
 *  metrics/score/bonus are computed live while draft). Refuses to touch a
 *  finalized period. */
export async function upsertDraft(
  db: any, employeeId: string, period: string, manualRating: number | null, notes: string, actorUserId: string
) {
  const existing = await getPerformanceRow(db, employeeId, period);
  if (existing && existing.status === "finalized") {
    throw new Error("This period has already been finalized and can no longer be edited.");
  }
  if (existing) {
    const rows = await db.sql`
      UPDATE employee_performance SET manual_rating = ${manualRating}, notes = ${notes}, updated_at = NOW()
      WHERE id = ${existing.id}
      RETURNING *
    `;
    return rows[0];
  }
  const id = "EP" + randomUUID().slice(0, 8).toUpperCase();
  const rows = await db.sql`
    INSERT INTO employee_performance (id, employee_id, period, manual_rating, notes, status, created_by)
    VALUES (${id}, ${employeeId}, ${period}, ${manualRating}, ${notes}, 'draft', ${actorUserId})
    RETURNING *
  `;
  return rows[0];
}

export function serializePerformanceRow(r: any) {
  return {
    id: r.id,
    employee_id: r.employee_id,
    period: r.period,
    manual_rating: r.manual_rating == null ? null : Number(r.manual_rating),
    ontime_rate: r.ontime_rate == null ? null : Number(r.ontime_rate),
    completion_rate: r.completion_rate == null ? null : Number(r.completion_rate),
    hours_efficiency: r.hours_efficiency == null ? null : Number(r.hours_efficiency),
    score: r.score == null ? null : Number(r.score),
    bonus_pct: r.bonus_pct == null ? 0 : Number(r.bonus_pct),
    base_salary_snapshot: r.base_salary_snapshot == null ? 0 : Number(r.base_salary_snapshot),
    bonus_amount: r.bonus_amount == null ? 0 : Number(r.bonus_amount),
    status: r.status || "draft",
    notes: r.notes || "",
    created_by: r.created_by || "",
    finalized_by: r.finalized_by || "",
    finalized_at: r.finalized_at instanceof Date ? r.finalized_at.toISOString() : r.finalized_at
  };
}
