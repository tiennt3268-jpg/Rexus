/* REXUS v2.0.7: white outline 2D icons on liquid-glass tiles. Visual only. */
(function(){
'use strict';
var P={
 grid:'<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
 home:'<path d="m3.5 10 8.5-7 8.5 7V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V10Z"/><path d="M9 21v-7h6v7"/>',
 check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
 folder:'<path d="M3 6a2 2 0 0 1 2-2h5l2.2 2.5H19a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
 folders:'<path d="M5 7V5a2 2 0 0 1 2-2h4l2 2h5a2 2 0 0 1 2 2v2"/><path d="M3 10a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
 document:'<path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v6h5M9 13h7M9 17h7"/>',
 book:'<path d="M4 4h7a3 3 0 0 1 3 3v14a3 3 0 0 0-3-3H4zM14 7a3 3 0 0 1 3-3h3v14h-3a3 3 0 0 0-3 3"/>',
 layers:'<path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h3v3H8Z"/>',
 users:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M17 15a5 5 0 0 1 4 5"/>',
 wallet:'<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M3 9V5a2 2 0 0 1 2-2h13M15 13h6v5h-6a2.5 2.5 0 0 1 0-5Z"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 bell:'<path d="M18 9a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9ZM10 22h4"/>',
 edit:'<path d="M12 20h9M16 4l4 4L8 20l-5 1 1-5L16 4Zm0 0 2-2a2 2 0 0 1 3 3l-1 1"/>',
 trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
 arrow:'<path d="M7 17 17 7M8 7h9v9"/>',
 back:'<path d="m15 5-7 7 7 7"/>',
 close:'<path d="M5 5l14 14M19 5 5 19"/>',
 plus:'<path d="M12 4v16M4 12h16"/>',
 link:'<path d="M9 15l6-6M8 11l-2 2a4 4 0 0 0 6 6l2-2M16 13l2-2a4 4 0 0 0-6-6l-2 2"/>',
 upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
 download:'<path d="M12 3v13m-5-5 5 5 5-5M4 18v3h16v-3"/>',
 save:'<path d="M4 3h13l3 3v15H4V3ZM7 3v6h9V3M7 21v-8h10v8"/>',
 paperclip:'<path d="m8 12 6-6a4 4 0 0 1 6 6l-9 9a6 6 0 0 1-9-9l9-9"/>',
 image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m3 18 5-5 4 3 3-4 6 6"/>',
 table:'<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 10h18M3 15h18M10 4v16M16 4v16"/>',
 quote:'<path d="M10 9H4v9h7v-6H8V9m12 0h-6v9h7v-6h-3V9"/>',
 code:'<path d="m8 7-5 5 5 5M16 7l5 5-5 5m-3-13-3 16"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.5"/>',
 history:'<path d="M3 11a9 9 0 1 1 3 7M3 4v7h7M12 7v5l4 2"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
 shield:'<path d="m12 2 9 4v6c0 5-3.5 8-9 10-5.5-2-9-5-9-10V6l9-4ZM8 12l3 3 5-6"/>',
 undo:'<path d="M8 7 3 12l5 5M3 12h11a6 6 0 1 1 0 12"/>',
 redo:'<path d="m16 7 5 5-5 5m5-5H10a6 6 0 1 0 0 12"/>',
 printer:'<path d="M6 8V3h12v5M6 17H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6zM18 11h1"/>',
 paint:'<path d="M3 3h12v8H3zM9 11v4m-3 0h6M9 15v6M16 6h5v5h-5M18.5 11v6"/>',
 palette:'<path d="M12 3a9 9 0 0 0 0 18h2a2 2 0 0 0 2-2 2 2 0 0 0-.5-1.5A2 2 0 0 1 17 14h2a2 2 0 0 0 2-2 9 9 0 0 0-9-9Z"/><circle cx="8" cy="10" r=".8"/><circle cx="12" cy="7" r=".8"/><circle cx="16" cy="10" r=".8"/>',
 highlighter:'<path d="m14 4 6 6-9 9-6-6 9-9ZM3 21h11M5 13l6 6"/>',
 eraser:'<path d="m9 4 12 12-5 5H9L3 15 9 4ZM7 19h14"/>',
 list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/>',
 ordered:'<path d="M9 6h12M9 12h12M9 18h12M3 5l2-1v5M3 13c1-2 4-2 4 0 0 1-4 3-4 4h4"/>',
 alignLeft:'<path d="M4 5h16M4 9h11M4 13h16M4 17h10"/>',
 alignCenter:'<path d="M4 5h16M7 9h10M4 13h16M8 17h8"/>',
 alignRight:'<path d="M4 5h16M9 9h11M4 13h16M10 17h10"/>',
 alignFull:'<path d="M4 5h16M4 9h16M4 13h16M4 17h16"/>',
 chart:'<path d="M4 21V4M4 21h17M8 17V9h3v8M13 17V5h3v12M18 17v-6h3v6"/>',
 bookmark:'<path d="M6 3h12v18l-6-4-6 4V3Z"/>',
 light:'<path d="M9 18h6M10 21h4M12 3a7 7 0 0 0-4 12c1.5 1 2 2 2 3h4c0-1 1-2 2-3A7 7 0 0 0 12 3Z"/>',
 dots:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
 minus:'<path d="M4 12h16"/>',
 date:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M9 14h6M12 12v5"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>'
};
var emoji={ '🏠':'home','✅':'check','🗂️':'folders','⏱️':'clock','📅':'calendar','👥':'users','💳':'wallet','✏️':'edit','🗑️':'trash','↗️':'arrow','✖️':'close','⬅️':'back','➕':'plus','🔗':'link','📥':'download','📤':'upload','💾':'save','🔎':'search','📎':'paperclip','📁':'folder','📂':'folder','📄':'document','📃':'document','▤':'document','▣':'layers','📚':'book','💼':'folders','🔔':'bell','🔐':'lock','🕘':'history','🛡️':'shield','📕':'document','📗':'table','📝':'edit','▦':'table','⇧':'upload','📊':'chart','⌨️':'code','📑':'list','🔖':'bookmark','☑️':'check','📆':'date','💡':'light','💬':'quote','🖼️':'image','🖌️':'paint','🖍️':'highlighter','🎨':'palette','🧹':'eraser','🧰':'table','💻':'code','↩️':'undo','↪️':'redo','🖨️':'printer','➖':'minus'};
var rte={undo:'undo',redo:'redo',print:'printer','format-painter':'paint',foreColor:'palette',hiliteColor:'highlighter',removeFormat:'eraser',insertUnorderedList:'list',insertOrderedList:'ordered','insert-checklist':'check',justifyLeft:'alignLeft',justifyCenter:'alignCenter',justifyRight:'alignRight',justifyFull:'alignFull',indent:'alignRight',outdent:'alignLeft','line-spacing':'list',link:'link','page-link':'bookmark','insert-table':'table','table-tools':'table',toc:'list','insert-mermaid':'chart','insert-image':'image','insert-file':'paperclip','insert-html':'code','insert-callout':'light','insert-quote':'quote','insert-code':'code','insert-date':'date','insert-hr':'minus','insert-break':'document'};
var rdAction={'new-page':'document','new-folder':'folder','upload-file':'upload','new-space':'plus','edit-page':'edit','share-page':'link','export-menu':'download','toggle-details':'info','doc-options':'dots','file-options':'dots','rename-doc':'edit','move':'folder','export-word':'download','export-pdf':'download','cancel-edit':'close'};
function svg(name){var markup=P[name]||P.document;var ns='http://www.w3.org/2000/svg',node=document.createElementNS(ns,'svg');node.setAttribute('viewBox','0 0 24 24');node.setAttribute('fill','none');node.setAttribute('stroke','currentColor');node.setAttribute('stroke-width','1.8');node.setAttribute('stroke-linecap','round');node.setAttribute('stroke-linejoin','round');node.setAttribute('aria-hidden','true');node.classList.add('rx-2d-svg');node.innerHTML=markup;return node;}
function convert(n,name){if(!n||n.dataset.rx2d==='1')return;n.replaceChildren(svg(name));n.dataset.rx2d='1';n.setAttribute('aria-hidden','true');}
function fromText(text){return emoji[text]|| (/folder|space/i.test(text)?'folder':/upload|attach/i.test(text)?'paperclip':/search/i.test(text)?'search':/file|document/i.test(text)?'document':'layers');}
function apply(){
 // Legacy UI can redraw nodes. This pass is idempotent and preserves click handlers.
 document.querySelectorAll('.rx-glass-icon:not([data-rx2d]), .rx-app-emoji:not([data-rx2d]), .rx-home-hero-icon:not([data-rx2d]), .rd-home-icon:not([data-rx2d]), .rd-list-icon:not([data-rx2d]), .rd-drive-icon:not([data-rx2d]), .rd-icon-btn:not([data-rx2d])').forEach(function(n){
  // v2.2.0 fix: chips already drawn by rexus-v205.js contain a purpose-specific SVG
  // (edit, delete, close, nav…) and no text. The old fallback replaced every one of
  // them with the same generic "layers" glyph, so all icon buttons looked identical.
  if(n.querySelector('svg')){n.dataset.rx2d='1';return;}
  var text=n.textContent.trim();var name=fromText(text);
  if(n.classList.contains('rx-home-hero-icon'))name='book';
  if(n.classList.contains('rx-app-work'))name='folders';
  if(n.classList.contains('rx-app-document'))name='book';
  if(n.classList.contains('rd-icon-btn'))name='plus';
  if(n.classList.contains('rd-drive-icon')){if(/📁/.test(text))name='folder';else if(/📗/.test(text))name='table';else name='document';}
  convert(n,name);
 });
 document.querySelectorAll('#rexusDocsShell .rd-tool[data-rte]:not([data-rx2d])').forEach(function(n){var type=rte[n.dataset.rte];if(!type)return;convert(n,type);n.classList.add('rx-outline-tool');n.removeAttribute('aria-hidden');});
 document.querySelectorAll('#rexusDocsShell .rd-nav-row:not([data-rx2d])').forEach(function(n){
  var action=n.dataset.rd||'';var name=action==='overview'?'home':action==='all-files'?'document':action==='space'?'folders':action==='doc'?(n.closest('.rd-tree-line')?.querySelector('[data-rd="toggle-folder"]')?'folder':'document'):'folder';
  var span=n.firstElementChild;
  if(span&&span.tagName==='SPAN'&&span.nextElementSibling){span.replaceChildren(svg(name));span.classList.add('rx-glass-icon');span.dataset.rx2d='1';span.setAttribute('aria-hidden','true');}
  else if(n.firstChild&&n.firstChild.nodeType===3){n.firstChild.textContent=' ';var ic=document.createElement('span');ic.className='rx-glass-icon';ic.dataset.rx2d='1';ic.setAttribute('aria-hidden','true');ic.appendChild(svg(name));n.insertBefore(ic,n.firstChild);}
  n.dataset.rx2d='1';
 });
 document.querySelectorAll('#rexusDocsShell .rd-button[data-rd]:not([data-rx2d])').forEach(function(n){
  var icon=rdAction[n.dataset.rd];if(!icon)return;
  // Text buttons need no pictogram. The three-dot icon-only menu keeps the glyph.
  if(n.textContent.trim()!=='⋯'){n.dataset.rx2d='1';return;}
  // Keep the complete button text and data-rd handler; only strip decorative emoji prefix.
  var label=n.textContent.replace(/^(?:📁|📝|⬆|⬇|✎|↗|↓|☷|⚙|⋯|\+|＋)\s*/u,'').trim();
  var el=document.createElement('span');el.className='rx-mini-icon';el.setAttribute('aria-hidden','true');el.appendChild(svg(icon));
  n.replaceChildren(el,document.createTextNode(' '+label));n.dataset.rx2d='1';
 });
 var head=document.querySelector('#rexusDocsShell .rd-side-head strong');if(head&&!head.dataset.rx2d){head.textContent=head.textContent.replace(/^[📚\s]+/u,'');var e=document.createElement('span');e.className='rx-mini-icon';e.appendChild(svg('book'));head.prepend(e);head.dataset.rx2d='1';}
 // Replace remaining editor/folder heading emoji with the same outlined glass treatment.
 document.querySelectorAll('#rexusDocsShell .rd-edit-meta:not([data-rx2d]), #rexusDocsShell .rd-folder-side h3:not([data-rx2d])').forEach(function(n){
  var txt=n.textContent||'';var m=/^(?:📝|📁|💬)\s*/u.exec(txt);
  if(!m)return;
  var icon=m[0].includes('📁')?'folder':m[0].includes('💬')?'quote':'edit';
  n.firstChild.textContent=n.firstChild.textContent.replace(m[0],'');
  var glyph=document.createElement('span');glyph.className='rx-mini-icon';glyph.appendChild(svg(icon));n.insertBefore(glyph,n.firstChild);n.dataset.rx2d='1';
 });
 var bell=document.querySelector('#wmNotifBellBtn');if(bell&&!bell.dataset.rx2d){var bare=bell.querySelector('svg:not(.rx-2d-svg)');if(bare)bare.replaceWith(svg('bell'));bell.dataset.rx2d='1';}
}
var queued=false;function schedule(){if(queued)return;queued=true;requestAnimationFrame(function(){queued=false;apply();});}
apply();
var app=document.querySelector('.wm-app');if(app)new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
})();
