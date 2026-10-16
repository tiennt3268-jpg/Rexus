import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { randomUUID } from "node:crypto";
import { getUserFromRequest, unauthorized } from "./lib/auth.mts";
import { logAudit } from "./lib/rexus-audit.mts";
import {documentAccess,atLeast,forbidden} from "./lib/rexus-access.mts";
const fail=(error:string,status=400)=>Response.json({error},{status});
export default async (req:Request,_context:Context)=>{
 const user=await getUserFromRequest(req);if(!user)return unauthorized();
 const db=getDatabase(), url=new URL(req.url);
 try {
  if(req.method==='GET'){
   const id=url.searchParams.get('folder')||'';
   const folder=await db.sql`SELECT id FROM rexus_documents WHERE id=${id} AND kind='folder'`;
   if(!folder.length)return fail('Folder not found',404);
   if(!atLeast(await documentAccess(db,user,id),'view'))return forbidden();
   const comments=await db.sql`SELECT id,folder_id,parent_id,author_id,author_name,body,created_at,updated_at FROM rexus_folder_comments WHERE folder_id=${id} ORDER BY created_at`;
   return Response.json({comments});
  }
  if(req.method==='POST'){
   const body=await req.json(),folderId=String(body.folder_id||''), parentId=String(body.parent_id||'')||null,content=String(body.body||'').trim();
   if(!content||content.length>4000)return fail('Comment must be 1–4,000 characters');
   const folder=await db.sql`SELECT id FROM rexus_documents WHERE id=${folderId} AND kind='folder'`;
   if(!folder.length)return fail('Folder not found',404);
   if(!atLeast(await documentAccess(db,user,folderId),'comment'))return forbidden();
   if(parentId){const parent=await db.sql`SELECT id FROM rexus_folder_comments WHERE id=${parentId} AND folder_id=${folderId}`;if(!parent.length)return fail('Reply target not found',404);}
   const id='RC'+randomUUID().replace(/-/g,'').slice(0,18).toUpperCase();
   const rows=await db.sql`INSERT INTO rexus_folder_comments(id,folder_id,parent_id,author_id,author_name,body) VALUES (${id},${folderId},${parentId},${user.uid},${user.username},${content}) RETURNING *`;
   await logAudit(db,{actorId:user.uid,actorName:user.username,action:'comment_folder',entityType:'folder',entityId:folderId,summary:'Commented on folder'});
   return Response.json({comment:rows[0]},{status:201});
  }
  if(req.method==='PUT'||req.method==='DELETE'){
   const body=req.method==='PUT'?await req.json():{id:url.searchParams.get('id')},id=String(body.id||'');
   const existing=await db.sql`SELECT id,folder_id,author_id FROM rexus_folder_comments WHERE id=${id}`;
   if(!existing.length)return fail('Comment not found',404);
   if(!atLeast(await documentAccess(db,user,existing[0].folder_id),'comment'))return forbidden();
   if(existing[0].author_id!==user.uid)return fail('Only the comment author can change it',403);
   if(req.method==='PUT'){
    const content=String(body.body||'').trim();if(!content||content.length>4000)return fail('Comment must be 1–4,000 characters');
    const rows=await db.sql`UPDATE rexus_folder_comments SET body=${content},updated_at=NOW() WHERE id=${id} RETURNING *`;
    return Response.json({comment:rows[0]});
   }
   await db.sql`DELETE FROM rexus_folder_comments WHERE id=${id}`;
   return Response.json({ok:true});
  }
  return fail('Unsupported method',405);
 }catch(e:any){return fail('Folder comments error: '+e.message,500);}
};
export const config:Config={path:'/api/rexus-folder-comments'};
