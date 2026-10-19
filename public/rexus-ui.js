/* =============================================================================
   REXUS v2.2.0 — interaction & accessibility layer for the design system.
   Progressive enhancement only: it never changes data, API payloads or the
   app's own event handlers. Everything it does is driven by existing markup.

   1. Keyboard access for legacy <div>/<span> controls (role, tabindex, Enter/Space)
   2. Accessible names for icon-only buttons
   3. Dialog management: ARIA, focus-in, focus trap, Escape, focus restore,
      background scroll lock
   4. Button feedback: loading state while a mutating request is in flight,
      double-submit guard, brief success / error state
   5. Live regions for toasts
   ========================================================================== */
(function(){
  'use strict';
  var doc = document, root = doc.documentElement;

  /* ---------------------------------------------------------------- 1 + 2 */
  // Legacy markup renders several controls as <div>/<span> with click handlers.
  var PSEUDO_BUTTONS = [
    '.wm-tab', '.wm-tabs-toggle', '.wm-detail-tab', '#wmNotifBellBtn', '#wmUserMenuBtn',
    '#wmUserMenu > div[data-action]', '#wmUserMenu > div[data-audit]', '.wm-notif-mark-read', '.wm-modal-close',
    '.wm-task-check', '.wm-cal-chip', '.wm-breadcrumb > span:first-child', '.wm-export-menu > div',
    '.wm-pd-more-menu > div', '.wm-chip-remove', '.wm-subtask-toggle', '.wm-auth-tab', '.wm-gsearch-item', '.wm-user-picker-item'
  ].join(',');
  var LABELS = {
    wmNotifBellBtn: 'Notifications', wmUserMenuBtn: 'Account menu', wmTabsToggle: 'Collapse or expand navigation',
    wmConfirmPopupClose: 'Dismiss message'
  };
  function nameFor(el){
    if (LABELS[el.id]) return LABELS[el.id];
    var t = el.getAttribute('title') || el.dataset.action || el.dataset.rd || '';
    if (!t && el.classList.contains('wm-chip-remove')) t = 'Remove';
    if (!t && el.classList.contains('wm-task-check')) t = el.classList.contains('checked') ? 'Mark as not completed' : 'Mark as completed';
    if (!t && /^[×✕✖]$/.test((el.textContent || '').trim())) t = 'Close';
    return t ? t.replace(/[-_]/g, ' ').replace(/^\w/, function(c){ return c.toUpperCase(); }) : '';
  }
  function enhanceControls(scope){
    (scope || doc).querySelectorAll(PSEUDO_BUTTONS).forEach(function(el){
      if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'INPUT') return;
      if (!el.hasAttribute('role')) el.setAttribute('role', el.closest('#wmUserMenu,.wm-export-menu,.wm-pd-more-menu') ? 'menuitem' : 'button');
      if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
    });
    // Navigation state
    (scope || doc).querySelectorAll('.wm-tab').forEach(function(el){
      if (el.classList.contains('active')) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
      if (!el.getAttribute('aria-label')) { var l = el.querySelector('.wm-tab-label'); if (l) el.setAttribute('aria-label', l.textContent.trim()); }
    });
    (scope || doc).querySelectorAll('.wm-detail-tab').forEach(function(el){ el.setAttribute('aria-selected', el.classList.contains('active') ? 'true' : 'false'); });
    (scope || doc).querySelectorAll('.wm-task-check').forEach(function(el){
      el.setAttribute('aria-pressed', el.classList.contains('checked') ? 'true' : 'false');
      el.setAttribute('aria-label', el.classList.contains('checked') ? 'Mark as not completed' : 'Mark as completed');
    });
    // Icon-only controls need an accessible name
    (scope || doc).querySelectorAll('button, [role="button"], .wm-glass-chip').forEach(function(el){
      if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return;
      var text = (el.textContent || '').replace(/[\s▾✓✕×✖⋯]+/g, '').trim();
      if (text) return;
      var n = nameFor(el); if (n) el.setAttribute('aria-label', n);
    });
    var bell = doc.getElementById('wmNotifBellBtn'); if (bell && !bell.hasAttribute('aria-haspopup')) { bell.setAttribute('aria-haspopup', 'dialog'); }
    var user = doc.getElementById('wmUserMenuBtn'); if (user && !user.hasAttribute('aria-haspopup')) { user.setAttribute('aria-haspopup', 'menu'); user.setAttribute('aria-label', 'Account menu'); }
  }
  // Enter / Space activate pseudo-buttons (native buttons already do this)
  doc.addEventListener('keydown', function(e){
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var el = e.target;
    if (!el || !el.matches || el.tagName === 'BUTTON' || el.tagName === 'A' || el.isContentEditable || /INPUT|SELECT|TEXTAREA/.test(el.tagName)) return;
    if (el.getAttribute('role') === 'button' || el.getAttribute('role') === 'menuitem') { e.preventDefault(); el.click(); }
  });

  /* ---------------------------------------------------------------- 3 */
  var FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  var openStack = [];   // [{el, returnTo}]
  function visible(el){ return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden'; }
  function dialogs(){
    var list = [];
    doc.querySelectorAll('.wm-modal-overlay.open').forEach(function(o){ list.push(o); });
    doc.querySelectorAll('.rd-dialog-wrap').forEach(function(o){ list.push(o); });
    doc.querySelectorAll('.rx-audit-screen:not([hidden])').forEach(function(o){ list.push(o); });
    // topmost = highest computed z-index, DOM order breaks ties
    return list.sort(function(a, b){ return (parseInt(getComputedStyle(a).zIndex, 10) || 0) - (parseInt(getComputedStyle(b).zIndex, 10) || 0); });
  }
  function labelDialog(overlay){
    var box = overlay.querySelector('.wm-modal, .rd-dialog, .rx-audit-panel') || overlay;
    if (!box.hasAttribute('role')) box.setAttribute('role', overlay.id === 'wmConfirmModal' ? 'alertdialog' : 'dialog');
    box.setAttribute('aria-modal', 'true');
    var h = box.querySelector('h3, h2, .rx-audit-title');
    if (h && !box.hasAttribute('aria-labelledby')) { if (!h.id) h.id = 'rxdlg-' + Math.random().toString(36).slice(2, 8); box.setAttribute('aria-labelledby', h.id); }
    if (overlay.id === 'wmConfirmModal') { var m = doc.getElementById('wmConfirmMessage'); if (m) box.setAttribute('aria-describedby', 'wmConfirmMessage'); }
    return box;
  }
  function initialFocus(overlay, box){
    var target = null;
    if (overlay.id === 'wmConfirmModal') target = doc.getElementById('wmConfirmCancel') || doc.getElementById('wmConfirmOk'); // safe default for destructive prompts
    if (!target) target = box.querySelector('[autofocus]') || Array.prototype.find.call(box.querySelectorAll('.wm-modal-body input:not([type=hidden]):not([readonly]), .wm-modal-body select, .wm-modal-body textarea, .rd-dialog input:not([readonly]), .rd-dialog select, .rd-dialog textarea'), visible);
    if (!target) target = Array.prototype.find.call(box.querySelectorAll(FOCUSABLE), visible);
    if (target) { try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); } }
  }
  var confirmTrigger = null;
  function syncDialogs(){
    var current = dialogs();
    var confirmOpen = current.some(function(o){ return o.id === 'wmConfirmModal'; });
    var confirmWasOpen = openStack.some(function(s){ return s.el.id === 'wmConfirmModal'; });
    if (confirmOpen && !confirmWasOpen && lastActivation && !lastActivation.el.closest('#wmConfirmModal') && performance.now() - lastActivation.t < 1000) {
      // While "Create this project?" is open, a second click on Save would stack a second
      // confirmation (both resolve on one OK → duplicate records). Hold the trigger.
      confirmTrigger = lastActivation.el; confirmTrigger.setAttribute('data-rx-awaiting', '');
    }
    if (!confirmOpen && confirmWasOpen && confirmTrigger) {
      var t = confirmTrigger;
      setTimeout(function(){ if (confirmTrigger === t) { t.removeAttribute('data-rx-awaiting'); confirmTrigger = null; } }, 600);
    }
    // newly opened
    current.forEach(function(o){
      if (openStack.some(function(s){ return s.el === o; })) return;
      var box = labelDialog(o);
      openStack.push({ el: o, returnTo: doc.activeElement });
      requestAnimationFrame(function(){ if (!box.contains(doc.activeElement)) initialFocus(o, box); });
    });
    // closed → restore focus to the control that opened it
    openStack = openStack.filter(function(s){
      if (current.indexOf(s.el) !== -1) return true;
      var r = s.returnTo;
      if (r && r.isConnected && typeof r.focus === 'function' && visible(r)) { try { r.focus({ preventScroll: true }); } catch (e) {} }
      return false;
    });
    root.classList.toggle('rx-scroll-locked', current.length > 0);
  }
  function topDialog(){ var d = dialogs(); return d.length ? d[d.length - 1] : null; }
  doc.addEventListener('keydown', function(e){
    if (e.target && e.target.closest && e.target.closest('.rx-combo-pop')) return;   // GEN-08 list handles its own keys
    if (doc.querySelector('.rx-notify-layer:not(.is-out)')) return;                 // GEN-10 notification on top handles Esc / Tab
    var top = topDialog(); if (!top) return;
    if (e.key === 'Escape') {
      // Re-use the dialog's own close/cancel control so app logic (promise resolution etc.) runs unchanged.
      var close;
      if (top.id === 'wmConfirmModal') {
        // askConfirm() → Cancel resolves false; showAlert() has only OK (its head ✕ has no listener).
        close = doc.getElementById('wmConfirmCancel') || doc.getElementById('wmConfirmOk');
      } else {
        close = top.querySelector('.wm-modal-head button, .wm-modal-close, [data-rd="close-dialog"], [data-rd="cancel"], .rx-audit-header button');
      }
      if (close) { e.preventDefault(); e.stopPropagation(); close.click(); }
      return;
    }
    if (e.key === 'Tab') {
      var box = top.querySelector('.wm-modal, .rd-dialog, .rx-audit-panel') || top;
      var items = Array.prototype.filter.call(box.querySelectorAll(FOCUSABLE), visible);
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (!box.contains(doc.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, true);

  /* ---------------------------------------------------------------- 4 */
  // Track which button the user just activated; a mutating request started in the
  // same interaction (≤1.5 s, e.g. after an awaited confirm) marks that button busy.
  var BTN = '.wm-btn, .rd-button, .rx210-btn, .wm-new-btn, .wm-auth-submit, .rx211-bulk-tools button, .wm-icon-btn, .wm-glass-icon-btn';
  var lastActivation = null;
  doc.addEventListener('click', function(e){
    var b = e.target && e.target.closest && e.target.closest(BTN);
    if (!b) return;
    if (b.getAttribute('aria-busy') === 'true' || b.hasAttribute('data-rx-awaiting')) {   // double-submit guard
      e.preventDefault(); e.stopImmediatePropagation(); return;
    }
    lastActivation = { el: b, t: performance.now() };
  }, true);
  function setBusy(b, on){
    if (on) { b.setAttribute('aria-busy', 'true'); b.classList.add('is-loading'); b.classList.remove('is-success', 'is-error'); }
    else { b.removeAttribute('aria-busy'); b.classList.remove('is-loading'); }
  }
  function flash(b, cls){
    if (!b.isConnected) return;
    b.classList.add(cls);
    setTimeout(function(){ b.classList.remove(cls); }, 1400);
  }
  if (window.fetch && !window.fetch.__rxWrapped) {
    var nativeFetch = window.fetch;
    var wrapped = function(input, init){
      var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      var act = lastActivation, btn = null;
      if (method !== 'GET' && method !== 'HEAD' && act && act.el.isConnected && performance.now() - act.t < 1500) {
        btn = act.el; lastActivation = null;
        // A request fired from the confirm dialog's OK belongs to the button that asked for confirmation.
        if (btn.closest('#wmConfirmModal') && confirmTrigger && confirmTrigger.isConnected) btn = confirmTrigger;
        if (confirmTrigger) { confirmTrigger.removeAttribute('data-rx-awaiting'); confirmTrigger = null; }
        if (btn.getAttribute('aria-busy') !== 'true') setBusy(btn, true); else btn = null;
      }
      var p = nativeFetch.apply(this, arguments);
      if (!btn) return p;
      var safety = setTimeout(function(){ setBusy(btn, false); }, 20000);
      p.then(function(res){ clearTimeout(safety); setBusy(btn, false); flash(btn, res && res.ok ? 'is-success' : 'is-error'); },
             function(){ clearTimeout(safety); setBusy(btn, false); flash(btn, 'is-error'); });
      return p;
    };
    wrapped.__rxWrapped = true;
    window.fetch = wrapped;
  }

  /* ---------------------------------------------------------------- 4b */
  // Table column hygiene: short values (dates, IDs, numbers, money) never break
  // mid-token; long-text columns get a minimum width so they don't collapse into
  // one-word-per-line stacks. Purely presentational classes.
  var WIDE = /^(task|tasks|project|name|title|description|employee|request|notes|document|file)$/i;
  var MID = /^(owner|assignee|department|requester|status|type|email|position|role)$/i;
  // Legacy screens (Finance, Org, Configuration…) render bare inline-styled tables
  // with no scroll container: on phones their numbers broke mid-digit. Give them the
  // shared table styling and a horizontal scroll wrapper.
  function adoptBareTables(){
    doc.querySelectorAll('.wm-app .wm-body table:not(.wm-table):not(.rx210-table):not(.wm-worklog-grid):not([border]):not(.rx-table), .wm-app .wm-modal-body table:not(.wm-table):not([border]):not(.rx-table)').forEach(function(t){
      if (t.closest('.wm-rte-editor, .wm-rich-content, #orgChartCanvas, [contenteditable]')) return;
      t.classList.add('rx-table');
      var p = t.parentElement, scrolls = false;
      for (var a = p; a && a !== doc.body; a = a.parentElement) {
        var ox = getComputedStyle(a).overflowX;
        if (ox === 'auto' || ox === 'scroll') { scrolls = true; break; }
        if (a.classList.contains('wm-view') || a.classList.contains('wm-modal-body')) break;
      }
      if (!scrolls) { var w = doc.createElement('div'); w.className = 'rx-table-scroll'; p.insertBefore(w, t); w.appendChild(t); }
    });
  }
  function tidyTables(){
    adoptBareTables();
    doc.querySelectorAll('table.wm-table, table.rx210-table, table.rx-table').forEach(function(t){
      if (t.tHead && !t.dataset.rxCols) {
        Array.prototype.forEach.call(t.tHead.rows[0] ? t.tHead.rows[0].cells : [], function(th){
          var txt = (th.textContent || '').replace(/[▲▼↑↓⇅\s]+$/g, '').trim();
          if (WIDE.test(txt)) th.classList.add('rx-col-wide'); else if (MID.test(txt)) th.classList.add('rx-col-mid');
        });
        t.dataset.rxCols = '1';
      }
      Array.prototype.forEach.call(t.tBodies.length ? t.tBodies[0].rows : [], function(row){
        if (row.dataset.rxTidy === '1') return;
        Array.prototype.forEach.call(row.cells, function(td){
          var txt = (td.textContent || '').trim();
          if (txt.length && txt.length <= 16 && !/\s{2,}/.test(txt) && (/^[\d\s.,:%\/+\-–₫$€hVNDvnd]+$/.test(txt) || /^[A-Za-z]{3}\s\d{1,2}(,\s\d{4})?$/.test(txt) || /^\S+$/.test(txt))) td.classList.add('rx-nowrap');
        });
        row.dataset.rxTidy = '1';
      });
    });
  }

  /* ---------------------------------------------------------------- 4c */
  // GEN-07 (v2.2.2): drag a header edge to resize a column, in every data table of REXUS and
  // REXUS Document. Widths are remembered per browser (localStorage) per table; double-click
  // an edge to reset. Keyboard: focus the edge, Arrow Left/Right. Touch keeps the normal table.
  var MIN_COL = 56;
  function tableKey(t){
    var view = t.closest('[id^="view-"], #rexusDocsShell, .wm-modal-overlay, [id]');
    var heads = Array.prototype.map.call(t.tHead.rows[0].cells, function(th){ return (th.textContent || '').replace(/[▲▼↑↓⇅]/g, '').trim().slice(0, 24); });
    return 'rx-colw:' + (t.id || (view ? view.id || view.className.split(' ')[0] : '')) + '|' + heads.join('|');
  }
  function readW(k){ try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return Array.isArray(v) ? v : null; } catch (e) { return null; } }
  function writeW(k, v){ try { v ? localStorage.setItem(k, JSON.stringify(v)) : localStorage.removeItem(k); } catch (e) {} }
  function applyW(t, ws){
    var cells = t.tHead.rows[0].cells, sum = 0;
    for (var i = 0; i < cells.length; i++) { cells[i].style.width = ws[i] + 'px'; sum += ws[i]; }
    t.style.tableLayout = 'fixed'; t.style.width = sum + 'px'; t.classList.add('rx-resized');
  }
  function freeze(t){
    var ws = Array.prototype.map.call(t.tHead.rows[0].cells, function(th){ return Math.max(MIN_COL, Math.round(th.getBoundingClientRect().width)); });
    applyW(t, ws); return ws;
  }
  function resizableTables(){
    doc.querySelectorAll('.wm-app table, #rexusDocsShell table').forEach(function(t){
      if (t.dataset.rxResize || !t.tHead || !t.tHead.rows[0] || t.closest('.wm-rte-editor, .wm-rich-content, [contenteditable], .rd-editor, .wm-worklog-grid')) return;
      var cells = t.tHead.rows[0].cells; if (cells.length < 2 || Array.prototype.some.call(cells, function(c){ return c.colSpan > 1; })) return;
      t.dataset.rxResize = '1';
      var key = tableKey(t), saved = readW(key);
      if (saved && saved.length === cells.length) applyW(t, saved);
      Array.prototype.forEach.call(cells, function(th, i){
        var h = doc.createElement('span');
        h.className = 'rx-col-resizer'; h.setAttribute('role', 'separator'); h.setAttribute('aria-orientation', 'vertical');
        h.setAttribute('tabindex', '0'); h.setAttribute('aria-label', 'Resize column ' + ((th.textContent || '').trim() || (i + 1)));
        h.addEventListener('click', function(e){ e.stopPropagation(); });   // never trigger header sorting
        h.addEventListener('dblclick', function(e){ e.stopPropagation(); writeW(key, null); t.style.tableLayout = ''; t.style.width = ''; t.classList.remove('rx-resized'); Array.prototype.forEach.call(cells, function(c){ c.style.width = ''; }); });
        h.addEventListener('keydown', function(e){
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault(); var ws = t.classList.contains('rx-resized') ? readW(key) || freeze(t) : freeze(t);
          ws[i] = Math.max(MIN_COL, ws[i] + (e.key === 'ArrowRight' ? 16 : -16)); applyW(t, ws); writeW(key, ws);
        });
        h.addEventListener('pointerdown', function(e){
          if (e.button !== 0) return; e.preventDefault(); e.stopPropagation();
          var ws = freeze(t), x0 = e.clientX, w0 = ws[i];
          h.setPointerCapture(e.pointerId); doc.body.classList.add('rx-col-resizing');
          function move(ev){ ws[i] = Math.max(MIN_COL, Math.round(w0 + ev.clientX - x0)); applyW(t, ws); }
          function up(){ h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up); doc.body.classList.remove('rx-col-resizing'); writeW(key, ws); }
          h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
        });
        if (getComputedStyle(th).position === 'static') th.style.position = 'relative';   // keep sticky headers sticky
        th.appendChild(h); th.classList.add('rx-th-resizable');
      });
    });
  }

  /* ---------------------------------------------------------------- 5 */
  function liveRegions(){
    [['wmSync', 'status']].forEach(function(p){
      var el = doc.getElementById(p[0]); if (el && !el.hasAttribute('role')) { el.setAttribute('role', p[1]); el.setAttribute('aria-live', 'polite'); el.setAttribute('aria-atomic', 'true'); }
    });
  }


  /* ---------------------------------------------------------------- 6  GEN-08 searchable selection lists
     Every <select> with more than 7 options becomes a searchable combobox (multi-selects get checkboxes,
     a count, "Select all" for the filtered results and "Clear"). The native <select> stays in the form as the
     source of truth, so form code, validation and saved values are unchanged. Checkbox lists marked
     [data-rx-searchlist] get the same search toolbar. Matching ignores case and Vietnamese diacritics and
     looks at the visible text plus data-search (username / email). */
  var PICK_MIN = 8, PICK_DEBOUNCE = 300, PICK_MAX_ROWS = 300, pickSeq = 0;
  function fold(s){ return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase(); }
  function optHay(o){ return fold(o.text + ' ' + (o.getAttribute('data-search') || '')); }
  function escH(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function debounce(fn, ms){ var t; return function(){ clearTimeout(t); t = setTimeout(fn, ms); }; }
  var openCombo = null;
  function enhanceSelects(){
    doc.querySelectorAll('select:not([data-rx-pick]):not([data-rx-nosearch])').forEach(function(sel){
      if ((sel.options.length < PICK_MIN && !sel.hasAttribute('data-rx-search')) || sel.closest('.rd-editor, [contenteditable]')) return;   // data-rx-search: always searchable
      combo(sel);
    });
    doc.querySelectorAll('[data-rx-searchlist]:not([data-rx-pick])').forEach(searchList);
  }
  function combo(sel){
    var multi = sel.multiple, id = 'rxPick' + (++pickSeq);
    sel.setAttribute('data-rx-pick', '1');
    var cs = getComputedStyle(sel), h = sel.offsetHeight, look = { fontSize: cs.fontSize, fontWeight: cs.fontWeight, minHeight: h && !multi ? h + 'px' : '' };   // match the field it replaces
    var box = doc.createElement('div'); box.className = 'rx-combo' + (multi ? ' is-multi' : '');
    sel.parentNode.insertBefore(box, sel);
    var btn = doc.createElement('button'); btn.type = 'button'; btn.className = 'rx-combo-btn'; btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false'); btn.id = sel.id ? sel.id + 'Pick' : id + 'b';
    btn.innerHTML = '<span class="rx-combo-label"></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
    box.appendChild(btn); box.appendChild(sel);
    if (look.minHeight || h) Object.keys(look).forEach(function(k){ if (look[k]) btn.style[k] = look[k]; });
    sel.classList.add('rx-combo-native'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    // keep the field's <label for=…> pointing at something focusable
    if (sel.id) doc.querySelectorAll('label[for="' + sel.id + '"]').forEach(function(l){ l.setAttribute('for', btn.id); });
    var lab = sel.getAttribute('aria-label') || (sel.closest('label') ? sel.closest('label').textContent : '') || (box.closest('.wm-form-row') && box.closest('.wm-form-row').querySelector('label') ? box.closest('.wm-form-row').querySelector('label').textContent : '');
    if (lab) btn.setAttribute('aria-label', lab.replace(/\s+/g, ' ').trim());
    var pop = null, q, list, empty, count, active = -1, shown = [], navMoved = false;
    function label(){
      var picked = [].filter.call(sel.options, function(o){ return o.selected; });
      var t = multi ? (picked.length ? (picked.length <= 2 ? picked.map(function(o){ return o.text; }).join(', ') : picked.length + ' selected') : 'None selected') : (picked[0] ? picked[0].text : '');
      btn.querySelector('.rx-combo-label').textContent = t || ' '; btn.disabled = sel.disabled; btn.title = t;
    }
    function place(){
      if (!pop) return;
      var r = btn.getBoundingClientRect(), vh = window.innerHeight, w = Math.max(r.width, 260);
      pop.style.width = Math.min(w, window.innerWidth - 16) + 'px';
      pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - Math.min(w, window.innerWidth - 16) - 8)) + 'px';
      var below = vh - r.bottom, h = Math.min(360, Math.max(below, r.top) - 12);
      pop.style.maxHeight = h + 'px';
      if (below < 220 && r.top > below) { pop.style.top = ''; pop.style.bottom = (vh - r.top + 4) + 'px'; } else { pop.style.bottom = ''; pop.style.top = (r.bottom + 4) + 'px'; }
    }
    function render(){
      var f = fold(q.value.trim()), html = '', n = 0; shown = [];
      [].forEach.call(sel.options, function(o, i){
        if (o.hidden || (f && optHay(o).indexOf(f) === -1)) return;
        shown.push(i); if (n++ >= PICK_MAX_ROWS) return;
        html += '<div role="option" id="' + id + 'o' + i + '" data-i="' + i + '" class="rx-combo-opt' + (o.disabled ? ' is-disabled' : '') + '" aria-selected="' + o.selected + '"' + (o.disabled ? ' aria-disabled="true"' : '') + '>' + (multi ? '<span class="rx-combo-box" aria-hidden="true"></span>' : '') + '<span>' + escH(o.text || ' ') + '</span></div>';
      });
      if (shown.length > PICK_MAX_ROWS) html += '<div class="rx-combo-more">' + (shown.length - PICK_MAX_ROWS) + ' more — keep typing to narrow the list</div>';
      list.innerHTML = html; empty.hidden = shown.length > 0;
      if (count) count.textContent = [].filter.call(sel.options, function(o){ return o.selected && o.value !== ''; }).length + ' selected';
      if (active >= 0 && shown.indexOf(active) === -1) active = -1;
      if (active === -1 && shown.length && !f && !multi) active = sel.selectedIndex >= 0 ? sel.selectedIndex : shown[0];
      if (active === -1 && shown.length && f) active = shown[0];
      mark();
    }
    function mark(){
      list.querySelectorAll('.is-active').forEach(function(e){ e.classList.remove('is-active'); });
      var el = active >= 0 ? doc.getElementById(id + 'o' + active) : null;
      if (el) { el.classList.add('is-active'); q.setAttribute('aria-activedescendant', el.id); el.scrollIntoView({ block: 'nearest' }); } else q.removeAttribute('aria-activedescendant');
    }
    function changed(){ sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); label(); }
    function choose(i){
      var o = sel.options[i]; if (!o || o.disabled) return;
      if (multi) { o.selected = !o.selected; changed(); render(); return; }
      sel.selectedIndex = i; changed(); close(true);
    }
    function open(){
      if (sel.disabled) return;
      if (openCombo && openCombo !== api) openCombo.close();
      pop = doc.createElement('div'); pop.className = 'rx-combo-pop'; pop.setAttribute('data-rx-nodirty', '');
      pop.innerHTML = '<input type="search" class="rx-combo-q" placeholder="Search…" autocomplete="off" role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="' + id + 'l" aria-label="Search ' + escH(btn.getAttribute('aria-label') || 'options') + '">' +
        (multi ? '<div class="rx-combo-tools"><span class="rx-combo-count" aria-live="polite"></span><button type="button" data-all>Select all</button><button type="button" data-clear>Clear</button></div>' : '') +
        '<div class="rx-combo-list" role="listbox" id="' + id + 'l"' + (multi ? ' aria-multiselectable="true"' : '') + '></div><div class="rx-combo-empty" role="status" hidden>No results found</div>';
      doc.body.appendChild(pop);   // fixed layer above every page / dialog (sticky bars included)
      q = pop.querySelector('.rx-combo-q'); list = pop.querySelector('.rx-combo-list'); empty = pop.querySelector('.rx-combo-empty'); count = pop.querySelector('.rx-combo-count');
      active = -1; render(); place(); btn.setAttribute('aria-expanded', 'true'); box.classList.add('is-open');
      q.addEventListener('input', debounce(function(){ navMoved = false; active = -1; render(); }, PICK_DEBOUNCE));
      q.addEventListener('keydown', function(e){
        var k = shown.indexOf(active);
        if (e.key === 'ArrowDown') { e.preventDefault(); navMoved = true; active = shown[Math.min(shown.length - 1, k + 1)]; if (active === undefined) active = -1; mark(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); navMoved = true; active = shown[Math.max(0, k - 1)]; if (active === undefined) active = -1; mark(); }
        else if (e.key === 'Enter') { e.preventDefault(); if (active >= 0) choose(active); }
        else if (e.key === ' ' && navMoved && active >= 0) { e.preventDefault(); choose(active); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
      });
      list.addEventListener('mousedown', function(e){ e.preventDefault(); });
      list.addEventListener('click', function(e){ var o = e.target.closest('[data-i]'); if (o) { active = +o.dataset.i; choose(active); if (multi) q.focus(); } });
      if (multi) {
        pop.querySelector('[data-all]').onclick = function(){ shown.forEach(function(i){ var o = sel.options[i]; if (!o.disabled && o.value !== '') o.selected = true; }); changed(); render(); q.focus(); };
        pop.querySelector('[data-clear]').onclick = function(){ [].forEach.call(sel.options, function(o){ o.selected = false; }); changed(); render(); q.focus(); };
      }
      pop.addEventListener('keydown', function(e){
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
        else if (e.key === 'Tab') {   // stay inside the list: search ↔ Select all ↔ Clear; single lists close back to the field
          e.preventDefault(); if (!multi) return close(true);
          var f = [].slice.call(pop.querySelectorAll('input, button')), i = f.indexOf(doc.activeElement);
          f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
        }
      });
      setTimeout(function(){ q.focus(); }, 0);
      openCombo = api;
    }
    function close(refocus){
      if (!pop) return; pop.remove(); pop = null; btn.setAttribute('aria-expanded', 'false'); box.classList.remove('is-open');
      if (openCombo === api) openCombo = null; if (refocus) btn.focus();
    }
    var api = { close: close, place: place, el: box, contains: function(n){ return box.contains(n) || (pop && pop.contains(n)); } };
    btn.addEventListener('click', function(){ pop ? close(true) : open(); });
    btn.addEventListener('keydown', function(e){ if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !pop) { e.preventDefault(); open(); } });
    sel.addEventListener('change', label);
    new MutationObserver(function(){ label(); if (pop) render(); }).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'style'] });
    // programmatic sel.value = … fires no event: re-read the label whenever the field is shown or focused
    box.addEventListener('focusin', label);
    sel._rxPick = api; label();
  }
  doc.addEventListener('mousedown', function(e){ if (openCombo && !openCombo.contains(e.target)) openCombo.close(false); }, true);
  window.addEventListener('resize', function(){ if (openCombo) openCombo.place(); });
  doc.addEventListener('scroll', function(e){ if (openCombo && !(e.target.closest && e.target.closest('.rx-combo-pop'))) openCombo.place(); }, true);

  function searchList(box){
    box.setAttribute('data-rx-pick', '1');
    var items = function(){ return [].slice.call(box.querySelectorAll('label')).filter(function(l){ return l.querySelector('input[type=checkbox]'); }); };
    if (items().length < PICK_MIN) return;
    var bar = doc.createElement('div'); bar.className = 'rx-pick-bar'; bar.setAttribute('data-rx-nodirty', '');
    bar.innerHTML = '<input type="search" class="rx-pick-q" placeholder="Search by name, username or email…" aria-label="Search the list" autocomplete="off">' +
      '<span class="rx-pick-count" aria-live="polite"></span><button type="button" class="wm-btn rx-btn-sm" data-all>Select all</button><button type="button" class="wm-btn rx-btn-sm" data-clear>Clear</button>';
    box.parentNode.insertBefore(bar, box);
    var emptyEl = doc.createElement('p'); emptyEl.className = 'rx-pick-empty'; emptyEl.setAttribute('role', 'status'); emptyEl.textContent = 'No results found'; emptyEl.hidden = true;
    box.parentNode.insertBefore(emptyEl, box.nextSibling);
    var q = bar.querySelector('.rx-pick-q'), cnt = bar.querySelector('.rx-pick-count');
    function boxes(visibleOnly){ return items().filter(function(l){ return !visibleOnly || !l.hidden; }).map(function(l){ return l.querySelector('input[type=checkbox]'); }); }
    function sync(){
      var all = boxes(false), on = all.filter(function(c){ return c.checked; }).length, dis = all.every(function(c){ return c.disabled; });
      cnt.textContent = on + ' selected'; [q].concat([].slice.call(bar.querySelectorAll('button'))).forEach(function(x){ x.disabled = dis; });
    }
    function filter(){
      var f = fold(q.value.trim()), n = 0;
      items().forEach(function(l){ var hit = !f || fold(l.textContent + ' ' + (l.getAttribute('data-search') || '')).indexOf(f) !== -1; l.hidden = !hit; if (hit) n++; });
      emptyEl.hidden = n > 0;
    }
    function fire(c){ c.dispatchEvent(new Event('change', { bubbles: true })); }
    q.addEventListener('input', debounce(filter, PICK_DEBOUNCE));
    q.addEventListener('keydown', function(e){ if (e.key === 'Enter') { e.preventDefault(); filter(); } if (e.key === 'ArrowDown') { e.preventDefault(); var c = boxes(true).filter(function(x){ return !x.disabled; })[0]; if (c) c.focus(); } });
    box.addEventListener('keydown', function(e){
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return;
      var vis = boxes(true).filter(function(x){ return !x.disabled; }), i = vis.indexOf(doc.activeElement); if (i === -1) return;
      e.preventDefault();
      if (e.key === 'Enter') { vis[i].checked = !vis[i].checked; fire(vis[i]); sync(); return; }
      var nx = vis[i + (e.key === 'ArrowDown' ? 1 : -1)]; if (nx) nx.focus(); else if (e.key === 'ArrowUp') q.focus();
    });
    bar.querySelector('[data-all]').onclick = function(){ boxes(true).forEach(function(c){ if (!c.disabled && !c.checked) { c.checked = true; fire(c); } }); sync(); };
    bar.querySelector('[data-clear]').onclick = function(){ boxes(false).forEach(function(c){ if (!c.disabled && c.checked) { c.checked = false; fire(c); } }); sync(); };
    (box.closest('form') || box).addEventListener('change', function(){ setTimeout(sync, 0); });
    sync();
  }

  /* ---------------------------------------------------------------- boot */
  var scheduled = false;
  function run(){ scheduled = false; enhanceSelects(); enhanceControls(); syncDialogs(); liveRegions(); tidyTables(); resizableTables(); }
  function schedule(){ if (!scheduled) { scheduled = true; requestAnimationFrame(run); } }
  new MutationObserver(schedule).observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
  run();
  window.REXUSui = { refresh: run, fold: fold, version: '2.2.3' };
})();
