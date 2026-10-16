import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { randomUUID } from "node:crypto";
import { getUserFromRequest, unauthorized } from "./lib/auth.mts";
import { logAudit } from "./lib/rexus-audit.mts";
import { documentAccess, spaceAccess, atLeast, forbidden, listVisible } from "./lib/rexus-access.mts";

function id(prefix: string) { return prefix + randomUUID().replace(/-/g, "").slice(0, 18).toUpperCase(); }
function text(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function labels(value: unknown): string {
  const items = Array.isArray(value) ? value : [];
  return JSON.stringify([...new Set(items.filter((v) => typeof v === "string").map((v: string) => v.trim().slice(0, 50)).filter(Boolean))].slice(0, 20));
}
function rowToDoc(row: any) {
  let tags: string[] = [];
  try { const raw = typeof row.labels === "string" ? JSON.parse(row.labels) : row.labels; tags = Array.isArray(raw) ? raw : []; } catch {}
  return { ...row, labels: tags };
}
function fail(message: string, status = 400) { return Response.json({ error: message }, { status }); }
async function getDoc(db: any, documentId: string) {
  const rows = await db.sql`SELECT * FROM rexus_documents WHERE id = ${documentId}`;
  return rows[0] || null;
}
async function validParent(db: any, spaceId: string, parentId: string | null) {
  if (!parentId) return true;
  const parent = await getDoc(db, parentId);
  return !!parent && parent.space_id === spaceId && parent.kind === "folder";
}

export default async (req: Request, _context: Context) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();
  const db = getDatabase();
  const url = new URL(req.url);
  try {
    if (req.method === "GET") {
      const revisionId = url.searchParams.get("history");
      if (revisionId) {
        if (!(await getDoc(db, revisionId))) return fail("Document not found", 404);
        if (!atLeast(await documentAccess(db,user,revisionId),"view")) return forbidden();
        const revisions = await db.sql`SELECT version, title, body, labels, edited_by, edited_at FROM rexus_doc_revisions WHERE document_id = ${revisionId} ORDER BY version DESC`;
        return Response.json({ revisions: revisions.map(rowToDoc) });
      }
      const spaces = await db.sql`SELECT * FROM rexus_spaces ORDER BY name ASC`;
      const documents = await db.sql`SELECT * FROM rexus_documents ORDER BY title ASC`;
      const visible=await listVisible(db,user,spaces,documents);
      return Response.json({ spaces: visible.spaces, documents: visible.documents.map(rowToDoc) });
    }

    if (req.method === "POST") {
      const body = await req.json();
      if (body.action === "share_link") {
        const docId = text(body.id, 80);
        const doc = await getDoc(db, docId);
        if (!doc) return fail('Document not found', 404);
        if (!atLeast(await documentAccess(db,user,docId),'view')) return forbidden();
        await logAudit(db, { actorId: user.uid, actorName: user.username, action: 'share_document', entityType: 'page', entityId: docId, summary: `Generated internal share link for "${doc.title}"` });
        return Response.json({ ok: true });
      }
      if (body.action === "create_space") {
        const name = text(body.name, 120);
        if (!name) return fail("Space name is required");
        const spaceId = id("RS");
        const rows = await db.sql`INSERT INTO rexus_spaces(id, name, description, created_by, access_mode) VALUES (${spaceId}, ${name}, ${text(body.description, 1500)}, ${user.uid}, 'restricted') RETURNING *`;
        await logAudit(db, { actorId: user.uid, actorName: user.username, action: 'create_space', entityType: 'space', entityId: spaceId, summary: `Created space "${name}"` });
        return Response.json({ space: rows[0] }, { status: 201 });
      }
      if (body.action === "copy_document") {
        const source = await getDoc(db, text(body.id, 80));
        if (!source) return fail("Document not found", 404);
        if (!atLeast(await documentAccess(db,user,source.id),"view")) return forbidden();
        if (!atLeast(await spaceAccess(db,user,source.space_id),"edit")) return forbidden();
        if (source.kind !== 'page') return fail("Only document pages can be copied");
        const copyId = id('RD');
        const title = text(body.title, 200) || (source.title + ' (Copy)').slice(0, 200);
        const rows = await db.sql`INSERT INTO rexus_documents(id,space_id,parent_id,kind,title,body,labels,created_by,updated_by) VALUES (${copyId},${source.space_id},${source.parent_id},'page',${title},${source.body},${source.labels},${user.uid},${user.uid}) RETURNING *`;
        await db.sql`INSERT INTO rexus_doc_revisions(document_id,version,title,body,labels,edited_by) VALUES (${copyId},1,${title},${source.body},${source.labels},${user.uid})`;
        await logAudit(db,{actorId:user.uid,actorName:user.username,action:'copy_document',entityType:'page',entityId:copyId,summary:`Copied "${source.title}"`});
        return Response.json({document:rowToDoc(rows[0])},{status:201});
      }
      if (body.action === "create_document") {
        const spaceId = text(body.space_id, 80), title = text(body.title, 200);
        const parentId = text(body.parent_id, 80) || null;
        const kind = body.kind === "folder" ? "folder" : "page";
        if (!title || !spaceId) return fail("Space and title are required");
        const space = await db.sql`SELECT id FROM rexus_spaces WHERE id = ${spaceId}`;
        if (!space.length) return fail("Space not found", 404);
        if (!(await validParent(db, spaceId, parentId))) return fail("Parent must be a folder in the same space");
        if (!atLeast(await (parentId ? documentAccess(db,user,parentId) : spaceAccess(db,user,spaceId)),"edit")) return forbidden();
        const docId = id("RD"), labelJson = labels(body.labels), content = kind === "page" ? text(body.body, 250000) : "";
        const rows = await db.sql`INSERT INTO rexus_documents(id, space_id, parent_id, kind, title, body, labels, created_by, updated_by) VALUES (${docId}, ${spaceId}, ${parentId}, ${kind}, ${title}, ${content}, ${labelJson}, ${user.uid}, ${user.uid}) RETURNING *`;
        await db.sql`INSERT INTO rexus_doc_revisions(document_id, version, title, body, labels, edited_by) VALUES (${docId}, 1, ${title}, ${content}, ${labelJson}, ${user.uid})`;
        await logAudit(db, { actorId: user.uid, actorName: user.username, action: 'create_document', entityType: kind, entityId: docId, summary: `Created ${kind} "${title}"`, details: { spaceId } });
        return Response.json({ document: rowToDoc(rows[0]) }, { status: 201 });
      }
      return fail("Unknown action");
    }

    if (req.method === "PUT") {
      const body = await req.json();
      if (body.action === "update_space") {
        const spaceId = text(body.id, 80), name = text(body.name, 120);
        if (!spaceId || !name) return fail("Space ID and name are required");
        if (!atLeast(await spaceAccess(db,user,spaceId),"edit")) return forbidden();
        const rows = await db.sql`UPDATE rexus_spaces SET name = ${name}, description = ${text(body.description, 1500)}, updated_at = NOW() WHERE id = ${spaceId} RETURNING *`;
        if (!rows.length) return fail("Space not found", 404);
        await logAudit(db, { actorId: user.uid, actorName: user.username, action: 'update_space', entityType: 'space', entityId: spaceId, summary: `Updated space "${name}"` });
        return Response.json({ space: rows[0] });
      }
      const docId = text(body.id, 80);
      const doc = await getDoc(db, docId);
      if (!doc) return fail("Document not found", 404);
      if (!atLeast(await documentAccess(db,user,docId),"edit")) return forbidden();
      if (body.action === "restore") {
        const version = Number(body.version);
        if (!Number.isSafeInteger(version) || version < 1) return fail("Invalid version");
        const rows = await db.sql`SELECT * FROM rexus_doc_revisions WHERE document_id = ${docId} AND version = ${version}`;
        if (!rows.length) return fail("Version not found", 404);
        const prev = rows[0], nextVersion = Number(doc.version) + 1;
        const updated = await db.sql`UPDATE rexus_documents SET title = ${prev.title}, body = ${prev.body}, labels = ${prev.labels}, version = ${nextVersion}, updated_by = ${user.uid}, updated_at = NOW() WHERE id = ${docId} AND version = ${doc.version} RETURNING *`;
        if (!updated.length) return fail("Document changed. Refresh and try again", 409);
        await db.sql`INSERT INTO rexus_doc_revisions(document_id, version, title, body, labels, edited_by) VALUES (${docId}, ${nextVersion}, ${prev.title}, ${prev.body}, ${prev.labels}, ${user.uid})`;
        await logAudit(db, { actorId: user.uid, actorName: user.username, action: 'restore_document', entityType: 'page', entityId: docId, summary: `Restored "${prev.title}" from version ${version}`, details: { version: nextVersion } });
        return Response.json({ document: rowToDoc(updated[0]) });
      }
      if (body.action === "move") {
        const parentId = text(body.parent_id, 80) || null;
        if (parentId === docId) return fail("A document cannot be its own parent");
        if (!(await validParent(db, doc.space_id, parentId))) return fail("Parent must be a folder in the same space");
        if (!atLeast(await (parentId ? documentAccess(db,user,parentId) : spaceAccess(db,user,doc.space_id)),"edit")) return forbidden();
        // Walk ancestors, preventing folder cycles and unviewable content.
        let ancestor = parentId;
        const visited = new Set<string>();
        while (ancestor) {
          if (ancestor === docId || visited.has(ancestor)) return fail("Cannot move a folder into its descendants");
          visited.add(ancestor);
          const a = await getDoc(db, ancestor);
          ancestor = a?.parent_id || null;
        }
        const rows = await db.sql`UPDATE rexus_documents SET parent_id = ${parentId}, updated_at = NOW(), updated_by = ${user.uid} WHERE id = ${docId} RETURNING *`;
        await logAudit(db, { actorId: user.uid, actorName: user.username, action: 'move_document', entityType: doc.kind, entityId: docId, summary: `Moved "${doc.title}"`, details: { parentId: parentId || '' } });
        return Response.json({ document: rowToDoc(rows[0]) });
      }
      if (body.action !== "update_document") return fail("Unknown action");
      const title = text(body.title, 200);
      if (!title) return fail("Title is required");
      const content = doc.kind === "page" ? text(body.body, 250000) : "";
      const labelJson = labels(body.labels), nextVersion = Number(doc.version) + 1;
      const version = Number(body.expected_version);
      if (version !== Number(doc.version)) return fail("Someone changed this page. Refresh before saving", 409);
      if (doc.title === title && doc.body === content && doc.labels === labelJson) return Response.json({document:rowToDoc(doc),unchanged:true});
      const updated = await db.sql`UPDATE rexus_documents SET title = ${title}, body = ${content}, labels = ${labelJson}, version = ${nextVersion}, updated_by = ${user.uid}, updated_at = NOW() WHERE id = ${docId} AND version = ${version} RETURNING *`;
      if (!updated.length) return fail("Someone changed this page. Refresh before saving", 409);
      await db.sql`INSERT INTO rexus_doc_revisions(document_id, version, title, body, labels, edited_by) VALUES (${docId}, ${nextVersion}, ${title}, ${content}, ${labelJson}, ${user.uid})`;
      await logAudit(db, { actorId: user.uid, actorName: user.username, action: 'update_document', entityType: doc.kind, entityId: docId, summary: `Updated "${title}"`, details: { version: nextVersion } });
      return Response.json({ document: rowToDoc(updated[0]) });
    }

    if (req.method === "DELETE") {
      const spaceId = url.searchParams.get("space");
      if (spaceId) {
        if (!atLeast(await spaceAccess(db,user,spaceId),"edit")) return forbidden();
        const count = await db.sql`SELECT id FROM rexus_documents WHERE space_id = ${spaceId} LIMIT 1`;
        if (count.length) return fail("Delete or move all items out of the space first", 409);
        await db.sql`DELETE FROM rexus_spaces WHERE id = ${spaceId}`;
        await db.sql`DELETE FROM rexus_document_shares WHERE target_type = 'space' AND target_id = ${spaceId}`;
        await logAudit(db, { actorId: user.uid, actorName: user.username, action: 'delete_space', entityType: 'space', entityId: spaceId, summary: 'Deleted empty space' });
        return Response.json({ ok: true });
      }
      const docId = url.searchParams.get("id") || "";
      if (!(await getDoc(db, docId))) return fail("Document not found", 404);
      if (!atLeast(await documentAccess(db,user,docId),"edit")) return forbidden();
      const children = await db.sql`SELECT id FROM rexus_documents WHERE parent_id = ${docId} LIMIT 1`;
      if (children.length) return fail("Folder contains documents. Remove them first", 409);
      const files = await db.sql`SELECT id FROM rexus_doc_files WHERE document_id = ${docId} OR folder_id = ${docId} LIMIT 1`;
      if (files.length) return fail("Remove all files from this page or folder first", 409);
      // Links are stored as Task/Subtask attachment entries; forbid deletion
      // of documents still referenced there so links cannot go stale.
      const pattern = "%" + docId + "%";
      const tasks = await db.sql`SELECT attachments FROM tasks WHERE attachments LIKE ${pattern} LIMIT 50`;
      const subtasks = await db.sql`SELECT attachments FROM subtasks WHERE attachments LIKE ${pattern} LIMIT 50`;
      for (const record of [...tasks, ...subtasks]) {
        try {
          const entries = JSON.parse(record.attachments || "[]");
          if (Array.isArray(entries) && entries.some((a: any) => a?.type === "rexus-document" && a?.document_id === docId)) {
            return fail("Unlink this document from its Tasks/Subtasks before deleting", 409);
          }
        } catch {}
      }
      const oldDocument = await getDoc(db, docId);
      await db.sql`DELETE FROM rexus_documents WHERE id = ${docId}`;
      await db.sql`DELETE FROM rexus_document_shares WHERE target_id = ${docId} AND target_type IN ('folder','page')`;
      await logAudit(db, { actorId: user.uid, actorName: user.username, action: 'delete_document', entityType: oldDocument?.kind || 'page', entityId: docId, summary: `Deleted "${oldDocument?.title || docId}"` });
      return Response.json({ ok: true });
    }
    return fail("Unsupported method", 405);
  } catch (err: any) {
    return Response.json({ error: "Document service error: " + err.message }, { status: 500 });
  }
};
export const config: Config = { path: "/api/rexus-documents" };
