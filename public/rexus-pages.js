/* =============================================================================
   REXUS v2.2.3 — form pages (GEN-09).
   Forms with more than four fields open as their own page instead of a pop-up:
     - a URL of their own: #/f/<route>?<params> (refresh, new tab, shared link, browser Back/Forward)
     - a breadcrumb and a Back button that returns to the exact previous screen (it is kept, not re-rendered)
     - action buttons pinned to the bottom of the page
     - a confirmation before leaving with unsaved changes (in-app navigation, Back, refresh/close tab)
   Pages can stack (e.g. a work-log entry opened from a task page). Permissions are unchanged: every
   page calls the same API as before, so the server decides exactly as it did for the pop-up.
   Hooks expected from index.html: window.REXUSLegacy.{showView, confirm}.
   ========================================================================== */
(function () {
  'use strict';
  var ROUTES = {}, STACK = [], booted = false;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var top = function () { return STACK[STACK.length - 1] || null; };
  var isPageHash = function (h) { return /^#\/f\/[a-z0-9-]+/.test(h || ''); };
  function parse(h) { var m = /^#\/f\/([a-z0-9-]+)(?:\?(.*))?$/.exec(h || ''); return m ? { name: m[1], q: new URLSearchParams(m[2] || '') } : null; }
  function dirty(p) { return !!p && (p.isDirty ? p.isDirty() : p.dirty); }
  function anyDirty() { return STACK.some(dirty); }
  function confirmLeave() {
    var L = window.REXUSLegacy;
    return L && L.confirm ? L.confirm('You have unsaved changes. Leave this page without saving?', 'Discard changes') : Promise.resolve(window.confirm('You have unsaved changes. Leave this page without saving?'));
  }
  function container() { var v = document.querySelector('.wm-app .wm-view'); return v ? v.parentElement : document.querySelector('.wm-app'); }

  function bar(p) {
    var crumbs = (p.crumbs || []).map(function (c) {
      return '<li>' + (c[1] ? '<a href="' + esc(c[1]) + '" data-rx-crumb>' + esc(c[0]) + '</a>' : '<span>' + esc(c[0]) + '</span>') + '</li>';
    }).join('') + '<li aria-current="page"><span>' + esc(p.title) + '</span></li>';
    return '<div class="rx-page-bar"><button type="button" class="wm-btn rx-page-back" data-rx-back><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg> Back</button>' +
      '<nav aria-label="Breadcrumb" class="rx-breadcrumb"><ol>' + crumbs + '</ol></nav></div>';
  }

  /** Open a page. o = { route, title, crumbs:[[label, hash|null]], node?: Element to show, view?: existing .wm-view,
   *  isDirty?: fn, onBack?: fn (default: back with unsaved-changes check), onClose?: fn, fromRoute?, parentHash?, prepare?: fn } */
  function open(o) {
    var hash = '#/f/' + o.route;
    var cur = top();
    if (cur && cur.hash === hash) { close(cur, { silent: true, keepHistory: true }); }
    // History: from a direct link / refresh, first put the parent screen underneath so Back lands on it.
    if (o.fromRoute && (o.initial !== undefined ? o.initial : !booted) && o.parentHash) { history.replaceState(null, '', location.pathname + location.search + o.parentHash); if (o.prepare) o.prepare(); }
    var prev = document.querySelector('.wm-app .wm-view.active');
    var p = { hash: hash, title: o.title, crumbs: o.crumbs, prev: prev, isDirty: o.isDirty, onBack: o.onBack, onClose: o.onClose, dirty: false, node: o.node || null, home: null };
    if (o.view) {
      p.section = o.view; p.owned = false;
      p.barEl = document.createElement('div'); p.barEl.className = 'rx-page-head'; p.barEl.innerHTML = bar(p);
      p.section.insertBefore(p.barEl, p.section.firstChild);
    } else {
      p.section = document.createElement('div'); p.owned = true;
      p.section.className = 'wm-view rx-page'; p.section.setAttribute('role', 'region'); p.section.setAttribute('aria-labelledby', 'rxPageTitle' + STACK.length);
      p.section.innerHTML = '<div class="rx-page-head">' + bar(p) + '<h2 class="rx-page-title" id="rxPageTitle' + STACK.length + '" tabindex="-1">' + esc(o.title) + '</h2></div><div class="rx-page-body"></div>';
      if (p.node) { p.home = { parent: p.node.parentNode, next: p.node.nextSibling }; p.section.querySelector('.rx-page-body').appendChild(p.node); }
      container().appendChild(p.section);
    }
    p.section.classList.add('rx-page-host');
    document.querySelectorAll('.wm-app .wm-view').forEach(function (v) { v.classList.toggle('active', v === p.section); });
    var mark = function (e) { if (!e.target.closest('[data-rx-nodirty]')) p.dirty = true; };
    p.section.addEventListener('input', mark); p.section.addEventListener('change', mark);
    p.unmark = function () { p.section.removeEventListener('input', mark); p.section.removeEventListener('change', mark); };
    p.section.querySelectorAll('[data-rx-back]').forEach(function (b) { b.onclick = function () { back(p); }; });
    p.section.querySelectorAll('[data-rx-crumb]').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); var go = a.getAttribute('href'); leaveTo(p, function () { location.hash = go.slice(1); }); }; });
    STACK.push(p);
    if (location.hash !== hash) history.pushState({ rxPage: hash }, '', location.pathname + location.search + hash);
    else history.replaceState({ rxPage: hash }, '', location.pathname + location.search + hash);
    if (o.fromRoute && o.parentHash) {   // a direct link: highlight the section the page belongs to
      var pv = (/^#\/([a-z-]+)$/.exec(o.parentHash) || [])[1];
      if (pv) document.querySelectorAll('.wm-tab').forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-view') === pv); });
    }
    booted = true;
    window.scrollTo(0, 0);
    var t = p.section.querySelector('.rx-page-title, .wm-modal-head h3'); if (t) { t.setAttribute('tabindex', '-1'); try { t.focus({ preventScroll: true }); } catch (e) {} }
    return p;
  }
  /** Close a page. opts.fromPop: the browser already moved back; opts.silent: no onClose; opts.keepHistory: leave history alone. */
  function close(p, opts) {
    opts = opts || {}; p = p || top(); if (!p) return;
    var i = STACK.indexOf(p); if (i === -1) return;
    while (STACK.length > i + 1) close(top(), { fromPop: true, keepHistory: true });   // pages opened on top of it go first
    STACK.pop();
    p.unmark();
    if (p.owned) { if (p.node && p.home && p.home.parent) p.home.parent.insertBefore(p.node, p.home.next); p.section.remove(); }
    else { if (p.barEl) p.barEl.remove(); p.section.classList.remove('active', 'rx-page-host'); }
    var below = top();
    var restore = below ? below.section : (p.prev && document.contains(p.prev) && !p.prev.classList.contains('rx-page') ? p.prev : null);
    document.querySelectorAll('.wm-app .wm-view').forEach(function (v) { v.classList.toggle('active', v === restore); });
    if (!restore && window.REXUSLegacy && window.REXUSLegacy.showView) window.REXUSLegacy.showView(null);
    if (!opts.fromPop && !opts.keepHistory && history.state && history.state.rxPage === p.hash) history.back();
    if (!opts.silent && p.onClose) p.onClose();
  }
  function back(p) { p = p || top(); if (!p) return; if (p.onBack) return p.onBack(); leaveTo(p, function () { close(p); }); }
  function leaveTo(p, go) { if (!dirty(p)) return go(); confirmLeave().then(function (ok) { if (ok) { p.dirty = false; p.isDirty = null; go(); } }); }

  /** Called first by the app's hashchange/popstate handler. Returns true when it handled the route. */
  function onRoute() {
    var h = location.hash, t = top();
    if (t && t.hash === h) return true;
    var inStack = STACK.filter(function (p) { return p.hash === h; })[0];
    if (inStack) {   // Back from a page opened on top of another page
      var above = STACK.slice(STACK.indexOf(inStack) + 1);
      if (above.some(dirty) && !window.confirm('You have unsaved changes. Leave this page without saving?')) { history.pushState({ rxPage: t.hash }, '', t.hash); return true; }
      above.reverse().forEach(function (p) { close(p, { fromPop: true }); });
      return true;
    }
    if (isPageHash(h)) return openRoute(h);
    if (!STACK.length) return false;
    if (anyDirty() && !window.confirm('You have unsaved changes. Leave this page without saving?')) { history.pushState({ rxPage: t.hash }, '', t.hash); return true; }
    STACK.slice().reverse().forEach(function (p) { close(p, { fromPop: true }); });
    return false;
  }
  function openRoute(h) {
    var r = parse(h); if (!r || !ROUTES[r.name]) return false;
    try { ROUTES[r.name](r.q, { fromRoute: true, initial: !booted, hash: h }); } catch (e) { console.error(e); return false; }
    return true;
  }
  /** In-app navigation (sidebar, header, menus) while a page is open. Returns true if it took over (async confirm). */
  function guardNav(cb) {
    if (!STACK.length) return false;
    var closeAll = function () { STACK.slice().reverse().forEach(function (p) { close(p, { keepHistory: true }); }); };
    if (!anyDirty()) { closeAll(); return false; }
    confirmLeave().then(function (ok) { if (ok) { closeAll(); cb(); } });
    return true;
  }
  window.addEventListener('beforeunload', function (e) { if (anyDirty()) { e.preventDefault(); e.returnValue = ''; } });

  window.REXUSPages = {
    register: function (name, fn) { ROUTES[name] = fn; },
    open: open, close: close, back: back, onRoute: onRoute, openRoute: openRoute, guardNav: guardNav,
    current: top, isOpen: function () { return STACK.length > 0; },
    markClean: function (p) { p = p || top(); if (p) { p.dirty = false; } },
    hasRoute: function (h) { var r = parse(h); return !!(r && ROUTES[r.name]); },
    booted: function () { booted = true; }
  };
})();
