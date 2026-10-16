import type {Context,Config} from '@netlify/functions';
import {getDatabase} from '@netlify/database';
import {randomUUID} from 'node:crypto';
import {getUserFromRequest,unauthorized} from './lib/auth.mts';
import {targetAccess,canManage,atLeast,forbidden} from './lib/rexus-access.mts';
import {logAudit} from './lib/rexus-audit.mts';
const failure=(message:string,status=400)=>Response.json({error:message},{status});
export default async (req:Request,_context:Context)=>{
 const user=await getUserFromRequest(req);if(!user)return unauthorized();
 const db=getDatabase(),url=new URL(req.url);
 try{
  if(req.method==='GET'){
   const type=url.searchParams.get('type')||'',id=url.searchParams.get('id')||'';
   if(!['space','folder','page'].includes(type)||!id)return failure('Invalid item');
   if(type!=='space'){const obj=await db.sql`SELECT kind FROM rexus_documents WHERE id=${id}`;if(!obj.length||obj[0].kind!==(type==='page'?'page':'folder'))return failure('Item not found',404);}
   const permission=await targetAccess(db,user,type,id);
   if(!atLeast(permission,'view'))return forbidden();
   const manage=await canManage(db,user,type,id);
   const shares=manage?await db.sql`SELECT s.id,s.user_id,s.permission,u.full_name,u.username,u.email FROM rexus_document_shares s JOIN users u ON u.id=s.user_id WHERE s.target_type=${type} AND s.target_id=${id} ORDER BY u.full_name` : [];
   const target=type==='space'?await db.sql`SELECT access_mode FROM rexus_spaces WHERE id=${id}`:await db.sql`SELECT access_mode FROM rexus_documents WHERE id=${id}`;
   return Response.json({permission,can_manage:manage,access_mode:target[0]?.access_mode||'restricted',shares});
  }
  if(!['POST','PUT','DELETE'].includes(req.method))return failure('Unsupported method',405);
  const body=await req.json();
  const type=String(body.type||''),id=String(body.id||'');
  if(!['space','folder','page'].includes(type)||id.length>100||!id)return failure('Invalid item');
  if(type!=='space'){const obj=await db.sql`SELECT kind FROM rexus_documents WHERE id=${id}`;if(!obj.length||obj[0].kind!==type)return failure('Item not found',404);}
  if(!(await canManage(db,user,type,id)))return forbidden();
  if(req.method==='PUT'&&body.action==='access_mode'){
   const mode=String(body.access_mode);
   if(type==='space'&&!['organization','restricted'].includes(mode))return failure('Invalid access mode');
   if(type!=='space'&&!['organization','restricted','inherited'].includes(mode))return failure('Invalid access mode');
   if(type==='space')await db.sql`UPDATE rexus_spaces SET access_mode=${mode} WHERE id=${id}`;
   else await db.sql`UPDATE rexus_documents SET access_mode=${mode} WHERE id=${id}`;
   await logAudit(db,{actorId:user.uid,actorName:user.username,action:'change_document_visibility',entityType:type,entityId:id,summary:`Changed access mode to ${mode}`});
   return Response.json({ok:true,access_mode:mode});
  }
  const userId=String(body.user_id||'');
  const recipient=await db.sql`SELECT id,full_name,username,status FROM users WHERE id=${userId}`;
  if(!recipient.length||recipient[0].status==='Inactive')return failure('Choose an active organization member',404);
  if(userId===user.uid)return failure('You already own this item');
  if(req.method==='DELETE'){
   await db.sql`DELETE FROM rexus_document_shares WHERE target_type=${type} AND target_id=${id} AND user_id=${userId}`;
   await logAudit(db,{actorId:user.uid,actorName:user.username,action:'revoke_document_share',entityType:type,entityId:id,summary:`Revoked access for ${recipient[0].username}`});
   return Response.json({ok:true});
  }
  if(!['view','comment','edit'].includes(body.permission))return failure('Choose View, Comment or Edit');
  const shareId='RSH'+randomUUID().replace(/-/g,'').slice(0,20).toUpperCase();
  await db.sql`INSERT INTO rexus_document_shares(id,target_type,target_id,user_id,permission,granted_by) VALUES(${shareId},${type},${id},${userId},${body.permission},${user.uid}) ON CONFLICT(target_type,target_id,user_id) DO UPDATE SET permission=EXCLUDED.permission,granted_by=EXCLUDED.granted_by,updated_at=NOW()`;
  const titleRows=type==='space'?await db.sql`SELECT name AS title FROM rexus_spaces WHERE id=${id}`:await db.sql`SELECT title FROM rexus_documents WHERE id=${id}`;
  const name=titleRows[0]?.title||'document';
  const nid='NT'+randomUUID().replace(/-/g,'').slice(0,21).toUpperCase();
  await db.sql`INSERT INTO notifications(id,user_id,type,title,message,entity_type,entity_id) VALUES(${nid},${userId},'rexus_document_shared','REXUS Document shared',${`${user.username} shared "${name}" with ${body.permission} access.`},${type},${id})`;
  await logAudit(db,{actorId:user.uid,actorName:user.username,action:'share_document',entityType:type,entityId:id,summary:`Shared "${name}" with ${recipient[0].username} (${body.permission})`});
  return Response.json({ok:true,permission:body.permission});
 }catch(err:any){return failure('Sharing service error: '+err.message,500);}
};
export const config:Config={path:'/api/rexus-document-shares'};
