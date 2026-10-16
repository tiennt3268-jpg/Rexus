import type {Context,Config} from '@netlify/functions';
import {getDatabase} from '@netlify/database';
import {randomUUID} from 'node:crypto';
import {getUserFromRequest,unauthorized} from './lib/auth.mts';
import {documentAccess,atLeast,forbidden} from './lib/rexus-access.mts';
import {logAudit} from './lib/rexus-audit.mts';
const fail=(error:string,status=400)=>Response.json({error},{status});
const newId=(prefix:string)=>prefix+randomUUID().replace(/-/g,'').slice(0,20).toUpperCase();
export default async(req:Request,_context:Context)=>{
 const user=await getUserFromRequest(req);if(!user)return unauthorized();
 const db=getDatabase(),url=new URL(req.url);
 try{
  if(req.method==='GET'){
   const docId=url.searchParams.get('document')||'';
   if(!atLeast(await documentAccess(db,user,docId),'view'))return forbidden();
   const threads=await db.sql`SELECT t.*,u.full_name AS author_name FROM rexus_document_threads t LEFT JOIN users u ON u.id=t.created_by WHERE t.document_id=${docId} ORDER BY t.created_at`;
   const ids=threads.map((t:any)=>t.id);
   const replies:any[]=[];
   for(const id of ids){const rows=await db.sql`SELECT r.*,u.full_name AS author_name FROM rexus_document_thread_replies r LEFT JOIN users u ON u.id=r.author_id WHERE r.thread_id=${id} ORDER BY r.created_at`;replies.push(...rows);}
   return Response.json({threads:threads.map((t:any)=>({...t,replies:replies.filter(r=>r.thread_id===t.id)}))});
  }
  if(req.method!=='POST'&&req.method!=='PUT'&&req.method!=='DELETE')return fail('Unsupported method',405);
  const body=await req.json();
  const docId=String(body.document_id||'');
  if(!atLeast(await documentAccess(db,user,docId),'comment'))return forbidden();
  if(req.method==='POST'&&body.action==='create'){
   const quote=String(body.anchor_text||'').trim().slice(0,1500),message=String(body.message||'').trim().slice(0,5000);
   if(!quote||!message)return fail('Select a text passage and enter a comment');
   const d=await db.sql`SELECT id,kind,body FROM rexus_documents WHERE id=${docId}`;
   if(!d.length||d[0].kind!=='page')return fail('Document not found',404);
   // Anchor is a text quote with adjacent context; it need not mutate saved HTML.
   const threadId=newId('RCT'),replyId=newId('RCR');
   await db.sql`INSERT INTO rexus_document_threads(id,document_id,anchor_text,anchor_prefix,anchor_suffix,created_by) VALUES(${threadId},${docId},${quote},${String(body.anchor_prefix||'').slice(0,100)},${String(body.anchor_suffix||'').slice(0,100)},${user.uid})`;
   await db.sql`INSERT INTO rexus_document_thread_replies(id,thread_id,author_id,body) VALUES(${replyId},${threadId},${user.uid},${message})`;
   await logAudit(db,{actorId:user.uid,actorName:user.username,action:'comment_document',entityType:'page',entityId:docId,summary:'Commented on a selected passage'});
   return Response.json({ok:true,id:threadId},{status:201});
  }
  const threadId=String(body.thread_id||'');
  const th=await db.sql`SELECT * FROM rexus_document_threads WHERE id=${threadId} AND document_id=${docId}`;
  if(!th.length)return fail('Comment thread not found',404);
  if(req.method==='POST'&&body.action==='reply'){
   const message=String(body.message||'').trim().slice(0,5000);
   if(!message)return fail('Comment cannot be empty');
   const id=newId('RCR');
   await db.sql`INSERT INTO rexus_document_thread_replies(id,thread_id,author_id,body) VALUES(${id},${threadId},${user.uid},${message})`;
   await db.sql`UPDATE rexus_document_threads SET updated_at=NOW() WHERE id=${threadId}`;
   return Response.json({ok:true,id},{status:201});
  }
  if(req.method==='PUT'&&['resolve','reopen'].includes(body.action)){
   const resolve=body.action==='resolve';
   await db.sql`UPDATE rexus_document_threads SET status=${resolve?'resolved':'open'},resolved_by=${resolve?user.uid:null},resolved_at=${resolve?new Date().toISOString():null},updated_at=NOW() WHERE id=${threadId}`;
   await logAudit(db,{actorId:user.uid,actorName:user.username,action:resolve?'resolve_document_thread':'reopen_document_thread',entityType:'page',entityId:docId,summary:`${resolve?'Resolved':'Reopened'} document comment`});
   return Response.json({ok:true});
  }
  if(req.method==='PUT'&&body.action==='edit'){
   const replyId=String(body.reply_id||''),message=String(body.message||'').trim().slice(0,5000);
   if(!message)return fail('Comment cannot be empty');
   const rows=await db.sql`UPDATE rexus_document_thread_replies SET body=${message},updated_at=NOW() WHERE id=${replyId} AND thread_id=${threadId} AND author_id=${user.uid} RETURNING id`;
   return rows.length?Response.json({ok:true}):fail('Only the author can edit this comment',403);
  }
  if(req.method==='DELETE'&&body.action==='delete_reply'){
   const replyId=String(body.reply_id||'');
   const rows=await db.sql`DELETE FROM rexus_document_thread_replies WHERE id=${replyId} AND thread_id=${threadId} AND author_id=${user.uid} RETURNING id`;
   return rows.length?Response.json({ok:true}):fail('Only the author can delete this comment',403);
  }
  return fail('Unknown action');
 }catch(e:any){return fail('Document comments error: '+e.message,500);}
};
export const config:Config={path:'/api/rexus-document-threads'};
