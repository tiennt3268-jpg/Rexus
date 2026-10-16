import type {Context,Config} from '@netlify/functions';
import {getDatabase} from '@netlify/database';
import {getUserFromRequest,unauthorized} from './lib/auth.mts';
export default async(req:Request,_ctx:Context)=>{
 const me=await getUserFromRequest(req);if(!me)return unauthorized();
 if(req.method!=='GET')return Response.json({error:'Method not supported'},{status:405});
 const q=(new URL(req.url).searchParams.get('q')||'').trim().toLowerCase().slice(0,100);
 if(q.length<2)return Response.json({employees:[]});
 const like='%'+q.replace(/[%_\\]/g,'')+'%';
 const db=getDatabase();
 try{
  const rows=await db.sql`SELECT id,full_name,username,email,department,position,avatar,status FROM users WHERE status='Active' AND (LOWER(COALESCE(full_name,'')) LIKE ${like} OR LOWER(COALESCE(username,'')) LIKE ${like} OR LOWER(COALESCE(email,'')) LIKE ${like} OR LOWER(COALESCE(department,'')) LIKE ${like} OR LOWER(COALESCE(position,'')) LIKE ${like} OR LOWER(id) LIKE ${like}) ORDER BY full_name LIMIT 20`;
  return Response.json({employees:rows});
 }catch{return Response.json({error:'Employee search unavailable'},{status:500});}
};
export const config:Config={path:'/api/organization-search'};
