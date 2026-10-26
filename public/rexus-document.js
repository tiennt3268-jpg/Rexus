/* REXUS Document v2.0.5 — independent workspace, shared authenticated session.
 * No external framework. All user supplied strings are escaped before HTML.
 */
(function () {
  'use strict';
  var root = document.querySelector('.wm-app');
  if (!root) return;
  var shell = document.getElementById('rexusDocsShell');
  var switcher = document.getElementById('rexusAppSwitch');
  var baseUrl = '/api/rexus-documents';
  var fileUrl = '/api/rexus-document-files';
  var commentUrl='/api/rexus-folder-comments';
  var shareUrl='/api/rexus-document-shares',threadUrl='/api/rexus-document-threads';
  var spaceMenuOpen=false;
  var collapsedTreeFolders=new Set();
  // v2.2.2 DOC-01: sidebar sections can be shown/hidden; remembered per browser.
  var collapsedSections = (function(){ try { return new Set(JSON.parse(localStorage.getItem('rd-collapsed-sections') || '[]')); } catch (e) { return new Set(); } })();
  // DOC-01: one chevron for every expand/collapse control in the sidebar (same size, position and motion); it points down when open.
  var CHEV = '<svg class="rd-chev" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6"/></svg>';
  function sectionHead(key, label){ var closed = collapsedSections.has(key); return '<button type="button" class="rd-section-title rd-section-toggle" data-rd="toggle-section" data-id="' + key + '" aria-expanded="' + (!closed) + '" aria-controls="rdSec-' + key + '"><span class="rd-section-chevron" aria-hidden="true">' + CHEV + '</span><span>' + label + '</span></button>'; }
  var state = { spaces: [], documents: [], files: [], spaceId: '', folderId: '', pageId: '', home: true, search: '', searchScope: 'all', edit: false, dirty: false, busy: false, details: false, folderComments: [], sort: 'name', filter: 'all', userId: '', selected: new Set(), threads: [], commentPanel: false, activeThread: '', error: '', loaded: false };
  function el(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function date(v) { try { return new Date(v).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }); } catch (_) { return ''; } }
  function bytes(n) { return (Number(n || 0) < 1024 ? Number(n || 0) + ' B' : Number(n) < 1048576 ? Math.round(Number(n)/1024) + ' KB' : (Number(n)/1048576).toFixed(1) + ' MB'); }
  function docById(id) { return state.documents.find(function (d) { return d.id === id; }); }
  function spaceById(id) { return state.spaces.find(function (d) { return d.id === id; }); }
  function perm(d,level){return !!d && ['edit','comment','view'].indexOf(d.permission)>=0 && ['view','comment','edit'].indexOf(d.permission)>=['view','comment','edit'].indexOf(level);}
  function pages() { return state.documents.filter(function (d) { return d.kind === 'page'; }); }
  // A prefixed HTML body keeps existing plain-text pages backward compatible.
  // The DOM whitelist is applied both when displaying saved pages and before
  // submitting content. User HTML never goes directly into the live document.
  var RICH = '<!--REXUS-RICH-V1-->';
  var allowedTags = new Set(['P','DIV','BR','H1','H2','H3','H4','H5','H6','NAV','STRONG','B','EM','I','U','S','DEL','UL','OL','LI','BLOCKQUOTE','PRE','CODE','HR','A','TABLE','THEAD','TBODY','TR','TH','TD','SPAN','IMG','INPUT','ASIDE','SUB','SUP','FONT']);
  function safeUrl(url, image) {
    var raw=String(url||'').trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (!image && /^mailto:[^\s@]+@[^\s@]+$/i.test(raw)) return raw;
    if (!image && /^#document\/[A-Za-z0-9%_-]+$/.test(raw)) return raw;
    if (!image && /^#rexus-(?:project|task|subtask)\/[A-Za-z0-9%_.~-]+$/.test(raw)) return raw;
    if (!image && /^#rdh-[a-zA-Z0-9_-]+$/.test(raw)) return raw;
    if (/^\/api\/rexus-document-files\?file=RF[A-Za-z0-9]+(?:&preview=1)?$/.test(raw)) return raw;
    return '';
  }
  function cleanRich(html) {
    var parsed = new DOMParser().parseFromString('<body>'+String(html||'')+'</body>','text/html');
    var out = document.createElement('div');
    function visit(from,to) {
      Array.from(from.childNodes).forEach(function(node){
        if (node.nodeType===3) {to.appendChild(document.createTextNode(node.nodeValue||''));return;}
        if (node.nodeType!==1) return;
        var tag=node.tagName;
        if (['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','FORM','TEMPLATE','LINK','META','VIDEO','AUDIO'].includes(tag))return;
        if (!allowedTags.has(tag)) {visit(node,to);return;}
        if(tag==='IMG') {
          var source=safeUrl(node.getAttribute('src'),true);
          if(!source)return;
          var image=document.createElement('img');image.setAttribute('src',source);image.setAttribute('alt',String(node.getAttribute('alt')||'').slice(0,160));image.setAttribute('loading','lazy');to.appendChild(image);return;
        }
        if(tag==='INPUT') {
          if(node.getAttribute('type')!=='checkbox')return;
          var check=document.createElement('input');check.type='checkbox';check.disabled=true;if(node.checked)check.setAttribute('checked','');to.appendChild(check);return;
        }
        var copy=document.createElement(tag==='FONT'?'span':tag.toLowerCase());
        if(tag==='FONT'){var fontColor=(node.getAttribute('color')||'').trim().toLowerCase();if(/^#[0-9a-f]{3,8}$/.test(fontColor))copy.style.color=fontColor;}
        if(tag==='A') {
          var href=safeUrl(node.getAttribute('href'),false);
          if(href){copy.setAttribute('href',href);copy.setAttribute('target','_blank');copy.setAttribute('rel','noopener noreferrer');}
        }
        var align=(node.getAttribute('align')||'').toLowerCase();
        if(['left','right','center','justify'].includes(align))copy.style.textAlign=align;
        var className=node.getAttribute('class')||'';
        if((tag==='ASIDE'||tag==='DIV')&&className.split(/\s+/).includes('rd-callout'))copy.className='rd-callout';
        if(tag==='NAV' && className.split(/\s+/).includes('rd-toc'))copy.className='rd-toc';
        if(tag==='A' && className.split(/\s+/).includes('rd-rexus-reference'))copy.className='rd-rexus-reference';
        if(tag==='PRE' && className.split(/\s+/).includes('rd-mermaid')) {copy.className='rd-mermaid';copy.setAttribute('data-code',String(node.getAttribute('data-code')||node.textContent||'').slice(0,10000));}
        if(/^H[1-6]$/.test(tag)&&/^rdh-[a-zA-Z0-9_-]+$/.test(node.id))copy.id=node.id;
        if(tag==='UL'&&className.split(/\s+/).includes('rd-checklist'))copy.className='rd-checklist';
        var inline=node.getAttribute('style')||'';
        // Allow basic editor color/alignment output, not arbitrary CSS or URLs.
        inline.split(';').forEach(function(declaration){
          var parts=declaration.split(':');if(parts.length!==2)return;
          var prop=parts[0].trim().toLowerCase(),value=parts[1].trim().toLowerCase();
          if(['color','background-color'].includes(prop) && /^(#[0-9a-f]{3,8}|rgb\([0-9, %]+\)|rgba\([0-9,. %]+\))$/.test(value))copy.style.setProperty(prop,value);
          if(prop==='text-align'&&['left','center','right','justify'].includes(value))copy.style.textAlign=value;
        });
        if(['SPAN','P','DIV'].includes(tag)) {
          var family=(node.style.fontFamily||'').replace(/["']/g,'').trim();
          if(/^(Arial|Georgia|Calibri|Times New Roman|Verdana|Inter|monospace|serif|sans-serif)$/i.test(family))copy.style.fontFamily=family;
          var fsize=node.style.fontSize||'';if(/^(1[2-9]|2[0-8])px$/.test(fsize))copy.style.fontSize=fsize;
        }
        if(['TD','TH'].includes(tag) && node.style.width && /^(\d{1,2}|100)%$/.test(node.style.width)) copy.style.width=node.style.width;
        if(['P','DIV','SPAN','LI'].includes(tag) && node.style.lineHeight && /^(1|1\.15|1\.5|2|2\.5)$/.test(node.style.lineHeight)) copy.style.lineHeight=node.style.lineHeight;
        if(tag==='TH'||tag==='TD') {
          var colspan=Number(node.getAttribute('colspan'));
          if(Number.isInteger(colspan)&&colspan>1&&colspan<=8)copy.colSpan=colspan;
        }
        visit(node,copy);to.appendChild(copy);
      });
    }
    visit(parsed.body,out);
    return out.innerHTML;
  }
  function contentHtml(d) {
    var raw=String(d.body||'');
    return raw.startsWith(RICH) ? cleanRich(raw.slice(RICH.length)) : (raw ? '<p>'+esc(raw).replace(/\r?\n/g,'<br>')+'</p>' : '');
  }
  function searchableBody(d) {
    var raw=String(d.body||'');
    if(!raw.startsWith(RICH))return raw;
    var parsed=new DOMParser().parseFromString(cleanRich(raw.slice(RICH.length)),'text/html');
    return parsed.body.textContent||'';
  }
  function guardDraft(){return !state.edit || !state.dirty || confirm('You have unsaved changes. Leave this page without saving?');}
  var savedRange=null;
  function rememberCursor(){
    var surface=el('rdRichSurface'),selection=window.getSelection();
    if(surface&&selection&&selection.rangeCount&&surface.contains(selection.anchorNode))savedRange=selection.getRangeAt(0).cloneRange();
  }
  function focusCursor(){
    var surface=el('rdRichSurface');if(!surface)return;
    surface.focus();
    try{if(savedRange&&surface.contains(savedRange.startContainer)){var selection=window.getSelection();selection.removeAllRanges();selection.addRange(savedRange);}}catch(_){}
  }
  function insertMarkup(html){
    focusCursor();document.execCommand('insertHTML',false,cleanRich(html));markDirty();rememberCursor();
  }
  function markDirty(){state.dirty=true;var indicator=el('rdDraftStatus');if(indicator){indicator.textContent='● Unsaved changes';indicator.classList.add('dirty');}}
  function editorToolbar(){
    function tool(action,symbol,label){return '<button type="button" class="rd-tool" data-rte="'+action+'" title="'+label+'" aria-label="'+label+'">'+symbol+'</button>';}
    return '<div class="rd-toolbar rd-compact-toolbar" role="toolbar" aria-label="Document formatting">'+
      '<div class="rd-tools">'+tool('undo','↶','Undo')+tool('redo','↷','Redo')+'</div>'+
      '<div class="rd-tools"><label class="rd-sr-only" for="rdBlockType">Paragraph style</label><select id="rdBlockType" class="rd-block-select" title="Paragraph style"><option value="p">Normal text</option>'+[1,2,3,4,5,6].map(function(n){return '<option value="h'+n+'">Heading '+n+'</option>';}).join('')+'</select><select id="rdFontFamily" class="rd-block-select rd-font" aria-label="Font family">'+['Arial','Calibri','Georgia','Times New Roman','Verdana','Inter'].map(function(f){return '<option>'+f+'</option>';}).join('')+'</select><select id="rdFontSize" class="rd-block-select rd-font-size" aria-label="Font size">'+[12,14,16,18,20,24,28].map(function(n){return '<option value="'+n+'"'+(n===16?' selected':'')+'>'+n+'</option>';}).join('')+'</select></div>'+
      '<div class="rd-tools">'+tool('bold','<b>B</b>','Bold')+tool('italic','<i>I</i>','Italic')+tool('underline','<u>U</u>','Underline')+'</div>'+
      '<div class="rd-tools rd-tool-lists">'+tool('insertUnorderedList','☷','Bulleted list')+tool('insertOrderedList','1≡','Numbered list')+tool('justifyLeft','⇤','Align left')+'</div>'+
      '<div class="rd-tools"><button type="button" class="rd-button rd-insert-button" id="rdInsertMenuBtn" title="Insert content">＋ Insert <span aria-hidden="true">⌄</span></button><button type="button" class="rd-button rd-tool-more" id="rdMoreFormattingBtn" title="More formatting options">More <span aria-hidden="true">⌄</span></button></div></div>';
  }

  var autosaveTimer=null,saveInFlight=null;
  function getDraft() {
    var form=el('rdPageEdit'), surface=el('rdRichSurface');if(!form||!surface)return null;
    var node=surface.cloneNode(true);
    node.querySelectorAll('input[type=checkbox]').forEach(function(b){if(b.checked)b.setAttribute('checked','');else b.removeAttribute('checked');});
    return {title:form.elements.title.value.trim(),body:RICH+cleanRich(node.innerHTML),labels:(docById(state.pageId)?.labels||[])};
  }
  function editorPage(d){
    return '<div class="rd-editor-shell"><form class="rd-editor" id="rdPageEdit">'+
      '<div class="rd-edit-top"><div class="rd-edit-meta">Live document <span class="rd-micro-note">· Pageless</span></div><div class="rd-actions"><span id="rdDraftStatus" class="rd-draft-status" aria-live="polite">All changes saved</span><button class="rd-button primary" type="submit">Save</button><button type="button" class="rd-button rd-doc-action-menu" data-rd="editor-actions" aria-label="Document actions">Actions ⌄</button></div></div>'+
      editorToolbar()+
      '<div class="rd-paper"><input class="rd-paper-title" name="title" maxlength="200" required aria-label="Document name" placeholder="Untitled document" value="'+esc(d.title)+'">'+
      '<div id="rdRichSurface" class="rd-rich-surface" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Document content" data-placeholder="Start writing here…">'+contentHtml(d)+'</div></div>'+
      '</form></div>';
  }
  function detailsPanel(d){
    if(!state.details)return '';
    var files=state.files.filter(function(f){return f.document_id===d.id;});
    return '<aside class="rd-details-panel"><div class="rd-details-head"><strong>Document details</strong>'+btn('✕','toggle-details')+'</div>'+
      '<p><strong>Created</strong><br>'+date(d.created_at)+'</p><p><strong>Last updated</strong><br>'+date(d.updated_at)+'</p><p><strong>Created by</strong><br>'+esc(d.created_by||'Unknown')+'</p><p><strong>Version</strong><br>v'+Number(d.version||1)+'</p>'+
      '<div class="rd-side-section"><strong>Labels</strong><div class="rd-tagbox">'+(d.labels||[]).map(function(l){return '<button class="rd-tag" data-rd="search-label" data-label="'+esc(l)+'">#'+esc(l)+'</button>';}).join('')+'</div><label class="rd-label-input">Edit labels<input id="rdDetailsLabels" value="'+esc((d.labels||[]).join(', '))+'" placeholder="Separate with commas"></label>'+btn('Apply labels','apply-labels')+'</div>'+
      '<div class="rd-side-section"><strong>Version history</strong><p>'+esc(String(d.version))+' saved versions</p>'+btn('View history','history-page')+'</div>'+
      '<div class="rd-side-section"><strong>Sharing</strong><p>Internal REXUS link</p>'+btn('Share page','share-target','',d.id)+'</div>'+
      '<div class="rd-side-section"><strong>Attachments ('+files.length+')</strong>'+files.slice(0,15).map(function(f){return '<p><a href="'+fileUrl+'?file='+encodeURIComponent(f.id)+'">📎 '+esc(f.name)+'</a></p>';}).join('')+btn('Upload file','upload-file')+'</div></aside>';
  }
  function editorCommand(action) {
    var surface=el('rdRichSurface');if(!surface)return;
    rememberCursor();
    if(action==='print'){exportPdf();return;}
    if(action==='format-painter'){formatPaint();return;}
    if(action==='insert-html'){insertHtmlDialog();return;}
    if(action==='insert-mermaid'){insertMermaidDialog();return;}
    if(action==='toc'){insertOrRefreshToc();return;}
    if(action==='table-tools'){editTable();return;}
    if(action==='line-spacing'){var sp=prompt('Line spacing (1, 1.15, 1.5, 2):','1.5');if(sp&&/^(1|1.15|1.5|2)$/.test(sp)){focusCursor();var anchor=window.getSelection()?.anchorNode,parent=anchor?.nodeType===3?anchor.parentElement:anchor?.closest?.('p,li,div');if(parent){parent.style.lineHeight=sp;markDirty();}else toast('Place cursor inside a paragraph first',true);}return;}
    if(action==='insert-date'){insertMarkup('<p>'+esc(new Date().toLocaleDateString('en-GB'))+'</p>');return;}
    if(action==='insert-break'){insertMarkup('<hr><p><br></p>');return;}
    if (action==='link') {
      var selected=String(window.getSelection()||'').trim();var url=prompt('Link URL (https://, mailto: or internal page):','https://');
      if(url===null)return;
      var valid=safeUrl(url,false);if(!valid)return toast('Invalid link URL',true);
      if(selected){focusCursor();document.execCommand('createLink',false,valid);}
      else insertMarkup('<a href="'+esc(valid)+'">'+esc(valid)+'</a>');
    }else if(action==='page-link') {
      var choices=pages().filter(function(p){return p.id!==state.pageId;}).map(function(p){return{label:p.title,subtitle:spaceById(p.space_id)?.name||'Space',value:p};});
      choice('Insert internal page link',choices,function(item){insertMarkup('<a href="#document/'+encodeURIComponent(item.value.id)+'">'+esc(item.value.title)+'</a>');});
      return;
    }else if(action==='insert-table'){
      tablePicker();
    }else if(action==='insert-callout'){insertMarkup('<aside class="rd-callout"><p>💡 Important note — type here</p></aside><p><br></p>');}
    else if(action==='insert-code'){insertMarkup('<pre><code>// Your code here</code></pre><p><br></p>');}
    else if(action==='insert-quote'){insertMarkup('<blockquote><p>Quote</p></blockquote><p><br></p>');}
    else if(action==='insert-checklist'){insertMarkup('<ul class="rd-checklist"><li><input type="checkbox" disabled> Action item</li></ul><p><br></p>');}
    else if(action==='insert-hr'){insertMarkup('<hr><p><br></p>');}
    else if(action==='insert-image'){upload('','image');return;}
    else if(action==='insert-file'){upload('','file');return;}
    else {focusCursor();document.execCommand(action,false,action==='foreColor'?'#1162db':action==='hiliteColor'?'#d3edff':null);}
    markDirty();rememberCursor();
  }
  function moreFormattingMenu(){
    rememberCursor();
    choice('Formatting options',[
      {label:'Strikethrough',subtitle:'Strike selected text',value:'strikeThrough'},
      {label:'Superscript / Subscript',subtitle:'Use superscript (next: subscript)',value:'superscript'},
      {label:'Subscript',subtitle:'Lower selected text',value:'subscript'},
      {label:'Text color',subtitle:'Change selected text color',value:'foreColor'},
      {label:'Highlight',subtitle:'Highlight selected text',value:'hiliteColor'},
      {label:'Remove formatting',subtitle:'Clear selected text style',value:'removeFormat'},
      {label:'Checklist',subtitle:'Insert task checklist',value:'insert-checklist'},
      {label:'Align center',subtitle:'Center paragraph',value:'justifyCenter'},
      {label:'Align right',subtitle:'Align paragraph right',value:'justifyRight'},
      {label:'Justify',subtitle:'Justify paragraph',value:'justifyFull'},
      {label:'Indent / Outdent',subtitle:'Increase indent',value:'indent'},
      {label:'Outdent',subtitle:'Decrease indent',value:'outdent'},
      {label:'Line spacing',subtitle:'Configure paragraph line spacing',value:'line-spacing'},
      {label:'Format painter',subtitle:'Copy and apply selected formatting',value:'format-painter'},
      {label:'Table tools',subtitle:'Manage current table rows and columns',value:'table-tools'},
      {label:'Print / Save PDF',subtitle:'Print content',value:'print'}
    ],function(item){editorCommand(item.value);});
  }
  function editorActions(){
    choice('Document actions',[
      {label:'Comment on selection',subtitle:'Start a discussion on highlighted text',value:'comment-selection'},
      {label:'Discussion threads',subtitle:'View replies and resolved threads',value:'toggle-comments'},
      {label:'Export Word',subtitle:'Download editable DOCX',value:'export-word'},
      {label:'Print / Export PDF',subtitle:'Save a PDF through browser print',value:'export-pdf'},
      {label:'Document details',subtitle:'Labels, history, sharing and attachments',value:'toggle-details'},
      {label:'Close editor',subtitle:'Return to reading view',value:'cancel-edit'}
    ],function(item){var proxy=document.createElement('button');proxy.dataset.rd=item.value;el('rexusDocsShell').appendChild(proxy);proxy.click();proxy.remove();});
  }
  // Keep toolbar state synchronized with the actual selected paragraph.
  function syncParagraphStyle(){
    var select=el('rdBlockType'),surface=el('rdRichSurface'),sel=window.getSelection();
    if(!select||!surface||!sel||!sel.anchorNode||!surface.contains(sel.anchorNode))return;
    var node=sel.anchorNode.nodeType===3?sel.anchorNode.parentElement:sel.anchorNode;
    var block=node?.closest('h1,h2,h3,h4,h5,h6,p,div,li,blockquote');
    var tag=block?.tagName?.toLowerCase()||'p';select.value=/^h[1-6]$/.test(tag)?tag:'p';
  }
  async function insertRexusItem(type){
    var endpoints={project:'/api/projects',task:'/api/tasks',subtask:'/api/subtasks'};
    try{
      var res=await request(endpoints[type]);
      var list=type==='project'?(res.projects||[]):type==='task'?(res.tasks||[]):(res.subtasks||[]);
      var items=list.slice(0,350).map(function(row){
        var identity=type==='project'?(row.name||''):(row.id||'');
        return {label:row.name||row.title||row.task||row.task_name||row.id||'Untitled',subtitle:(type==='project'?'Project':type==='task'?'Task':'Subtask')+' · '+(row.project||row.project_name||row.id||''),value:identity};
      }).filter(function(x){return x.value;});
      if(!items.length)return toast('No accessible '+type+' records found.',true);
      choice('Insert '+type,items,function(item){
        // In-editor link references use existing accessible REXUS IDs. Preview is
        // resolved server-side when opened; no confidential data is embedded.
        var href='#rexus-'+type+'/'+encodeURIComponent(item.value);
        insertMarkup('<a class="rd-rexus-reference" href="'+esc(href)+'" title="Open '+esc(type)+'">'+esc(type.toUpperCase())+' · '+esc(item.label)+'</a>&nbsp;');
      });
    }catch(err){toast('Unable to load '+type+': '+err.message,true);}
  }
  function sharePage(){
    var d=docById(state.pageId);if(!d)return;
    closeDialog();var url=location.origin+location.pathname+'#document/'+encodeURIComponent(d.id);
    var wrap=document.createElement('div');wrap.className='rd-dialog-wrap';wrap.id='rdDialogWrap';
    wrap.innerHTML='<div class="rd-dialog" role="dialog" aria-modal="true"><h3>Share this document</h3><p class="rd-share-intro">Send a direct link to this page. Access requires an active REXUS account; existing workspace access applies.</p><label>Page link<input id="rdShareLink" readonly value="'+esc(url)+'"></label><p id="rdShareStatus" class="rd-note" style="margin:11px 0">Not publicly accessible. Anyone signed in with REXUS access can open and edit this page.</p><div class="rd-actions" style="justify-content:flex-end"><button class="rd-button" data-rd="close-dialog">Close</button><button class="rd-button primary" id="rdCopyShare">Copy link</button></div></div>';
    document.body.appendChild(wrap);
    el('rdCopyShare').onclick=async function(){
      try{
      await request(baseUrl, 'POST', { action: 'share_link', id: d.id });
      if(navigator.clipboard&&navigator.clipboard.writeText)await navigator.clipboard.writeText(url);
      else {var input=el('rdShareLink');input.select();if(!document.execCommand('copy'))throw new Error('Copy failed');}
      el('rdShareStatus').textContent='Link copied — share it with your REXUS team.';
      }catch(_){el('rdShareStatus').textContent='Select the link above and copy it manually.';}
    };
    wrap.addEventListener('click',function(e){if(e.target===wrap)closeDialog();});
  }
  // GEN-10: the shared centred notification. Guidance ("Select text first") is a warning, progress an info.
  function toast(text, bad) {
    var t = String(text || ''), kind = bad || /failed|unable to|could not/i.test(t) ? 'error'
      : /…$/.test(t) ? 'info'
      : /^(select|place|save your|save changes|open a|only |no items|use |share from|share folders|this cell|you cannot|title required)|unavailable|still loading|first\.?$/i.test(t) ? 'warning' : 'success';
    if (window.REXUSNotify) return window.REXUSNotify(t, kind);
  }
  async function request(path, method, data) {
    var opts = { method: method || 'GET', credentials: 'same-origin' };
    if (data !== undefined) { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(data); }
    var response = await fetch(path, opts);
    var json; try { json = await response.json(); } catch (_) { throw new Error('Server returned an invalid response'); }
    if (!response.ok || json.error) throw new Error(json.error || 'Request failed (' + response.status + ')');
    return json;
  }
  async function refresh(preserve) {
    try {
      var results = await Promise.all([request(baseUrl), request(fileUrl)]);
      state.spaces = results[0].spaces || [];
      state.documents = results[0].documents || [];
      state.files = results[1].files || [];
      if (!preserve || !spaceById(state.spaceId)) state.spaceId = state.spaces.length ? state.spaces[0].id : '';
      if (state.folderId && !docById(state.folderId)) state.folderId = '';
      if (state.pageId && !docById(state.pageId)) { state.pageId = ''; state.edit = false; state.dirty = false; }
      state.error = ''; state.loaded = true;
      if(state.pageId) {try{state.threads=(await request(threadUrl+'?document='+encodeURIComponent(state.pageId))).threads||[];}catch(_){state.threads=[];}}
      if(state.folderId) {try{state.folderComments=(await request(commentUrl+'?folder='+encodeURIComponent(state.folderId))).comments||[];}catch(_){state.folderComments=[];}}
    } catch (err) { state.error = err.message; }
    render();
  }
  function setMode(mode) {
    var docs = mode === 'document';
    root.classList.toggle('rexus-document-mode', docs);
    var docSearch=el('rdHeaderSearchWrap');
    if(docSearch)docSearch.hidden=!docs;
    if(docs)syncHeaderSearch();
    if (switcher) switcher.querySelectorAll('[data-rexus-app]').forEach(function(b){
      var active = b.dataset.rexusApp === (docs ? 'document' : 'rexus');
      b.classList.toggle('rx-selected', active);
      b.setAttribute('aria-current', active ? 'page' : 'false');
    });
    document.title = docs ? 'REXUS Document' : 'REXUS – Work Management';
    var title = root.querySelector('.wm-title');
    if (title) title.innerHTML = docs ? 'REXUS <span class="rx-doc-word">Document</span>' : 'REXUS';
    if(window.REXUSv205 && window.REXUSv205.closeLauncher) window.REXUSv205.closeLauncher();
    var header = root.querySelector('.wm-header'); if (header) document.documentElement.style.setProperty('--wm-header-h', header.offsetHeight + 'px');
  }
  function open(documentId) {
    if(!guardDraft())return;
    setMode('document');
    state.home = !documentId;
    allFilesMode = false;
    if (!documentId) { state.search = ''; state.pageId = ''; state.folderId = ''; state.edit = false; }
    if (documentId) {
      state.pageId = documentId;
      state.folderId = '';
      if(state.loaded && docById(documentId)?.kind==='folder'){state.folderId=documentId;state.pageId='';}
      state.edit = false;
      if (state.loaded && docById(documentId)) state.spaceId = docById(documentId).space_id;
    }
    refresh(true).then(function () {
      if (documentId && docById(documentId)) {state.spaceId = docById(documentId).space_id;if(docById(documentId).kind==='folder'){state.folderId=documentId;state.pageId='';}}
      render();
    });
  }
  function home() {
    if(!guardDraft())return;
    setMode('rexus');
    if (/^#document\//.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  }
  function gotoDocument(id, updateHash) {
    if(!guardDraft())return;
    state.home = false;
    var doc = docById(id);
    if (!doc) { toast('This document could not be found.', true); return; }
    allFilesMode=false; state.spaceId = doc.space_id; state.edit = false; state.dirty = false;
    state.pageId = doc.kind === 'page' ? id : '';
    state.folderId = doc.kind === 'folder' ? id : '';
    state.search = '';
    if (updateHash !== false) history.replaceState(null, '', '#document/' + encodeURIComponent(id));
    if(doc.kind==='folder')loadFolderComments();
    else request(threadUrl+'?document='+encodeURIComponent(id)).then(function(r){if(state.pageId===id){state.threads=r.threads||[];if(!(state.edit&&state.dirty))render();}}).catch(function(e){toast(e.message,true);});
    render();
  }
  function spaceRoute(id,restoreRoute) { if(!spaceById(id))return; if(!guardDraft())return; spaceMenuOpen=false; if(!restoreRoute)history.pushState(null,'','#space/'+encodeURIComponent(id)); state.home = false; allFilesMode=false; state.spaceId = id; state.pageId = ''; state.folderId = ''; state.search = ''; state.edit = false; if(/^#document\//.test(location.hash))history.replaceState(null,'',location.pathname+location.search);render(); }
  function icon(d) { return d.kind === 'folder' ? fileGlyph('folder') : fileGlyph('document'); }
  function fileGlyph(kind){return kind==='folder'?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3z"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h10l4 4v14H5zM15 3v5h4M8 12h8M8 16h8"/></svg>';}
  function treeItems(spaceId, parentId, depth, visited) {
    if (depth > 10) return '';
    var children = state.documents.filter(function (d) { return d.space_id === spaceId && (d.parent_id || '') === (parentId || ''); });
    return children.map(function (d) {
      if (visited[d.id]) return '';
      var v = Object.assign({}, visited); v[d.id] = true;
      var isFolder=d.kind==='folder',isCollapsed=collapsedTreeFolders.has(d.id);
      return '<div class="rd-tree-node"><div class="rd-tree-line" style="padding-left:'+Math.min(depth,8)*13+'px">'+
        (isFolder?'<button class="rd-tree-toggle" type="button" data-rd="toggle-folder" data-id="'+esc(d.id)+'" aria-label="'+(isCollapsed?'Expand ':'Collapse ')+esc(d.title)+'" aria-expanded="'+(!isCollapsed)+'">'+CHEV+'</button>':'<span class="rd-tree-spacer" aria-hidden="true"></span>')+
        '<button class="rd-nav-row ' + ((state.folderId === d.id || state.pageId === d.id) ? 'active' : '') + '" data-rd="doc" data-id="' + esc(d.id) + '" title="' + esc(d.title) + '"><span>' + icon(d) + '</span><span>' + esc(d.title) + '</span></button></div>'+
       (isFolder&&!isCollapsed ? '<div class="rd-tree-children">'+treeItems(spaceId, d.id, depth+1, v)+'</div>' : '')+'</div>';
    }).join('');
  }
  function renderSidebar() {
    var current=spaceById(state.spaceId);
    var accessible=state.spaces.filter(function(sp){return perm(sp,'view') || state.documents.some(function(d){return d.space_id===sp.id;});});
    var currentItems=current?treeItems(current.id,'',0,{}):'';
    // Only the active Space tree is expanded. Switching Spaces happens in the
    // single dropdown; inaccessible Spaces never reach this client from the API.
    var dropdown=spaceMenuOpen ? '<div class="rd-space-dropdown" role="dialog" aria-label="Switch document space">'+
      '<div class="rd-switch-section">CURRENT SPACE</div>'+
      (current?'<div class="rd-current-space"><span class="rd-space-glyph">'+spaceGlyph()+'</span><strong>'+esc(current.name)+'</strong><span class="rd-space-check">✓</span></div>':'<p class="rd-note">No space selected</p>')+
      '<label class="rd-space-search"><span class="rd-sr-only">Search spaces</span><input id="rdSpaceSearch" type="search" placeholder="Search spaces…" autocomplete="off" aria-label="Search spaces"></label>'+
      '<div class="rd-switch-section">SPACES YOU CAN ACCESS</div><div class="rd-space-option-list" role="listbox">'+accessible.map(function(sp){return '<button type="button" role="option" data-rd="space" data-id="'+esc(sp.id)+'" aria-selected="'+(sp.id===state.spaceId?'true':'false')+'"><span class="rd-space-glyph">'+spaceGlyph()+'</span><span>'+esc(sp.name)+'</span><span class="rd-space-check">'+(sp.id===state.spaceId?'✓':'')+'</span></button>';}).join('')+'</div>'+
      '<button type="button" data-rd="new-space" class="rd-space-add"><span aria-hidden="true">＋</span> New space</button></div>' : '';
    var shared=state.documents.filter(function(d){return (d.space_id!==state.spaceId && !d.parent_id) || (d.space_id===state.spaceId && !!d.parent_id && !docById(d.parent_id)) || (!perm(current,'view') && !d.parent_id);}).slice(0,25);
    return '<div class="rd-side-head"><button type="button" class="rd-space-switch" data-rd="toggle-space-menu" aria-haspopup="dialog" aria-expanded="'+(spaceMenuOpen?'true':'false')+'"><span class="rd-space-switch-label">Document spaces <span class="rd-chevron">'+CHEV+'</span></span><small>'+esc(current?.name||'Choose a space')+'</small></button><button class="rd-icon-btn" data-rd="new-space" title="Create space" aria-label="Create space">+</button>'+dropdown+'</div>'+
      '<div class="rd-sidebar-top"><button class="rd-nav-row '+(state.home&&!state.search?'active':'')+'" data-rd="overview"><span class="rd-plain-mark">⌂</span><span>Home</span></button><button class="rd-nav-row '+(allFilesMode?'active':'')+'" data-rd="all-files"><span class="rd-plain-mark">▤</span><span>All files</span></button></div>'+
      sectionHead('space', current?'IN '+esc(current.name.toUpperCase()):'DOCUMENTS')+'<div class="rd-spaces-tree" id="rdSec-space"'+(collapsedSections.has('space')?' hidden':'')+'>'+
      (current?'<button class="rd-nav-row rd-space-title" data-rd="space" data-id="'+esc(current.id)+'"><span class="rd-nav-glyph">'+spaceGlyph()+'</span><span>'+esc(current.name)+'</span></button>'+currentItems:'<div class="rd-empty rd-sidebar-empty">No spaces shared with you yet.</div>')+'</div>'+
      (shared.length?sectionHead('shared','OTHER SHARED ITEMS')+'<div class="rd-spaces-tree" id="rdSec-shared"'+(collapsedSections.has('shared')?' hidden':'')+'>'+shared.map(function(d){return '<button class="rd-nav-row" data-rd="doc" data-id="'+esc(d.id)+'"><span class="rd-plain-mark">'+(d.kind==='folder'?'▱':'▤')+'</span><span>'+esc(d.title)+'</span></button>';}).join('')+'</div>':'');
  }
  function spaceGlyph(){return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="4" width="7" height="7" rx="2"/><rect x="13.5" y="4" width="7" height="7" rx="2"/><rect x="3.5" y="14" width="7" height="7" rx="2"/><rect x="13.5" y="14" width="7" height="7" rx="2"/></svg>';}

  function hero(title, subtitle, actions, crumbs) {
    return '<div class="rd-hero"><div><div class="rd-overline">' + esc(subtitle) + '</div><h2>' + esc(title) + '</h2>' + (crumbs || '') + '</div><div class="rd-actions">' + (actions || '') + '</div></div>';
  }
  function btn(label, action, cls, id) {
    var title=String(label).replace(/^(?:[+＋↗↓☷✎]\s+|⋯\s+)/u,'');
    return '<button class="rd-button ' + (cls || '') + '" data-rd="' + action + '"' + (id ? ' data-id="' + esc(id) + '"' : '') + '>' + title + '</button>';
  }
  function breadcrumb(d){
    var path=[],seen=new Set(),cur=d;
    while(cur&&!seen.has(cur.id)&&path.length<24){seen.add(cur.id);path.unshift(cur);cur=docById(cur.parent_id);}
    var space=spaceById(d?.space_id||state.spaceId);
    var links='<button data-rd="space" data-id="'+esc(space?.id||'')+'">'+esc(space?.name||'Space')+'</button>';
    if(path.length>5)path=[path[0],{id:'',title:'…'},...path.slice(-3)];
    path.forEach(function(item,i){links+='<span>›</span>'+(item.id?'<button data-rd="doc" data-id="'+esc(item.id)+'">'+esc(item.title)+'</button>':'<span>…</span>');});
    return '<nav class="rd-breadcrumb rd-path" aria-label="Breadcrumb">'+links+'</nav>';
  }
  function listRows(docs, files) {
    var sort=state.sort, q=state.filter;
    var entries=docs.map(function(d){return {type:d.kind==='folder'?'folder':'document',id:d.id,name:d.title,updated_at:d.updated_at,owner:d.created_by,doc:d};}).concat(files.map(function(f){return {type:'file',id:f.id,name:f.name,updated_at:f.updated_at,owner:f.created_by,file:f};}));
    if(q!=='all')entries=entries.filter(function(e){return e.type===q;});
    entries.sort(function(a,b){return sort==='updated'?new Date(b.updated_at||0)-new Date(a.updated_at||0):sort==='type'?a.type.localeCompare(b.type):a.name.localeCompare(b.name);});
    if(!entries.length)return '<div class="rd-empty"><strong>This folder is empty</strong>Create a folder, document or upload a file to begin.</div>';
    return '<div class="rd-drive-overflow"><table class="rd-drive-table"><thead><tr><th class="rd-check-col"><input type="checkbox" id="rdCheckAll" aria-label="Select all items"></th><th>Name</th><th>Type</th><th>Updated</th><th>Owner</th><th>Actions</th></tr></thead><tbody>'+entries.map(function(e){
      var mark=fileGlyph(e.type);
      var name=e.type==='file'?'<button data-rd="preview-file" data-id="'+esc(e.id)+'">'+esc(e.name)+'</button>':'<button data-rd="doc" data-id="'+esc(e.id)+'">'+esc(e.name)+'</button>';
      var actions=e.type==='file'?btn('⋯','file-options','',e.id):btn('⋯','doc-options','',e.id);
      return '<tr class="'+(state.selected.has(e.type+':'+e.id)?'rd-row-selected':'')+'"><td class="rd-check-col"><input class="rd-item-check" type="checkbox" data-key="'+e.type+':'+esc(e.id)+'" aria-label="Select '+esc(e.name)+'" '+(state.selected.has(e.type+':'+e.id)?'checked':'')+'></td><td><span class="rd-drive-icon">'+mark+'</span>'+name+'</td><td>'+({folder:'Folder',document:'Document',file:'Uploaded file'}[e.type])+'</td><td>'+date(e.updated_at)+'</td><td>'+esc(e.owner||'—')+'</td><td>'+actions+'</td></tr>';
    }).join('')+'</tbody></table></div>';
  }
  // Document Home provides a shared starting point without affecting existing folders/pages.
  function renderHome() {
    var latest = state.documents.filter(function(d) { return d.kind === 'page'; })
      .sort(function(a,b){return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);}).slice(0,6);
    var top = '<section class="rd-home-banner"><div><div class="rd-overline" style="color:#a8d9ff">REXUS DOCUMENT</div>' +
      '<h2>Organize knowledge.<br>Work smarter together.</h2>' +
      '<p>One beautiful place for your team knowledge, product guides, notes and files — connected to REXUS tasks.</p></div>' +
      '<div aria-hidden="true" class="rx-home-hero-icon">📚</div></section>';
    var actions = '<div class="rd-home-actions">' +
      '<button class="rd-home-action" data-rd="new-page"><span class="rd-home-icon">▤</span><span>Create a page</span></button>' +
      '<button class="rd-home-action" data-rd="all-files"><span class="rd-home-icon">⇧</span><span>Browse files</span></button>' +
      '<button class="rd-home-action" data-rd="new-space"><span class="rd-home-icon">▣</span><span>Create a space</span></button></div>';
    var recents = latest.length ? latest.map(function(d){
      return '<button class="rd-list-row" data-rd="doc" data-id="' + esc(d.id) + '"><span class="rd-list-icon">▤</span><span style="min-width:0"><span class="rd-row-name" style="display:block">' + esc(d.title) + '</span><span class="rd-row-meta">' + esc(spaceById(d.space_id)?.name || 'Space') + ' · Updated ' + date(d.updated_at) + '</span></span><span class="rd-row-end">Open →</span></button>';
    }).join('') : '<div class="rd-empty">No pages yet — create your first page above.</div>';
    var spaces = state.spaces.length ? state.spaces.map(function(sp){
      var count = state.documents.filter(function(d){ return d.space_id === sp.id && d.kind === 'page'; }).length;
      return '<button class="rd-home-space" data-rd="space" data-id="' + esc(sp.id) + '"><span class="rd-home-icon">▣</span><span><strong>' + esc(sp.name) + '</strong><small>' + count + ' pages</small></span><span class="rd-row-end">→</span></button>';
    }).join('') : '<div class="rd-empty">No spaces yet. Create a space above.</div>';
    return top + actions + '<div class="rd-home-columns"><section class="rd-panel"><div class="rd-home-section-head"><h3>Recent documents</h3><span class="rd-row-meta">' + latest.length + ' recent</span></div>' + recents + '</section><section class="rd-panel"><div class="rd-home-section-head"><h3>Spaces</h3><span class="rd-row-meta">' + state.spaces.length + ' total</span></div>' + spaces + '</section></div>';
  }
  function renderListing() {
    var folder=docById(state.folderId),space=spaceById(state.spaceId);
    var title=folder?folder.title:space?.name||'REXUS Document';
    var controls='<div class="rd-drive-controls">'+(perm(folder||space,'edit')?(btn('New folder','new-folder')+btn('New document','new-page','primary')+btn('Upload','upload-file')):'')+(perm(folder||space,'edit')?btn('Share','share-target','',folder?folder.id:space.id):'')+'<select id="rdSort" aria-label="Sort by"><option value="name"'+(state.sort==='name'?' selected':'')+'>Name</option><option value="updated"'+(state.sort==='updated'?' selected':'')+'>Updated</option><option value="type"'+(state.sort==='type'?' selected':'')+'>Type</option></select><select id="rdFilter" aria-label="Filter by"><option value="all">All types</option><option value="folder"'+(state.filter==='folder'?' selected':'')+'>Folders</option><option value="document"'+(state.filter==='document'?' selected':'')+'>Documents</option><option value="file"'+(state.filter==='file'?' selected':'')+'>Files</option></select></div>';
    if(!space)return hero('Knowledge, organized','REXUS Document',btn('+ Create space','new-space','primary'))+'<div class="rd-panel"><div class="rd-empty">Create your first Space to get started.</div></div>';
    var docs=state.documents.filter(function(d){return d.space_id===state.spaceId&&(d.parent_id||'')===(state.folderId||'');});
    var files=state.files.filter(function(f){return folder?f.folder_id===folder.id:false;});
    var path=breadcrumb(folder||{space_id:state.spaceId});
    var right=folder?'<aside class="rd-folder-side"><h3>Folder details</h3><p><strong>Updated:</strong> '+date(folder.updated_at)+'</p><p><strong>Owner:</strong> '+esc(folder.created_by||'—')+'</p><div class="rd-actions">'+(perm(folder,'edit')?btn('Rename','rename-doc','',folder.id)+btn('Move','move','',folder.id):'')+btn('Share','share-target','',folder.id)+'</div><p class="rd-note">Comment on a passage inside a document to start a discussion thread. Legacy folder comments remain stored.</p></aside>':'';
    return path+hero(title,'Folder & file management',(perm(folder||space,'edit')?(folder?btn('Folder actions','doc-options','',folder.id):btn('Space settings','edit-space')):''))+controls+renderBulkBar()+'<div class="rd-list-layout"><div class="rd-panel">'+listRows(docs,files)+'</div>'+right+'</div>';
  }
  function renderPage(){
    var doc=docById(state.pageId);if(!doc){state.pageId='';return renderListing();}
    var controls=state.edit?'':(perm(doc,'edit')?btn('✎ Edit','edit-page','primary'):'')+btn('↗ Share','share-target','',doc.id)+btn('Comment','comment-selection')+btn('Discussions','toggle-comments')+btn('↓ Export','export-menu')+btn('☷ Details','toggle-details')+btn('⋯ More','doc-options','',doc.id);
    var header=breadcrumb(doc)+'<div class="rd-hero rd-document-head"><div><h2>'+esc(doc.title)+'</h2><span class="rd-row-meta">'+(state.edit?'Autosave enabled · Editing':'Online document')+'</span></div><div class="rd-actions">'+controls+'</div></div>';
    var content=state.edit?editorPage(doc):'<div class="rd-page-view"><div class="rd-page-paper"><article class="rd-content rd-rich-display">'+(doc.body?contentHtml(doc):'<p class="rd-page-placeholder">This document is empty. Select Edit to start writing.</p>')+'</article></div></div>';
    return header+'<div class="rd-document-layout"><div class="rd-document-body">'+content+'</div>'+renderThreadPanel()+detailsPanel(doc)+'</div>';
  }
  function renderResults() {
    var q=state.search.toLowerCase().trim(),scope=state.searchScope;
    var docs=state.documents.filter(function(d){
      var title=d.title.toLowerCase().includes(q), body=d.kind==='page'&&searchableBody(d).toLowerCase().includes(q), labels=(d.labels||[]).some(function(l){return l.toLowerCase().includes(q);});
      return scope==='title'?title:scope==='content'?body:scope==='labels'?labels:scope==='files'?false:(title||body||labels);
    });
    var files=(scope==='all'||scope==='files')?state.files.filter(function(f){return (f.name+' '+(f.description||'')).toLowerCase().includes(q);}):[];
    return hero('Search results',docs.length+' pages and '+files.length+' files found',btn('Clear search','clear-search')) +
      '<div class="rd-panel rd-search-results">' + (docs.length?docs.map(function(d){
        var content=searchableBody(d),at=content.toLowerCase().indexOf(q),excerpt=at<0?content.slice(0,115):content.slice(Math.max(0,at-55),at+105);
        return '<button class="rd-list-row rd-result" data-rd="doc" data-id="'+esc(d.id)+'"><span class="rd-list-icon">📄</span><span class="rd-result-body"><span class="rd-row-name">'+esc(d.title)+'</span><small>'+esc(spaceById(d.space_id)?.name||'Space')+' · '+esc((d.labels||[]).map(function(l){return '#'+l;}).join(' '))+'</small><span class="rd-result-excerpt">'+esc(excerpt||'No content')+'</span></span><span class="rd-row-end">Open →</span></button>';
      }).join(''):'') + (files.length?listRows([],files):'')+(docs.length===0&&files.length===0?'<div class="rd-empty">No results found. Try another keyword or search field.</div>':'')+'</div>';
  }
  function renderAllFiles() {
    return hero('All files', state.files.length + ' files across spaces', btn('+ Create document','new-page','primary')) + renderBulkBar() + '<div class="rd-panel">' + listRows([], state.files) + '</div>';
  }
  var allFilesMode = false;
  function syncHeaderSearch() {
    var wrap=el('rdHeaderSearchWrap'), input=el('rdSearchInput'), scope=el('rdSearchScope'), clear=el('rdSearchClear');
    if(!wrap||!input||!scope)return;
    var editing=!!state.edit;
    input.disabled=editing; scope.disabled=editing;
    input.title=scope.title=editing?'Save or leave editing to search':'';
    if(document.activeElement!==input && input.value!==state.search)input.value=state.search;
    if(scope.value!==state.searchScope)scope.value=state.searchScope;
    if(clear)clear.hidden=!state.search;
  }
  (function initDocumentSearch(){
    var input=el('rdSearchInput'),scope=el('rdSearchScope'),clear=el('rdSearchClear');
    if(!input||!scope)return;
    input.addEventListener('input',function(){
      if(state.edit)return;
      state.search=input.value;
      render(); // Only rdMain updates; the search field keeps its focus and caret.
    });
    scope.addEventListener('change',function(){state.searchScope=scope.value;render();});
    if(clear)clear.addEventListener('click',function(){
      if(state.edit)return;
      state.search='';input.value='';render();input.focus();
    });
  })();
  function positionSpaceDropdown(){
    var menu=shell.querySelector(':scope > .rd-space-dropdown');
    if(!menu)return;
    var anchor=el('rdSidebar').querySelector('.rd-space-switch');
    if(!anchor)return;
    var rect=anchor.getBoundingClientRect();
    var roomBelow=window.innerHeight-rect.bottom-10;
    var roomAbove=rect.top-10;
    var upward=roomBelow<220&&roomAbove>roomBelow;
    var available=Math.max(145,Math.floor((upward?roomAbove:roomBelow)-8));
    var top=upward?'auto':Math.max(8,rect.bottom+5)+'px';
    menu.style.position='fixed';menu.style.left=Math.max(8,Math.min(rect.left,window.innerWidth- Math.min(360,window.innerWidth-16)-8))+'px';
    menu.style.right='auto';menu.style.width=Math.min(360,window.innerWidth-16)+'px';
    menu.style.maxHeight=available+'px';menu.style.top=top;menu.style.bottom=upward?Math.max(8,window.innerHeight-rect.top+5)+'px':'auto';
    menu.style.overflowY='auto';
  }
  function paintSidebar(){
    // Render the Space menu into the document shell instead of the scrolling sidebar.
    // Fixed overlay cannot be clipped by the sticky sidebar's backdrop-filter.
    shell.querySelector(':scope > .rd-space-dropdown')?.remove();
    el('rdSidebar').innerHTML = renderSidebar();
    var overlay=el('rdSidebar').querySelector('.rd-space-dropdown');
    if(overlay)shell.appendChild(overlay);
    positionSpaceDropdown();
    var spaceSearch=el('rdSpaceSearch');if(spaceSearch){
      spaceSearch.oninput=function(){var q=this.value.trim().toLowerCase(),matches=0;shell.querySelectorAll('.rd-space-option-list button').forEach(function(btn){var ok=btn.textContent.toLowerCase().includes(q);btn.hidden=!ok;if(ok)matches++;});var empty=el('rdNoSpaceMatches');if(!empty){empty=document.createElement('p');empty.id='rdNoSpaceMatches';empty.className='rd-note';shell.querySelector('.rd-space-option-list').appendChild(empty);}empty.textContent=matches?'':'No accessible spaces found';};
      spaceSearch.onkeydown=function(e){if(e.key==='Escape'){spaceMenuOpen=false;paintSidebar();}if(e.key==='Enter'){e.preventDefault();var first=shell.querySelector('.rd-space-option-list button:not([hidden])');if(first)first.click();}if(e.key==='ArrowDown'){e.preventDefault();shell.querySelector('.rd-space-option-list button:not([hidden])')?.focus();}};
    }
  }
  function render() {
    if (!shell) return;
    paintSidebar();
    var main = el('rdMain');
    if (state.error) main.innerHTML = '<div class="rd-error">' + esc(state.error) + '</div><p class="rd-note" style="margin:12px 0">If this is a new deploy, run migration 026_rexus_document before opening this workspace.</p>' + btn('Retry','retry');
    else if (!state.loaded) main.innerHTML = '<div class="rd-empty">Loading REXUS Document…</div>';
    else {
      // Search is a persistent control in the shared header, not inside rdMain.
      main.innerHTML = state.search.trim() ? renderResults() : allFilesMode ? renderAllFiles() : state.home ? renderHome() : state.pageId ? renderPage() : renderListing();
      syncHeaderSearch();
      if(el('rdCheckAll'))el('rdCheckAll').onchange=function(e){document.querySelectorAll('#rexusDocsShell .rd-item-check').forEach(function(c){if(e.target.checked)state.selected.add(c.dataset.key);else state.selected.delete(c.dataset.key);});render();};
      main.querySelectorAll('.rd-item-check').forEach(function(c){c.onchange=function(){if(c.checked)state.selected.add(c.dataset.key);else state.selected.delete(c.dataset.key);render();};});
      if(el('rdSort'))el('rdSort').onchange=function(e){state.sort=e.target.value;render();};
      if(el('rdFilter'))el('rdFilter').onchange=function(e){state.filter=e.target.value;render();};
      if(el('rdFolderCommentForm'))el('rdFolderCommentForm').onsubmit=postFolderComment;
      renderToc();
      applyThreadHighlights();
      var edit = el('rdPageEdit'); if (edit) {
        edit.addEventListener('submit',savePage);
        edit.addEventListener('input',function(){markDirty();scheduleAutosave();clearTimeout(tocUpdateTimer);tocUpdateTimer=setTimeout(renderToc,650);});
        var surface=el('rdRichSurface');
        surface.querySelectorAll('input[type=checkbox]').forEach(function(box){box.disabled=false;});
        surface.addEventListener('click',function(e){if(e.target.matches('input[type=checkbox]'))markDirty();});
        surface.addEventListener('mouseup',rememberCursor);
        surface.addEventListener('dblclick',function(e){if(e.target.closest('.rd-mermaid'))editMermaidElement(e.target.closest('.rd-mermaid'));});
        surface.addEventListener('keyup',rememberCursor);
        surface.addEventListener('paste',function(e){
          var imageFiles=Array.from(e.clipboardData?.files||[]).filter(function(file){return /^image\/(png|jpeg|webp|gif)$/.test(file.type);});
          if(imageFiles.length){e.preventDefault();rememberCursor();uploadPicked(imageFiles,'','image');return;}
          e.preventDefault();var html=e.clipboardData?.getData('text/html')||'',plain=e.clipboardData?.getData('text/plain')||'';
          if(html){document.execCommand('insertHTML',false,cleanRich(html));}else document.execCommand('insertText',false,plain);markDirty();
        });
        surface.addEventListener('dragover',function(e){if(e.dataTransfer?.types?.includes('Files'))e.preventDefault();});
        surface.addEventListener('drop',function(e){
          var files=Array.from(e.dataTransfer?.files||[]);if(!files.length)return;
          e.preventDefault();rememberCursor();var images=files.filter(function(f){return /^image\/(png|jpeg|webp|gif)$/.test(f.type);});
          if(images.length)uploadPicked(images,'','image');else uploadPicked(files,'','file');
        });
        edit.querySelectorAll('[data-rte]').forEach(function(b){
          b.addEventListener('mousedown',function(e){e.preventDefault();});
          b.addEventListener('click',function(){editorCommand(b.dataset.rte);});
        });
        el('rdBlockType').addEventListener('change',function(e){focusCursor();document.execCommand('formatBlock',false,e.target.value);markDirty();});
        el('rdFontFamily').addEventListener('change',function(e){focusCursor();document.execCommand('fontName',false,e.target.value);markDirty();});
        el('rdFontSize').addEventListener('change',function(e){focusCursor();var selection=window.getSelection();document.execCommand('fontSize',false,'7');surface.querySelectorAll('font[size="7"]').forEach(function(f){f.removeAttribute('size');f.style.fontSize=e.target.value+'px';});markDirty();});
        el('rdInsertMenuBtn').onclick=insertMenu;el('rdMoreFormattingBtn').onclick=moreFormattingMenu;
        surface.addEventListener('mouseup',syncParagraphStyle);surface.addEventListener('keyup',syncParagraphStyle);
        surface.addEventListener('keydown',function(e){if((e.ctrlKey||e.metaKey)&&e.altKey&&/^[1-6]$/.test(e.key)){e.preventDefault();focusCursor();document.execCommand('formatBlock',false,'h'+e.key);syncParagraphStyle();markDirty();}});
        var draftKey='rexus-draft-'+state.pageId;try{var local=JSON.parse(localStorage.getItem(draftKey)||'null');if(local&&local.version===docById(state.pageId)?.version&&(state.dirty||confirm('An unsaved local draft was found. Restore it?'))){edit.elements.title.value=local.title;surface.innerHTML=contentHtml({body:local.body});markDirty();}}catch(_){}
        edit.addEventListener('keydown',function(e){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();edit.requestSubmit();}});
      }
    }
  }
  // GEN-03: member pickers show Name + Job title · Email (shared helper in rexus-ui.js)
  function personOpt(u){ return window.REXUSui && REXUSui.personOption ? REXUSui.personOption(u) : '<option value="' + esc(u.id) + '">' + esc(u.full_name || u.username) + '</option>'; }
  function dialog(title, fields, onSave) {
    closeDialog();
    var wrap = document.createElement('div'); wrap.className = 'rd-dialog-wrap'; wrap.id = 'rdDialogWrap';
    var html = '<div class="rd-dialog" role="dialog" aria-modal="true"><h3>' + esc(title) + '</h3><form id="rdDialogForm">';
    fields.forEach(function (f) {
      html += '<label>' + esc(f.label) + (f.type === 'select' ? '<select name="' + esc(f.name) + '">' + (f.options || []).map(function (o) { return o.html || ('<option value="' + esc(o.value) + '"' + (o.value === f.value ? ' selected' : '') + '>' + esc(o.label) + '</option>'); }).join('') + '</select>' : f.type === 'textarea' ? '<textarea name="' + esc(f.name) + '" rows="3">' + esc(f.value || '') + '</textarea>' : '<input name="' + esc(f.name) + '" maxlength="200" value="' + esc(f.value || '') + '" ' + (f.required ? 'required' : '') + '>') + '</label>';
    });
    html += '<div id="rdDialogError" class="rd-error" style="display:none"></div><div class="rd-actions" style="justify-content:flex-end"><button class="rd-button" type="button" id="rdDialogCancel">Cancel</button><button class="rd-button primary" type="submit">Save</button></div></form></div>';
    wrap.innerHTML = html; document.body.appendChild(wrap);
    el('rdDialogCancel').onclick = closeDialog;
    el('rdDialogForm').onsubmit = async function (event) {
      event.preventDefault(); var form = event.currentTarget, button=form.querySelector('[type="submit"]'); button.disabled = true;
      var data = Object.fromEntries(new FormData(form).entries());
      try { await onSave(data); closeDialog(); await refresh(true); }
      catch (err) { el('rdDialogError').textContent = err.message; el('rdDialogError').style.display = 'block'; }
      button.disabled = false;
    };
    wrap.addEventListener('click', function (e) { if (e.target === wrap) closeDialog(); });
    wrap.querySelector('input,textarea,select')?.focus();
  }
  function closeDialog() { var node = el('rdDialogWrap'); if (node) node.remove(); }
  function choice(title, entries, onPick) {
    closeDialog();
    var wrap = document.createElement('div'); wrap.className='rd-dialog-wrap'; wrap.id='rdDialogWrap';
    wrap.innerHTML = '<div class="rd-dialog" role="dialog" aria-modal="true"><h3>' + esc(title) + '</h3><input id="rdPickerSearch" placeholder="Search pages or files…" autocomplete="off"><div class="rd-dialog-choices" id="rdDialogChoices"></div><div class="rd-actions" style="justify-content:flex-end;margin-top:15px">' + btn('Cancel', 'close-dialog') + '</div></div>';
    document.body.appendChild(wrap);
    var search = el('rdPickerSearch'), choices = el('rdDialogChoices');
    function draw() {
      var q = search.value.toLowerCase(); var matches = entries.filter(function (x) { return (x.label + ' ' + x.subtitle).toLowerCase().includes(q); });
      choices.innerHTML = matches.length ? matches.map(function (x,i) { return '<button type="button" data-choice="' + i + '"><strong>' + esc(x.label) + '</strong><br><small style="color:#8693a9">' + esc(x.subtitle) + '</small></button>'; }).join('') : '<div class="rd-empty">No matching items</div>';
      choices.querySelectorAll('[data-choice]').forEach(function (b) { b.addEventListener('click', function () { closeDialog(); onPick(matches[Number(b.dataset.choice)]); }); });
    }
    search.oninput=draw; draw(); search.focus();
    wrap.addEventListener('click', function(e){ if(e.target===wrap) closeDialog(); });
  }
  function spaceOptions() { return state.spaces.map(function (s) { return {value:s.id, label:s.name}; }); }
  function folderOptions(spaceId, excluded) { return [{value:'',label:'Space root'}].concat(state.documents.filter(function (d) { return d.space_id === spaceId && d.kind === 'folder' && d.id !== excluded; }).map(function (d) { return {value:d.id, label:d.title}; })); }
  function newDocument(kind) {
    if(!guardDraft())return;
    if (!state.spaces.length) { newSpace(); return; }
    var spaceId = state.spaceId || state.spaces[0].id;
    dialog('New ' + kind, [
      {name:'title',label:kind === 'folder' ? 'Folder name' : 'Page title',required:true},
      {name:'space_id',label:'Space',type:'select',value:spaceId,options:spaceOptions()},
      {name:'parent_id',label:'Parent folder',type:'select',value:state.folderId,options:folderOptions(spaceId)},
    ], async function (data) {
      if (data.parent_id && docById(data.parent_id)?.space_id !== data.space_id) data.parent_id = '';
      var result = await request(baseUrl, 'POST', Object.assign(data, {action:'create_document',kind:kind}));
      state.spaceId = data.space_id; state.home = false; allFilesMode = false;
      if (kind === 'page') { state.pageId = result.document.id; state.folderId = ''; state.edit = true; state.dirty = false; history.replaceState(null,'','#document/'+encodeURIComponent(state.pageId)); }
      else { state.pageId=''; state.folderId=result.document.id; }
      toast(kind === 'page' ? 'Page created' : 'Folder created');
    });
  }
  function newSpace() { if(!guardDraft())return; dialog('Create a space',[{name:'name',label:'Space name',required:true},{name:'description',label:'Description',type:'textarea'}],async function (data) { var r = await request(baseUrl,'POST',Object.assign(data,{action:'create_space'})); state.spaceId=r.space.id; state.home=false; allFilesMode=false;state.folderId='';state.pageId='';toast('Space created'); }); }
  function editSpace() { var s=spaceById(state.spaceId); if(!s)return; dialog('Edit space',[{name:'name',label:'Name',value:s.name,required:true},{name:'description',label:'Description',type:'textarea',value:s.description}],async function(data){await request(baseUrl,'PUT',Object.assign(data,{action:'update_space',id:s.id}));toast('Space updated');}); }
  function scheduleAutosave(){
    clearTimeout(autosaveTimer);
    if(!state.edit)return;
    var data=getDraft(), d=docById(state.pageId);
    if(data&&d){try{localStorage.setItem('rexus-draft-'+d.id,JSON.stringify({...data,version:d.version}));}catch(_){}}
    autosaveTimer=setTimeout(function(){persistPage(false);},2500);
  }
  async function persistPage(closeOnSuccess){
    var docId=state.pageId, d=docById(docId);if(!d||!state.edit)return;
    if(saveInFlight){await saveInFlight;if(state.dirty)return persistPage(closeOnSuccess);return;}
    var data=getDraft();if(!data||!data.title||data.body.length>250000){toast('Title required; document must be under 250,000 characters',true);return;}
    var indicator=el('rdDraftStatus');if(indicator){indicator.textContent='Saving…';indicator.classList.remove('dirty');}
    saveInFlight=(async function(){
      try{
        var response=await request(baseUrl,'PUT',{action:'update_document',id:docId,expected_version:d.version,title:data.title,body:data.body,labels:data.labels});
        var i=state.documents.findIndex(function(x){return x.id===docId;});if(i>=0)state.documents[i]=response.document;
        var current=getDraft();state.dirty=!!current&&(current.body!==data.body||current.title!==data.title||JSON.stringify(current.labels)!==JSON.stringify(data.labels));
        if(!state.dirty){try{localStorage.removeItem('rexus-draft-'+docId);}catch(_){}if(indicator)indicator.textContent='✓ All changes saved';}
        else {if(indicator){indicator.textContent='● More changes to save';indicator.classList.add('dirty');}scheduleAutosave();}
      }catch(e){state.dirty=true;if(indicator){indicator.textContent='⚠ Save failed: '+e.message;indicator.classList.add('dirty');}toast('Autosave failed: '+e.message,true);}
    })();
    await saveInFlight;saveInFlight=null;
    if(closeOnSuccess&&!state.dirty){state.edit=false;savedRange=null;await refresh(true);}
  }
  async function savePage(event){event.preventDefault();clearTimeout(autosaveTimer);await persistPage(false);if(!state.dirty){state.edit=false;savedRange=null;await refresh(true);toast('Document saved');}}
  function moveDocument(docId) {
    var d=docById(docId); if(!d)return;
    dialog('Move ' + d.title,[{name:'parent_id',label:'Move to folder',type:'select',value:d.parent_id||'',options:folderOptions(d.space_id,d.id)}],async function(data){await request(baseUrl,'PUT',{action:'move',id:d.id,parent_id:data.parent_id});toast('Moved');});
  }
  async function deleteDoc(docId) {
    var d=docById(docId); if(!d||!confirm('Delete "'+d.title+'"? This cannot be undone.')) return;
    try{await request(baseUrl+'?id='+encodeURIComponent(d.id),'DELETE');state.pageId='';state.folderId='';if(/^#document\//.test(location.hash))history.replaceState(null,'',location.pathname+location.search);await refresh(true);toast('Deleted');}catch(err){toast(err.message,true);}
  }
  async function historyDoc() {
    var d=docById(state.pageId);if(!d)return;
    try{var revisions=(await request(baseUrl+'?history='+encodeURIComponent(d.id))).revisions||[];
      choice('Page version history',revisions.map(function(v){return {label:'Version '+v.version+' — '+v.title,subtitle:date(v.edited_at)+' · click to preview',value:v};}),function(item){
        closeDialog();var revision=item.value,wrap=document.createElement('div');wrap.className='rd-dialog-wrap';wrap.id='rdDialogWrap';
        wrap.innerHTML='<div class="rd-dialog"><h3>Version '+revision.version+'</h3><p>'+esc(revision.title)+' · '+date(revision.edited_at)+'</p><div class="rd-embed-preview rd-rich-display">'+contentHtml(revision)+'</div><div class="rd-actions"><button class="rd-button primary" id="rdRestoreRevision">Restore this version</button>'+btn('Close','close-dialog')+'</div></div>';
        document.body.appendChild(wrap);
        el('rdRestoreRevision').onclick=async function(){if(!confirm('Restore version '+revision.version+'? This creates a new version.'))return;try{await request(baseUrl,'PUT',{action:'restore',id:d.id,version:revision.version});closeDialog();await refresh(true);toast('Version restored');}catch(err){toast(err.message,true);}};
      });
    }catch(err){toast(err.message,true);}
  }
  async function fileVersions(fileId) {
    try {var data=await request(fileUrl+'?file='+encodeURIComponent(fileId)+'&versions=1');
      choice('File history: '+data.file.name,(data.versions||[]).map(function(v){return {label:'Version '+v.version+' · '+bytes(v.size_bytes),subtitle:date(v.created_at),value:v.version};}),function(item){location.href=fileUrl+'?file='+encodeURIComponent(fileId)+'&version='+item.value;});
    }catch(err){toast(err.message,true);}
  }
  function upload(fileId,insertMode) { var input=el('rdFileInput');input.dataset.fileId=fileId||'';input.dataset.insertMode=insertMode||'';input.accept=insertMode==='image'?'image/png,image/jpeg,image/webp,image/gif':'';input.value='';input.multiple=!fileId&&insertMode!=='image';if(insertMode)rememberCursor();input.click(); }
  async function uploadFiles(input) {
    await uploadPicked(Array.from(input.files||[]),input.dataset.fileId,input.dataset.insertMode);
  }
  async function uploadPicked(files,fileId,insertMode) {
    if(!files.length)return;
    var pageId = state.pageId, folderId=state.folderId;
    if (!pageId && !folderId && !fileId) return toast('Open a folder or document before uploading',true);
    for(var i=0;i<files.length;i++){
      var f=files[i]; if(insertMode==='image'&&!['image/png','image/jpeg','image/webp','image/gif'].includes(f.type)){toast('Only PNG, JPEG, WebP and GIF images can be embedded',true);continue;} if(f.size>4*1024*1024){toast(f.name+' exceeds the 4 MB upload limit',true);continue;}
      var fd=new FormData();if(pageId)fd.append('document_id',pageId);else if(folderId)fd.append('folder_id',folderId);if(fileId)fd.append('file_id',fileId);fd.append('file',f);
      try{var response=await fetch(fileUrl,{method:'POST',body:fd,credentials:'same-origin'});var json=await response.json();if(!response.ok||json.error)throw new Error(json.error||'Upload failed');toast('Uploaded '+f.name+(fileId?' as a new version':''));if(insertMode==='image')insertMarkup('<p><img src="'+fileUrl+'?file='+encodeURIComponent(json.id)+'&preview=1" alt="'+esc(f.name)+'"></p><p><br></p>');else if(insertMode==='file')insertMarkup('<p>📎 <a href="'+fileUrl+'?file='+encodeURIComponent(json.id)+'">'+esc(f.name)+'</a></p><p><br></p>');}
      catch(err){toast('Upload failed: '+err.message,true);}
    }
    if(state.edit){try{state.files=(await request(fileUrl)).files||[];}catch(_){};}else await refresh(true);
  }
  async function deleteFile(fileId){
    var f=state.files.find(function(x){return x.id===fileId;}); if(!f||!confirm('Delete all versions of "'+f.name+'"? This cannot be undone.'))return;
    try{await request(fileUrl+'?file='+encodeURIComponent(fileId),'DELETE');await refresh(true);toast('File deleted');}catch(err){toast(err.message,true);}
  }
  // Uses the stable ID, not the displayed title, so a page rename does not
  // break an attachment link stored inside existing Task/Subtask JSON.
  function libraryEntry(d,file){return file?{type:'rexus-document',document_id:file.document_id,file_id:file.id,name:file.name,url:fileUrl+'?file='+encodeURIComponent(file.id)}:{type:'rexus-document',document_id:d.id,name:d.title,url:'#document/'+encodeURIComponent(d.id)};}
  async function pick(callback, onlyPages) {
    try {
      await refresh(true);
      var entries=pages().map(function(d){return{label:'📄 '+d.title,subtitle:'Page · '+(spaceById(d.space_id)?.name||''),value:libraryEntry(d)};});
      if(!onlyPages)state.files.forEach(function(f){entries.push({label:'📎 '+f.name,subtitle:'File · '+(docById(f.document_id)?.title||''),value:libraryEntry(null,f)});});
      choice(onlyPages?'Choose destination page':'Link from REXUS Document',entries,function(item){callback(item.value);});
    }catch(err){toast(err.message,true);}
  }
  async function saveTaskAttachment(entry, onDone) {
    await pick(async function(destination){
      try {
        var r=await fetch('/api/attachments?file='+encodeURIComponent(entry.id),{credentials:'same-origin'});
        if(!r.ok)throw new Error('Original file is no longer accessible');
        var blob=await r.blob();if(blob.size>4*1024*1024)throw new Error('Only files up to 4 MB can be copied to Document');
        var fd=new FormData();fd.append('document_id',destination.document_id);fd.append('file',new File([blob],entry.name||'attachment',{type:blob.type}));
        var uploadResponse=await fetch(fileUrl,{method:'POST',body:fd,credentials:'same-origin'});
        var uploaded=await uploadResponse.json();if(!uploadResponse.ok)throw new Error(uploaded.error||'Copy failed');
        var ref={type:'rexus-document',document_id:destination.document_id,file_id:uploaded.id,name:entry.name,url:fileUrl+'?file='+encodeURIComponent(uploaded.id)};
        onDone(ref);toast('File copied to REXUS Document. Save the Task/Subtask to keep the link.');
      }catch(err){toast('Unable to copy: '+err.message,true);}
    },true);
  }
  // v2.0.6 document tools (same secure, authenticated Document API)
  function loadFolderComments(){
    if(!state.folderId)return;
    var folder=state.folderId;
    request(commentUrl+'?folder='+encodeURIComponent(folder)).then(function(r){if(state.folderId===folder){state.folderComments=r.comments||[];render();}}).catch(function(e){toast(e.message,true);});
  }
  async function postFolderComment(e){
    e.preventDefault();var f=e.currentTarget,body=f.elements.body.value.trim();if(!body)return;
    try{await request(commentUrl,'POST',{folder_id:state.folderId,body:body});f.reset();loadFolderComments();}catch(err){toast(err.message,true);}
  }
  function commentDialog(parentId){
    dialog('Reply to folder comment',[{name:'body',label:'Reply',type:'textarea',required:true}],async function(x){await request(commentUrl,'POST',{folder_id:state.folderId,parent_id:parentId,body:x.body});await loadFolderComments();});
  }
  function editComment(id){
    var comment=state.folderComments.find(function(c){return c.id===id;});if(!comment)return;
    dialog('Edit comment',[{name:'body',label:'Comment',type:'textarea',value:comment.body,required:true}],async function(x){await request(commentUrl,'PUT',{id:id,body:x.body});await loadFolderComments();});
  }
  async function deleteComment(id){if(!confirm('Delete this comment?'))return;try{await request(commentUrl+'?id='+encodeURIComponent(id),'DELETE');loadFolderComments();}catch(e){toast(e.message,true);}}
  function renameDoc(id){
    var d=docById(id);if(!d)return;
    if(d.kind==='page'){
      dialog('Rename document',[{name:'title',label:'Document name',value:d.title,required:true}],async function(x){await request(baseUrl,'PUT',{action:'update_document',id:id,expected_version:d.version,title:x.title,body:d.body,labels:d.labels});toast('Renamed');});
    }else{
      dialog('Rename folder',[{name:'title',label:'Folder name',value:d.title,required:true}],async function(x){await request(baseUrl,'PUT',{action:'update_document',id:id,expected_version:d.version,title:x.title,body:'',labels:d.labels});toast('Renamed');});
    }
  }
  function docOptions(id){
    var d=docById(id);if(!d)return;
    choice('Actions: '+d.title,[{label:'Share',subtitle:'Manage access for this folder or page',value:'share'},{label:'Add labels',subtitle:'Manage document labels',value:'labels'},{label:'Copy link',subtitle:'Copy direct link',value:'link'},{label:'Export',subtitle:'Export page as Word or PDF',value:'export'},{label:'Rename',subtitle:'Update the displayed name',value:'rename'},{label:'Move',subtitle:'Choose another folder in this space',value:'move'},...(d.kind==='page'?[{label:'Copy document',subtitle:'Create an independent copy',value:'copy'}]:[]),{label:'Delete',subtitle:'Requires empty folder / no task links',value:'delete'}],async function(x){
      if(x.value==='share')shareTarget(id);
      if(x.value==='labels'){gotoDocument(id);if(d.kind==='page')updateLabels();else toast('Labels are available for documents',true);}
      if(x.value==='link')navigator.clipboard.writeText(location.origin+location.pathname+'#document/'+encodeURIComponent(id)).then(function(){toast('Link copied');}).catch(function(){toast('Clipboard unavailable',true);});
      if(x.value==='export'){if(d.kind==='page'){gotoDocument(id);exportWord();}else toast('Export is available for documents',true);}
      if(x.value==='rename')renameDoc(id);
      if(x.value==='move')moveDocument(id);
      if(x.value==='copy'){try{var r=await request(baseUrl,'POST',{action:'copy_document',id:id});await refresh(true);gotoDocument(r.document.id);toast('Copy created');}catch(e){toast(e.message,true);}}
      if(x.value==='delete')deleteDoc(id);
    });
  }
  function previewFile(id){var f=state.files.find(function(x){return x.id===id;});if(!f)return;var type=String(f.content_type||'').toLowerCase();if(type==='application/pdf'||/^image\/(png|jpeg|webp|gif)$/.test(type)){var w=window.open(fileUrl+'?file='+encodeURIComponent(id)+'&preview=1','_blank');if(!w)toast('Allow popups to preview files',true);}else{location.href=fileUrl+'?file='+encodeURIComponent(id);toast('Preview unavailable for this format — downloading instead');}}
  function fileOptions(id){
    var f=state.files.find(function(x){return x.id===id;});if(!f)return;
    choice('Actions: '+f.name,[{label:'Copy link',subtitle:'Copy file download link',value:'link'},{label:'Share',subtitle:'Access inherited from folder',value:'share'},{label:'Preview',subtitle:'Preview supported image/PDF files',value:'preview'},{label:'Download',subtitle:'Download current version',value:'download'},{label:'Rename',subtitle:'Update file name',value:'rename'},{label:'Move to folder',subtitle:'Keep file ID and versions',value:'move'},{label:'Copy to folder',subtitle:'Create another independent file',value:'copy'},{label:'Details',subtitle:'Owner, size, updated, versions',value:'details'},{label:'Versions',subtitle:'Older file versions',value:'versions'},{label:'Upload new version',subtitle:'Replace bytes, preserve history',value:'replace'},{label:'Delete',subtitle:'Permanently remove all versions',value:'delete'}],async function(x){
      if(x.value==='link')navigator.clipboard.writeText(location.origin+fileUrl+'?file='+encodeURIComponent(id)).then(function(){toast('Link copied');}).catch(function(){toast('Clipboard unavailable',true);});
      if(x.value==='share'){var fOwner=docById(f.folder_id||f.document_id);if(fOwner)shareTarget(fOwner.id);else toast('Share from the containing folder',true);}
      if(x.value==='download')location.href=fileUrl+'?file='+encodeURIComponent(id);
      if(x.value==='preview')previewFile(id);
      if(x.value==='details')toast('File: '+f.name+' · '+bytes(f.size_bytes)+' · Version '+f.current_version+' · '+date(f.updated_at));
      if(x.value==='versions')fileVersions(id);
      if(x.value==='replace')upload(id);
      if(x.value==='delete')deleteFile(id);
      if(x.value==='rename')dialog('Rename file',[{name:'name',label:'File name',value:f.name,required:true}],async function(d){await request(fileUrl,'PUT',{action:'rename',id:id,name:d.name});toast('Renamed');});
      if(x.value==='move'||x.value==='copy'){
        var owningDoc=docById(f.document_id||f.folder_id);
        if(!owningDoc)return toast('File owner not found',true);
        dialog(x.value==='copy'?'Copy file to folder':'Move uploaded file',[{name:'folder_id',label:'Destination folder',type:'select',options:folderOptions(owningDoc.space_id)}],async function(d){if(!d.folder_id)throw new Error('Select a folder');if(x.value==='copy'){var r=await fetch(fileUrl+'?file='+encodeURIComponent(id),{credentials:'same-origin'});if(!r.ok)throw new Error('Unable to read original file');var blob=await r.blob();if(blob.size>4*1024*1024)throw new Error('File exceeds copy limit');var form=new FormData();form.append('folder_id',d.folder_id);form.append('file',new File([blob],f.name,{type:f.content_type||blob.type}));var up=await fetch(fileUrl,{method:'POST',body:form,credentials:'same-origin'});if(!up.ok)throw new Error((await up.json()).error||'Copy failed');toast('File copied');}else{await request(fileUrl,'PUT',{action:'move',id:id,folder_id:d.folder_id});toast('File moved');}});
      }
    });
  }
  function updateLabels(){
    var d=docById(state.pageId),input=el('rdDetailsLabels');if(!d||!input)return;
    var values=input.value.split(',').map(function(v){return v.trim();}).filter(Boolean);
    request(baseUrl,'PUT',{action:'update_document',id:d.id,expected_version:d.version,title:d.title,body:d.body,labels:values}).then(function(){refresh(true);toast('Labels updated');}).catch(function(e){toast(e.message,true);});
  }
  function tablePicker(){
    closeDialog();var wrap=document.createElement('div');wrap.id='rdDialogWrap';wrap.className='rd-dialog-wrap';
    wrap.innerHTML='<div class="rd-dialog"><h3>Insert table</h3><p>Choose rows and columns</p><div id="rdTableGrid" class="rd-table-picker"></div><p id="rdTableSize">3 × 3</p><div class="rd-actions">'+btn('Cancel','close-dialog')+'</div></div>';
    document.body.appendChild(wrap);var grid=el('rdTableGrid');
    for(var r=1;r<=8;r++)for(var c=1;c<=8;c++){
      var cell=document.createElement('button');cell.type='button';cell.title=r+' rows, '+c+' columns';cell.dataset.row=r;cell.dataset.col=c;
      cell.onmouseenter=function(){var row=Number(this.dataset.row),col=Number(this.dataset.col);el('rdTableSize').textContent=row+' × '+col;Array.from(grid.children).forEach(function(k){k.classList.toggle('active',k.dataset.row<=row&&k.dataset.col<=col);});};
      cell.onclick=function(){var row=Number(this.dataset.row),col=Number(this.dataset.col);closeDialog();var html='<table><tbody>';for(var a=0;a<row;a++){html+='<tr>';for(var b=0;b<col;b++)html+='<'+(a===0?'th':'td')+'> '+(a===0?'Heading':' ')+' </'+(a===0?'th':'td')+'>';html+='</tr>';}insertMarkup(html+'</tbody></table><p><br></p>');};
      grid.appendChild(cell);
    }
  }
  function insertMenu(){
    choice('Insert content',[
      {label:'Table',subtitle:'Choose rows and columns',value:'insert-table'},
      {label:'Link / internal document',subtitle:'Reference a URL or another page',value:'page-link'},
      {label:'HTML snippet',subtitle:'Sanitized HTML code & preview',value:'insert-html'},
      {label:'Mermaid diagram',subtitle:'Editable diagram source',value:'insert-mermaid'},
      {label:'Table of contents',subtitle:'Create headings navigation',value:'toc'},
      {label:'Insert image',subtitle:'Upload an image inline or paste from clipboard',value:'insert-image'},
      {label:'Attach file',subtitle:'Attach a file to this document',value:'insert-file'},
      {label:'REXUS Project',subtitle:'Insert a reference to an accessible project',value:'rexus-project'},
      {label:'REXUS Task',subtitle:'Insert a reference to an accessible task',value:'rexus-task'},
      {label:'REXUS Subtask',subtitle:'Insert a reference to an accessible subtask',value:'rexus-subtask'},
      {label:'Code / Quote / Callout',subtitle:'Structured content',value:'insert-code'},
      {label:'Horizontal divider',subtitle:'Separate sections',value:'insert-hr'}],function(x){if(x.value.startsWith('rexus-'))insertRexusItem(x.value.slice(6));else editorCommand(x.value);});
  }
  var storedFormat=null;
  function formatPaint(){
    var selection=window.getSelection(),node=selection?.anchorNode,element=node?.nodeType===3?node.parentElement:node;
    if(!element||!el('rdRichSurface')?.contains(element))return toast('Select text in the document first',true);
    if(!storedFormat){
      var computed=getComputedStyle(element);storedFormat={fontFamily:computed.fontFamily.replace(/["']/g,''),fontSize:computed.fontSize,color:computed.color,backgroundColor:computed.backgroundColor};
      toast('Formatting copied. Select target text and click Format Painter again.');return;
    }
    if(!selection||selection.isCollapsed)return toast('Select the destination text first',true);
    var content=esc(selection.toString());
    var inline='';if(/^(1[2-9]|2[0-8])px$/.test(storedFormat.fontSize))inline+='font-size:'+storedFormat.fontSize+';';
    if(/^(Arial|Georgia|Calibri|Times New Roman|Verdana|Inter|monospace|serif|sans-serif)$/i.test(storedFormat.fontFamily))inline+='font-family:'+storedFormat.fontFamily+';';
    if(storedFormat.color)inline+='color:'+storedFormat.color+';';
    if(storedFormat.backgroundColor)inline+='background-color:'+storedFormat.backgroundColor+';';
    insertMarkup('<span style="'+esc(inline)+'">'+content+'</span>');storedFormat=null;
  }
  function editTable(){
    var anchor=window.getSelection()?.anchorNode,elNode=anchor?.nodeType===3?anchor.parentElement:anchor;
    var cell=elNode?.closest?.('td,th'),table=cell?.closest?.('table');
    if(!table||!el('rdRichSurface')?.contains(table))return toast('Place your cursor inside a table cell first.',true);
    var tr=cell.closest('tr'),cellIndex=Array.from(tr.children).indexOf(cell);
    choice('Edit table',[
      {label:'Insert row below',subtitle:'Insert a new row',value:'row-add'},
      {label:'Delete current row',subtitle:'Remove selected row',value:'row-delete'},
      {label:'Insert column after',subtitle:'Insert a new column',value:'col-add'},
      {label:'Delete current column',subtitle:'Remove selected column',value:'col-delete'},
      {label:'Merge with next cell',subtitle:'Merge cells in current row',value:'merge'},
      {label:'Split merged cell',subtitle:'Split a cell into separate columns',value:'split'},
      {label:'Column width',subtitle:'Set cell width percentage',value:'width'}],function(item){
        var action=item.value;
        if(action==='row-add'){var clone=tr.cloneNode(true);Array.from(clone.querySelectorAll('th')).forEach(function(th){var td=document.createElement('td');td.textContent=' ';th.replaceWith(td);});clone.querySelectorAll('td').forEach(function(td){td.textContent=' ';});tr.after(clone);}
        if(action==='row-delete'){if(table.rows.length>1)tr.remove();else return toast('Cannot remove the only row',true);}
        if(action==='col-add')Array.from(table.rows).forEach(function(row){var old=row.cells[cellIndex],next=document.createElement('td');next.textContent=' ';if(old)old.after(next);else row.appendChild(next);});
        if(action==='col-delete')Array.from(table.rows).forEach(function(row){if(row.cells.length>1)row.cells[cellIndex]?.remove();});
        if(action==='merge'){var next=cell.nextElementSibling;if(next){cell.innerHTML+=' '+next.innerHTML;cell.colSpan=(cell.colSpan||1)+(next.colSpan||1);next.remove();}else return toast('No cell to merge on the right',true);}
        if(action==='split'){var count=cell.colSpan;if(count>1){cell.colSpan=1;for(var i=1;i<count;i++){var c=document.createElement('td');c.textContent=' ';cell.after(c);}}else return toast('This cell is not merged',true);}
        if(action==='width'){var width=prompt('Width in percent (10–100):','25');if(width!==null){var n=Number(width);if(n>=10&&n<=100)cell.style.width=n+'%';else return toast('Use 10–100',true);}}
        markDirty();scheduleAutosave();
      });
  }
  function insertHtmlDialog(){
    closeDialog();var w=document.createElement('div');w.className='rd-dialog-wrap';w.id='rdDialogWrap';
    w.innerHTML='<div class="rd-dialog rd-code-dialog"><h3>Insert HTML</h3><p>Scripts, event handlers, iframes, external CSS and unsafe URLs are removed.</p><textarea id="rdHtmlCode" spellcheck="false" rows="8" placeholder="<p>Enter HTML here</p>"></textarea><div class="rd-embed-preview" id="rdHtmlPreview"></div><div class="rd-actions"><button id="rdHtmlPreviewButton" class="rd-button">Preview</button><button id="rdHtmlInsert" class="rd-button primary">Insert safely</button>'+btn('Cancel','close-dialog')+'</div></div>';
    document.body.appendChild(w);
    el('rdHtmlPreviewButton').onclick=function(){el('rdHtmlPreview').innerHTML=cleanRich(el('rdHtmlCode').value);};
    el('rdHtmlInsert').onclick=function(){var markup=cleanRich(el('rdHtmlCode').value);closeDialog();insertMarkup(markup);};
  }
  function insertMermaidDialog(existing){
    closeDialog();var w=document.createElement('div');w.className='rd-dialog-wrap';w.id='rdDialogWrap';
    w.innerHTML='<div class="rd-dialog rd-code-dialog"><h3>Mermaid diagram</h3><p>Preserves diagram source. Basic flowcharts have an in-app preview; other Mermaid types are stored as editable code.</p><textarea id="rdMermaidCode" spellcheck="false" rows="9" placeholder="flowchart LR\n  A[Start] --> B[Done]"></textarea><div id="rdMermaidPreview" class="rd-embed-preview"></div><div class="rd-actions"><button id="rdMermaidPreviewBtn" class="rd-button">Live preview</button><button id="rdMermaidSave" class="rd-button primary">'+(existing?'Update':'Insert')+' diagram</button>'+btn('Cancel','close-dialog')+'</div></div>';
    document.body.appendChild(w);el('rdMermaidCode').value=existing?.getAttribute('data-code')||'flowchart LR\n  A[Start] --> B[Done]';
    var preview=function(){var c=el('rdMermaidCode').value;el('rdMermaidPreview').innerHTML=previewDiagram(c);};
    el('rdMermaidCode').oninput=preview;el('rdMermaidPreviewBtn').onclick=preview;
    el('rdMermaidSave').onclick=function(){var c=el('rdMermaidCode').value.slice(0,10000),markup='<pre class="rd-mermaid" data-code="'+esc(c)+'">'+esc(c)+'</pre>';closeDialog();if(existing&&existing.isConnected){existing.outerHTML=cleanRich(markup);markDirty();}else insertMarkup(markup);};preview();
  }
  function editMermaidElement(node){insertMermaidDialog(node);}
  function previewDiagram(code){
    var lines=String(code||'').split(/\r?\n/).map(function(x){return x.trim();}).filter(Boolean),nodes=[];
    if(!/^((flowchart|graph)\s+(TB|TD|LR|RL|BT))/i.test(lines[0]||''))return '<p>Diagram source saved (full renderer unavailable offline). '+esc(lines[0]||'')+'</p><pre>'+esc(code)+'</pre>';
    lines.slice(1).forEach(function(line){var m=/([A-Za-z_][\w]*)\[([^\]]+)\]/g,x;while((x=m.exec(line)))if(!nodes.some(function(n){return n.id===x[1];}))nodes.push({id:x[1],text:x[2]});});
    return '<div class="rd-flow-preview">'+nodes.slice(0,16).map(function(n,i){return '<span class="rd-flow-node">'+esc(n.text)+'</span>'+(i<nodes.length-1?'<span>→</span>':'');}).join('')+'</div><small>Basic flowchart preview; source remains editable.</small>';
  }
  function renderToc(){
    var container=state.edit?el('rdRichSurface'):document.querySelector('#rexusDocsShell .rd-rich-display');
    if(!container)return;
    var heads=Array.from(container.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    heads.forEach(function(h,i){h.id='rdh-'+(i+1);});
    container.querySelectorAll('nav.rd-toc').forEach(function(nav){
      nav.innerHTML='<strong>Table of contents</strong>'+heads.map(function(h){return '<a href="#'+h.id+'" style="padding-left:'+((Number(h.tagName[1])-1)*13)+'px">'+esc(h.textContent||'Untitled')+'</a>';}).join('');
      nav.onclick=function(e){var anchor=e.target.closest('a');if(anchor){e.preventDefault();container.querySelector(anchor.getAttribute('href'))?.scrollIntoView({behavior:'smooth',block:'center'});}};
    });
    container.querySelectorAll('.rd-mermaid').forEach(function(m){if(!state.edit){m.innerHTML=previewDiagram(m.getAttribute('data-code')||m.textContent||'');m.classList.add('rd-mermaid-rendered');}});
  }
  var tocUpdateTimer=null;
  function insertOrRefreshToc(){var surface=el('rdRichSurface');if(!surface)return;var nav=surface.querySelector('nav.rd-toc');if(!nav)insertMarkup('<nav class="rd-toc"></nav><p><br></p>');renderToc();markDirty();}
  async function exportWord(){
    var d=docById(state.pageId);if(!d)return;
    try{
      if(state.edit&&state.dirty){await persistPage(false);if(state.dirty)throw new Error('Save changes before exporting');}
      d=docById(state.pageId);
      if(!window.RexusDocxExport)throw new Error('Word exporter is unavailable');
      toast('Preparing Word document…');
      await window.RexusDocxExport.download(d.title,contentHtml(d));toast('Word file downloaded');
    }catch(e){toast('Word export failed: '+e.message,true);}
  }
  function exportPdf(){
    var d=docById(state.pageId);if(!d)return;
    if(state.edit&&state.dirty){toast('Save your changes before exporting PDF',true);return;}
    var printable=contentHtml(d),name=esc(d.title);
    var win=window.open('','_blank');if(!win){toast('Allow popups to print or save as PDF',true);return;}
    win.document.open();win.document.write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>'+name+'</title><style>@page{size:A4;margin:19mm}body{font-family:Arial,sans-serif;color:#152c49;font-size:12pt;line-height:1.5}h1,h2,h3{page-break-after:avoid}table{border-collapse:collapse;width:100%}td,th{border:1px solid #94a8bf;padding:8px}img{max-width:100%;height:auto}pre{white-space:pre-wrap}a{color:#1659b6}nav.rd-toc{display:none}</style></head><body><h1>'+name+'</h1><article>'+printable+'</article><script>window.addEventListener("load",()=>setTimeout(()=>window.print(),450));<\/script></body></html>');win.document.close();
    toast('Choose “Save as PDF” in the print dialog');
  }

  // REXUS 2.0.8 · Passage-anchored discussions; annotations are separate from document HTML.
  function renderThreadPanel(){
    if(!state.commentPanel)return '';
    return '<aside class="rd-thread-panel"><div class="rd-details-head"><strong>Comments ('+state.threads.filter(function(t){return t.status==='open';}).length+')</strong>'+btn('Close','toggle-comments')+'</div>'+
      '<p class="rd-note">Highlight text in the document, then choose “Comment selection”. Anyone with Comment or Edit access can resolve a thread.</p>'+
      (state.threads.length?state.threads.map(function(t){return '<section class="rd-thread '+(state.activeThread===t.id?'active':'')+' '+(t.status==='resolved'?'resolved':'')+'" data-thread="'+esc(t.id)+'"><button class="rd-thread-quote" data-rd="focus-thread" data-id="'+esc(t.id)+'">“'+esc(t.anchor_text)+'”</button><small>'+esc(t.status==='resolved'?'Resolved':'Open')+'</small>'+
      (t.replies||[]).map(function(r){return '<p><strong>'+esc(r.author_name||'Member')+'</strong> · '+date(r.created_at)+'<span>'+esc(r.body)+'</span></p>';}).join('')+
      '<div class="rd-actions">'+btn('Reply','reply-thread','',t.id)+btn(t.status==='open'?'Resolve':'Reopen',t.status==='open'?'resolve-thread':'reopen-thread','',t.id)+'</div></section>';}).join(''):'<div class="rd-empty">No comments yet. Select a sentence in the document to discuss it.</div>')+'</aside>';
  }
  function selectedPassage(){
    var container=el('rdRichSurface')||document.querySelector('#rexusDocsShell .rd-rich-display');
    var selection=window.getSelection();
    if(!container)return null;
    var range=selection&&selection.rangeCount&&!selection.isCollapsed?selection.getRangeAt(0):(state.edit?savedRange:null);
    if(!range||range.collapsed)return null;
    if(!container.contains(range.commonAncestorContainer))return null;
    var quote=range.toString().trim().slice(0,1500);
    if(!quote)return null;
    var prefixRange=range.cloneRange();prefixRange.selectNodeContents(container);prefixRange.setEnd(range.startContainer,range.startOffset);
    var suffixRange=range.cloneRange();suffixRange.selectNodeContents(container);suffixRange.setStart(range.endContainer,range.endOffset);
    return {anchor_text:quote,anchor_prefix:prefixRange.toString().slice(-80),anchor_suffix:suffixRange.toString().slice(0,80)};
  }
  async function loadThreads(){
    if(!state.pageId)return;
    var data=await request(threadUrl+'?document='+encodeURIComponent(state.pageId));
    state.threads=data.threads||[];if(!(state.edit&&state.dirty))render();
  }
  function commentSelection(){
    var d=docById(state.pageId);if(!d||!perm(d,'comment'))return toast('Comment permission is required',true);
    var passage=selectedPassage();if(!passage)return toast('Highlight a passage inside the document first',true);
    // Selection is captured before the modal steals focus; document HTML is never rewritten.
    dialog('Comment on selected text',[{name:'message',label:'“'+passage.anchor_text.slice(0,80)+'” — Comment',type:'textarea',required:true}],async function(data){
      if(state.edit&&state.dirty){await persistPage(false);if(state.dirty)throw new Error('Save the page before posting a comment');}
      await request(threadUrl,'POST',Object.assign({action:'create',document_id:d.id},passage,{message:data.message}));
      state.commentPanel=true;await loadThreads();toast('Comment added');
    });
  }
  function applyThreadHighlights(){
    var container=document.querySelector('#rexusDocsShell .rd-rich-display');
    if(!container)return;
    state.threads.filter(function(t){return t.status==='open'&&t.anchor_text;}).forEach(function(t){
      // A conservative quote+context match; if edited/deleted, show thread as unanchored instead.
      var walker=document.createTreeWalker(container,NodeFilter.SHOW_TEXT),nodes=[],flat='',n;
      while((n=walker.nextNode())){nodes.push({node:n,start:flat.length,end:flat.length+n.length});flat+=n.nodeValue;}
      var from=0,idx=-1;
      while((from=flat.indexOf(t.anchor_text,from))!==-1){
        var p=flat.slice(Math.max(0,from-80),from),ss=flat.slice(from+t.anchor_text.length,from+t.anchor_text.length+80);
        if((!t.anchor_prefix||p.endsWith(t.anchor_prefix))&&(!t.anchor_suffix||ss.startsWith(t.anchor_suffix))){idx=from;break;}
        from+=t.anchor_text.length||1;
      }
      if(idx<0){idx=flat.indexOf(t.anchor_text);if(idx<0)return;}
      var start=nodes.find(function(x){return x.end>idx;}),end=nodes.find(function(x){return x.end>=idx+t.anchor_text.length;});
      if(!start||!end)return;
      var range=document.createRange();range.setStart(start.node,idx-start.start);range.setEnd(end.node,idx+t.anchor_text.length-end.start);
      var highlight=document.createElement('mark');highlight.className='rd-annotation';highlight.dataset.thread=t.id;highlight.tabIndex=0;highlight.title='Open comment thread';
      try{highlight.appendChild(range.extractContents());range.insertNode(highlight);}catch(_){}
    });
    container.querySelectorAll('.rd-annotation').forEach(function(m){m.addEventListener('click',function(){state.commentPanel=true;state.activeThread=m.dataset.thread;render();});});
  }
  function threadAction(action,id){
    var t=state.threads.find(function(x){return x.id===id;});if(!t)return;
    var d=docById(state.pageId);if(!perm(d,'comment'))return toast('You cannot comment on this document',true);
    if(action==='reply-thread'){
      dialog('Reply to selected passage',[{name:'message',label:'Reply',type:'textarea',required:true}],async function(data){await request(threadUrl,'POST',{action:'reply',document_id:d.id,thread_id:id,message:data.message});await loadThreads();toast('Reply posted');});return;
    }
    request(threadUrl,'PUT',{action:action==='resolve-thread'?'resolve':'reopen',document_id:d.id,thread_id:id}).then(function(){loadThreads();toast('Discussion updated');}).catch(function(e){toast(e.message,true);});
  }
  async function shareDialog(type,id){
    if(!type||!id)return;
    try{
      var info=await request(shareUrl+'?type='+encodeURIComponent(type)+'&id='+encodeURIComponent(id));
      var userData=info.can_manage?await request('/api/users'): {users:[]};
      closeDialog();var wrap=document.createElement('div');wrap.className='rd-dialog-wrap';wrap.id='rdDialogWrap';
      var modeOpts=type==='space'?['organization','restricted']:['inherited','organization','restricted'];
      wrap.innerHTML='<div class="rd-dialog rd-share-dialog" role="dialog" aria-modal="true"><h3>Share '+esc(type)+'</h3><p class="rd-note">Permissions are enforced on the server. Existing organization-wide access stays unchanged until you choose Restricted. Parent Space/Folder access may be inherited.</p><p><strong>Your permission: '+esc(info.permission)+'</strong></p>'+
        (info.can_manage?'<label>Visibility<select id="rdShareMode">'+modeOpts.map(function(m){return '<option value="'+m+'" '+(m===info.access_mode?'selected':'')+'>'+m+'</option>';}).join('')+'</select></label><button class="rd-button" id="rdSaveShareMode">Apply visibility</button>':'')+
        '<div class="rd-side-section"><strong>People with access</strong><div id="rdSharePeople">'+(info.shares||[]).map(function(sh){return '<div class="rd-person"><span>'+esc(sh.full_name||sh.username)+'</span><strong>'+esc(sh.permission)+'</strong>'+(info.can_manage?'<button class="rd-button" data-revoke="'+esc(sh.user_id)+'">Remove</button>':'')+'</div>';}).join('')+'</div></div>'+
        (info.can_manage?'<div class="rd-side-section"><label>Organization member<select id="rdShareUser"><option value="">Choose member</option>'+userData.users.filter(function(u){return u.id!==state.userId&&u.status!=='Inactive';}).map(function(u){return personOpt(u);}).join('')+'</select></label><label>Permission<select id="rdSharePermission"><option value="view">View</option><option value="comment">Comment</option><option value="edit">Edit</option></select></label><button class="rd-button primary" id="rdGrantShare">Share & notify</button></div>':'')+
        '<div class="rd-actions" style="justify-content:flex-end">'+btn('Done','close-dialog')+'</div></div>';
      document.body.appendChild(wrap);
      function again(){shareDialog(type,id);}
      if(el('rdSaveShareMode'))el('rdSaveShareMode').onclick=async function(){try{await request(shareUrl,'PUT',{action:'access_mode',type:type,id:id,access_mode:el('rdShareMode').value});toast('Visibility updated');again();}catch(e){toast(e.message,true);}};
      if(el('rdGrantShare'))el('rdGrantShare').onclick=async function(){var uid=el('rdShareUser').value;if(!uid)return toast('Choose an organization member',true);try{await request(shareUrl,'POST',{type:type,id:id,user_id:uid,permission:el('rdSharePermission').value});toast('Shared — notification sent');again();}catch(e){toast(e.message,true);}};
      wrap.querySelectorAll('[data-revoke]').forEach(function(b){b.onclick=async function(){if(!confirm('Revoke this user’s access?'))return;try{await request(shareUrl,'DELETE',{type:type,id:id,user_id:b.dataset.revoke});toast('Access revoked');again();}catch(e){toast(e.message,true);}};});
      wrap.addEventListener('click',function(e){if(e.target===wrap)closeDialog();});
    }catch(e){toast(e.message,true);}
  }
  function shareTarget(id){
    var d=docById(id);if(d)return shareDialog(d.kind==='folder'?'folder':'page',d.id);
    var space=spaceById(id);if(space)return shareDialog('space',space.id);
  }
  function renderBulkBar(){
    var count=state.selected.size;
    if(count<2)return '';
    return '<div class="rd-bulk-bar" role="toolbar" aria-label="Bulk document actions"><strong>'+count+' selected</strong>'+btn('Move','bulk-move')+btn('Share','bulk-share')+btn('Add labels','bulk-labels')+btn('Export','bulk-export')+btn('Copy links','bulk-links')+btn('Delete','bulk-delete','danger')+btn('Clear','bulk-clear')+'</div>';
  }
  function selectedEntries(){return Array.from(state.selected).map(function(k){var i=k.indexOf(':'),type=k.slice(0,i),id=k.slice(i+1);return {type:type,id:id,doc:docById(id),file:state.files.find(function(f){return f.id===id;})};}).filter(function(e){return e.doc||e.file;});}
  async function bulkAction(action){
    if(action==='bulk-clear'){state.selected.clear();render();return;}
    var entries=selectedEntries();if(!entries.length)return toast('No items selected',true);
    if(action==='bulk-links'){
      var links=entries.map(function(e){return location.origin+(e.type==='file'?'/api/rexus-document-files?file='+encodeURIComponent(e.id):location.pathname+'#document/'+encodeURIComponent(e.id));});
      try{await navigator.clipboard.writeText(links.join('\n'));toast(links.length+' links copied');}catch(_){toast('Clipboard unavailable',true);}return;
    }
    if(action==='bulk-share'){
      var types=entries.filter(function(e){return !!e.doc;});if(!types.length)return toast('Share folders and documents individually; direct file access is inherited',true);
      try{
        var data=await request('/api/users');
        dialog('Share '+types.length+' items',[{name:'user_id',label:'Organization member',type:'select',options:[{label:'Select member',value:''}].concat(data.users.filter(function(u){return u.id!==state.userId;}).map(function(u){return {label:u.full_name||u.username,value:u.id,html:personOpt(u)};}))},{name:'permission',label:'Permission',type:'select',options:['view','comment','edit'].map(function(p){return {label:p,value:p};})}],async function(form){
          if(!form.user_id)throw Error('Choose a member');
          var ok=0,failed=[];
          for(const e of types){try{await request(shareUrl,'POST',{type:e.doc.kind==='folder'?'folder':'page',id:e.id,user_id:form.user_id,permission:form.permission});ok++;}catch(err){failed.push(e.doc.title+': '+err.message);}}
          toast(ok+' items shared, '+failed.length+' failed'+(failed.length?': '+failed[0]:''),!!failed.length);
        });
      }catch(e){toast(e.message,true);}return;
    }
    if(action==='bulk-labels'){
      var docs=entries.filter(function(e){return e.doc&&e.doc.kind==='page';});if(!docs.length)return toast('Select document pages to add labels',true);
      dialog('Add labels to '+docs.length+' documents',[{name:'labels',label:'Labels (comma separated)',required:true}],async function(form){
        var add=form.labels.split(',').map(function(l){return l.trim();}).filter(Boolean);var ok=0,fail=[];
        for(const e of docs){try{await request(baseUrl,'PUT',{action:'update_document',id:e.id,title:e.doc.title,body:e.doc.body,labels:Array.from(new Set((e.doc.labels||[]).concat(add))),expected_version:e.doc.version});ok++;}catch(err){fail.push(e.doc.title);}}
        toast(ok+' updated'+(fail.length?', failed: '+fail.join(', '):''),!!fail.length);state.selected.clear();
      });return;
    }
    if(action==='bulk-move'){
      var targets=entries.filter(function(e){return !!e.doc||!!e.file;});
      // One destination in the current space; cross-space moves intentionally prevented.
      var options=folderOptions(state.spaceId,'');
      dialog('Move '+targets.length+' items',[{name:'folder_id',label:'Destination folder',type:'select',options:options}],async function(form){
        var ok=0,failed=[];
        for(const e of targets){try{
          if(e.doc)await request(baseUrl,'PUT',{action:'move',id:e.id,parent_id:form.folder_id});
          else{if(!form.folder_id)throw Error('File requires a folder destination');await request(fileUrl,'PUT',{action:'move',id:e.id,folder_id:form.folder_id});}ok++;
        }catch(err){failed.push(e.id+': '+err.message);}}
        toast(ok+' moved; '+failed.length+' failed'+(failed.length?' — '+failed[0]:''),!!failed.length);state.selected.clear();
      });return;
    }
    if(action==='bulk-export'){
      var docs=entries.filter(function(e){return e.doc&&e.doc.kind==='page';});
      if(!docs.length)return toast('Select document pages for Word export',true);
      if(!window.RexusDocxExport)return toast('Word exporter unavailable',true);
      var ok=0;
      for(const e of docs){try{await window.RexusDocxExport.download(e.doc.title,contentHtml(e.doc));ok++;}catch(_){}}
      toast(ok+' Word file(s) created. Your browser may ask to allow multiple downloads.',ok!==docs.length);return;
    }
    if(action==='bulk-delete'){
      if(!confirm('Delete '+entries.length+' selected items? This cannot be undone. Linked or nonempty folders will be protected.'))return;
      // Pages first; folders last, deepest first.
      entries.sort(function(a,b){return (a.doc?.kind==='folder'?1:0)-(b.doc?.kind==='folder'?1:0);});
      var ok=0,errors=[];
      for(const e of entries){try{await request(e.file?fileUrl+'?file='+encodeURIComponent(e.id):baseUrl+'?id='+encodeURIComponent(e.id),'DELETE');state.selected.delete(e.type+':'+e.id);ok++;}catch(err){errors.push(err.message);}}
      await refresh(true);toast(ok+' deleted, '+errors.length+' failed'+(errors.length?' — '+errors[0]:''),!!errors.length);
    }
  }

  shell.addEventListener('click',async function(e){
    var ref=e.target.closest('a.rd-rexus-reference');if(!ref)return;
    e.preventDefault();
    var match=/^#rexus-(project|task|subtask)\/(.+)$/.exec(ref.getAttribute('href')||'');if(!match)return;
    try{
      var data=await request({project:'/api/projects',task:'/api/tasks',subtask:'/api/subtasks'}[match[1]]);
      var arr=data[match[1]==='project'?'projects':match[1]==='task'?'tasks':'subtasks']||[];
      var found=arr.find(function(x){return String(match[1]==='project'?x.name:x.id)===decodeURIComponent(match[2]);});
      if(!found){toast('This '+match[1]+' is not accessible with your account.',true);return;}
      // Work Management can be opened without inventing a route that bypasses access checks.
      home();if(!window.REXUSDeepLink?.(match[1],match[1]==='project'?found.name:found.id))toast('REXUS data is still loading. Open '+match[1]+': '+(found.name||found.title||found.id));
    }catch(err){toast(err.message,true);}
  });
  // Delegated actions in the independent workspace, preserving REXUS internals.
  shell.addEventListener('click',function(e){
    var target=e.target.closest('[data-rd]');if(!target)return;
    var action=target.dataset.rd,id=target.dataset.id;
    if(action==='retry')refresh(true);
    else if(action==='toggle-space-menu'){spaceMenuOpen=!spaceMenuOpen;paintSidebar();if(spaceMenuOpen&&el('rdSpaceSearch'))el('rdSpaceSearch').focus();}
    else if(action==='toggle-section'){if(collapsedSections.has(id))collapsedSections.delete(id);else collapsedSections.add(id);try{localStorage.setItem('rd-collapsed-sections',JSON.stringify(Array.from(collapsedSections)));}catch(e){}paintSidebar();var t=document.querySelector('[data-rd="toggle-section"][data-id="'+id+'"]');if(t)t.focus();}
    else if(action==='toggle-folder'){if(collapsedTreeFolders.has(id))collapsedTreeFolders.delete(id);else collapsedTreeFolders.add(id);paintSidebar();}
    else if(action==='space')spaceRoute(id);
    else if(action==='doc'){allFilesMode=false;gotoDocument(id);}
    else if(action==='overview'){if(!guardDraft())return;state.edit=false;state.dirty=false;state.home=true;allFilesMode=false;state.search='';state.pageId='';state.folderId='';render();}
    else if(action==='all-files'){if(!guardDraft())return;state.edit=false;state.dirty=false;state.home=false;allFilesMode=true;state.search='';state.pageId='';render();}
    else if(action==='new-space')newSpace();
    else if(action==='edit-space')editSpace();
    else if(action==='new-folder')newDocument('folder');
    else if(action==='new-page')newDocument('page');
    else if(action==='edit-page'){if(!perm(docById(state.pageId),'edit'))return toast('Edit permission required',true);state.edit=true;state.dirty=false;render();}
    else if(action==='cancel-edit'){if(!guardDraft())return;state.edit=false;state.dirty=false;render();}
    else if(action==='move')moveDocument(id);
    else if(action==='delete-doc')deleteDoc(id);
    else if(action==='share-page')shareTarget(state.pageId);
    else if(action==='share-target')shareTarget(id);
    else if(action==='comment-selection')commentSelection();
    else if(action==='toggle-comments'){if(state.edit&&state.dirty){persistPage(false).then(function(){if(!state.dirty){state.commentPanel=!state.commentPanel;render();}else toast('Save your changes first',true);});}else{state.commentPanel=!state.commentPanel;render();}}
    else if(action==='focus-thread'){state.commentPanel=true;state.activeThread=id;if(state.edit&&state.dirty)toast('Save changes before opening a thread',true);else render();}
    else if(action==='reply-thread'||action==='resolve-thread'||action==='reopen-thread')threadAction(action,id);
    else if(action.startsWith('bulk-'))bulkAction(action);
    else if(action==='history-page')historyDoc();
    else if(action==='search-label'){state.search=target.dataset.label||'';state.searchScope='labels';render();}
    else if(action==='clear-search'){state.search='';state.searchScope='all';render();}
    else if(action==='upload-file')upload('');
    else if(action==='replace-file')upload(id);
    else if(action==='file-versions')fileVersions(id);
    else if(action==='toggle-details'){if(state.edit&&state.dirty){persistPage(false).then(function(){if(!state.dirty){state.details=!state.details;render();}else toast('Save changes before switching panels',true);});}else{state.details=!state.details;render();}}
    else if(action==='apply-labels')updateLabels();
    else if(action==='export-menu')choice('Export document',[{label:'Word (.docx)',subtitle:'Download Word file',value:'word'},{label:'PDF',subtitle:'Print / save to PDF',value:'pdf'}],function(item){item.value==='word'?exportWord():exportPdf();});
    else if(action==='editor-actions')editorActions();
    else if(action==='export-word')exportWord();
    else if(action==='export-pdf')exportPdf();
    else if(action==='doc-options')docOptions(id);
    else if(action==='file-options')fileOptions(id);
    else if(action==='preview-file')previewFile(id);
    else if(action==='rename-doc')renameDoc(id);
    else if(action==='reply-comment')commentDialog(id);
    else if(action==='edit-comment')editComment(id);
    else if(action==='delete-comment')deleteComment(id);
    else if(action==='delete-file')deleteFile(id);
  });
  document.addEventListener('click',function(e){if(e.target.closest('[data-rd="close-dialog"]'))closeDialog();if(spaceMenuOpen&&!e.target.closest('.rd-space-dropdown,.rd-space-switch')){spaceMenuOpen=false;paintSidebar();}});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&spaceMenuOpen){spaceMenuOpen=false;paintSidebar();}});
  window.addEventListener('resize',function(){if(spaceMenuOpen)positionSpaceDropdown();},{passive:true});
  if(switcher)switcher.addEventListener('click',function(e){var button=e.target.closest('[data-rexus-app]');if(!button)return;if(button.dataset.rexusApp==='document')open();else home();});
  var fileInput=el('rdFileInput');if(fileInput)fileInput.addEventListener('change',function(){uploadFiles(fileInput);});
  window.addEventListener('beforeunload',function(e){if(state.edit&&state.dirty){e.preventDefault();e.returnValue='';}});
  window.RexusDocument={open:open,pick:pick,saveTaskAttachment:saveTaskAttachment};
  var match=/^#document\/([^?#]+)/.exec(location.hash);
  if(match)open(decodeURIComponent(match[1]));
  else {var sp=/^#space\/([^?#]+)/.exec(location.hash);if(sp){open();setTimeout(function(){spaceRoute(decodeURIComponent(sp[1]),true);},450);}}
  request('/api/auth/me').then(function(x){state.userId=x.user?.id||'';}).catch(function(){});
  window.addEventListener('hashchange',function(){var m=/^#document\/([^?#]+)/.exec(location.hash);if(m)open(decodeURIComponent(m[1]));else {var sp=/^#space\/([^?#]+)/.exec(location.hash);if(sp)spaceRoute(decodeURIComponent(sp[1]),true);}});
  window.addEventListener('popstate',function(){var sp=/^#space\/([^?#]+)/.exec(location.hash);if(sp)spaceRoute(decodeURIComponent(sp[1]),true);});
})();
