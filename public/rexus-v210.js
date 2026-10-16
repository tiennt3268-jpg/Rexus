/* REXUS 2.1.0 UI integration. No sample business data. */
(function(){'use strict';
const $=(id)=>document.getElementById(id);
const esc=(s)=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=(name)=>{let path={search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',account:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',capacity:'<path d="M3 20h18M6 16v-7h4v7M14 16V4h4v12"/>',approve:'<path d="M5 3h10l4 4v14H5zM15 3v5h4M8 14l3 3 5-6"/>',finance:'<path d="M3 19h18M5 14l5-5 4 3 5-8M16 4h3v4"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M7 3v4M17 3v4"/>',download:'<path d="M12 3v13m-5-5 5 5 5-5M4 18v3h16v-3"/>',add:'<path d="M12 4v16M4 12h16"/>',back:'<path d="m15 5-7 7 7 7"/>'}[name]||'<path d="M4 12h16"/>';return '<span class="rx210-glyph"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg></span>';};
async function api(url,opts){let r=await fetch(url,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...opts});let j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||'Request failed ('+r.status+')');return j;}
function panel(node,title,lead,tools=''){node.innerHTML='<div class="rx210-title"><div><h2>'+esc(title)+'</h2><p>'+esc(lead)+'</p></div>'+tools+'</div><div id="rx210Content"></div>';return $('rx210Content');}
function loading(node){node.innerHTML='<div class="rx210-glass">Loading current data…</div>';}
function error(node,e){node.innerHTML='<div class="rx210-alert">'+esc(e.message||e)+'</div>';}
const field=(label,id,type='text',value='')=>'<label class="rx210-field"><span>'+esc(label)+'</span><input id="'+esc(id)+'" type="'+type+'" value="'+esc(value)+'"></label>';
const button=(id,label,iconName)=>'<button id="'+id+'" class="rx210-btn">'+esc(label)+'</button>';
function rowTable(headers,rows){return '<div class="rx210-table-wrap"><table class="rx210-table"><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>';}
function fmt(v){return Number(v||0).toLocaleString('en-US',{maximumFractionDigits:2});}
function organization(node){
 node.innerHTML='<div class="rx210-title"><div><h2>Organization</h2><p>Search for an employee to view their information.</p></div></div><div class="rx210-glass"><label class="rx210-search">'+icon('search')+'<input id="rx210EmpQuery" aria-label="Find an employee" placeholder="Search by name, ID, email, department, or job title…" autocomplete="off"></label><div id="rx210EmpResults" role="listbox">Enter at least two characters to search.</div><section id="rx210EmpDetails" hidden></section></div>';
 let timer,sequence=0;const input=$('rx210EmpQuery'),list=$('rx210EmpResults'),detail=$('rx210EmpDetails');
 input.addEventListener('input',()=>{clearTimeout(timer);const q=input.value.trim(),turn=++sequence;detail.hidden=true;list.hidden=false;
  if(q.length<2){list.textContent='Enter at least two characters to search.';return;}
  list.textContent='Searching…';timer=setTimeout(async()=>{try{const out=await api('/api/organization-search?q='+encodeURIComponent(q));if(turn!==sequence)return;
   if(!out.employees.length){list.textContent='No matching employees.';return;}
   list.innerHTML=out.employees.map((u,i)=>'<button class="rx210-person" type="button" role="option" data-i="'+i+'">'+icon('account')+'<span><strong>'+esc(u.full_name||u.username)+'</strong><small>'+esc(u.department||'')+' · '+esc(u.position||'')+'</small></span></button>').join('');
   list.querySelectorAll('button').forEach(btn=>btn.onclick=()=>{const u=out.employees[Number(btn.dataset.i)];list.hidden=true;detail.hidden=false;detail.innerHTML='<h3>'+esc(u.full_name||u.username)+'</h3><div class="rx210-details">'+[['Employee ID',u.id],['Email',u.email],['Department',u.department],['Job title',u.position],['Employment status',u.status]].map(pair=>'<div><small>'+esc(pair[0])+'</small><strong>'+esc(pair[1]||'—')+'</strong></div>').join('')+'</div>';});
  }catch(e){if(turn===sequence)error(list,e);}},250);
 });
 input.addEventListener('keydown',function(e){if(e.key==='Escape'){list.hidden=true;input.blur();}if(e.key==='ArrowDown'){var first=list.querySelector('button');if(first&&!list.hidden){e.preventDefault();first.focus();}}});
 list.addEventListener('keydown',function(e){if(e.key==='Escape'){list.hidden=true;input.focus();}});
 // Results should never obscure the selected employee or adjacent modules.
 document.addEventListener('pointerdown',function(e){if(!node.contains(input)||!node.isConnected)return;if(!e.target.closest('#rx210EmpQuery,#rx210EmpResults'))list.hidden=true;},{signal:undefined});
}
function resource(node){
 const today=new Date(),first=today.toISOString().slice(0,7)+'-01',last=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth()+1,0)).toISOString().slice(0,10);
 const content=panel(node,'Resource Planning','Capacity and workload from your REXUS employees, allocations and Worklogs.','');
 content.innerHTML='<div class="rx210-glass rx210-filters">'+field('From','rx210ResourceFrom','date',first)+field('To','rx210ResourceTo','date',last)+button('rx210ResourceLoad','Apply filters','search')+'</div><div id="rx210ResourceData"></div>';
 async function load(){const target=$('rx210ResourceData');loading(target);try{const r=await api('/api/resource-planning?from='+encodeURIComponent($('rx210ResourceFrom').value)+'&to='+encodeURIComponent($('rx210ResourceTo').value));
 let cap=r.employees.reduce((s,u)=>s+u.working_capacity,0),planned=r.employees.reduce((s,u)=>s+u.planned_hours,0),over=r.employees.filter(u=>u.status==='Overloaded').length;
 target.innerHTML='<div class="rx210-metrics"><article><small>Employees</small><strong>'+r.employees.length+'</strong></article><article><small>Working capacity (h)</small><strong>'+fmt(cap)+'</strong></article><article><small>Allocated (h)</small><strong>'+fmt(planned)+'</strong></article><article><small>Overloaded</small><strong>'+over+'</strong></article></div>'+rowTable(['Employee','Department','Capacity','Planned','Actual','Available','Utilization'],r.employees.map(u=>'<tr><td>'+esc(u.name)+'</td><td>'+esc(u.department||'—')+'</td><td>'+fmt(u.working_capacity)+' h</td><td>'+fmt(u.planned_hours)+' h</td><td>'+fmt(u.actual_hours)+' h</td><td>'+fmt(u.available_capacity)+' h</td><td><span class="rx210-status '+(u.status==='Overloaded'?'danger':u.status==='Available'?'success':'warning')+'">'+esc(u.status)+'</span> '+(u.utilization==null?'—':fmt(u.utilization)+'%')+'</td></tr>'));
 }catch(e){error(target,e);}}
 $('rx210ResourceLoad').onclick=load;load();
}
function approvals(node){
 const content=panel(node,'Approval Center','Requests you submitted or are authorized to review.');
 content.innerHTML='<div class="rx210-glass rx210-filters"><label class="rx210-field"><span>View</span><select id="rx210ApprovalTab"><option value="pending">Pending my approval</option><option value="mine">My requests</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All accessible</option></select></label>'+button('rx210NewApproval','New review','add')+'</div><div id="rx210ApprovalData"></div>';
 async function load(){const target=$('rx210ApprovalData');loading(target);try{const data=await api('/api/approval-center?tab='+$('rx210ApprovalTab').value);target.innerHTML=!data.requests.length?'<div class="rx210-glass">No requests in this view.</div>':rowTable(['Request','Status','Approvers','Action'],data.requests.map(r=>'<tr><td><strong>'+esc(r.title)+'</strong><br><small>'+esc(r.request_type)+'</small></td><td><span class="rx210-status">'+esc(r.status)+'</span></td><td>'+r.steps.map(s=>esc(s.full_name||s.approver_id)+' ('+esc(s.decision)+')').join('<br>')+'</td><td>'+(r.steps.some(s=>s.decision==='Pending')&&r.status==='Pending'?'<button class="rx210-btn rx210-decide" data-id="'+esc(r.id)+'" data-decision="Approved">Approve</button> <button class="rx210-btn rx210-decide" data-id="'+esc(r.id)+'" data-decision="Rejected">Reject</button>':'—')+'</td></tr>'));
 target.querySelectorAll('.rx210-decide').forEach(b=>b.onclick=async()=>{const decision=b.dataset.decision,reason=decision==='Rejected'?prompt('Reason for rejection (required)'):'';if(decision==='Rejected'&&!reason)return;try{await api('/api/approval-center',{method:'POST',body:JSON.stringify({action:'decide',id:b.dataset.id,decision,reason})});load();}catch(e){alert(e.message);}});
 }catch(e){error(target,e);}}
 $('rx210ApprovalTab').onchange=load;
 $('rx210NewApproval').onclick=async()=>{const title=prompt('Review title');if(!title)return;const approver=prompt('Approver REXUS User ID (existing user)');if(!approver)return;try{await api('/api/approval-center',{method:'POST',body:JSON.stringify({action:'create',type:'project_change_review',title,approvers:[approver],mode:'single'})});load();}catch(e){alert(e.message);}};
 load();
}
function financials(node){
 const content=panel(node,'Project Financials','Income, expenses, authorization and actual disbursements remain separate.');
 content.innerHTML='<div class="rx210-glass rx210-filters"><label class="rx210-field"><span>Project</span><select id="rx210FinancialProject"><option value="">Select project…</option></select></label>'+button('rx210RefreshFinance','Refresh','finance')+'</div><div id="rx210FinancialData" class="rx210-glass">Select a project to view its transactions.</div>';
 const proj=$('rx210FinancialProject');
 async function load(){if(!proj.value)return;const target=$('rx210FinancialData');loading(target);
  try{const r=await api('/api/project-financials?project='+encodeURIComponent(proj.value));
   target.innerHTML='<h3>'+esc(r.project)+' — Financial summary</h3><p>Approved budget: <strong>'+fmt(r.approved_budget)+'</strong> '+esc(r.budget_currency||'VND')+'</p><div class="rx210-metrics">'+r.summary.map(s=>'<article><small>'+esc(s.currency)+' · Cash received</small><strong>'+fmt(s.received)+'</strong><small>Expenses '+fmt(s.expenses)+' · Net '+fmt(s.net_cash)+'</small></article>').join('')+'</div><div class="rx210-filters">'+button('rx210AddIncome','Add income','add')+button('rx210AddExpense','Add expense','add')+button('rx210NewDisbursement','New disbursement','finance')+'</div>'+rowTable(['Reference','Type','Amount','Status'],r.transactions.map(t=>'<tr><td>'+esc(t.reference)+'</td><td>'+esc(t.type)+'</td><td>'+fmt(t.amount)+' '+esc(t.currency)+'</td><td>'+esc(t.status)+(t.status==='Draft'?' <button class="rx210-btn rx210-confirm" data-id="'+esc(t.id)+'">Confirm</button>':'')+'</td></tr>'))+'<h3>Disbursement requests</h3>'+rowTable(['Purpose','Requested','Approved','Status','Action'],r.disbursements.map(d=>'<tr><td>'+esc(d.purpose)+'</td><td>'+fmt(d.requested_amount)+' '+esc(d.currency)+'</td><td>'+fmt(d.approved_amount||0)+'</td><td>'+esc(d.status)+'</td><td>'+(['Approved','Partially Disbursed'].includes(d.status)?'<button type="button" class="rx210-btn rx210-pay" data-id="'+esc(d.id)+'" data-max="'+esc(d.approved_amount)+'">Record payment</button>':'—')+'</td></tr>'));
   target.querySelectorAll('.rx210-confirm').forEach(b=>b.onclick=async()=>{if(!confirm('Confirm this cash movement?'))return;try{await api('/api/project-financials',{method:'POST',body:JSON.stringify({action:'confirm_transaction',id:b.dataset.id,project:proj.value})});load();}catch(e){alert(e.message);}});
   function add(type){return async()=>{let amount=Number(prompt(type+' amount')),currency=prompt('Currency ISO code (e.g. VND)','VND'),reference=prompt('Unique payment reference');if(!(amount>0)||!currency||!reference)return;try{await api('/api/project-financials',{method:'POST',body:JSON.stringify({action:'add_transaction',project:proj.value,type,amount,currency,reference})});load();}catch(e){alert(e.message);}};}
   $('rx210AddIncome').onclick=add('Income');$('rx210AddExpense').onclick=add('Expense');
   $('rx210NewDisbursement').onclick=async()=>{
    const amount=Number(prompt('Requested amount')),currency=prompt('Currency (ISO code)','VND'),purpose=prompt('Purpose'),approver=prompt('Approver REXUS User ID (existing user)');
    if(!(amount>0)||!currency||!purpose||!approver)return;
    try{
      const response=await api('/api/project-financials',{method:'POST',body:JSON.stringify({action:'request_disbursement',project:proj.value,amount,currency,purpose})});
      try{
       await api('/api/approval-center',{method:'POST',body:JSON.stringify({action:'create',type:'project_disbursement',title:'Disbursement: '+purpose,source_type:'disbursement',source_id:response.id,approvers:[approver],mode:'single'})});
       alert('Disbursement request submitted to Approval Center.');
      }catch(e){alert('Disbursement created but approval request failed: '+e.message+'. Please contact an administrator with request ID '+response.id);}
      load();
    }catch(e){alert(e.message);}
   };
   target.querySelectorAll('.rx210-pay').forEach(b=>b.onclick=async()=>{
    const amount=Number(prompt('Actual payment amount (approved limit: '+b.dataset.max+')'));
    const reference=prompt('Unique payment reference');
    if(!(amount>0)||!reference)return;
    if(!confirm('Confirm real disbursement of '+fmt(amount)+'? This will be permanently recorded.'))return;
    try{await api('/api/project-financials',{method:'POST',body:JSON.stringify({action:'pay_disbursement',project:proj.value,id:b.dataset.id,amount,reference})});load();}catch(e){alert(e.message);}
   });
  }catch(e){error(target,e);}}
 api('/api/projects').then(x=>{const list=x.projects||x||[];proj.innerHTML='<option value="">Select project…</option>'+list.map(p=>'<option value="'+esc(p.name)+'">'+esc(p.name)+'</option>').join('');}).catch(e=>error($('rx210FinancialData'),e));
 proj.onchange=load;$('rx210RefreshFinance').onclick=load;
}
window.REXUS210={organization,resource,approvals,financials};
})();
