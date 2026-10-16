import { randomUUID } from 'node:crypto';

// Never accept audit authors or action names from a browser request. Only
// call this function after the corresponding server-side action succeeds.
export async function logAudit(db: any, data: {
  actorId: string; actorName: string; action: string;
  entityType: string; entityId?: string | null;
  summary: string; details?: Record<string, unknown>;
}) {
  try {
    const id = 'RA' + randomUUID().replace(/-/g, '').slice(0, 22);
    const actorId = String(data.actorId).slice(0, 100);
    const actorName = String(data.actorName || '').slice(0, 150);
    const action = String(data.action).slice(0, 90);
    const entityType = String(data.entityType).slice(0, 90);
    const entityId = String(data.entityId || '').slice(0, 130);
    const summary = String(data.summary).slice(0, 400);
    // Whitelisted, non-sensitive metadata only; never store content, passwords,
    // access tokens, uploads or document bodies in this trail.
    const details = JSON.stringify(data.details || {}).slice(0, 1400);
    await db.sql`INSERT INTO rexus_audit_log
      (id, actor_user_id, actor_username, action, entity_type, entity_id, summary, details)
      VALUES (${id}, ${actorId}, ${actorName}, ${action}, ${entityType}, ${entityId}, ${summary}, ${details})`;
  } catch (err) {
    // Existing operations should continue even if the migration was not run.
    // Deployment checklist requires applying migration 027 to enable auditing.
    console.error('REXUS audit write failed', err);
  }
}
