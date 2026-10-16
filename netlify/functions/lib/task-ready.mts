import {randomUUID,createHash} from 'node:crypto';
import {createNotification} from './notify.mts';
const parsed=(s:any):any[]=>{try{const arr=typeof s==='string'?JSON.parse(s):s;return Array.isArray(arr)?arr:[];}catch{return [];}};
/** Notification-only workflow. Existing JSON dependencies continue working without data migration. */
export async function emitTaskReady(db:any,predecessorId:string){
 const changed=await db.sql`SELECT id,user_id,project FROM tasks WHERE id=${predecessorId}`;
 if(!changed[0])return;
 const owner=changed[0].user_id,project=changed[0].project;
 const projectCfg=await db.sql`SELECT workflow_notifications_enabled,dependencies_enabled,notify_assignee,notify_project_manager FROM projects WHERE user_id=${owner} AND name=${project}`;
 const cfg=projectCfg[0];
 // v2.2.1: notifications only — disabling them never deletes dependencies, and nothing here edits tasks.
 if(!cfg?.workflow_notifications_enabled||cfg.dependencies_enabled===false)return;
 const allTasks=await db.sql`SELECT id,task,status,updated_at,assignee_id,predecessors FROM tasks WHERE user_id=${owner} AND project=${project}`;
 const edges=await db.sql`SELECT d.predecessor_id,d.successor_id FROM rexus_task_dependencies d JOIN tasks t ON t.id=d.successor_id WHERE t.user_id=${owner} AND t.project=${project}`;
 const taskMap=new Map(allTasks.map((t:any)=>[t.id,t]));
 for(const successor of allTasks){
  if(successor.status==='Completed'||successor.id===predecessorId)continue;
  const legacy=parsed(successor.predecessors).filter((p:any)=>p?.id&&(!p.type||p.type==='FS')).map((p:any)=>String(p.id));
  const graph=edges.filter((e:any)=>e.successor_id===successor.id).map((e:any)=>String(e.predecessor_id));
  const preds=[...new Set([...legacy,...graph])].sort();
  if(!preds.includes(predecessorId) || preds.some(id=>(taskMap.get(id) as any)?.status!=='Completed'))continue;
  const signature=createHash('sha256').update(JSON.stringify(preds.map(id=>{const u=(taskMap.get(id) as any).updated_at;return [id,u instanceof Date?u.toISOString():String(u)];}))).digest('hex');
  const rows=await db.sql`INSERT INTO rexus_workflow_events(id,successor_id,dependency_signature) VALUES (${randomUUID()},${successor.id},${signature}) ON CONFLICT(successor_id,dependency_signature) DO NOTHING RETURNING id`;
  if(!rows.length)continue;
  const message=`All prerequisite tasks for '${successor.task}' have been completed. You can now proceed with this task. (Project: ${project})`;
  const recipients=new Set<string>();
  if(cfg.notify_assignee!==false&&successor.assignee_id)recipients.add(successor.assignee_id);
  if(cfg.notify_project_manager)recipients.add(owner);
  for(const who of recipients)await createNotification(db,{userId:who,type:'task_ready',title:'Task Ready to Start',message,entityType:'task',entityId:successor.id,project});
 }
}
