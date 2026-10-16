/** Server-side REXUS Document authorization, shared by pages, files, comments and sharing.
 * Legacy Spaces default to organization edit access. New Spaces are private;
 * descendants inherit unless explicitly set to organization or restricted.
 * Explicit per-user shares on an ancestor or target grant the specified level.
 */
export type DocPermission = 'none' | 'view' | 'comment' | 'edit';
type User = { uid: string; username: string };
const rank: Record<DocPermission,number> = {none:0,view:1,comment:2,edit:3};
function upper(a:DocPermission,b:DocPermission):DocPermission {return rank[a]>=rank[b]?a:b;}
export function atLeast(actual:DocPermission, required:DocPermission) {return rank[actual]>=rank[required];}
export function forbidden(){return Response.json({error:'You do not have permission to access this item'},{status:403});}
export async function isAdmin(db:any,user:User){
  const rows=await db.sql`SELECT role FROM users WHERE id=${user.uid} LIMIT 1`;
  return rows[0]?.role==='System Admin';
}
export async function spaceAccess(db:any,user:User,spaceId:string):Promise<DocPermission>{
  if(await isAdmin(db,user))return 'edit';
  const rows=await db.sql`SELECT id,created_by,access_mode FROM rexus_spaces WHERE id=${spaceId}`;
  if(!rows.length)return 'none';
  const space=rows[0];
  if(space.created_by===user.uid)return 'edit';
  const direct=await db.sql`SELECT permission FROM rexus_document_shares WHERE user_id=${user.uid} AND target_type='space' AND target_id=${spaceId}`;
  return upper(space.access_mode==='organization'?'edit':'none',(direct[0]?.permission||'none') as DocPermission);
}
export async function documentAccess(db:any,user:User,docId:string):Promise<DocPermission>{
  if(await isAdmin(db,user))return 'edit';
  let id=docId, seen=new Set<string>(), inherited:DocPermission='none';
  while(id && !seen.has(id) && seen.size<60){
    seen.add(id);
    const rows=await db.sql`SELECT id,space_id,parent_id,kind,created_by,access_mode FROM rexus_documents WHERE id=${id}`;
    if(!rows.length)return 'none';
    const doc=rows[0];
    if(doc.created_by===user.uid)return 'edit';
    const direct=await db.sql`SELECT permission FROM rexus_document_shares WHERE target_type=${doc.kind==='folder'?'folder':'page'} AND target_id=${id} AND user_id=${user.uid}`;
    inherited=upper(inherited,(direct[0]?.permission||'none') as DocPermission);
    if(doc.access_mode==='organization')return 'edit';
    if(doc.access_mode==='restricted')return inherited;
    if(!doc.parent_id)return upper(inherited,await spaceAccess(db,user,doc.space_id));
    id=doc.parent_id;
  }
  return inherited;
}
export async function targetAccess(db:any,user:User,type:string,id:string):Promise<DocPermission>{
  if(type==='space')return spaceAccess(db,user,id);
  if(type==='folder'||type==='page')return documentAccess(db,user,id);
  return 'none';
}
export async function fileAccess(db:any,user:User,fileId:string):Promise<DocPermission>{
  const rows=await db.sql`SELECT document_id,folder_id FROM rexus_doc_files WHERE id=${fileId}`;
  if(!rows.length)return 'none';
  return documentAccess(db,user,rows[0].document_id||rows[0].folder_id);
}
export async function canManage(db:any,user:User,type:string,id:string){
  if(await isAdmin(db,user))return true;
  const rows=type==='space'
    ?await db.sql`SELECT created_by FROM rexus_spaces WHERE id=${id}`
    :await db.sql`SELECT created_by FROM rexus_documents WHERE id=${id}`;
  return rows[0]?.created_by===user.uid;
}
/** Efficient list visibility for a document tree (avoids a DB query per node). */
export async function listVisible(db:any,user:User,spaces:any[],docs:any[]){
 const admin=await isAdmin(db,user);
 const shares=admin?[]:await db.sql`SELECT target_type,target_id,permission FROM rexus_document_shares WHERE user_id=${user.uid}`;
 const direct=new Map<string,DocPermission>();
 shares.forEach((s:any)=>direct.set(s.target_type+':'+s.target_id,s.permission));
 const sp=new Map(spaces.map((s:any)=>[s.id,s]));
 const items=new Map(docs.map((d:any)=>[d.id,d]));
 const computed=new Map<string,DocPermission>();
 const score=(a:DocPermission,b:DocPermission)=>upper(a,b);
 const spAccess=(s:any):DocPermission=> admin||s.created_by===user.uid?'edit':score(s.access_mode==='organization'?'edit':'none',direct.get('space:'+s.id)||'none');
 const resolve=(d:any,seen=new Set<string>()):DocPermission=>{
  if(computed.has(d.id))return computed.get(d.id)!;
  if(seen.has(d.id)||seen.size>80)return 'none';
  const seen2=new Set(seen);seen2.add(d.id);
  let level:DocPermission=admin||d.created_by===user.uid?'edit':direct.get((d.kind==='folder'?'folder:':'page:')+d.id)||'none';
  if(d.access_mode==='organization')level='edit';
  if(d.access_mode==='inherited'){
   const parent=items.get(d.parent_id);
   const inherited=parent?resolve(parent,seen2):(sp.get(d.space_id)?spAccess(sp.get(d.space_id)):'none');
   level=score(level,inherited);
  }
  computed.set(d.id,level);return level;
 };
 const visibleDocs=docs.filter((d:any)=>{d.permission=resolve(d);return atLeast(d.permission,'view');});
 const visibleSpaceIds=new Set(visibleDocs.map((d:any)=>d.space_id));
 const visibleSpaces=spaces.filter((s:any)=>{
  const p=spAccess(s);s.permission=p;
  return atLeast(p,'view')||visibleSpaceIds.has(s.id);
 });
 return {spaces:visibleSpaces,documents:visibleDocs};
}
