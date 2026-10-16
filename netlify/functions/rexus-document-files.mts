import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import { getUserFromRequest, unauthorized } from "./lib/auth.mts";
import { logAudit } from "./lib/rexus-audit.mts";
import {documentAccess,fileAccess,atLeast,forbidden,listVisible} from "./lib/rexus-access.mts";

// Netlify Functions' HTTP upload body limit is below the original task
// attachment limit; 4 MiB keeps multipart requests within that limit.
const MAX_BYTES = 4 * 1024 * 1024;
function error(message: string, status = 400) { return Response.json({ error: message }, { status }); }
function safeName(name: string): string {
  return (name || "file").replace(/[\\/\r\n\x00-\x1f]/g, "_").slice(0, 180) || "file";
}
function newId() { return "RF" + randomUUID().replace(/-/g, "").slice(0, 18).toUpperCase(); }

export default async (req: Request, _context: Context) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();
  const db = getDatabase();
  const store = getStore({ name: "rexus-documents", consistency: "strong" });
  const url = new URL(req.url);
  try {
    if (req.method === "GET") {
      const folderId = url.searchParams.get("folder");
      if (folderId) {
        const folder = await db.sql`SELECT id FROM rexus_documents WHERE id = ${folderId} AND kind = 'folder'`;
        if (!folder.length) return error("Folder not found", 404);
        if (!atLeast(await documentAccess(db,user,folderId),"view")) return forbidden();
        const files = await db.sql`SELECT id, document_id, folder_id, name, description, content_type, size_bytes, current_version, created_by, created_at, updated_at FROM rexus_doc_files WHERE folder_id = ${folderId} ORDER BY updated_at DESC`;
        return Response.json({ files });
      }
      const documentId = url.searchParams.get("document");
      if (documentId) {
        const docs = await db.sql`SELECT id FROM rexus_documents WHERE id = ${documentId} AND kind = 'page'`;
        if (!docs.length) return error("Page not found", 404);
        if (!atLeast(await documentAccess(db,user,documentId),"view")) return forbidden();
        const files = await db.sql`SELECT id, document_id, folder_id, name, description, content_type, size_bytes, current_version, created_by, created_at, updated_at FROM rexus_doc_files WHERE document_id = ${documentId} ORDER BY updated_at DESC`;
        return Response.json({ files });
      }
      const fileId = url.searchParams.get("file");
      if (!fileId) {
        const files = await db.sql`SELECT id, document_id, folder_id, name, description, content_type, size_bytes, current_version, created_by, created_at, updated_at FROM rexus_doc_files ORDER BY updated_at DESC LIMIT 500`;
        const visible=await listVisible(db,user,
          await db.sql`SELECT id,created_by,access_mode FROM rexus_spaces`,
          await db.sql`SELECT id,space_id,parent_id,kind,created_by,access_mode FROM rexus_documents`);
        const allowed=new Set(visible.documents.map((d:any)=>d.id));
        return Response.json({ files: files.filter((f:any)=>allowed.has(f.document_id||f.folder_id)) });
      }
      const files = await db.sql`SELECT * FROM rexus_doc_files WHERE id = ${fileId}`;
      if (!files.length) return error("File not found", 404);
      const file = files[0];
      if (!atLeast(await fileAccess(db,user,fileId),"view")) return forbidden();
      if (url.searchParams.has("versions")) {
        const versions = await db.sql`SELECT version, content_type, size_bytes, uploaded_by, created_at FROM rexus_doc_file_versions WHERE file_id = ${fileId} ORDER BY version DESC`;
        return Response.json({ file, versions });
      }
      const versionParam = url.searchParams.get("version");
      const version = versionParam ? Number(versionParam) : Number(file.current_version);
      if (!Number.isSafeInteger(version) || version < 1) return error("Invalid file version");
      const vrows = await db.sql`SELECT * FROM rexus_doc_file_versions WHERE file_id = ${fileId} AND version = ${version}`;
      if (!vrows.length) return error("File version not found", 404);
      const blob = await store.get(vrows[0].blob_key, { type: "arrayBuffer" });
      if (!blob) return error("File content not found", 404);
      const filename = safeName(file.name);
      // Embeddable images are served only from a strict safe image allowlist.
      // All other documents retain the original forced-download behaviour.
      const preview = url.searchParams.get("preview") === "1";
      const safeImages = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
      const mime = String(vrows[0].content_type).toLowerCase();
      // PDFs are rendered by the browser's sandboxed PDF viewer.
      const inline = preview && (safeImages.has(mime) || mime === "application/pdf");
      return new Response(blob, {
        status: 200,
        headers: {
          "Content-Type": inline ? mime : "application/octet-stream",
          "Content-Disposition": inline ? "inline" : `attachment; filename="${filename.replace(/[^\x20-\x7e]|[";]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
          "Content-Security-Policy": "default-src 'none'",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store"
        }
      });
    }

    if (req.method === "PUT") {
      const body = await req.json(), fileId=String(body.id||'');
      const existing = await db.sql`SELECT f.*,d.space_id AS page_space,fd.space_id AS folder_space FROM rexus_doc_files f LEFT JOIN rexus_documents d ON d.id=f.document_id LEFT JOIN rexus_documents fd ON fd.id=f.folder_id WHERE f.id=${fileId}`;
      if(!existing.length)return error('File not found',404);
      const old=existing[0];
      if (!atLeast(await fileAccess(db,user,fileId),"edit")) return forbidden();
      if(body.action==='rename'){
        if(!String(body.name||'').trim())return error('File name required');
        const name=safeName(String(body.name).trim());
        const rows=await db.sql`UPDATE rexus_doc_files SET name=${name},updated_at=NOW() WHERE id=${fileId} RETURNING *`;
        await logAudit(db,{actorId:user.uid,actorName:user.username,action:'rename_document_file',entityType:'file',entityId:fileId,summary:`Renamed file to "${name}"`});
        return Response.json({file:rows[0]});
      }
      if(body.action==='move'){
        const folderId=String(body.folder_id||'');
        if(!folderId)return error('Target folder required');
        const folder=await db.sql`SELECT id,space_id FROM rexus_documents WHERE id=${folderId} AND kind='folder'`;
        if(!folder.length)return error('Folder not found',404);
        if (!atLeast(await documentAccess(db,user,folderId),'edit')) return forbidden();
        const oldSpace=old.page_space||old.folder_space;
        if(oldSpace!==folder[0].space_id)return error('File can only move within the same space');
        const rows=await db.sql`UPDATE rexus_doc_files SET folder_id=${folderId},document_id=NULL,updated_at=NOW() WHERE id=${fileId} RETURNING *`;
        await logAudit(db,{actorId:user.uid,actorName:user.username,action:'move_document_file',entityType:'file',entityId:fileId,summary:'Moved file to folder'});
        return Response.json({file:rows[0]});
      }
      return error('Unknown action');
    }

    if (req.method === "POST") {
      const form = await req.formData();
      const documentId = String(form.get("document_id") || "");
      const folderId = String(form.get("folder_id") || "");
      const requestedFileId = String(form.get("file_id") || "");
      const item = form.get("file");
      if (!(item instanceof File)) return error("Choose a file to upload");
      if (item.size === 0) return error("The selected file is empty");
      if (item.size > MAX_BYTES) return error("Maximum file size is 4 MB per upload");
      const name = safeName(item.name);
      const contentType = (item.type || "application/octet-stream").slice(0, 120);
      let fileId = requestedFileId, version = 1;
      if (requestedFileId) {
        const old = await db.sql`SELECT * FROM rexus_doc_files WHERE id = ${requestedFileId}`;
        if (!old.length) return error("File not found", 404);
        if (!atLeast(await fileAccess(db,user,requestedFileId),"edit")) return forbidden();
        if (documentId && documentId !== old[0].document_id) return error("File is attached to a different page");
        if (folderId && folderId !== old[0].folder_id) return error("File belongs to a different folder");
        version = Number(old[0].current_version) + 1;
      } else {
        if (!!documentId === !!folderId) return error('Choose exactly one page or folder');
        const targetId = documentId || folderId, kind = documentId ? 'page' : 'folder';
        const docs = await db.sql`SELECT id FROM rexus_documents WHERE id = ${targetId} AND kind = ${kind}`;
        if (!docs.length) return error("Choose an existing page or folder", 404);
        if (!atLeast(await documentAccess(db,user,targetId),"edit")) return forbidden();
        fileId = newId();
      }
      const blobKey = `${fileId}/v${version}/${randomUUID()}`;
      await store.set(blobKey, await item.arrayBuffer(), { metadata: { originalName: name, contentType } });
      try {
        if (!requestedFileId) {
          await db.sql`INSERT INTO rexus_doc_files(id, document_id, folder_id, name, content_type, size_bytes, current_version, created_by) VALUES (${fileId}, ${documentId || null}, ${folderId || null}, ${name}, ${contentType}, ${item.size}, 1, ${user.uid})`;
        } else {
          const rows = await db.sql`UPDATE rexus_doc_files SET content_type = ${contentType}, size_bytes = ${item.size}, current_version = ${version}, updated_at = NOW() WHERE id = ${fileId} AND current_version = ${version - 1} RETURNING id`;
          if (!rows.length) { await store.delete(blobKey); return error("File was updated by another user. Try again", 409); }
        }
        await db.sql`INSERT INTO rexus_doc_file_versions(file_id, version, blob_key, content_type, size_bytes, uploaded_by) VALUES (${fileId}, ${version}, ${blobKey}, ${contentType}, ${item.size}, ${user.uid})`;
      } catch (err) {
        await store.delete(blobKey);
        throw err;
      }
      await logAudit(db, { actorId: user.uid, actorName: user.username,
        action: requestedFileId ? 'update_document_file' : 'upload_document_file', entityType: 'file', entityId: fileId,
        summary: `${requestedFileId ? 'Updated' : 'Uploaded'} file "${name}"`, details: { version, documentId: documentId || '', folderId: folderId || '' } });
      return Response.json({ ok: true, id: fileId, version, name: requestedFileId ? null : name });
    }

    if (req.method === "DELETE") {
      const fileId = url.searchParams.get("file") || "";
      const files = await db.sql`SELECT id, name, document_id, folder_id FROM rexus_doc_files WHERE id = ${fileId}`;
      if (!files.length) return error("File not found", 404);
      if (!atLeast(await fileAccess(db,user,fileId),"edit")) return forbidden();
      const pattern = "%" + fileId + "%";
      const t = await db.sql`SELECT attachments FROM tasks WHERE attachments LIKE ${pattern} LIMIT 50`;
      const s = await db.sql`SELECT attachments FROM subtasks WHERE attachments LIKE ${pattern} LIMIT 50`;
      for (const record of [...t, ...s]) {
        try {
          const list = JSON.parse(record.attachments || "[]");
          if (Array.isArray(list) && list.some((a: any) => a?.type === "rexus-document" && a?.file_id === fileId))
            return error("Unlink this file from its Tasks/Subtasks first", 409);
        } catch {}
      }
      const versions = await db.sql`SELECT blob_key FROM rexus_doc_file_versions WHERE file_id = ${fileId}`;
      // Delete relational rows before blobs: a DB failure must not leave a live
      // file whose bytes were already deleted.
      await db.sql`DELETE FROM rexus_doc_files WHERE id = ${fileId}`;
      for (const v of versions) { try { await store.delete(v.blob_key); } catch (_) { /* Orphan blob may be garbage-collected later */ } }
      await logAudit(db, { actorId: user.uid, actorName: user.username, action: 'delete_document_file', entityType: 'file', entityId: fileId, summary: `Deleted file "${files[0].name}"`, details: { documentId: files[0].document_id } });
      return Response.json({ ok: true });
    }
    return error("Unsupported method", 405);
  } catch (err: any) {
    return Response.json({ error: "File service error: " + err.message }, { status: 500 });
  }
};
export const config: Config = { path: "/api/rexus-document-files" };
