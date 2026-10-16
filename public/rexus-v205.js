/* REXUS v2.0.5 • Application launcher, glossy emoji iconography, audit viewer. */
(function(){
 'use strict';
 var $=function(q,ctx){return (ctx||document).querySelector(q)}, $$=function(q,ctx){return Array.from((ctx||document).querySelectorAll(q))};
 var menu=$('#rexusLauncherMenu'),trigger=$('#rexusLauncherButton');
 function closeLauncher(){if(menu){menu.hidden=true;trigger.setAttribute('aria-expanded','false');}}
 window.REXUSv205={closeLauncher:closeLauncher};
 if(trigger&&menu){
   trigger.addEventListener('click',function(e){e.stopPropagation();menu.hidden=!menu.hidden;trigger.setAttribute('aria-expanded',String(!menu.hidden));});
   menu.addEventListener('click',function(e){if(e.target.closest('[data-rexus-app]'))closeLauncher();});
   document.addEventListener('click',function(e){if(!e.target.closest('#rexusAppSwitch'))closeLauncher();});
   document.addEventListener('keydown',function(e){if(e.key==='Escape')closeLauncher();});
 }
 // Original REXUS 2D icon strokes. No emoji text and no third-party icon font.
 function glass(symbol,tone){
   var paths={
     home:'<path d="M3.5 10 12 3l8.5 7v10.5h-6V15h-5v5.5h-6z"/>',
     task:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>',
     folder:'<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3z"/>',
     clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
     calendar:'<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7.5 3v4m9-4v4M3.5 10h17"/>',
     team:'<circle cx="9" cy="8" r="3"/><path d="M2.5 20v-3a6.5 6.5 0 0 1 13 0v3M17 6a3 3 0 0 1 0 6m1 2c2.5.5 3.5 2.5 3.5 5"/>',
     finance:'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18m-6 5h3"/>',
     edit:'<path d="m4 20 4-.7L20 7l-4-4L4 15.3zM14 5l4 4"/>',
     delete:'<path d="M4 6h16M9 6V4h6v2m-9 0 1 15h10l1-15M10 10v7m4-7v7"/>',
     open:'<path d="M5 12v7h14v-7M11 3h10v10m0-10L10 14"/>',
     close:'<path d="M5 5 19 19M19 5 5 19"/>',
     back:'<path d="m14.5 4-8 8 8 8"/>',
     add:'<path d="M12 4v16M4 12h16"/>',
     share:'<circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="m8 11 8-5M8 13l8 5"/>',
     download:'<path d="M12 3v13m-4-4 4 4 4-4M4 18v3h16v-3"/>',
     upload:'<path d="M12 18V5m-4 4 4-4 4 4M4 17v4h16v-4"/>',
     save:'<path d="M4 3h13l3 3v15H4zM7 3v7h9V3M7 21v-8h10v8"/>',
     search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
     document:'<path d="M5 3h10l4 4v14H5zM15 3v5h4M8 12h8M8 16h8"/>',
     bell:'<path d="M18 8a6 6 0 0 0-12 0c0 6-3 9-3 9h18s-3-3-3-9M10 21h4"/>',
     note:'<path d="M4 5h16v14H8l-4 3zM8 10h8M8 14h6"/>',
     grid:'<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
     link:'<path d="M10 13a5 5 0 0 0 8-1l2-2a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-8 1l-2 2a5 5 0 0 0 7 7l2-2"/>'
   };
   var key= /🏠|⌂/.test(symbol)?'home':/✅|☑/.test(symbol)?'task':/🗂|📁|▣/.test(symbol)?'folder':/⏱|🕘|↩|↪/.test(symbol)?'clock':/📅/.test(symbol)?'calendar':/👥/.test(symbol)?'team':/💳/.test(symbol)?'finance':/✏/.test(symbol)?'edit':/🗑/.test(symbol)?'delete':/↗/.test(symbol)?'open':/✖|✕/.test(symbol)?'close':/⬅/.test(symbol)?'back':/➕|＋/.test(symbol)?'add':/🔗/.test(symbol)?'link':/📥/.test(symbol)?'download':/📤/.test(symbol)?'upload':/💾/.test(symbol)?'save':/🔎/.test(symbol)?'search':/📃|📄|▤/.test(symbol)?'document':/🔔/.test(symbol)?'bell':/📚/.test(symbol)?'grid':/💬/.test(symbol)?'note':'document';
   var n=document.createElement('span');n.className='rx-glass-icon';n.setAttribute('aria-hidden','true');if(tone)n.dataset.tone=tone;
   n.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[key]+'</svg>';
   return n;
 }

 var nav={overview:['🏠','blue'],all:['✅','mint'],projects:['🗂️','indigo'],worklog:['⏱️','purple'],calendar:['📅','orange'],organization:['👥','mint'],finance:['💳','green']};
 var actions={edit:['✏️','blue'],delete:['🗑️','red'],open:['↗️','mint'],close:['✖️','red'],back:['⬅️','indigo'],add:['➕','green'],share:['🔗','mint'],download:['📥','indigo'],upload:['📤','mint'],save:['💾','blue'],search:['🔎','blue']};
 var tools={undo:'↩️',redo:'↪️',link:'🔗','page-link':'📃','insert-table':'🔢','insert-image':'🖼️','insert-file':'📎','insert-callout':'💡','insert-quote':'💬','insert-code':'💻','insert-checklist':'☑️','insert-hr':'➖','removeFormat':'🧹'};
 function enhance(){
  $$('.wm-tab .wm-tab-icon').forEach(function(el){if(el.dataset.rxDecorated)return;var p=el.closest('.wm-tab');var it=p&&nav[p.dataset.view];if(!it)return;el.replaceChildren(glass(it[0],it[1]));el.dataset.rxDecorated='1';});
  $$('.wm-icon-btn, .wm-glass-icon-btn').forEach(function(b){if(b.dataset.rxDecorated||!b.querySelector('svg'))return;var key=(b.dataset.action||b.getAttribute('title')||'').toLowerCase();key=key.includes('delete')||key.includes('remove')?'delete':key.includes('edit')?'edit':key.includes('back')?'back':key.includes('close')?'close':key.includes('share')?'share':key.includes('open')?'open':null;if(!key)return;var it=actions[key];b.replaceChildren(glass(it[0],it[1]));b.dataset.rxDecorated='1';b.classList.add('rx-decorated');});
  $$('.rd-list-icon,.rd-home-icon').forEach(function(n){if(n.dataset.rxDecorated)return;var ch=n.textContent.trim();n.classList.add('rx-glass-icon');if(/📎|⇧/.test(ch)){n.replaceChildren(glass('📎','mint'));n.dataset.tone='mint';}else if(/📁|🗂️|▣/.test(ch)){n.replaceChildren(glass('🗂️','purple'));n.dataset.tone='purple';}else if(/▤|📄|📃/.test(ch)){n.replaceChildren(glass('📃','indigo'));n.dataset.tone='indigo';}n.dataset.rxDecorated='1';});
  $$('.rd-nav-row').forEach(function(n){if(n.dataset.rxDecorated)return;var first=n.firstChild, iconEl=n.querySelector(':scope > span:first-child');if(first&&first.nodeType===3&&first.nodeValue.trim()){var raw=first.nodeValue.trim();first.nodeValue='';n.insertBefore(glass(/⌂/.test(raw)?'🏠':'📎', /⌂/.test(raw)?'blue':'mint'),n.firstChild);}else if(iconEl&&!iconEl.querySelector('svg')){var symbol=iconEl.textContent.trim();iconEl.replaceChildren(glass(symbol==='▤'?'📃':symbol==='📁'?'🗂️':symbol||'📄',symbol==='📁'?'purple':'blue'));}n.dataset.rxDecorated='1';});
  $$('.rd-tool[data-rte]').forEach(function(b){if(b.dataset.rxDecorated)return;var icon=tools[b.dataset.rte];if(icon){b.replaceChildren(glass(icon,'blue'));b.classList.add('rx-emoji-tool');}b.dataset.rxDecorated='1';});
  $$('.wm-attach-row .wm-attach-icon').forEach(function(svg){var p=svg.parentNode;if(!p)return;var isFile=svg.getAttribute('viewBox')==='0 0 24 24' && /M14 2/.test(svg.innerHTML);p.replaceChild(glass(isFile?'📎':'🔗',isFile?'indigo':'mint'),svg);});
  $$('.wm-notif-icon').forEach(function(n){if(n.dataset.rxDecorated||!n.querySelector('svg'))return;n.replaceChildren(glass('🔔','indigo'));n.dataset.rxDecorated='1';});
  $$('.rd-icon-btn[data-rd="new-space"]').forEach(function(n){if(n.dataset.rxDecorated)return;n.replaceChildren(glass('➕','blue'));n.classList.add('rx-emoji-tool');n.dataset.rxDecorated='1';});
  var bell=$('#wmNotifBellBtn');if(bell&&!bell.dataset.rxDecorated){var svg=bell.querySelector('svg');if(svg){svg.replaceWith(glass('🔔','indigo'));bell.dataset.rxDecorated='1';}}
  var search=$('.wm-gsearch-icon');if(search&&!search.dataset.rxDecorated){var parent=search.parentNode;var g=glass('🔎','blue');g.classList.add('rx-search-icon');parent.replaceChild(g,search);g.dataset.rxDecorated='1';}
 }
 enhance();
 // The legacy app creates and replaces rows using innerHTML. Keep the icon
 // presentation in sync without touching its view logic or event listeners.
 var scheduled=false;var observer=new MutationObserver(function(){if(!scheduled){scheduled=true;requestAnimationFrame(function(){scheduled=false;enhance();});}});
 var app=$('.wm-app');if(app)observer.observe(app,{childList:true,subtree:true});

 var auditScreen, auditList, auditScope='mine', auditPage=0, auditEvents=[];
 function createAudit(){if(auditScreen)return;
   auditScreen=document.createElement('section');auditScreen.className='rx-audit-screen';auditScreen.hidden=true;auditScreen.setAttribute('role','dialog');auditScreen.setAttribute('aria-modal','true');auditScreen.setAttribute('aria-label','REXUS user activity');
   auditScreen.innerHTML='<div class="rx-audit-panel"><header class="rx-audit-header"><div><div class="rx-audit-title" id="rxAuditTitle">🕘 My Activity</div><div class="rx-audit-subtitle">Server-verified event history • REXUS + REXUS Document</div></div><button type="button" class="rx-audit-btn" id="rxAuditClose" aria-label="Close activity history">✕ Close</button></header><div class="rx-audit-filters"><input id="rxAuditSearch" type="search" placeholder="Search users, actions, document titles…" aria-label="Filter audit events"><button type="button" class="rx-audit-btn" id="rxAuditRefresh">↻ Refresh</button></div><main class="rx-audit-list" id="rxAuditList" aria-live="polite"></main><footer class="rx-audit-footer"><small id="rxAuditCounter">–</small><div><button type="button" class="rx-audit-btn" id="rxAuditPrevious">← Previous</button> <button type="button" class="rx-audit-btn" id="rxAuditNext">Next →</button></div></footer></div>';
   document.body.appendChild(auditScreen);auditList=$('#rxAuditList');
   auditScreen.addEventListener('click',function(e){if(e.target===auditScreen)hideAudit();});
   $('#rxAuditClose').onclick=hideAudit;$('#rxAuditRefresh').onclick=loadAudit;
   $('#rxAuditSearch').addEventListener('input',renderAudit);
   $('#rxAuditPrevious').onclick=function(){if(auditPage>0){auditPage--;loadAudit();}};
   $('#rxAuditNext').onclick=function(){if(auditEvents.length===80){auditPage++;loadAudit();}};
 }
 function hideAudit(){if(auditScreen){auditScreen.hidden=true;}}
 function auditEmoji(action){if(/login|logout/.test(action))return '🔐';if(/file|upload/.test(action))return '📎';if(/document|space/.test(action))return '📚';if(/delete/.test(action))return '🗑️';if(/task/.test(action))return '✅';if(/project/.test(action))return '🗂️';return '🕘';}
 function safeText(el,value){el.textContent=String(value==null?'':value);return el;}
 function renderAudit(){if(!auditList)return;var filter=($('#rxAuditSearch').value||'').trim().toLowerCase();auditList.replaceChildren();
   var shown=auditEvents.filter(function(e){return [e.actor_username,e.summary,e.action,e.entity_type,e.entity_id].some(function(t){return String(t||'').toLowerCase().includes(filter);});});
   if(!shown.length){var empty=document.createElement('p');empty.style.padding='20px 0';empty.textContent='No matching activity events.';auditList.appendChild(empty);}
   shown.forEach(function(e){var row=document.createElement('article');row.className='rx-audit-event';row.appendChild(glass(auditEmoji(e.action),/delete/.test(e.action)?'red':'indigo'));var content=document.createElement('div');content.className='rx-audit-event-text';
     content.appendChild(safeText(document.createElement('strong'),e.summary||e.action));var detail=document.createElement('p');detail.textContent=[e.actor_username,e.action,e.entity_type].filter(Boolean).join(' · ');content.appendChild(detail);
     var time=document.createElement('small');var d=new Date(e.created_at);time.textContent=(isNaN(d.getTime())?'':d.toLocaleString('en-GB'))+(e.entity_id?'  ·  ID: '+e.entity_id:'');content.appendChild(time);row.appendChild(content);auditList.appendChild(row);});
   $('#rxAuditCounter').textContent='Page '+(auditPage+1)+' · '+shown.length+' event(s)'+(filter?' matching filter':'');$('#rxAuditPrevious').disabled=auditPage===0;$('#rxAuditNext').disabled=auditEvents.length!==80;
 }
 async function loadAudit(){if(!auditList)return;auditList.textContent='Loading verified activity…';try{
   var r=await fetch('/api/rexus-audit?scope='+encodeURIComponent(auditScope)+'&limit=80&page='+auditPage,{credentials:'same-origin'});var data=await r.json();if(!r.ok)throw new Error(data.error||'Unable to load audit history');auditEvents=data.events||[];renderAudit();
  }catch(err){auditList.textContent='Could not load activity: '+err.message;}}
 function openAudit(scope){createAudit();auditScope=scope==='all'?'all':'mine';auditPage=0;auditScreen.hidden=false;$('#rxAuditTitle').textContent=auditScope==='all'?'🛡️ Audit Log · All Users':'🕘 My Activity';$('#rxAuditSearch').value='';loadAudit();var menu=$('#wmUserMenu');if(menu)menu.style.display='none';}
 document.addEventListener('click',function(e){var b=e.target.closest('[data-audit]');if(b){e.stopPropagation();openAudit(b.dataset.audit);}});
 document.addEventListener('keydown',function(e){if(e.key==='Escape'&&auditScreen&&!auditScreen.hidden)hideAudit();});
})();
