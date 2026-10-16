import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import { getUserFromRequest, unauthorized } from "./lib/auth.mts";
import { canAccessProject, findProjectOwnerAccessibleToUser } from "./lib/collab.mts";
import { logAudit } from "./lib/rexus-audit.mts";

type Scope = "task" | "subtask" | "project";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB per file

/**
 * Resolves a {scope, id} pair the same way comments.mts / shares.mts do,
 * so "can this user attach/download a file here" always matches "can this
 * user see this project/task/subtask" — one access-control story, reused
 * everywhere an entity is referenced by {scope, id}.
 */
async function resolveAccess(db: any, scope: Scope, id: string, requestingUserId: string): Promise<{ ok: boolean; error?: string }> {
  if (scope === "task") {
    const rows = await db.sql`SELECT user_id, project FROM tasks WHERE id = ${id}`;
    if (!rows.length) return { ok: false, error: "Task not found" };
    const ok = await canAccessProject(db, rows[0].user_id, rows[0].project, requestingUserId);
    return ok ? { ok: true } : { ok: false, error: "You do not have access to this task." };
  }
  if (scope === "subtask") {
    const srows = await db.sql`SELECT task_id FROM subtasks WHERE id = ${id}`;
    if (!srows.length) return { ok: false, error: "Subtask not found" };
    const trows = await db.sql`SELECT user_id, project FROM tasks WHERE id = ${srows[0].task_id}`;
    if (!trows.length) return { ok: false, error: "Parent task not found" };
    const ok = await canAccessProject(db, trows[0].user_id, trows[0].project, requestingUserId);
    return ok ? { ok: true } : { ok: false, error: "You do not have access to this subtask." };
  }
  if (scope === "project") {
    const ownerId = await findProjectOwnerAccessibleToUser(db, id, requestingUserId);
    return ownerId ? { ok: true } : { ok: false, error: "Project not found or not accessible" };
  }
  return { ok: false, error: "Unknown scope" };
}

export default async (req: Request, context: Context) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const db = getDatabase();
  const store = getStore({ name: "wm-attachments", consistency: "strong" });

  try {
    if (req.method === "POST") {
      // Uploads bytes right away (so the user sees upload progress before
      // hitting Save), but does NOT attach the file to the entity yet —
      // the caller stores the returned metadata into the entity's
      // `attachments` JSON array itself, on Save, exactly like a link
      // attachment. This mirrors the existing link-attachment UX.
      const form = await req.formData();
      const scope = String(form.get("scope") || "") as Scope;
      const id = String(form.get("id") || "");
      const file = form.get("file");
      if (!scope || !id) return Response.json({ error: "Missing scope or id" }, { status: 400 });
      if (!(file instanceof File)) return Response.json({ error: "Missing file" }, { status: 400 });
      if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: "File is too large (20 MB max)." }, { status: 400 });

      const access = await resolveAccess(db, scope, id, user.uid);
      if (!access.ok) return Response.json({ error: access.error }, { status: access.error?.indexOf("access") !== -1 ? 403 : 404 });

      const fileId = "F" + randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase();
      const blobKey = scope + "/" + id + "/" + fileId + "-" + file.name;
      const bytes = await file.arrayBuffer();

      await store.set(blobKey, bytes, {
        metadata: { contentType: file.type || "application/octet-stream", originalName: file.name }
      });

      await db.sql`
        INSERT INTO uploaded_files (id, blob_key, original_name, content_type, size_bytes, scope, entity_id, uploaded_by)
        VALUES (${fileId}, ${blobKey}, ${file.name}, ${file.type || "application/octet-stream"}, ${file.size}, ${scope}, ${id}, ${user.uid})
      `;

      await logAudit(db, { actorId: user.uid, actorName: user.username, action: 'upload_attachment', entityType: scope, entityId: id, summary: `Uploaded attachment "${file.name.slice(0, 150)}"`, details: { fileId } });
      return Response.json({
        id: fileId,
        type: "file",
        name: file.name,
        url: "/api/attachments?file=" + encodeURIComponent(fileId),
        size: file.size,
        content_type: file.type || "application/octet-stream"
      });
    }

    if (req.method === "GET") {
      const url = new URL(req.url);
      const fileId = url.searchParams.get("file");
      if (!fileId) return Response.json({ error: "Missing file id" }, { status: 400 });

      const rows = await db.sql`SELECT * FROM uploaded_files WHERE id = ${fileId}`;
      if (!rows.length) return Response.json({ error: "File not found" }, { status: 404 });
      const meta = rows[0];

      const access = await resolveAccess(db, meta.scope as Scope, meta.entity_id, user.uid);
      if (!access.ok) return Response.json({ error: access.error }, { status: access.error?.indexOf("access") !== -1 ? 403 : 404 });

      const blob = await store.get(meta.blob_key, { type: "arrayBuffer" });
      if (!blob) return Response.json({ error: "File data not found" }, { status: 404 });

      return new Response(blob, {
        status: 200,
        headers: {
          "Content-Type": meta.content_type || "application/octet-stream",
          "Content-Disposition": "inline; filename=\"" + meta.original_name.replace(/"/g, "") + "\"",
          "Cache-Control": "private, max-age=3600"
        }
      });
    }

    if (req.method === "DELETE") {
      const url = new URL(req.url);
      const fileId = url.searchParams.get("file");
      if (!fileId) return Response.json({ error: "Missing file id" }, { status: 400 });

      const rows = await db.sql`SELECT * FROM uploaded_files WHERE id = ${fileId}`;
      if (!rows.length) return Response.json({ ok: true }); // already gone
      const meta = rows[0];

      const access = await resolveAccess(db, meta.scope as Scope, meta.entity_id, user.uid);
      if (!access.ok) return Response.json({ error: access.error }, { status: access.error?.indexOf("access") !== -1 ? 403 : 404 });

      await store.delete(meta.blob_key);
      await db.sql`DELETE FROM uploaded_files WHERE id = ${fileId}`;
      await logAudit(db, { actorId: user.uid, actorName: user.username, action: 'delete_attachment', entityType: meta.scope, entityId: meta.entity_id, summary: `Deleted attachment "${String(meta.original_name).slice(0,150)}"`, details: { fileId } });
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unsupported method" }, { status: 405 });
  } catch (err: any) {
    return Response.json({ error: "Server error: " + err.message }, { status: 500 });
  }
};

export const config: Config = { path: "/api/attachments" };
