/* REXUS v2.1.1 — progressive multi-row actions for read-only list screens.
 * Explicit task and document bulk workflows continue to own their own actions.
 * No generic operation may mutate server records; Copy/CSV operate on visible rows.
 */
(function(){'use strict';
  var root=document.querySelector('.wm-app');if(!root)return;
  var scheduled=false;
  function safeCsv(rows){return rows.map(function(cols){return cols.map(function(x){return '"'+String(x).replace(/"/g,'""')+'"';}).join(',');}).join('\r\n');}
  function enhance(table){
    if(table.dataset.rexusBulkEnhanced || table.closest('#rexusDocsShell') || table.querySelector('.wm-bulk-check,.rd-item-check'))return;
    var head=table.tHead?.rows?.[0],body=table.tBodies?.[0];if(!head||!body||!body.rows.length)return;
    if(table.querySelector('input[type=checkbox]'))return; // preserve native bulk selections
    table.dataset.rexusBulkEnhanced='1';
    var th=document.createElement('th');th.className='rx211-check-col';
    th.innerHTML='<input type="checkbox" aria-label="Select all visible rows" class="rx211-select-all">';head.insertBefore(th,head.firstChild);
    Array.from(body.rows).forEach(function(row){
      var td=document.createElement('td');td.className='rx211-check-col';td.innerHTML='<input class="rx211-row-check" type="checkbox" aria-label="Select row">';row.insertBefore(td,row.firstChild);
    });
    var wrap=table.closest('.wm-table-wrap,.rx210-table-wrap');if(!wrap)return;
    var bar=document.createElement('div');bar.className='rx211-bulk-tools';bar.hidden=true;
    bar.innerHTML='<strong class="rx211-count">0 selected</strong><button type="button" data-rx211="copy">Copy rows</button><button type="button" data-rx211="csv">Export selected CSV</button><button type="button" data-rx211="clear">Clear</button>';
    wrap.parentNode.insertBefore(bar,wrap);
    function rows(){return Array.from(body.rows).filter(function(row){return row.querySelector('.rx211-row-check')?.checked;});}
    function values(row){return Array.from(row.cells).slice(1).map(function(c){return c.textContent.trim().replace(/\s+/g,' ');});}
    function sync(){var selected=rows();bar.hidden=!selected.length;bar.querySelector('.rx211-count').textContent=selected.length+' selected';var checks=body.querySelectorAll('.rx211-row-check');th.querySelector('input').checked=selected.length===checks.length;th.querySelector('input').indeterminate=selected.length>0&&selected.length<checks.length;}
    table.addEventListener('change',function(e){if(e.target.classList.contains('rx211-select-all'))body.querySelectorAll('.rx211-row-check').forEach(function(c){c.checked=e.target.checked;});if(e.target.matches('.rx211-row-check,.rx211-select-all'))sync();});
    bar.addEventListener('click',async function(e){var action=e.target.closest('[data-rx211]')?.dataset.rx211;if(!action)return;
      if(action==='clear'){body.querySelectorAll('.rx211-row-check').forEach(function(c){c.checked=false;});sync();return;}
      var lines=[Array.from(head.cells).slice(1).map(function(c){return c.textContent.trim();})].concat(rows().map(values));
      if(action==='copy'){try{await navigator.clipboard.writeText(lines.map(function(l){return l.join('\t');}).join('\n'));}catch(err){alert('Clipboard unavailable: '+err.message);}return;}
      var data=new Blob(['\uFEFF'+safeCsv(lines)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(data),link=document.createElement('a');link.href=url;link.download='REXUS-selected-rows.csv';link.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);
    });
  }
  function scan(){scheduled=false;root.querySelectorAll('table.wm-table,table.rx210-table').forEach(enhance);}
  var observer=new MutationObserver(function(){if(!scheduled){scheduled=true;requestAnimationFrame(scan);}});
  observer.observe(root,{subtree:true,childList:true});scan();
})();
