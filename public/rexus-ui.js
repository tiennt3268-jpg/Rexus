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
      if (t.closest('.wm-rte-editor, .wm-rich-content, #pdGanttChart, #orgChartCanvas, [contenteditable]')) return;
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

  /* ---------------------------------------------------------------- 5 */
  function liveRegions(){
    [['wmSync', 'status'], ['wmConfirmPopup', 'status']].forEach(function(p){
      var el = doc.getElementById(p[0]); if (el && !el.hasAttribute('role')) { el.setAttribute('role', p[1]); el.setAttribute('aria-live', 'polite'); el.setAttribute('aria-atomic', 'true'); }
    });
    var popup = doc.getElementById('wmConfirmPopup');
    if (popup) popup.classList.contains('error') ? popup.setAttribute('aria-live', 'assertive') : popup.setAttribute('aria-live', 'polite');
  }

  /* ---------------------------------------------------------------- boot */
  var scheduled = false;
  function run(){ scheduled = false; enhanceControls(); syncDialogs(); liveRegions(); tidyTables(); }
  function schedule(){ if (!scheduled) { scheduled = true; requestAnimationFrame(run); } }
  new MutationObserver(schedule).observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
  run();
  window.REXUSui = { refresh: run, version: '2.2.0' };
})();
