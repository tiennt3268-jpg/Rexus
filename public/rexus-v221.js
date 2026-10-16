/* =============================================================================
   REXUS v2.2.1 — UI for Modules 1–9 (HR, Resource Planning, Approval Center,
   Project Finance, WBS + Gantt, workflow, Connected Accounts, Appearance).
   Talks only to the authenticated /api endpoints; no sample business data.
   Replaces the v2.1.0 screens registered on window.REXUS210 (same entry points).
   ========================================================================== */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fmt = function (v, d) { if (v === null || v === undefined || v === '') return '—'; return Number(v).toLocaleString('en-US', { maximumFractionDigits: d === undefined ? 2 : d }); };
  var money = function (v, cur) { return v === null || v === undefined ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }) + (cur ? ' ' + esc(cur) : ''); };
  var day = function (v) { return v ? String(v).slice(0, 10) : ''; };
  var fmtDay = function (v) { if (!v) return '—'; var d = new Date(day(v) + 'T12:00:00Z'); return isNaN(d) ? esc(v) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
  var fmtTime = function (v) { if (!v) return '—'; var d = new Date(v); return isNaN(d) ? esc(v) : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  var todayStr = function () { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  var addDays = function (s, n) { var d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  var monthStart = function (s) { return s.slice(0, 7) + '-01'; };
  var monthEnd = function (s) { var d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7), 0)); return d.toISOString().slice(0, 10); };
  var eachDay = function (a, b) { var out = []; for (var d = a; d <= b && out.length < 400; d = addDays(d, 1)) out.push(d); return out; };
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /* ------------------------------------------------------------- api */
  function api(url, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    return fetch(url, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) { location.reload(); throw new Error('Session expired'); }
        if (!r.ok) throw new Error(j.error || ('Request failed (' + r.status + ')'));
        return j;
      });
    });
  }
  var USERS = null;
  function users() { if (USERS) return Promise.resolve(USERS); return api('/api/users').then(function (j) { USERS = (j.users || []).filter(function (u) { return !u.status || u.status === 'Active'; }); return USERS; }).catch(function () { return []; }); }
  var ME = null;
  function me() { if (ME) return Promise.resolve(ME); return api('/api/auth/me').then(function (j) { ME = j.user || {}; return ME; }); }
  function userOptions(list, selected, opts) {
    opts = opts || {};
    return (opts.empty ? '<option value="">' + esc(opts.empty) + '</option>' : '') + list.filter(function (u) { return !opts.exclude || opts.exclude.indexOf(u.id) === -1; })
      .filter(function (u) { return !opts.roles || opts.roles.indexOf(u.role) !== -1; })
      .map(function (u) { return '<option value="' + esc(u.id) + '"' + (u.id === selected ? ' selected' : '') + '>' + esc(u.full_name || u.username) + (u.department ? ' · ' + esc(u.department) : '') + '</option>'; }).join('');
  }

  /* ------------------------------------------------------------- ui kit */
  function toast(message, kind) {
    var p = $('wmConfirmPopup'), t = $('wmConfirmPopupText'), i = $('wmConfirmPopupIcon');
    if (!p || !t) return;
    t.textContent = message; if (i) i.textContent = kind === 'error' ? '✕' : '✓';
    p.className = 'wm-confirm-popup show' + (kind === 'error' ? ' error' : '');
    clearTimeout(toast._t); toast._t = setTimeout(function () { p.classList.remove('show'); }, kind === 'error' ? 6000 : 3500);
  }
  function badge(text, tone) { return '<span class="rx-chip rx-chip-' + (tone || 'neutral') + '">' + esc(text) + '</span>'; }
  var TONE = { Approved: 'success', Completed: 'success', 'Fully Disbursed': 'success', Available: 'success', 'Dependencies Satisfied': 'success', Active: 'success', 'Schedule-based': 'neutral',
    Pending: 'warning', 'Pending Approval': 'warning', 'Partially Disbursed': 'info', 'Near Capacity': 'warning', 'Changes Requested': 'warning', Draft: 'neutral', 'Waiting for Predecessors': 'warning',
    Rejected: 'danger', Overloaded: 'danger', 'Missing Declaration': 'danger', 'Rejected Declaration': 'danger', Cancelled: 'neutral', Unavailable: 'neutral', Superseded: 'neutral', Revoked: 'neutral', 'No Dependencies': 'neutral',
    'In Progress': 'info', 'Not Started': 'neutral', Review: 'warning', Urgent: 'danger', High: 'danger', Normal: 'neutral', Low: 'neutral' };
  function statusChip(s) { return badge(s || '—', TONE[s] || 'neutral'); }
  function loading(node, text) { node.innerHTML = '<div class="rx-state rx-state-loading" role="status"><span class="rx-spinner" aria-hidden="true"></span>' + esc(text || 'Loading…') + '</div>'; }
  function empty(text, hint) { return '<div class="rx-state rx-state-empty"><strong>' + esc(text) + '</strong>' + (hint ? '<span>' + esc(hint) + '</span>' : '') + '</div>'; }
  function errorBox(node, e) { node.innerHTML = '<div class="rx-state rx-state-error" role="alert"><strong>Something went wrong</strong><span>' + esc(e && e.message || e) + '</span></div>'; }
  function header(title, lead, actions) { return '<div class="rx-page-head"><div><h2>' + esc(title) + '</h2>' + (lead ? '<p>' + esc(lead) + '</p>' : '') + '</div>' + (actions ? '<div class="rx-page-actions">' + actions + '</div>' : '') + '</div>'; }
  function metric(label, value, tone, sub) { return '<article class="rx-metric rx-tone-' + (tone || 'neutral') + '"><small>' + esc(label) + '</small><strong>' + value + '</strong>' + (sub ? '<span>' + sub + '</span>' : '') + '</article>'; }
  function tabs(id, items, active) { return '<div class="rx213-subnav rx-tabs" role="tablist" id="' + id + '">' + items.map(function (it) { return '<button type="button" role="tab" data-tab="' + esc(it[0]) + '" aria-selected="' + (it[0] === active) + '">' + esc(it[1]) + (it[2] ? ' <span class="rx-count">' + esc(it[2]) + '</span>' : '') + '</button>'; }).join('') + '</div>'; }
  function table(headers, rows, opts) {
    opts = opts || {};
    return '<div class="wm-table-wrap rx-table-dense"><table class="wm-table ' + (opts.cls || '') + '" style="min-width:' + (opts.min || 640) + 'px"><thead><tr>' + headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + (rows.length ? rows.join('') : '<tr><td colspan="' + headers.length + '">' + empty(opts.empty || 'Nothing to show yet.') + '</td></tr>') + '</tbody></table></div>';
  }
  function field(label, html, opts) { opts = opts || {}; return '<div class="wm-form-row' + (opts.cls ? ' ' + opts.cls : '') + '"><label' + (opts.for ? ' for="' + opts.for + '"' : '') + '>' + esc(label) + (opts.req ? ' <span class="rx-req" aria-hidden="true">*</span>' : '') + '</label>' + html + (opts.help ? '<div class="rx-help">' + esc(opts.help) + '</div>' : '') + '</div>'; }

  /** Dialog built from the shared modal anatomy, so it inherits focus trap / Escape / scroll lock. */
  function dialog(o) {
    var app = document.querySelector('.wm-app') || document.body;
    var wrap = document.createElement('div');
    wrap.className = 'wm-modal-overlay open rx-dialog'; wrap.style.zIndex = o.nested ? 'var(--rx-z-modal-nested)' : '';
    wrap.innerHTML = '<div class="wm-modal' + (o.wide ? ' rx-modal-wide' : '') + '" style="max-width:' + (o.width || 560) + 'px">' +
      '<div class="wm-modal-head"><h3>' + esc(o.title) + '</h3><button type="button" class="wm-glass-icon-btn" data-close title="Close"><svg viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg></button></div>' +
      '<form class="rx-dialog-form" novalidate><div class="wm-modal-body">' + (o.body || '') + '<p class="rx-form-error" role="alert" hidden></p></div>' +
      '<div class="wm-modal-footer">' + (o.footer || ('<button type="button" class="wm-btn" data-close>Cancel</button>' + (o.submit ? '<button type="submit" class="wm-btn primary">' + esc(o.submit) + '</button>' : ''))) + '</div></form></div>';
    app.appendChild(wrap);
    var form = wrap.querySelector('form'), err = wrap.querySelector('.rx-form-error');
    function close() { wrap.remove(); if (o.onClose) o.onClose(); }
    wrap.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', close); });
    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap && !o.sticky) close(); });
    var api_ = {
      el: wrap, form: form, close: close,
      val: function (name) { var el = form.elements[name]; if (!el) return ''; if (el.type === 'checkbox') return el.checked; return el.value; },
      error: function (m) { if (!m) { err.hidden = true; return; } err.textContent = m; err.hidden = false; err.scrollIntoView({ block: 'nearest' }); }
    };
    form.addEventListener('submit', function (e) {
      e.preventDefault(); api_.error('');
      var btn = form.querySelector('button[type=submit]'); var action = e.submitter && e.submitter.dataset.action;
      if (!o.onSubmit) return;
      if (btn) { btn.disabled = true; }
      Promise.resolve().then(function () { return o.onSubmit(api_, action); }).then(function (keep) { if (keep !== true) close(); })
        .catch(function (x) { api_.error(x.message || String(x)); }).then(function () { if (btn) btn.disabled = false; });
    });
    if (o.onOpen) o.onOpen(api_);
    return api_;
  }
  function confirmDialog(title, message, okLabel, danger) {
    return new Promise(function (resolve) {
      var done = false;
      dialog({ title: title, width: 440, body: '<p class="rx-confirm-text">' + esc(message) + '</p>', nested: true,
        footer: '<button type="button" class="wm-btn" data-close>Cancel</button><button type="submit" class="wm-btn ' + (danger ? 'danger' : 'primary') + '">' + esc(okLabel || 'Confirm') + '</button>',
        onSubmit: function () { done = true; resolve(true); }, onClose: function () { if (!done) resolve(false); } });
    });
  }
  function reasonDialog(title, label, okLabel) {
    return new Promise(function (resolve) {
      var done = false;
      dialog({ title: title, width: 480, nested: true, submit: okLabel || 'Submit', body: field(label, '<textarea name="reason" rows="3" required></textarea>', { req: true }),
        onSubmit: function (d) { var v = String(d.val('reason')).trim(); if (!v) throw new Error('A reason is required.'); done = true; resolve(v); }, onClose: function () { if (!done) resolve(null); } });
    });
  }

  /* =============================================================== THEME (Module 9) */
  var THEMES = { mono: 'Black & White', navy: 'Navy Blue & Light Blue' };
  function applyTheme(t, density) {
    var theme = THEMES[t] ? t : 'mono';
    document.documentElement.setAttribute('data-rx-theme', theme);
    if (density) document.documentElement.setAttribute('data-rx-density', density);
    try { localStorage.setItem('rexus-theme', theme); if (density) localStorage.setItem('rexus-density', density); } catch (e) {}
  }
  function syncThemeFromServer() {
    return api('/api/preferences').then(function (p) { applyTheme(p.theme, p.density); return p; }).catch(function () { return null; });
  }
  function bindAppearance() {
    var root = $('rexusAppearance'); if (!root) return;
    var current = document.documentElement.getAttribute('data-rx-theme') || 'mono';
    root.innerHTML = '<h4 class="rx-section-h">Appearance</h4><p class="rx-muted">Color theme is saved to your REXUS account and follows you on every device.</p>' +
      '<div class="rx-theme-grid" role="radiogroup" aria-label="Color theme">' + Object.keys(THEMES).map(function (k) {
        return '<button type="button" class="rx-theme-card" role="radio" data-theme-choice="' + k + '" aria-checked="' + (k === current) + '"><span class="rx-theme-swatch rx-swatch-' + k + '" aria-hidden="true"><i></i><i></i><i></i></span><strong>' + esc(THEMES[k]) + '</strong><small>' + (k === 'mono' ? 'Neutral, minimal, glass surfaces' : 'Navy headings and accents, light-blue highlights') + '</small></button>';
      }).join('') + '</div>';
    root.querySelectorAll('[data-theme-choice]').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = b.dataset.themeChoice; applyTheme(t);
        root.querySelectorAll('[data-theme-choice]').forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); });
        api('/api/preferences', { method: 'PUT', body: { theme: t } }).then(function () { toast('Theme saved: ' + THEMES[t]); }).catch(function (e) { toast('Could not save theme: ' + e.message, 'error'); });
      });
    });
  }

  /* =============================================================== HUMAN RESOURCES (Module 4) */
  var HR_STATE = { sub: 'employees' };
  function hr(node, initial) {
    if (initial) HR_STATE.sub = initial;
    me().then(function (u) {
      var admin = u.role === 'System Admin';
      var items = [['employees', 'Employee Search'], ['leave', 'Leave Management'], ['capacity', 'Capacity Declarations'], ['resources', 'Resource Planning']];
      if (admin) items.splice(3, 0, ['schedules', 'Working Schedules & Holidays']);
      node.innerHTML = header('Human Resources Management', 'Employees, leave, availability and capacity in one place.') + tabs('rxHrTabs', items, HR_STATE.sub) + '<div id="rxHrBody" class="rx-hr-body"></div>';
      node.querySelectorAll('#rxHrTabs [data-tab]').forEach(function (b) { b.onclick = function () { HR_STATE.sub = b.dataset.tab; hr(node); }; });
      var body = $('rxHrBody');
      if (HR_STATE.sub === 'leave') return leave(body, u);
      if (HR_STATE.sub === 'capacity') return capacity(body, u);
      if (HR_STATE.sub === 'schedules') return schedules(body, u);
      if (HR_STATE.sub === 'resources') return resource(body, true);
      return employeeSearch(body, u);
    }).catch(function (e) { errorBox(node, e); });
  }

  function employeeSearch(node, u) {
    node.innerHTML = '<div class="rx-card rx-search-card"><label class="rx-search-field"><span class="rx-sr-only">Search employees</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
      '<input id="rxEmpQ" type="search" autocomplete="off" placeholder="Search by name, email, employee ID, department or job title…" aria-controls="rxEmpList" aria-expanded="false" role="combobox"></label>' +
      '<div id="rxEmpList" class="rx-results" role="listbox" hidden></div><p id="rxEmpHint" class="rx-muted">Search for an employee to view their information.</p></div><section id="rxEmpProfile" class="rx-profile" hidden aria-live="polite"></section>';
    var q = $('rxEmpQ'), list = $('rxEmpList'), hint = $('rxEmpHint'), prof = $('rxEmpProfile'), timer, seq = 0, found = [], idx = -1;
    function setActive(i) { idx = i; list.querySelectorAll('[role=option]').forEach(function (o, k) { o.setAttribute('aria-selected', String(k === i)); if (k === i) o.scrollIntoView({ block: 'nearest' }); }); }
    function choose(i) { var e = found[i]; if (!e) return; list.hidden = true; q.setAttribute('aria-expanded', 'false'); hint.hidden = true; profile(prof, e, u); }
    q.addEventListener('input', function () {
      clearTimeout(timer); var v = q.value.trim(), turn = ++seq; prof.hidden = true;
      if (v.length < 2) { list.hidden = true; hint.hidden = false; hint.textContent = v ? 'Type at least two characters.' : 'Search for an employee to view their information.'; return; }
      hint.hidden = false; hint.textContent = 'Searching…';
      timer = setTimeout(function () {
        api('/api/organization-search?q=' + encodeURIComponent(v)).then(function (j) {
          if (turn !== seq) return; found = j.employees || []; idx = -1;
          if (!found.length) { list.hidden = true; hint.textContent = 'No employees match "' + v + '".'; return; }
          hint.hidden = true; list.hidden = false; q.setAttribute('aria-expanded', 'true');
          list.innerHTML = found.map(function (e, i) { return '<button type="button" role="option" aria-selected="false" class="rx-result" data-i="' + i + '"><span class="rx-avatar">' + esc((e.full_name || e.username || '?').split(' ').map(function (p) { return p[0]; }).slice(-2).join('').toUpperCase()) + '</span><span><strong>' + esc(e.full_name || e.username) + '</strong><small>' + esc([e.position, e.department, e.email].filter(Boolean).join(' · ')) + '</small></span></button>'; }).join('');
          list.querySelectorAll('[data-i]').forEach(function (b) { b.onclick = function () { choose(+b.dataset.i); }; });
        }).catch(function (e) { if (turn === seq) { hint.textContent = e.message; } });
      }, 250);
    });
    q.addEventListener('keydown', function (e) {
      if (list.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(found.length - 1, idx + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(0, idx - 1)); }
      else if (e.key === 'Enter' && idx >= 0) { e.preventDefault(); choose(idx); }
      else if (e.key === 'Escape') { list.hidden = true; q.setAttribute('aria-expanded', 'false'); }
    });
    document.addEventListener('pointerdown', function (e) { if (!node.isConnected) return; if (!e.target.closest('#rxEmpQ,#rxEmpList')) list.hidden = true; });
    q.focus();
  }

  function profile(node, e, u) {
    node.hidden = false; loading(node, 'Loading employee…');
    api('/api/hr/profile?user_id=' + encodeURIComponent(e.id)).then(function (p) { renderProfile(node, p, u); }).catch(function () {
      // Not the viewer's own record and not someone they manage: directory information only.
      node.innerHTML = '<div class="rx-card">' + profileHead(e) + '<div class="rx-kv">' + kv([['Employee ID', e.id], ['Email', e.email], ['Department', e.department], ['Job title', e.position], ['Employment status', e.status]]) + '</div><p class="rx-muted">Employment, leave and capacity details are visible to the employee, their manager and HR.</p></div>';
    });
  }
  function profileHead(x) { return '<div class="rx-profile-head"><span class="rx-avatar rx-avatar-lg">' + esc((x.full_name || x.username || '?').split(' ').map(function (p) { return p[0]; }).slice(-2).join('').toUpperCase()) + '</span><div><h3>' + esc(x.full_name || x.username) + '</h3><p class="rx-muted">' + esc([x.position, x.department].filter(Boolean).join(' · ') || '—') + '</p></div></div>'; }
  function kv(pairs) { return pairs.map(function (p) { return '<div><small>' + esc(p[0]) + '</small><strong>' + (p[2] ? p[1] : esc(p[1] || '—')) + '</strong></div>'; }).join(''); }
  function renderProfile(node, p, u) {
    var x = p.user, pr = p.profile;
    var wd = (pr.workdays || []).map(function (d) { return DOW[d]; }).join(', ');
    var leaveRows = (p.leave_summary || []).map(function (l) { return '<tr><td>' + esc(l.leave_type) + '</td><td>' + statusChip(l.status) + '</td><td>' + l.n + '</td><td>' + fmt(l.hours) + ' h</td></tr>'; });
    node.innerHTML = '<div class="rx-card">' + profileHead(x) + '<div class="rx-kv">' + kv([['Employee ID', x.id], ['Email', x.email], ['Department', x.department], ['Job title', x.position], ['Manager', pr.manager_name], ['Employment status', x.status]]) + '</div></div>' +
      '<div class="rx-card"><div class="rx-card-head"><h4>Employment & capacity</h4>' + (p.can_edit ? '<button type="button" class="wm-btn rx-btn-sm" id="rxEditEmp">Edit employment</button>' : '') + '</div>' +
      '<div class="rx-kv">' + kv([['Employment type', pr.employment_type], ['Capacity method', pr.capacity_method === 'declaration' ? 'Monthly declaration (approved availability)' : 'Working schedule'], ['Working schedule', fmt(pr.hours_per_day) + ' h/day · ' + (wd || '—')],
        ['Capacity approver', pr.approver_name], ['Effective from', fmtDay(pr.effective_from)], ['Capacity status (this month)', statusChip(p.capacity_status), true]]) + '</div></div>' +
      '<div class="rx-card"><div class="rx-card-head"><h4>Leave this year</h4></div>' + table(['Leave type', 'Status', 'Requests', 'Hours'], leaveRows, { min: 420, empty: 'No leave requests this year.' }) + '</div>' +
      (p.history && p.history.length > 1 ? '<details class="rx-card rx-details"><summary>Schedule history (' + p.history.length + ')</summary>' + table(['Effective from', 'Type', 'Method', 'Hours/day', 'Workdays', 'Changed by'], p.history.map(function (h) {
        var w = []; try { w = JSON.parse(h.workdays); } catch (e) {} return '<tr><td>' + (day(h.effective_from) === '1900-01-01' ? 'Before first change' : fmtDay(h.effective_from)) + '</td><td>' + esc(h.employment_type) + '</td><td>' + esc(h.capacity_method) + '</td><td>' + fmt(h.hours_per_day) + '</td><td>' + w.map(function (d) { return DOW[d]; }).join(' ') + '</td><td>' + esc(h.changed_by_name || '') + '</td></tr>';
      }), { min: 560 }) + '</details>' : '');
    if ($('rxEditEmp')) $('rxEditEmp').onclick = function () { editEmployment(x, pr, function () { profile(node, x, u); }); };
  }
  function editEmployment(x, pr, done) {
    users().then(function (list) {
      dialog({ title: 'Employment — ' + (x.full_name || x.username), width: 620, submit: 'Save', body:
        '<div class="wm-form-grid">' + field('Employment type', '<select name="employment_type">' + ['Full-time', 'Part-time', 'Freelancer', 'Contractor', 'Collaborator', 'Other'].map(function (t) { return '<option' + (t === pr.employment_type ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select>') +
        field('Capacity method', '<select name="capacity_method"><option value="schedule"' + (pr.capacity_method === 'schedule' ? ' selected' : '') + '>Working schedule (working days × hours − leave)</option><option value="declaration"' + (pr.capacity_method === 'declaration' ? ' selected' : '') + '>Monthly declaration (approved availability)</option></select>') + '</div>' +
        '<div class="wm-form-grid">' + field('Daily working hours', '<input name="hours_per_day" type="number" min="0" max="24" step="0.5" value="' + esc(pr.hours_per_day) + '">') + field('Effective from', '<input name="effective_from" type="date" value="' + todayStr() + '">', { help: 'Earlier periods keep their previous schedule.' }) + '</div>' +
        field('Working days', '<div class="rx-weekdays">' + [1, 2, 3, 4, 5, 6, 0].map(function (d) { return '<label class="rx-check"><input type="checkbox" name="wd' + d + '"' + ((pr.workdays || []).indexOf(d) !== -1 ? ' checked' : '') + '> ' + DOW[d] + '</label>'; }).join('') + '</div>') +
        '<div class="wm-form-grid">' + field('Manager', '<select name="manager_id">' + userOptions(list, pr.manager_id, { empty: '— None —', exclude: [x.id] }) + '</select>') + field('Capacity approver', '<select name="capacity_approver_id">' + userOptions(list, pr.capacity_approver_id, { empty: '— Manager —', exclude: [x.id] }) + '</select>') + '</div>',
        onOpen: function (d) { var t = d.form.elements.employment_type, m = d.form.elements.capacity_method; t.onchange = function () { m.value = ['Part-time', 'Freelancer', 'Contractor', 'Collaborator'].indexOf(t.value) !== -1 ? 'declaration' : 'schedule'; }; },
        onSubmit: function (d) {
          var wd = [0, 1, 2, 3, 4, 5, 6].filter(function (n) { return d.val('wd' + n); });
          return api('/api/hr/profile', { method: 'PUT', body: { user_id: x.id, employment_type: d.val('employment_type'), capacity_method: d.val('capacity_method'), hours_per_day: Number(d.val('hours_per_day')), workdays: wd,
            manager_id: d.val('manager_id') || null, capacity_approver_id: d.val('capacity_approver_id') || null, effective_from: d.val('effective_from') } }).then(function () { toast('Employment updated'); done(); });
        } });
    });
  }

  /* ----------------------------------------------------------------- leave */
  var LEAVE_STATE = { view: 'mine', month: todayStr().slice(0, 7) };
  function leave(node, u) {
    api('/api/hr/team').then(function (t) {
      var manages = t.is_admin || (t.employees || []).length > 0;
      node.innerHTML = '<div class="rx-toolbar">' + tabs('rxLeaveTabs', [['mine', 'My Leave'], ['calendar', 'My Leave Calendar']].concat(manages ? [['team', 'Team Leave Calendar']] : []), LEAVE_STATE.view) +
        '<button type="button" class="wm-btn primary" id="rxNewLeave">New leave request</button></div><div id="rxLeaveBody"></div>';
      node.querySelectorAll('#rxLeaveTabs [data-tab]').forEach(function (b) { b.onclick = function () { LEAVE_STATE.view = b.dataset.tab; leave(node, u); }; });
      $('rxNewLeave').onclick = function () { leaveForm(null, function () { leave(node, u); }); };
      var body = $('rxLeaveBody');
      if (LEAVE_STATE.view === 'mine') return myLeave(body, u, function () { leave(node, u); });
      return leaveCalendar(body, LEAVE_STATE.view === 'team' ? 'team' : 'mine', function () { leave(node, u); });
    }).catch(function (e) { errorBox(node, e); });
  }
  function myLeave(node, u, refresh) {
    loading(node);
    api('/api/hr/leave?scope=mine').then(function (j) {
      var rows = j.leave.map(function (l) {
        var dur = l.unit === 'full' ? fmt(l.duration_hours) + ' h' : l.unit === 'half' ? 'Half day (' + esc(l.half_part || 'AM') + ')' : fmt(l.hours) + ' h';
        var acts = (['Draft', 'Changes Requested'].indexOf(l.status) !== -1 ? '<button type="button" class="wm-btn rx-btn-sm" data-edit="' + esc(l.id) + '">Edit</button>' : '') +
          (['Draft', 'Changes Requested', 'Pending Approval', 'Approved'].indexOf(l.status) !== -1 ? '<button type="button" class="wm-btn rx-btn-sm danger" data-cancel="' + esc(l.id) + '">Cancel</button>' : '');
        return '<tr><td>' + esc(l.leave_type) + '</td><td>' + fmtDay(l.start_date) + (l.end_date !== l.start_date ? ' – ' + fmtDay(l.end_date) : '') + '</td><td>' + dur + '</td><td>' + statusChip(l.status) + '</td><td>' + esc(l.approver_name || '—') + '</td><td class="rx-cell-wrap">' + esc(l.reason || '') + '</td><td class="rx-actions">' + acts + '</td></tr>';
      });
      var approved = j.leave.filter(function (l) { return l.status === 'Approved'; }).reduce(function (s, l) { return s + Number(l.duration_hours || 0); }, 0);
      var pending = j.leave.filter(function (l) { return l.status === 'Pending Approval'; }).length;
      node.innerHTML = '<div class="rx-metrics">' + metric('Approved leave (h)', fmt(approved), 'success') + metric('Pending requests', pending, 'warning') + metric('Total requests', j.leave.length, 'info') + '</div>' +
        table(['Type', 'Dates', 'Duration', 'Status', 'Approver', 'Reason', ''], rows, { min: 820, empty: 'No leave requests yet. Use "New leave request" to submit one.' });
      node.querySelectorAll('[data-edit]').forEach(function (b) { b.onclick = function () { leaveForm(j.leave.find(function (l) { return l.id === b.dataset.edit; }), refresh); }; });
      node.querySelectorAll('[data-cancel]').forEach(function (b) { b.onclick = function () { confirmDialog('Cancel leave request', 'Cancel this leave request? Approved leave that is cancelled no longer reduces your capacity.', 'Cancel request', true).then(function (ok) { if (!ok) return; api('/api/hr/leave', { method: 'POST', body: { action: 'cancel', id: b.dataset.cancel } }).then(function () { toast('Leave cancelled'); refresh(); }).catch(function (e) { toast(e.message, 'error'); }); }); }; });
    }).catch(function (e) { errorBox(node, e); });
  }
  function leaveForm(l, done) {
    users().then(function (list) {
      l = l || {};
      dialog({ title: l.id ? 'Edit leave request' : 'New leave request', width: 600,
        footer: '<button type="button" class="wm-btn" data-close>Cancel</button><button type="submit" class="wm-btn" data-action="save">Save draft</button><button type="submit" class="wm-btn primary" data-action="submit">Submit for approval</button>',
        body: '<div class="wm-form-grid">' + field('Leave type', '<select name="leave_type">' + ['Annual Leave', 'Sick Leave', 'Unpaid Leave', 'Personal Leave', 'Other'].map(function (t) { return '<option' + (t === l.leave_type ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select>', { req: true }) +
          field('Duration type', '<select name="unit"><option value="full"' + (l.unit === 'full' || !l.unit ? ' selected' : '') + '>Full day(s)</option><option value="half"' + (l.unit === 'half' ? ' selected' : '') + '>Half day</option><option value="hourly"' + (l.unit === 'hourly' ? ' selected' : '') + '>Hourly</option></select>') + '</div>' +
          '<div class="wm-form-grid">' + field('Start date', '<input type="date" name="start_date" required value="' + esc(day(l.start_date) || todayStr()) + '">', { req: true }) + field('End date', '<input type="date" name="end_date" required value="' + esc(day(l.end_date) || todayStr()) + '">', { req: true }) + '</div>' +
          '<div class="wm-form-grid" data-unit-extra>' + field('Half', '<select name="half_part"><option value="AM"' + (l.half_part !== 'PM' ? ' selected' : '') + '>Morning</option><option value="PM"' + (l.half_part === 'PM' ? ' selected' : '') + '>Afternoon</option></select>', { cls: 'rx-unit-half' }) +
          field('Hours', '<input type="number" name="hours" min="0.5" max="24" step="0.5" value="' + esc(l.hours || '') + '">', { cls: 'rx-unit-hourly' }) + '</div>' +
          field('Reason', '<textarea name="reason" rows="3">' + esc(l.reason || '') + '</textarea>') +
          '<div class="wm-form-grid">' + field('Supporting attachment (link)', '<input type="url" name="attachment_url" placeholder="https://…" value="' + esc(l.attachment_url || '') + '">') +
          field('Approver', '<select name="approver_id">' + userOptions(list, l.approver_id, { empty: 'Automatic (manager / routing rule)', exclude: [ME && ME.id] }) + '</select>') + '</div>',
        onOpen: function (d) {
          var unit = d.form.elements.unit, s = d.form.elements.start_date, e = d.form.elements.end_date;
          function sync() { d.el.querySelector('.rx-unit-half').hidden = unit.value !== 'half'; d.el.querySelector('.rx-unit-hourly').hidden = unit.value !== 'hourly'; if (unit.value !== 'full') e.value = s.value; e.disabled = unit.value !== 'full'; }
          unit.onchange = sync; s.onchange = function () { if (unit.value !== 'full' || e.value < s.value) e.value = s.value; }; sync();
        },
        onSubmit: function (d, action) {
          var body = { action: action === 'submit' ? 'submit' : 'save', id: l.id, leave_type: d.val('leave_type'), unit: d.val('unit'), start_date: d.val('start_date'), end_date: d.val('unit') === 'full' ? d.val('end_date') : d.val('start_date'),
            half_part: d.val('half_part'), hours: d.val('hours') ? Number(d.val('hours')) : null, reason: d.val('reason'), attachment_url: d.val('attachment_url'), approver_id: d.val('approver_id') || null };
          if (!body.start_date || !body.end_date || body.end_date < body.start_date) throw new Error('Choose a valid date range.');
          return api('/api/hr/leave', { method: 'POST', body: body }).then(function (r) { toast(r.status === 'Pending Approval' ? 'Leave submitted for approval (' + fmt(r.duration_hours) + ' h)' : 'Draft saved'); done(); });
        } });
    });
  }
  function leaveCalendar(node, scope, refresh) {
    var m = LEAVE_STATE.month, from = m + '-01', to = monthEnd(from);
    node.innerHTML = '<div class="rx-month-nav"><button type="button" class="wm-glass-icon-btn" id="rxLcPrev" title="Previous month"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button><input type="month" id="rxLcMonth" value="' + m + '" aria-label="Month"><button type="button" class="wm-glass-icon-btn" id="rxLcNext" title="Next month"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></button><span class="rx-legend">' + statusChip('Approved') + statusChip('Pending Approval') + '</span></div><div id="rxLcGrid"></div>';
    $('rxLcPrev').onclick = function () { LEAVE_STATE.month = addDays(from, -1).slice(0, 7); leaveCalendar(node, scope, refresh); };
    $('rxLcNext').onclick = function () { LEAVE_STATE.month = addDays(to, 1).slice(0, 7); leaveCalendar(node, scope, refresh); };
    $('rxLcMonth').onchange = function () { if (this.value) { LEAVE_STATE.month = this.value; leaveCalendar(node, scope, refresh); } };
    var grid = $('rxLcGrid'); loading(grid);
    Promise.all([api('/api/hr/leave?scope=' + scope + '&from=' + from + '&to=' + to), api('/api/hr/holidays?from=' + from + '&to=' + to)]).then(function (res) {
      var items = res[0].leave.filter(function (l) { return ['Approved', 'Pending Approval'].indexOf(l.status) !== -1; }), hol = res[1].holidays;
      var first = new Date(from + 'T12:00:00Z').getUTCDay(), lead = (first + 6) % 7, days = eachDay(from, to);
      var cells = ''; for (var i = 0; i < lead; i++) cells += '<div class="rx-cal-cell is-out" aria-hidden="true"></div>';
      days.forEach(function (d) {
        var h = hol.find(function (x) { return x.day === d; });
        var ls = items.filter(function (l) { return l.start_date <= d && l.end_date >= d; });
        cells += '<div class="rx-cal-cell' + (h ? ' is-holiday' : '') + (d === todayStr() ? ' is-today' : '') + '"><span class="rx-cal-num">' + (+d.slice(8)) + '</span>' + (h ? '<span class="rx-cal-tag">' + esc(h.name) + '</span>' : '') +
          ls.map(function (l) { return '<span class="rx-cal-ev rx-ev-' + (l.status === 'Approved' ? 'ok' : 'pending') + '" title="' + esc((l.full_name || '') + ' — ' + l.leave_type + ' (' + l.status + ')') + '">' + esc(scope === 'team' ? (l.full_name || '').split(' ').slice(-1)[0] : l.leave_type) + (l.unit !== 'full' ? ' ½' : '') + '</span>'; }).join('') + '</div>';
      });
      grid.innerHTML = '<div class="rx-cal" role="grid"><div class="rx-cal-dow">Mon</div><div class="rx-cal-dow">Tue</div><div class="rx-cal-dow">Wed</div><div class="rx-cal-dow">Thu</div><div class="rx-cal-dow">Fri</div><div class="rx-cal-dow">Sat</div><div class="rx-cal-dow">Sun</div>' + cells + '</div>' +
        '<details class="rx-card rx-details"><summary>List view</summary>' + table(['Employee', 'Type', 'Dates', 'Status'], items.map(function (l) { return '<tr><td>' + esc(l.full_name) + '</td><td>' + esc(l.leave_type) + '</td><td>' + fmtDay(l.start_date) + (l.end_date !== l.start_date ? ' – ' + fmtDay(l.end_date) : '') + '</td><td>' + statusChip(l.status) + '</td></tr>'; }), { min: 520, empty: 'No leave this month.' }) + '</details>';
    }).catch(function (e) { errorBox(grid, e); });
  }

  /* -------------------------------------------------------------- capacity */
  var CAP_STATE = { month: todayStr().slice(0, 7), view: 'calendar', tab: 'mine' };
  function capacity(node, u) {
    api('/api/hr/team?month=' + CAP_STATE.month).then(function (t) {
      var manages = t.is_admin || (t.employees || []).length > 0;
      node.innerHTML = (manages ? tabs('rxCapTabs', [['mine', 'My Capacity'], ['team', 'Team Capacity']], CAP_STATE.tab) : '') + '<div id="rxCapBody"></div>';
      if (manages) node.querySelectorAll('#rxCapTabs [data-tab]').forEach(function (b) { b.onclick = function () { CAP_STATE.tab = b.dataset.tab; capacity(node, u); }; });
      var body = $('rxCapBody');
      if (CAP_STATE.tab === 'team' && manages) return teamCapacity(body, t);
      myCapacity(body, u);
    }).catch(function (e) { errorBox(node, e); });
  }
  function teamCapacity(node, t) {
    var filt = '<label class="rx-inline-field">Status <select id="rxTeamCapFilter"><option value="">All</option><option>Missing Declaration</option><option>Pending Approval</option><option>Approved</option><option>Draft</option><option>Changes Requested</option><option>Rejected</option><option>Schedule-based</option></select></label>';
    function render(f) {
      var rows = t.employees.filter(function (e) { return !f || e.status === f; }).map(function (e) { return '<tr><td>' + esc(e.name) + '</td><td>' + esc(e.department || '—') + '</td><td>' + esc(e.employment_type) + '</td><td>' + statusChip(e.status) + '</td><td>' + (e.capacity_method === 'declaration' ? fmt(e.approved_hours) + ' h' : '—') + '</td><td>' + (e.pending_hours ? fmt(e.pending_hours) + ' h' : '—') + '</td></tr>'; });
      $('rxTeamCapTable').innerHTML = table(['Employee', 'Department', 'Employment', 'Status (' + t.month + ')', 'Approved', 'Pending'], rows, { min: 680, empty: 'No employees match.' });
    }
    var missing = t.employees.filter(function (e) { return e.status === 'Missing Declaration'; }).length, pending = t.employees.filter(function (e) { return e.status === 'Pending Approval'; }).length;
    node.innerHTML = '<div class="rx-metrics">' + metric('People you manage', t.employees.length, 'info') + metric('Missing declarations', missing, missing ? 'danger' : 'success') + metric('Pending approval', pending, pending ? 'warning' : 'neutral') + '</div>' +
      '<div class="rx-toolbar"><span class="rx-muted">Month ' + esc(t.month) + ' · approve declarations in the Approval Center.</span>' + filt + '</div><div id="rxTeamCapTable"></div>';
    $('rxTeamCapFilter').onchange = function () { render(this.value); }; render('');
  }
  function myCapacity(node, u) {
    var m = CAP_STATE.month, from = m + '-01', to = monthEnd(from);
    node.innerHTML = '<div class="rx-month-nav"><button type="button" class="wm-glass-icon-btn" id="rxCapPrev" title="Previous month"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button><input type="month" id="rxCapMonth" value="' + m + '" aria-label="Month"><button type="button" class="wm-glass-icon-btn" id="rxCapNext" title="Next month"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></button></div><div id="rxCapContent"></div>';
    $('rxCapPrev').onclick = function () { CAP_STATE.month = addDays(from, -1).slice(0, 7); myCapacity(node, u); };
    $('rxCapNext').onclick = function () { CAP_STATE.month = addDays(to, 1).slice(0, 7); myCapacity(node, u); };
    $('rxCapMonth').onchange = function () { if (this.value) { CAP_STATE.month = this.value; myCapacity(node, u); } };
    var c = $('rxCapContent'); loading(c);
    Promise.all([api('/api/hr/capacity?month=' + m), api('/api/resource-planning?from=' + from + '&to=' + to + '&user_id=' + encodeURIComponent(u.id))]).then(function (res) {
      var data = res[0], plan = (res[1].employees || [])[0] || {};
      var approved = data.versions.find(function (v) { return v.status === 'Approved'; });
      var open = data.versions.find(function (v) { return ['Draft', 'Changes Requested', 'Pending Approval'].indexOf(v.status) !== -1; });
      var editable = data.requires_declaration && (!open || open.status !== 'Pending Approval');
      var src = open || approved || { entries: [] };
      var byDay = {}; src.entries.forEach(function (e) { byDay[e.day] = e; });
      var holidays = {}; data.holidays.forEach(function (h) { holidays[h.day] = h.name; });
      var declared = src.entries.filter(function (e) { return e.availability !== 'unavailable'; }).reduce(function (s, e) { return s + Number(e.hours || 0); }, 0);
      var summary = '<div class="rx-metrics">' + metric('Declared (' + (open ? 'v' + open.version + ' ' + open.status : approved ? 'approved' : 'none') + ')', fmt(declared) + ' h', 'info') +
        metric('Approved capacity', approved ? fmt(approved.total_hours) + ' h' : (data.requires_declaration ? 'Not confirmed' : fmt(plan.approved_capacity) + ' h'), approved || !data.requires_declaration ? 'success' : 'danger') +
        metric('Pending', open && open.status === 'Pending Approval' ? fmt(open.total_hours) + ' h' : '—', 'warning') + metric('Planned work', fmt(plan.planned_hours) + ' h', 'indigo') +
        metric('Remaining', plan.remaining_hours === null || plan.remaining_hours === undefined ? '—' : fmt(plan.remaining_hours) + ' h', plan.remaining_hours < 0 ? 'danger' : 'neutral') + '</div>';
      if (!data.requires_declaration) {
        c.innerHTML = summary + '<div class="rx-card rx-note">Your capacity is calculated from your working schedule (' + fmt(data.profile.hours_per_day) + ' h/day, ' + data.profile.workdays.map(function (d) { return DOW[d]; }).join(', ') + ') minus holidays and approved leave. Monthly declarations are used by part-time, freelancer, contractor and collaborator employment types.</div>';
        return;
      }
      var lead = (new Date(from + 'T12:00:00Z').getUTCDay() + 6) % 7, days = eachDay(from, to);
      var cells = ''; for (var i = 0; i < lead; i++) cells += '<div class="rx-cal-cell is-out" aria-hidden="true"></div>';
      days.forEach(function (d) {
        var e = byDay[d] || {}, off = e.availability === 'unavailable';
        cells += '<div class="rx-cal-cell rx-cap-cell' + (holidays[d] ? ' is-holiday' : '') + (off ? ' is-off' : '') + '" data-day="' + d + '"><span class="rx-cal-num">' + (+d.slice(8)) + ' <small>' + DOW[new Date(d + 'T12:00:00Z').getUTCDay()] + '</small></span>' + (holidays[d] ? '<span class="rx-cal-tag">' + esc(holidays[d]) + '</span>' : '') +
          '<label class="rx-sr-only" for="cap-' + d + '">Available hours on ' + d + '</label><input id="cap-' + d + '" class="rx-cap-hours" type="number" min="0" max="24" step="0.5" value="' + (e.hours !== undefined && !off ? esc(e.hours) : '') + '" placeholder="0" ' + (editable ? '' : 'disabled') + ' inputmode="decimal">' +
          '<label class="rx-cap-off"><input type="checkbox" class="rx-cap-unavail" ' + (off ? 'checked' : '') + ' ' + (editable ? '' : 'disabled') + '> Unavailable</label></div>';
      });
      var status = open ? open.status : approved ? 'Approved' : 'Missing Declaration';
      c.innerHTML = summary + '<div class="rx-toolbar"><span>' + statusChip(status) + (open && open.status === 'Changes Requested' ? ' <span class="rx-muted">Your approver asked for changes — update and resubmit.</span>' : '') + (approved && open ? ' <span class="rx-muted">Approved v' + approved.version + ' stays in effect until this revision is approved.</span>' : '') + '</span>' +
        '<div class="rx-btn-row">' + tabs('rxCapView', [['calendar', 'Calendar'], ['list', 'List']], CAP_STATE.view) + (editable ? '<button type="button" class="wm-btn rx-btn-sm" id="rxCapCopy">Copy previous month</button><button type="button" class="wm-btn rx-btn-sm" id="rxCapWeekly">Apply weekly availability</button><button type="button" class="wm-btn" id="rxCapSave">Save draft</button><button type="button" class="wm-btn primary" id="rxCapSubmit">Submit for approval</button>' : '') + '</div></div>' +
        '<div id="rxCapCal" class="rx-cal rx-cap-cal"' + (CAP_STATE.view === 'list' ? ' hidden' : '') + '><div class="rx-cal-dow">Mon</div><div class="rx-cal-dow">Tue</div><div class="rx-cal-dow">Wed</div><div class="rx-cal-dow">Thu</div><div class="rx-cal-dow">Fri</div><div class="rx-cal-dow">Sat</div><div class="rx-cal-dow">Sun</div>' + cells + '</div>' +
        '<div id="rxCapList"' + (CAP_STATE.view === 'calendar' ? ' hidden' : '') + '></div>' +
        (data.versions.length ? '<details class="rx-card rx-details"><summary>Version history (' + data.versions.length + ')</summary>' + table(['Version', 'Status', 'Total', 'Submitted', 'Decided'], data.versions.map(function (v) { return '<tr><td>v' + v.version + '</td><td>' + statusChip(v.status) + '</td><td>' + fmt(v.total_hours) + ' h</td><td>' + fmtTime(v.submitted_at) + '</td><td>' + fmtTime(v.decided_at) + '</td></tr>'; }), { min: 520 }) + '</details>' : '');
      // List alternative (accessible / small screens) mirrors the same inputs.
      $('rxCapList').innerHTML = table(['Date', 'Available hours', 'Unavailable'], days.map(function (d) { var e = byDay[d] || {}; return '<tr><td>' + DOW[new Date(d + 'T12:00:00Z').getUTCDay()] + ' ' + fmtDay(d) + (holidays[d] ? ' · ' + esc(holidays[d]) : '') + '</td><td><input class="rx-cap-hours-l" data-day="' + d + '" type="number" min="0" max="24" step="0.5" value="' + (e.hours !== undefined && e.availability !== 'unavailable' ? esc(e.hours) : '') + '" ' + (editable ? '' : 'disabled') + ' aria-label="Hours on ' + d + '"></td><td><input type="checkbox" class="rx-cap-unavail-l" data-day="' + d + '" ' + (e.availability === 'unavailable' ? 'checked' : '') + ' ' + (editable ? '' : 'disabled') + ' aria-label="Unavailable on ' + d + '"></td></tr>'; }), { min: 420 });
      c.querySelectorAll('#rxCapView [data-tab]').forEach(function (b) { b.onclick = function () { syncFrom(CAP_STATE.view); CAP_STATE.view = b.dataset.tab; $('rxCapCal').hidden = CAP_STATE.view !== 'calendar'; $('rxCapList').hidden = CAP_STATE.view !== 'list'; syncTo(CAP_STATE.view); c.querySelectorAll('#rxCapView [data-tab]').forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); }); }; });
      function syncFrom(view) { if (view !== 'list') return; days.forEach(function (d) { var h = c.querySelector('.rx-cap-hours-l[data-day="' + d + '"]'), u2 = c.querySelector('.rx-cap-unavail-l[data-day="' + d + '"]'), cell = c.querySelector('.rx-cap-cell[data-day="' + d + '"]'); cell.querySelector('.rx-cap-hours').value = h.value; cell.querySelector('.rx-cap-unavail').checked = u2.checked; }); }
      function syncTo(view) { if (view !== 'list') return; days.forEach(function (d) { var cell = c.querySelector('.rx-cap-cell[data-day="' + d + '"]'); c.querySelector('.rx-cap-hours-l[data-day="' + d + '"]').value = cell.querySelector('.rx-cap-hours').value; c.querySelector('.rx-cap-unavail-l[data-day="' + d + '"]').checked = cell.querySelector('.rx-cap-unavail').checked; }); }
      function collect() { syncFrom(CAP_STATE.view); return days.map(function (d) { var cell = c.querySelector('.rx-cap-cell[data-day="' + d + '"]'); var off = cell.querySelector('.rx-cap-unavail').checked, h = Number(cell.querySelector('.rx-cap-hours').value || 0); return off ? { day: d, hours: 0, availability: 'unavailable' } : h > 0 ? { day: d, hours: h } : null; }).filter(Boolean); }
      c.querySelectorAll('.rx-cap-unavail').forEach(function (cb) { cb.onchange = function () { var cell = cb.closest('.rx-cap-cell'); cell.classList.toggle('is-off', cb.checked); if (cb.checked) cell.querySelector('.rx-cap-hours').value = ''; }; });
      if (!editable) return;
      function send(action, extra) { return api('/api/hr/capacity', { method: 'POST', body: Object.assign({ action: action, month: m, entries: collect() }, extra || {}) }); }
      $('rxCapSave').onclick = function () { send('save').then(function (r) { toast('Draft saved · ' + fmt(r.total_hours) + ' h'); myCapacity(node, u); }).catch(function (e) { toast(e.message, 'error'); }); };
      $('rxCapSubmit').onclick = function () {
        var entries = collect(), total = entries.reduce(function (s, e) { return s + (e.hours || 0); }, 0);
        confirmDialog('Submit capacity for ' + m, 'Submit ' + fmt(total) + ' available hours for manager approval? Only approved capacity is used for planning.', 'Submit').then(function (ok) { if (!ok) return; send('submit').then(function () { toast('Submitted for approval'); myCapacity(node, u); }).catch(function (e) { toast(e.message, 'error'); }); });
      };
      $('rxCapCopy').onclick = function () { send('copy_previous').then(function (r) { toast('Copied previous month pattern · ' + fmt(r.total_hours) + ' h'); myCapacity(node, u); }).catch(function (e) { toast(e.message, 'error'); }); };
      $('rxCapWeekly').onclick = function () {
        dialog({ title: 'Apply weekly availability', width: 520, submit: 'Apply to month', body: '<p class="rx-muted">Hours per weekday are filled into every matching day of ' + esc(m) + '. Holidays are left empty. You can adjust individual days afterwards.</p><div class="rx-weekly-grid">' +
          [1, 2, 3, 4, 5, 6, 0].map(function (d) { return field(DOW[d], '<input type="number" name="w' + d + '" min="0" max="24" step="0.5" placeholder="0">'); }).join('') + '</div>',
          onSubmit: function (d) {
            days.forEach(function (x) { if (holidays[x]) return; var wd = new Date(x + 'T12:00:00Z').getUTCDay(), v = d.val('w' + wd); var cell = c.querySelector('.rx-cap-cell[data-day="' + x + '"]'); cell.querySelector('.rx-cap-hours').value = v && Number(v) > 0 ? v : ''; cell.querySelector('.rx-cap-unavail').checked = false; cell.classList.remove('is-off'); });
            syncTo(CAP_STATE.view); toast('Weekly pattern applied — save or submit to keep it');
          } });
      };
    }).catch(function (e) { errorBox(c, e); });
  }

  /* ------------------------------------------------------- schedules (admin) */
  function schedules(node, u) {
    var year = new Date().getFullYear();
    node.innerHTML = '<div class="rx-card"><div class="rx-card-head"><h4>Public & company holidays ' + year + '</h4><button type="button" class="wm-btn primary rx-btn-sm" id="rxAddHol">Add holiday</button></div><p class="rx-muted">Company-wide days excluded from every working schedule. Employee schedules (working days, hours, employment type) are edited from each employee profile and keep their history.</p><div id="rxHolList"></div></div>';
    function load() {
      var t = $('rxHolList'); loading(t);
      api('/api/hr/holidays?from=' + year + '-01-01&to=' + (year + 1) + '-12-31').then(function (j) {
        t.innerHTML = table(['Date', 'Day', 'Name', 'Calendar', ''], j.holidays.map(function (h) { return '<tr><td>' + fmtDay(h.day) + '</td><td>' + DOW[new Date(h.day + 'T12:00:00Z').getUTCDay()] + '</td><td>' + esc(h.name) + '</td><td>' + esc({ holiday_public: 'Public holiday', holiday_company: 'Company holiday', non_working: 'Non-working day' }[h.kind] || h.kind) + '</td><td class="rx-actions"><button type="button" class="wm-icon-btn danger" data-del="' + esc(h.id) + '" title="Delete holiday"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg></button></td></tr>'; }), { min: 560, empty: 'No holidays configured.' });
        t.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () { confirmDialog('Delete holiday', 'Remove this company-wide day? Capacity for that date will count it as a working day again.', 'Delete', true).then(function (ok) { if (ok) api('/api/hr/holidays', { method: 'DELETE', body: { id: b.dataset.del } }).then(load).catch(function (e) { toast(e.message, 'error'); }); }); }; });
      }).catch(function (e) { errorBox(t, e); });
    }
    $('rxAddHol').onclick = function () {
      dialog({ title: 'Add holiday', width: 480, submit: 'Add', body: field('Date', '<input type="date" name="day" required>', { req: true }) + field('Name', '<input name="name" required maxlength="200">', { req: true }) +
        field('Calendar', '<select name="kind"><option value="holiday_public">Public holiday</option><option value="holiday_company">Company holiday</option><option value="non_working">Non-working day</option></select>'),
        onSubmit: function (d) { return api('/api/hr/holidays', { method: 'POST', body: { day: d.val('day'), name: d.val('name'), kind: d.val('kind') } }).then(function () { toast('Holiday added'); load(); }); } });
    };
    load();
  }

  /* =============================================================== RESOURCE PLANNING (Module 2) */
  var RP = { preset: 'month', from: monthStart(todayStr()), to: monthEnd(todayStr()), view: 'table', scale: 'day', dep: '', type: '', cap: '' };
  function rangeFor(p) {
    var t = todayStr(), d = new Date(t + 'T12:00:00Z'), dow = (d.getUTCDay() + 6) % 7;
    if (p === 'week') return [addDays(t, -dow), addDays(t, 6 - dow)];
    if (p === 'next4') return [addDays(t, -dow + 7), addDays(t, -dow + 34)];
    if (p === 'nextmonth') { var n = addDays(monthEnd(t), 1); return [n, monthEnd(n)]; }
    if (p === 'quarter') { var s = addDays(monthEnd(t), 1); return [s, monthEnd(addDays(monthEnd(addDays(monthEnd(s), 1)), 1))]; }
    return [monthStart(t), monthEnd(t)];
  }
  function resource(node, embedded) {
    node.innerHTML = (embedded ? '' : header('Resource Planning', 'Approved capacity, planned effort and actual worklog hours — advisory only.')) +
      '<div class="rx-card rx-filters"><div class="rx-filter-row">' +
      '<label class="rx-inline-field">Period <select id="rpPreset"><option value="week">This week</option><option value="month">This month</option><option value="next4">Next 4 weeks (forecast)</option><option value="nextmonth">Next month (forecast)</option><option value="quarter">Next 3 months (forecast)</option><option value="custom">Custom range</option></select></label>' +
      '<label class="rx-inline-field">From <input type="date" id="rpFrom" value="' + RP.from + '"></label><label class="rx-inline-field">To <input type="date" id="rpTo" value="' + RP.to + '"></label>' +
      '<label class="rx-inline-field">Department <select id="rpDep"><option value="">All</option></select></label>' +
      '<label class="rx-inline-field">Employment <select id="rpType"><option value="">All</option><option>Full-time</option><option>Part-time</option><option>Freelancer</option><option>Contractor</option><option>Collaborator</option><option>Other</option></select></label>' +
      '<label class="rx-inline-field">Capacity status <select id="rpCap"><option value="">All</option><option>Approved</option><option>Pending Approval</option><option>Missing Declaration</option><option>Rejected Declaration</option></select></label>' +
      '</div></div><div id="rpData"></div>';
    $('rpPreset').value = RP.preset; $('rpType').value = RP.type; $('rpCap').value = RP.cap;
    $('rpPreset').onchange = function () { RP.preset = this.value; if (RP.preset !== 'custom') { var r = rangeFor(RP.preset); RP.from = r[0]; RP.to = r[1]; $('rpFrom').value = RP.from; $('rpTo').value = RP.to; } load(); };
    $('rpFrom').onchange = $('rpTo').onchange = function () { RP.preset = 'custom'; $('rpPreset').value = 'custom'; RP.from = $('rpFrom').value; RP.to = $('rpTo').value; load(); };
    $('rpDep').onchange = function () { RP.dep = this.value; load(); }; $('rpType').onchange = function () { RP.type = this.value; load(); }; $('rpCap').onchange = function () { RP.cap = this.value; load(); };
    function load() {
      var target = $('rpData'); if (!target) return; loading(target, 'Calculating capacity…');
      if (RP.to < RP.from) { errorBox(target, 'End date must be after the start date.'); return; }
      var qs = '?from=' + RP.from + '&to=' + RP.to + '&detail=1' + (RP.dep ? '&department=' + encodeURIComponent(RP.dep) : '') + (RP.type ? '&employment_type=' + encodeURIComponent(RP.type) : '') + (RP.cap ? '&capacity_status=' + encodeURIComponent(RP.cap) : '');
      api('/api/resource-planning' + qs).then(function (r) {
        var deps = {}; r.employees.forEach(function (e) { if (e.department) deps[e.department] = 1; });
        var sel = $('rpDep'); if (sel && sel.options.length <= 1) { Object.keys(deps).sort().forEach(function (d) { sel.insertAdjacentHTML('beforeend', '<option>' + esc(d) + '</option>'); }); sel.value = RP.dep; }
        var s = r.summary;
        target.innerHTML = '<div class="rx-metrics">' + metric('Approved capacity', fmt(s.approved_capacity) + ' h', 'info', s.unconfirmed_capacity_employees ? s.unconfirmed_capacity_employees + ' with unconfirmed capacity' : '') + metric('Planned hours', fmt(s.planned_hours) + ' h', 'indigo') +
          metric('Actual hours', fmt(s.actual_hours) + ' h', 'neutral') + metric('Remaining capacity', fmt(s.remaining_hours) + ' h', s.remaining_hours < 0 ? 'danger' : 'success') + metric('Overloaded', s.overloaded, s.overloaded ? 'danger' : 'success') +
          metric('Pending capacity approvals', s.pending_capacity_approvals, s.pending_capacity_approvals ? 'warning' : 'neutral') + metric('Missing declarations', s.missing_declarations, s.missing_declarations ? 'danger' : 'neutral') + '</div>' +
          '<div class="rx-toolbar">' + tabs('rpView', [['table', 'Employees'], ['timeline', 'Timeline & heatmap'], ['unestimated', 'Unestimated', r.unestimated.length || ''], ['availability', 'Availability search']], RP.view) +
          (RP.view === 'timeline' ? '<label class="rx-inline-field">Scale <select id="rpScale"><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option></select></label>' : '') + '</div><div id="rpBody"></div>';
        target.querySelectorAll('#rpView [data-tab]').forEach(function (b) { b.onclick = function () { RP.view = b.dataset.tab; load(); }; });
        if ($('rpScale')) { $('rpScale').value = RP.scale; $('rpScale').onchange = function () { RP.scale = this.value; drawTimeline($('rpBody'), r); }; }
        var body = $('rpBody');
        if (RP.view === 'timeline') return drawTimeline(body, r);
        if (RP.view === 'unestimated') return drawUnestimated(body, r, load);
        if (RP.view === 'availability') return drawAvailability(body, r);
        drawEmployees(body, r);
      }).catch(function (e) { errorBox(target, e); });
    }
    load();
  }
  function utilBar(e) {
    if (e.utilization === null || e.utilization === undefined) return '<span class="rx-muted">' + (e.approved_capacity === null ? 'Not confirmed' : '—') + '</span>';
    var pct = Math.min(100, e.utilization), tone = e.status === 'Overloaded' ? 'danger' : e.status === 'Near Capacity' ? 'warning' : 'success';
    return '<span class="rx-util"><span class="rx-util-track"><span class="rx-util-fill rx-tone-bg-' + tone + '" style="width:' + pct + '%"></span></span><span>' + fmt(e.utilization, 1) + '%</span></span>';
  }
  function drawEmployees(body, r) {
    body.innerHTML = table(['Employee', 'Employment', 'Capacity status', 'Approved', 'Planned', 'Actual', 'Utilization', 'Remaining', 'Projects', 'Workload'], r.employees.map(function (e) {
      return '<tr data-emp="' + esc(e.id) + '"><td><strong>' + esc(e.name) + '</strong><small class="rx-sub">' + esc(e.department || '') + '</small></td><td>' + esc(e.employment_type) + '</td><td>' + statusChip(e.capacity_status) + '</td>' +
        '<td>' + (e.approved_capacity === null ? '<span class="rx-muted" title="Approved part: ' + fmt(e.approved_capacity_partial) + ' h">—</span>' : fmt(e.approved_capacity) + ' h') + '</td><td>' + fmt(e.planned_hours) + ' h</td><td>' + fmt(e.actual_hours) + ' h</td><td>' + utilBar(e) + '</td>' +
        '<td>' + (e.remaining_hours === null ? '—' : '<span class="' + (e.remaining_hours < 0 ? 'rx-neg' : '') + '">' + fmt(e.remaining_hours) + ' h</span>') + '</td><td class="rx-cell-wrap">' + esc(e.projects.join(', ') || '—') + '</td><td>' + statusChip(e.status) + (e.overload_hours ? '<small class="rx-sub rx-neg">+' + fmt(e.overload_hours) + ' h over</small>' : '') + '</td></tr>';
    }), { min: 1100, empty: 'No employees match these filters.' }) + '<p class="rx-muted rx-footnote">Capacity = approved availability (schedule or declaration) minus holidays and approved leave. Planned = Task/Subtask estimates allocated over working days (roll-ups not double-counted). Actual = Worklogs. Pending or missing declarations are never shown as confirmed capacity.</p>';
    body.querySelectorAll('tr[data-emp]').forEach(function (tr) { tr.onclick = function () { var e = r.employees.find(function (x) { return x.id === tr.dataset.emp; }); employeeWorkload(e, r); }; });
  }
  function employeeWorkload(e, r) {
    dialog({ title: e.name + ' — workload ' + r.from + ' → ' + r.to, width: 820, footer: '<button type="button" class="wm-btn primary" data-close>Close</button>', body:
      '<div class="rx-metrics">' + metric('Approved capacity', e.approved_capacity === null ? 'Not confirmed' : fmt(e.approved_capacity) + ' h', 'info') + metric('Leave', fmt(e.leave_hours) + ' h', 'neutral') + metric('Planned', fmt(e.planned_hours) + ' h', 'indigo') + metric('Actual', fmt(e.actual_hours) + ' h', 'neutral') + metric('Variance (actual − planned)', fmt(e.variance_hours) + ' h', e.variance_hours > 0 ? 'warning' : 'neutral') + '</div>' +
      table(['Task / Subtask', 'Project', 'Source', 'Window', 'Hours in period'], e.assignments.map(function (a) { return '<tr><td>' + esc(a.name) + '</td><td>' + esc(a.project) + '</td><td>' + esc(a.kind === 'allocation' ? 'Explicit allocation' : a.kind === 'subtask' ? 'Subtask estimate' : 'Task estimate' + (a.rollup ? ' (roll-up)' : '')) + '</td><td>' + fmtDay(a.start) + ' – ' + fmtDay(a.end) + '</td><td>' + fmt(a.planned_in_range) + ' h</td></tr>'; }), { min: 640, empty: 'No planned work in this period.' }) });
  }
  function drawTimeline(body, r) {
    var days = eachDay(r.from, r.to), buckets = [];
    if (RP.scale === 'day') buckets = days.map(function (d) { return { key: d, label: (+d.slice(8)) + '', sub: DOW[new Date(d + 'T12:00:00Z').getUTCDay()].slice(0, 2), days: [d] }; });
    else if (RP.scale === 'week') { var cur = null; days.forEach(function (d) { var dt = new Date(d + 'T12:00:00Z'), mon = addDays(d, -((dt.getUTCDay() + 6) % 7)); if (!cur || cur.key !== mon) { cur = { key: mon, label: 'Wk ' + fmtDay(mon).slice(0, 6), sub: '', days: [] }; buckets.push(cur); } cur.days.push(d); }); }
    else { var cm = null; days.forEach(function (d) { var k = d.slice(0, 7); if (!cm || cm.key !== k) { cm = { key: k, label: new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }), sub: '', days: [] }; buckets.push(cm); } cm.days.push(d); }); }
    var head = '<div class="rx-tl-row rx-tl-head"><div class="rx-tl-name">Employee</div>' + buckets.map(function (b) { return '<div class="rx-tl-cell rx-tl-hcell"><span>' + esc(b.label) + '</span><small>' + esc(b.sub) + '</small></div>'; }).join('') + '</div>';
    var rows = r.employees.map(function (e) {
      var map = {}; (e.days || []).forEach(function (c) { map[c.day] = c; });
      return '<div class="rx-tl-row"><div class="rx-tl-name"><strong>' + esc(e.name) + '</strong><small>' + statusChip(e.status) + '</small></div>' + buckets.map(function (b) {
        var cap = 0, plan = 0, act = 0, leave = 0, hol = false, unconfirmed = false;
        b.days.forEach(function (d) { var c = map[d]; if (!c) return; if (c.capacity === null) unconfirmed = true; else cap += c.capacity; plan += c.planned; act += c.actual; leave += c.leave; if (c.holiday) hol = true; });
        var u = cap > 0 ? plan / cap * 100 : (plan > 0 ? 999 : 0);
        var cls = unconfirmed ? 'is-unconfirmed' : cap <= 0 && plan <= 0 ? 'is-zero' : u > 100 ? 'is-over' : u >= 85 ? 'is-near' : plan > 0 ? 'is-ok' : 'is-free';
        var tip = b.key + ' · capacity ' + (unconfirmed ? 'not confirmed' : fmt(cap) + 'h') + ' · planned ' + fmt(plan) + 'h · actual ' + fmt(act) + 'h' + (leave ? ' · leave ' + fmt(leave) + 'h' : '') + (hol ? ' · holiday' : '');
        return '<button type="button" class="rx-tl-cell rx-heat ' + cls + (hol ? ' is-holiday' : '') + (leave ? ' has-leave' : '') + '" title="' + esc(tip) + '" aria-label="' + esc(e.name + ' ' + tip) + '"><span>' + (plan ? fmt(plan, 1) : '') + '</span><small>' + (unconfirmed ? '?' : cap ? fmt(cap, 1) : '') + '</small></button>';
      }).join('') + '</div>';
    }).join('');
    body.innerHTML = '<div class="rx-legend rx-heat-legend"><span class="rx-heat is-free"></span>Free <span class="rx-heat is-ok"></span>Planned <span class="rx-heat is-near"></span>Near capacity (≥85%) <span class="rx-heat is-over"></span>Overloaded <span class="rx-heat is-unconfirmed"></span>Capacity not confirmed <span class="rx-heat is-zero"></span>No capacity · <small>big number = planned h, small = capacity h</small></div>' +
      '<div class="rx-tl-scroll" tabindex="0" aria-label="Resource timeline"><div class="rx-tl" style="--rx-tl-cols:' + buckets.length + '">' + head + rows + '</div></div>';
  }
  function drawUnestimated(body, r, reload) {
    me().then(function (u) {
      var canManage = r.can_manage;
      body.innerHTML = '<p class="rx-muted">Tasks and subtasks without an estimate are excluded from planned hours — they are not treated as zero effort.</p>' +
        table(['Item', 'Kind', 'Project', 'Assignee', ''], r.unestimated.map(function (x) { var a = (USERS || []).find(function (q) { return q.id === x.assignee_id; }); return '<tr><td>' + esc(x.name) + '</td><td>' + esc(x.kind) + '</td><td>' + esc(x.project) + '</td><td>' + esc(a ? a.full_name : x.assignee_id || 'Unassigned') + '</td><td class="rx-actions">' + (canManage ? '<button type="button" class="wm-btn rx-btn-sm" data-est="' + esc(x.id) + '" data-kind="' + esc(x.kind) + '">Set estimate</button>' : '') + '</td></tr>'; }), { min: 640, empty: 'Every scheduled task has an estimate.' });
      body.querySelectorAll('[data-est]').forEach(function (b) { b.onclick = function () { dialog({ title: 'Set estimate', width: 400, submit: 'Save', body: field('Estimated hours', '<input type="number" name="h" min="0.5" step="0.5" required>', { req: true }), onSubmit: function (d) { return api('/api/resource-planning', { method: 'POST', body: { action: 'estimate', kind: b.dataset.kind, id: b.dataset.est, estimated_hours: Number(d.val('h')) } }).then(function () { toast('Estimate saved'); reload(); }); } }); }; });
    });
  }
  function drawAvailability(body, r) {
    body.innerHTML = '<div class="rx-filter-row"><label class="rx-inline-field">At least <input type="number" id="rpMin" min="1" value="8" style="width:90px"> hours free</label></div><div id="rpAvail"></div>';
    function draw() {
      var min = Number($('rpMin').value || 1);
      var list = r.employees.filter(function (e) { return e.remaining_hours !== null && e.remaining_hours >= min; }).sort(function (a, b) { return b.remaining_hours - a.remaining_hours; });
      $('rpAvail').innerHTML = table(['Employee', 'Department', 'Approved capacity', 'Planned', 'Free', 'Utilization'], list.map(function (e) { return '<tr><td>' + esc(e.name) + '</td><td>' + esc(e.department) + '</td><td>' + fmt(e.approved_capacity) + ' h</td><td>' + fmt(e.planned_hours) + ' h</td><td><strong>' + fmt(e.remaining_hours) + ' h</strong></td><td>' + utilBar(e) + '</td></tr>'; }), { min: 640, empty: 'Nobody has that much confirmed free capacity in this period.' });
    }
    $('rpMin').oninput = draw; draw();
  }

  /* =============================================================== APPROVAL CENTER (Module 3) */
  var AP = { tab: 'pending', page: 1, category: '', type: '', status: '', priority: '', q: '', from: '', to: '' };
  function approvals(node) {
    Promise.all([api('/api/approval-center?meta=1'), users()]).then(function (res) {
      var meta = res[0], list = res[1];
      var tabList = [['pending', 'Pending'], ['assigned', 'Assigned to Me'], ['mine', 'My Requests'], ['delegated', 'Delegated'], ['approved', 'Approved'], ['rejected', 'Rejected']].concat(meta.is_admin ? [['all', 'All Requests']] : []).concat([['delegations', 'Delegations']]).concat(meta.is_admin ? [['routing', 'Routing rules']] : []);
      node.innerHTML = header('Approval Center', 'Every approval — HR, projects, finance and documents — in one queue.', '<button type="button" class="wm-btn primary" id="apNew">New request</button>') +
        tabs('apTabs', tabList, AP.tab) + '<div id="apBody"></div>';
      node.querySelectorAll('#apTabs [data-tab]').forEach(function (b) { b.onclick = function () { AP.tab = b.dataset.tab; AP.page = 1; approvals(node); }; });
      $('apNew').onclick = function () { newRequest(meta, list, function () { AP.tab = 'mine'; approvals(node); }); };
      var body = $('apBody');
      if (AP.tab === 'delegations') return delegations(body, meta, list, function () { approvals(node); });
      if (AP.tab === 'routing') return routing(body, meta, list, function () { approvals(node); });
      var types = Object.keys(meta.labels);
      body.innerHTML = '<div class="rx-card rx-filters"><div class="rx-filter-row">' +
        '<label class="rx-inline-field rx-grow">Search <input type="search" id="apQ" placeholder="ID, title, requester…" value="' + esc(AP.q) + '"></label>' +
        '<label class="rx-inline-field">Category <select id="apCat"><option value="">All</option>' + Object.keys(meta.categories).map(function (c) { return '<option' + (c === AP.category ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></label>' +
        '<label class="rx-inline-field">Type <select id="apType"><option value="">All</option>' + types.map(function (t) { return '<option value="' + t + '"' + (t === AP.type ? ' selected' : '') + '>' + esc(meta.labels[t]) + '</option>'; }).join('') + '</select></label>' +
        '<label class="rx-inline-field">Status <select id="apStatus"><option value="">All</option>' + ['Pending', 'Approved', 'Rejected', 'Changes Requested', 'Cancelled'].map(function (s) { return '<option' + (s === AP.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></label>' +
        '<label class="rx-inline-field">Priority <select id="apPri"><option value="">All</option>' + ['Low', 'Normal', 'High', 'Urgent'].map(function (s) { return '<option' + (s === AP.priority ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></label>' +
        '<label class="rx-inline-field">From <input type="date" id="apFrom" value="' + AP.from + '"></label><label class="rx-inline-field">To <input type="date" id="apTo" value="' + AP.to + '"></label></div></div><div id="apList"></div>';
      var t; $('apQ').oninput = function () { clearTimeout(t); var v = this.value; t = setTimeout(function () { AP.q = v; AP.page = 1; loadList(); }, 300); };
      [['apCat', 'category'], ['apType', 'type'], ['apStatus', 'status'], ['apPri', 'priority'], ['apFrom', 'from'], ['apTo', 'to']].forEach(function (p) { $(p[0]).onchange = function () { AP[p[1]] = this.value; AP.page = 1; loadList(); }; });
      function loadList() {
        var target = $('apList'); loading(target);
        var qs = '?tab=' + AP.tab + '&page=' + AP.page + '&page_size=20' + ['category', 'type', 'status', 'priority', 'q', 'from', 'to'].map(function (k) { return AP[k] ? '&' + k + '=' + encodeURIComponent(AP[k]) : ''; }).join('');
        api('/api/approval-center' + qs).then(function (j) {
          var pages = Math.max(1, Math.ceil(j.total / j.page_size));
          target.innerHTML = table(['Request ID', 'Category', 'Type', 'Title', 'Requester', 'Current approver', 'Submitted', 'Priority', 'Status', ''], j.requests.map(function (r) {
            return '<tr data-id="' + esc(r.id) + '"><td><code>' + esc(r.id.slice(0, 8)) + '</code></td><td>' + esc(r.category) + '</td><td>' + esc(r.type_label) + '</td><td class="rx-cell-wrap"><strong>' + esc(r.title) + '</strong></td><td>' + esc(r.requester_name || '') + '</td>' +
              '<td>' + esc(r.current_approvers.map(function (a) { return a.name; }).join(', ') || '—') + '</td><td>' + fmtTime(r.submitted_at || r.created_at) + '</td><td>' + statusChip(r.priority) + '</td><td>' + statusChip(r.status) + '</td>' +
              '<td class="rx-actions"><button type="button" class="wm-btn rx-btn-sm' + (r.can_decide ? ' primary' : '') + '" data-open="' + esc(r.id) + '">' + (r.can_decide ? 'Review' : 'View') + '</button></td></tr>';
          }), { min: 1100, empty: AP.tab === 'pending' ? 'Nothing is waiting for your decision.' : 'No requests in this view.' }) +
            '<div class="rx-pager"><span>' + j.total + ' request' + (j.total === 1 ? '' : 's') + '</span><button type="button" class="wm-btn rx-btn-sm" id="apPrev"' + (AP.page <= 1 ? ' disabled' : '') + '>Previous</button><span>Page ' + AP.page + ' / ' + pages + '</span><button type="button" class="wm-btn rx-btn-sm" id="apNext"' + (AP.page >= pages ? ' disabled' : '') + '>Next</button></div>';
          $('apPrev').onclick = function () { AP.page--; loadList(); }; $('apNext').onclick = function () { AP.page++; loadList(); };
          target.querySelectorAll('[data-open]').forEach(function (b) { b.onclick = function (ev) { ev.stopPropagation(); requestDetail(b.dataset.open, list, loadList); }; });
          target.querySelectorAll('tr[data-id]').forEach(function (tr) { tr.onclick = function () { requestDetail(tr.dataset.id, list, loadList); }; });
        }).catch(function (e) { errorBox(target, e); });
      }
      loadList();
    }).catch(function (e) { errorBox(node, e); });
  }
  function sourceSummary(type, s) {
    if (!s) return '';
    if (type === 'leave_request') return kv([['Leave type', s.leave_type], ['Dates', fmtDay(s.start_date) + (day(s.end_date) !== day(s.start_date) ? ' – ' + fmtDay(s.end_date) : '')], ['Duration', s.unit === 'half' ? 'Half day (' + (s.half_part || 'AM') + ')' : fmt(s.duration_hours) + ' h'], ['Reason', s.reason], ['Attachment', s.attachment_url ? '<a href="' + esc(s.attachment_url) + '" target="_blank" rel="noopener">Open</a>' : '—', !!s.attachment_url]]);
    if (type === 'capacity_declaration') return kv([['Month', s.month], ['Version', 'v' + s.version], ['Total available', fmt(s.total_hours) + ' h'], ['Days declared', (s.entries || []).filter(function (e) { return e.availability !== 'unavailable'; }).length]]) +
      '<div class="rx-mini-days">' + (s.entries || []).map(function (e) { return '<span class="' + (e.availability === 'unavailable' ? 'is-off' : '') + '">' + day(e.day).slice(8) + '<b>' + (e.availability === 'unavailable' ? '—' : fmt(e.hours)) + '</b></span>'; }).join('') + '</div>';
    if (type === 'project_disbursement') return kv([['Project', s.project_name], ['Requested', money(s.requested_amount, s.currency)], ['Purpose', s.purpose], ['Recipient', s.recipient], ['Status', s.status]]);
    if (type === 'project_expense') return kv([['Project', s.project_name], ['Amount', money(s.amount, s.currency)], ['Category', s.category], ['Reference', s.reference], ['Payee', s.counterparty], ['Description', s.description]]);
    return '';
  }
  function requestDetail(id, list, refresh) {
    var d = dialog({ title: 'Approval request', width: 760, footer: '<button type="button" class="wm-btn" data-close>Close</button>', body: '<div id="apDetail"></div>' });
    var box = d.el.querySelector('#apDetail'); loading(box);
    api('/api/approval-center?id=' + encodeURIComponent(id)).then(function (j) {
      var r = j.request; var payload = {}; try { payload = JSON.parse(r.payload || '{}'); } catch (e) {}
      d.el.querySelector('.wm-modal-head h3').textContent = r.title;
      box.innerHTML = '<div class="rx-kv">' + kv([['Request ID', '<code>' + esc(r.id) + '</code>', true], ['Category', r.category], ['Type', r.type_label], ['Requester', r.requester_name], ['Submitted', fmtTime(r.submitted_at || r.created_at)], ['Priority', statusChip(r.priority), true], ['Mode', { single: 'Single approver', sequential: 'Sequential stages', parallel: 'Parallel (all must approve)' }[r.mode]], ['Status', statusChip(r.status), true]]) + '</div>' +
        (payload.description ? '<p class="rx-desc">' + esc(payload.description) + '</p>' : '') + (j.source ? '<h4 class="rx-section-h">Related record</h4><div class="rx-kv">' + sourceSummary(r.request_type, j.source) + '</div>' : '') +
        '<h4 class="rx-section-h">Approval steps</h4><ol class="rx-steps">' + j.steps.map(function (s) { return '<li class="rx-step is-' + s.decision.toLowerCase().replace(/\s+/g, '-') + '"><span class="rx-step-n">' + s.sequence_num + '</span><span><strong>' + esc(s.full_name || s.approver_id) + '</strong>' + statusChip(s.decision) + (s.acted_by && s.acted_by !== s.approver_id ? '<small>by ' + esc(s.acted_by_name) + ' (delegate)</small>' : '') + (s.reason ? '<small>“' + esc(s.reason) + '”</small>' : '') + (s.decided_at ? '<small>' + fmtTime(s.decided_at) + '</small>' : '') + '</span>' + (j.can_reassign && s.decision === 'Pending' ? '<button type="button" class="wm-btn rx-btn-sm" data-reassign="' + esc(s.id) + '">Reassign</button>' : '') + '</li>'; }).join('') + '</ol>' +
        '<details class="rx-details" open><summary>History (' + j.events.length + ')</summary><ul class="rx-timeline">' + j.events.map(function (e) { var det = {}; try { det = JSON.parse(e.details || '{}'); } catch (x) {} var nm = function (uid) { var u = list.find(function (q) { return q.id === uid; }); return u ? u.full_name : uid; };
          return '<li><time>' + fmtTime(e.created_at) + '</time><span><strong>' + esc(e.actor_name || '') + '</strong> ' + esc(e.action) + (det.previous_approver ? ' · ' + esc(nm(det.previous_approver)) + ' → ' + esc(nm(det.new_approver)) : '') + (det.on_behalf_of ? ' · on behalf of ' + esc(nm(det.on_behalf_of)) : '') + (e.reason ? ' — “' + esc(e.reason) + '”' : '') + (e.new_status && e.new_status !== e.previous_status ? ' ' + statusChip(e.new_status) : '') + '</span></li>'; }).join('') + '</ul></details>';
      var footer = d.el.querySelector('.wm-modal-footer');
      if (j.can_decide) footer.innerHTML = '<button type="button" class="wm-btn" data-close>Close</button><button type="button" class="wm-btn" id="apChanges">Request changes</button><button type="button" class="wm-btn danger" id="apReject">Reject</button><button type="button" class="wm-btn primary" id="apApprove">Approve</button>';
      footer.querySelectorAll('[data-close]').forEach(function (b) { b.onclick = d.close; });
      function decide(decision, reason) { return api('/api/approval-center', { method: 'POST', body: { action: 'decide', id: id, decision: decision, reason: reason || '' } }).then(function (x) { toast(decision + (x.status === 'Pending' ? ' — waiting for other approvers' : '')); d.close(); refresh(); }).catch(function (e) { toast(e.message, 'error'); }); }
      if (j.can_decide) {
        $('apApprove').onclick = function () { confirmDialog('Approve request', 'Approve "' + r.title + '"?', 'Approve').then(function (ok) { if (ok) decide('Approved'); }); };
        $('apReject').onclick = function () { reasonDialog('Reject request', 'Reason for rejection', 'Reject').then(function (v) { if (v) decide('Rejected', v); }); };
        $('apChanges').onclick = function () { reasonDialog('Request changes', 'What needs to change?', 'Request changes').then(function (v) { if (v) decide('Changes Requested', v); }); };
      }
      box.querySelectorAll('[data-reassign]').forEach(function (b) { b.onclick = function () {
        dialog({ title: 'Reassign approver', width: 500, nested: true, submit: 'Reassign', body: field('New approver', '<select name="to" required>' + userOptions(list, '', { empty: 'Select an eligible approver…', exclude: [r.requester_id], roles: r.category === 'Project Finance' ? ['System Admin', 'Project Manager'] : null }) + '</select>', { req: true }) + field('Reason', '<textarea name="reason" rows="2" required></textarea>', { req: true, help: 'Recorded in the request history. Completed decisions are never removed.' }),
          onSubmit: function (x) { if (!x.val('to')) throw new Error('Choose an approver.'); return api('/api/approval-center', { method: 'POST', body: { action: 'reassign', id: id, step_id: b.dataset.reassign, approver_id: x.val('to'), reason: x.val('reason') } }).then(function () { toast('Approver reassigned'); d.close(); refresh(); }); } });
      }; });
    }).catch(function (e) { errorBox(box, e); });
  }
  function newRequest(meta, list, done) {
    dialog({ title: 'New approval request', width: 600, submit: 'Submit', body:
      '<p class="rx-muted">Leave, capacity, expense and disbursement approvals are created from their own screens so the business record stays linked.</p>' +
      field('Request type', '<select name="type">' + meta.direct_types.map(function (t) { return '<option value="' + t + '">' + esc(meta.labels[t]) + '</option>'; }).join('') + '</select>', { req: true }) +
      field('Title', '<input name="title" required maxlength="200">', { req: true }) + field('Details', '<textarea name="description" rows="3"></textarea>') +
      '<div class="wm-form-grid">' + field('Priority', '<select name="priority"><option>Normal</option><option>Low</option><option>High</option><option>Urgent</option></select>') + field('Mode', '<select name="mode"><option value="single">Single approver</option><option value="sequential">Sequential stages</option><option value="parallel">Parallel</option></select>') + '</div>' +
      field('Approvers', '<select name="approvers" multiple size="5">' + userOptions(list, '', { exclude: [ME && ME.id] }) + '</select>', { help: 'Leave empty to use routing rules / your department head. For sequential mode the order selected is the stage order.' }),
      onSubmit: function (d) {
        var sel = Array.prototype.slice.call(d.form.elements.approvers.selectedOptions).map(function (o) { return o.value; });
        var mode = d.val('mode'); if (mode === 'single' && sel.length > 1) throw new Error('Single mode needs one approver — choose sequential or parallel for several.');
        if (!String(d.val('title')).trim()) throw new Error('Title is required.');
        return api('/api/approval-center', { method: 'POST', body: { action: 'create', type: d.val('type'), title: d.val('title'), description: d.val('description'), priority: d.val('priority'), mode: sel.length > 1 ? mode : 'single', approvers: sel } }).then(function () { toast('Request submitted'); done(); });
      } });
  }
  function delegations(node, meta, list, refresh) {
    var rows = meta.delegations.map(function (d) {
      var cats = []; try { cats = JSON.parse(d.categories || '[]'); } catch (e) {}
      var active = d.status === 'Active' && day(d.start_date) <= todayStr() && day(d.end_date) >= todayStr();
      return '<tr><td>' + esc(d.delegator_name) + '</td><td>' + esc(d.delegate_name) + '</td><td>' + fmtDay(d.start_date) + ' – ' + fmtDay(d.end_date) + '</td><td>' + esc(cats.length ? cats.join(', ') : 'All categories') + '</td><td>' + statusChip(d.status === 'Active' ? (active ? 'Active' : day(d.end_date) < todayStr() ? 'Expired' : 'Scheduled') : d.status) + '</td><td class="rx-actions">' + (d.status === 'Active' && (meta.is_admin || (ME && d.delegator_id === ME.id)) ? '<button type="button" class="wm-btn rx-btn-sm danger" data-revoke="' + esc(d.id) + '">Revoke</button>' : '') + '</td></tr>';
    });
    node.innerHTML = '<div class="rx-toolbar"><p class="rx-muted">A delegate can decide your approvals while the delegation is active. Expired delegations stop automatically.</p><button type="button" class="wm-btn primary" id="apDelNew">New delegation</button></div>' + table(['Delegator', 'Delegate', 'Period', 'Categories', 'Status', ''], rows, { min: 760, empty: 'No delegations.' });
    node.querySelectorAll('[data-revoke]').forEach(function (b) { b.onclick = function () { confirmDialog('Revoke delegation', 'Stop this delegation now?', 'Revoke', true).then(function (ok) { if (ok) api('/api/approval-center', { method: 'POST', body: { action: 'revoke_delegation', id: b.dataset.revoke } }).then(function () { toast('Delegation revoked'); refresh(); }).catch(function (e) { toast(e.message, 'error'); }); }); }; });
    $('apDelNew').onclick = function () {
      dialog({ title: 'Delegate my approvals', width: 560, submit: 'Create delegation', body:
        (meta.is_admin ? field('Delegator', '<select name="delegator">' + userOptions(list, ME && ME.id) + '</select>') : '') +
        field('Delegate', '<select name="delegate" required>' + userOptions(list, '', { empty: 'Select…', exclude: [ME && ME.id] }) + '</select>', { req: true }) +
        '<div class="wm-form-grid">' + field('Start date', '<input type="date" name="start" value="' + todayStr() + '" required>', { req: true }) + field('End date', '<input type="date" name="end" value="' + addDays(todayStr(), 7) + '" required>', { req: true }) + '</div>' +
        field('Categories', '<div class="rx-weekdays">' + Object.keys(meta.categories).map(function (c) { return '<label class="rx-check"><input type="checkbox" name="cat" value="' + esc(c) + '"> ' + esc(c) + '</label>'; }).join('') + '</div>', { help: 'None selected = all categories. Finance approvals can only go to a Project Manager or System Admin.' }),
        onSubmit: function (d) {
          var cats = Array.prototype.slice.call(d.form.querySelectorAll('input[name=cat]:checked')).map(function (x) { return x.value; });
          return api('/api/approval-center', { method: 'POST', body: { action: 'delegate', delegator_id: meta.is_admin ? d.val('delegator') : undefined, delegate_id: d.val('delegate'), start_date: d.val('start'), end_date: d.val('end'), categories: cats } }).then(function () { toast('Delegation created'); refresh(); });
        } });
    };
  }
  function routing(node, meta, list, refresh) {
    var types = Object.keys(meta.labels);
    node.innerHTML = '<div class="rx-toolbar"><p class="rx-muted">Order: explicit approver → most specific active rule (lowest priority number) → employee manager / capacity approver → department head. No eligible approver = a clear error, never a silent assignment.</p><button type="button" class="wm-btn primary" id="apRuleNew">Add rule</button></div>' +
      table(['Priority', 'Category', 'Type', 'Department', 'Project', 'Approver', 'Active', ''], meta.routing_rules.map(function (r) { return '<tr><td>' + r.priority + '</td><td>' + esc(r.category || 'Any') + '</td><td>' + esc(r.request_type ? meta.labels[r.request_type] : 'Any') + '</td><td>' + esc(r.department || 'Any') + '</td><td>' + esc(r.project_key ? r.project_key.split('::')[1] : 'Any') + '</td><td>' + esc(r.approver_name) + '</td><td>' + statusChip(r.active ? 'Active' : 'Revoked') + '</td><td class="rx-actions">' + (r.active ? '<button type="button" class="wm-btn rx-btn-sm danger" data-off="' + esc(r.id) + '">Disable</button>' : '') + '</td></tr>'; }), { min: 820, empty: 'No routing rules yet.' });
    node.querySelectorAll('[data-off]').forEach(function (b) { b.onclick = function () { api('/api/approval-center', { method: 'POST', body: { action: 'routing_delete', id: b.dataset.off } }).then(refresh).catch(function (e) { toast(e.message, 'error'); }); }; });
    $('apRuleNew').onclick = function () {
      var deps = {}; list.forEach(function (u) { if (u.department) deps[u.department] = 1; });
      dialog({ title: 'Add routing rule', width: 560, submit: 'Save rule', body:
        '<div class="wm-form-grid">' + field('Category', '<select name="category"><option value="">Any</option>' + Object.keys(meta.categories).map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select>') + field('Request type', '<select name="type"><option value="">Any</option>' + types.map(function (t) { return '<option value="' + t + '">' + esc(meta.labels[t]) + '</option>'; }).join('') + '</select>') + '</div>' +
        '<div class="wm-form-grid">' + field('Department', '<select name="department"><option value="">Any</option>' + Object.keys(deps).sort().map(function (d) { return '<option>' + esc(d) + '</option>'; }).join('') + '</select>') + field('Priority', '<input type="number" name="priority" value="100" min="1" max="1000">', { help: 'Lower runs first.' }) + '</div>' +
        field('Approver', '<select name="approver" required>' + userOptions(list, '', { empty: 'Select…' }) + '</select>', { req: true }),
        onSubmit: function (d) { return api('/api/approval-center', { method: 'POST', body: { action: 'routing_save', category: d.val('category'), request_type: d.val('type'), department: d.val('department'), priority: d.val('priority'), approver_id: d.val('approver') } }).then(function () { toast('Rule saved'); refresh(); }); } });
    };
  }

  /* =============================================================== PROJECT FINANCE (Module 7) */
  var FN = { q: '', status: '', sort: 'name_asc', open: null, tab: 'overview' };
  function financials(node) {
    if (FN.open) return financeDetail(node, FN.open, function () { FN.open = null; financials(node); });
    node.innerHTML = header('Project Finance', 'Budget, cash received, expenses and disbursements per project. Approved budget is never treated as received cash.') +
      '<div class="rx-card rx-filters"><div class="rx-filter-row"><label class="rx-inline-field rx-grow">Search <input type="search" id="fnQ" placeholder="Project or owner…" value="' + esc(FN.q) + '"></label>' +
      '<label class="rx-inline-field">Status <select id="fnStatus"><option value="">All</option><option>Active</option><option>On Hold</option><option>Completed</option><option>Cancelled</option></select></label>' +
      '<label class="rx-inline-field">Sort <select id="fnSort"><option value="name_asc">Name A–Z</option><option value="cash_balance_desc">Cash balance ↓</option><option value="total_expenses_desc">Expenses ↓</option><option value="budget_utilization_desc">Utilization ↓</option></select></label></div></div><div id="fnList"></div>';
    $('fnStatus').value = FN.status; $('fnSort').value = FN.sort;
    var t; $('fnQ').oninput = function () { clearTimeout(t); var v = this.value; t = setTimeout(function () { FN.q = v; load(); }, 250); };
    $('fnStatus').onchange = function () { FN.status = this.value; load(); }; $('fnSort').onchange = function () { FN.sort = this.value; load(); };
    function load() {
      var target = $('fnList'); loading(target);
      api('/api/project-financials?list=1&page_size=200&q=' + encodeURIComponent(FN.q) + '&status=' + encodeURIComponent(FN.status) + '&sort=' + FN.sort).then(function (j) {
        target.innerHTML = table(['Project', 'Owner', 'Status', 'Approved budget', 'Total income', 'Total expenses', 'Cash balance', 'Budget utilization', ''], j.projects.map(function (p, i) {
          return '<tr data-i="' + i + '"><td><strong>' + esc(p.name) + '</strong>' + (p.registered ? '' : '<small class="rx-sub">Not registered — set a budget via Edit Project</small>') + '</td><td>' + esc(p.owner_name) + '</td><td>' + statusChip(p.status) + '</td>' +
            '<td>' + money(p.budget, p.budget !== null ? p.budget_currency : '') + '</td><td>' + money(p.total_income, p.budget_currency) + '</td><td>' + money(p.total_expenses, p.budget_currency) + '</td><td><span class="' + (p.cash_balance < 0 ? 'rx-neg' : '') + '">' + money(p.cash_balance, p.budget_currency) + '</span>' + (p.other_currencies.length ? '<small class="rx-sub">+ ' + esc(p.other_currencies.join(', ')) + '</small>' : '') + '</td>' +
            '<td>' + (p.budget_utilization === null ? '—' : fmt(p.budget_utilization, 1) + '%') + '</td><td class="rx-actions"><button type="button" class="wm-btn rx-btn-sm" data-open="' + i + '">Open</button></td></tr>';
        }), { min: 1060, empty: 'No projects you can access.' }) + '<p class="rx-muted rx-footnote">' + j.total + ' project' + (j.total === 1 ? '' : 's') + ' · includes projects that exist only on tasks (not yet registered).</p>';
        target.querySelectorAll('tr[data-i]').forEach(function (tr) { tr.onclick = function () { var p = j.projects[+tr.dataset.i]; FN.open = { owner: p.owner, project: p.name }; FN.tab = 'overview'; financials(node); }; });
      }).catch(function (e) { errorBox(target, e); });
    }
    load();
  }
  function financeDetail(node, ref, back, inline) {
    loading(node, 'Loading project finance…');
    var qs = '?owner=' + encodeURIComponent(ref.owner) + '&project=' + encodeURIComponent(ref.project);
    Promise.all([api('/api/project-financials' + qs), users()]).then(function (res) {
      var f = res[0], list = res[1];
      var main = f.summary.find(function (s) { return s.currency === f.budget_currency; }) || f.summary[0] || {};
      node.innerHTML = (inline ? '<div class="rx-card-head"><h3>Project Financials</h3></div>' : '<div class="wm-breadcrumb"><span id="fnBack">Project Finance</span> <span>›</span> <span>' + esc(f.project) + '</span></div>' + header(f.project, f.registered ? 'Budget currency ' + f.budget_currency : 'Not registered as a project — register it (Edit Project) to set a budget and release funds.')) +
        tabs('fnTabs', [['overview', 'Overview'], ['ledger', 'Income & Expenses', f.transactions.length || ''], ['disbursements', 'Disbursements', f.disbursements.length || ''], ['history', 'Financial History']], FN.tab) + '<div id="fnBody"></div>';
      if ($('fnBack')) $('fnBack').onclick = back;
      node.querySelectorAll('#fnTabs [data-tab]').forEach(function (b) { b.onclick = function () { FN.tab = b.dataset.tab; financeDetail(node, ref, back, inline); }; });
      var body = node.querySelector('#fnBody'), reload = function () { financeDetail(node, ref, back, inline); };
      if (FN.tab === 'ledger') return ledger(body, f, ref, list, reload);
      if (FN.tab === 'disbursements') return disbursementsView(body, f, ref, list, reload);
      if (FN.tab === 'history') return financeHistory(body, f, ref);
      body.innerHTML = '<div class="rx-metrics">' + metric('Approved budget', money(f.approved_budget, f.approved_budget === null ? '' : f.budget_currency), 'info') + metric('Total funds received', money(main.received, main.currency), 'success') + metric('Total expenses', money(main.expenses, main.currency), 'warning') +
        metric('Net cash balance', money(main.net_cash, main.currency), main.net_cash < 0 ? 'danger' : 'success') + metric('Total disbursed', money(main.disbursed, main.currency), 'indigo') + metric('Remaining undisbursed allocation', money(main.remaining_undisbursed_allocation, main.currency), 'neutral', 'Approved requests not yet paid') +
        metric('Budget utilization', main.budget_utilization === null || main.budget_utilization === undefined ? '—' : fmt(main.budget_utilization, 1) + '%', main.budget_utilization > 100 ? 'danger' : 'neutral', 'Confirmed expenses ÷ approved budget') + '</div>' +
        (f.summary.length > 1 ? '<h4 class="rx-section-h">Other currencies (not converted)</h4>' + table(['Currency', 'Received', 'Expenses', 'Net cash', 'Disbursed'], f.summary.filter(function (s) { return s.currency !== main.currency; }).map(function (s) { return '<tr><td>' + esc(s.currency) + '</td><td>' + money(s.received) + '</td><td>' + money(s.expenses) + '</td><td>' + money(s.net_cash) + '</td><td>' + money(s.disbursed) + '</td></tr>'; }), { min: 520 }) : '') +
        '<p class="rx-muted rx-footnote">Only Completed (confirmed) entries move cash. Approved requests are authorisations, not payments; disbursements are fund releases, not expenses. Corrections are posted as reversal entries — history is never edited.</p>';
    }).catch(function (e) { errorBox(node, e); });
  }
  function ledger(body, f, ref, list, reload) {
    var filt = { type: '', status: '' };
    function draw() {
      var rows = f.transactions.filter(function (t) { return (!filt.type || t.type === filt.type) && (!filt.status || t.status === filt.status); }).map(function (t) {
        var acts = '';
        if (f.can_manage) {
          if (t.status === 'Draft' || t.status === 'Approved') acts += '<button type="button" class="wm-btn rx-btn-sm primary" data-act="confirm_transaction" data-id="' + esc(t.id) + '">Confirm</button>';
          if (t.status === 'Draft' || t.status === 'Pending Approval') acts += '<button type="button" class="wm-btn rx-btn-sm" data-act="cancel_transaction" data-id="' + esc(t.id) + '">Cancel</button>';
          if (t.status === 'Completed' && !t.reverses_id && !f.transactions.some(function (x) { return x.reverses_id === t.id && x.status !== 'Cancelled'; })) acts += '<button type="button" class="wm-btn rx-btn-sm danger" data-act="reverse_transaction" data-id="' + esc(t.id) + '">Reverse</button>';
        }
        acts += '<button type="button" class="wm-icon-btn" data-hist="' + esc(t.id) + '" title="View history"><svg viewBox="0 0 24 24"><path d="M3 11a9 9 0 1 1 3 7M3 4v7h7M12 7v5l4 2"/></svg></button>';
        return '<tr class="' + (t.reverses_id ? 'rx-row-reversal' : '') + '"><td><code>' + esc(t.id.slice(0, 10)) + '</code></td><td>' + fmtDay(t.transaction_date || t.created_at) + '</td><td>' + statusChip(t.type === 'Income' ? 'Income' : 'Expense').replace('rx-chip-neutral', t.type === 'Income' ? 'rx-chip-success' : 'rx-chip-warning') + (t.reverses_id ? '<small class="rx-sub">Reversal</small>' : '') + '</td><td>' + esc(t.category || '—') + '</td><td class="rx-cell-wrap">' + esc(t.description || '') + (t.attachment_url ? ' <a href="' + esc(t.attachment_url) + '" target="_blank" rel="noopener">📎</a>' : '') + '</td>' +
          '<td class="rx-num">' + (t.reverses_id ? '−' : '') + money(t.amount) + '</td><td>' + esc(t.currency) + '</td><td>' + esc(t.payment_method || '—') + '</td><td>' + esc(t.reference) + '</td><td>' + esc(t.created_by_name || '') + '</td><td>' + esc(t.approved_by_name || '—') + '</td><td>' + statusChip(t.status) + '</td><td class="rx-actions">' + acts + '</td></tr>';
      });
      body.querySelector('#fnLedgerTable').innerHTML = table(['Transaction ID', 'Date', 'Type', 'Category', 'Description', 'Amount', 'Currency', 'Payment method', 'Reference', 'Created by', 'Approved by', 'Status', ''], rows, { min: 1400, empty: 'No transactions yet.' });
      body.querySelectorAll('[data-act]').forEach(function (b) { b.onclick = function () {
        var act = b.dataset.act, go = function (extra) { api('/api/project-financials', { method: 'POST', body: Object.assign({ owner: ref.owner, project: ref.project, action: act, id: b.dataset.id }, extra || {}) }).then(function () { toast({ confirm_transaction: 'Transaction confirmed', cancel_transaction: 'Transaction cancelled', reverse_transaction: 'Reversal posted' }[act]); reload(); }).catch(function (e) { toast(e.message, 'error'); }); };
        if (act === 'reverse_transaction') reasonDialog('Reverse transaction', 'Reason for correction (a reversing entry is posted; the original stays in history)', 'Post reversal').then(function (r) { if (r) go({ reason: r }); });
        else if (act === 'confirm_transaction') confirmDialog('Confirm cash movement', 'Confirm this transaction as completed? It will be included in cash balances.', 'Confirm').then(function (ok) { if (ok) go(); });
        else confirmDialog('Cancel transaction', 'Cancel this transaction?', 'Cancel transaction', true).then(function (ok) { if (ok) go(); });
      }; });
      body.querySelectorAll('[data-hist]').forEach(function (b) { b.onclick = function () { historyDialog(ref, 'transaction:' + b.dataset.hist); }; });
    }
    body.innerHTML = '<div class="rx-toolbar"><div class="rx-filter-row"><label class="rx-inline-field">Type <select id="fnLType"><option value="">All</option><option>Income</option><option>Expense</option></select></label><label class="rx-inline-field">Status <select id="fnLStatus"><option value="">All</option><option>Draft</option><option>Pending Approval</option><option>Approved</option><option>Completed</option><option>Rejected</option><option>Cancelled</option></select></label></div>' +
      (f.can_manage ? '<div class="rx-btn-row"><button type="button" class="wm-btn" id="fnAddIncome">Add income</button><button type="button" class="wm-btn primary" id="fnAddExpense">Add expense</button></div>' : '') + '</div><div id="fnLedgerTable"></div>';
    body.querySelector('#fnLType').onchange = function () { filt.type = this.value; draw(); }; body.querySelector('#fnLStatus').onchange = function () { filt.status = this.value; draw(); };
    if (f.can_manage) { body.querySelector('#fnAddIncome').onclick = function () { txForm('Income', f, ref, list, reload); }; body.querySelector('#fnAddExpense').onclick = function () { txForm('Expense', f, ref, list, reload); }; }
    draw();
  }
  function txForm(type, f, ref, list, reload) {
    var cats = (f.categories || {})[type] || [];
    dialog({ title: 'Add ' + type.toLowerCase(), width: 660, submit: type === 'Expense' ? 'Save' : 'Save draft', body:
      '<div class="wm-form-grid">' + field('Date', '<input type="date" name="date" value="' + todayStr() + '" required>', { req: true }) + field('Category', '<select name="category">' + cats.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select>') + '</div>' +
      '<div class="wm-form-grid">' + field('Amount', '<input type="number" name="amount" min="0.01" step="0.01" required inputmode="decimal">', { req: true }) + field('Currency', '<input name="currency" value="' + esc(f.budget_currency) + '" maxlength="3" required pattern="[A-Za-z]{3}">', { req: true }) + '</div>' +
      '<div class="wm-form-grid rx-fx" hidden>' + field('Exchange rate to ' + esc(f.budget_currency), '<input type="number" name="rate" min="0" step="any">', { help: 'Optional. Without a rate, totals stay grouped by currency.' }) + '<div></div></div>' +
      field('Description', '<input name="description" maxlength="1500">') +
      '<div class="wm-form-grid">' + field('Payment method', '<select name="method"><option value="">—</option>' + (f.methods || []).map(function (m) { return '<option>' + esc(m) + '</option>'; }).join('') + '</select>') + field('Reference number', '<input name="reference" required maxlength="120">', { req: true, help: 'Must be unique within this project (prevents duplicates).' }) + '</div>' +
      field(type === 'Income' ? 'Funding source / payer' : 'Recipient / payee', '<input name="counterparty" maxlength="200">') +
      field('Supporting document (link)', '<input type="url" name="attachment" placeholder="https://…">') + field('Notes', '<textarea name="notes" rows="2"></textarea>') +
      (type === 'Expense' ? '<label class="rx-check"><input type="checkbox" name="submit_for_approval" checked> Route through the Approval Center</label><div class="rx-approver-pick">' + field('Approver', '<select name="approver">' + userOptions(list, '', { empty: 'Automatic (routing rules)', exclude: [ME && ME.id], roles: ['System Admin', 'Project Manager'] }) + '</select>') + '</div>' : ''),
      onOpen: function (d) { var c = d.form.elements.currency, fx = d.el.querySelector('.rx-fx'); c.oninput = function () { fx.hidden = c.value.toUpperCase() === f.budget_currency; }; var s = d.form.elements.submit_for_approval; if (s) s.onchange = function () { d.el.querySelector('.rx-approver-pick').hidden = !s.checked; }; },
      onSubmit: function (d) {
        var amount = Number(d.val('amount')); if (!(amount > 0)) throw new Error('Enter a positive amount.');
        if (!/^[A-Za-z]{3}$/.test(d.val('currency'))) throw new Error('Currency must be a 3-letter ISO code.');
        if (!String(d.val('reference')).trim()) throw new Error('Reference number is required.');
        return api('/api/project-financials', { method: 'POST', body: { owner: ref.owner, project: ref.project, action: 'add_transaction', type: type, amount: amount, currency: d.val('currency').toUpperCase(), category: d.val('category'), description: d.val('description'), payment_method: d.val('method'), reference: d.val('reference'),
          counterparty: d.val('counterparty'), transaction_date: d.val('date'), notes: d.val('notes'), attachment_url: d.val('attachment'), exchange_rate: d.val('rate') || null, submit_for_approval: type === 'Expense' && d.val('submit_for_approval'), approver_id: d.val('approver') || null } })
          .then(function (r) { toast(r.status === 'Pending Approval' ? 'Expense sent for approval' : type + ' saved as draft — confirm it once the money has moved'); reload(); });
      } });
  }
  function disbursementsView(body, f, ref, list, reload) {
    var pays = {}; f.payments.forEach(function (p) { (pays[p.request_id] = pays[p.request_id] || []).push(p); });
    var rows = f.disbursements.map(function (d) {
      var paid = (pays[d.id] || []).reduce(function (s, p) { return s + Number(p.amount); }, 0), remain = d.approved_amount === null ? null : Number(d.approved_amount) - paid;
      return '<tr><td><code>' + esc(d.id.slice(0, 10)) + '</code></td><td class="rx-cell-wrap">' + esc(d.purpose) + '<small class="rx-sub">' + esc(d.recipient || '') + '</small></td><td>' + fmtDay(d.requested_date || d.created_at) + '</td><td class="rx-num">' + money(d.requested_amount, d.currency) + '</td><td class="rx-num">' + money(d.approved_amount, d.approved_amount === null ? '' : d.currency) + '</td><td class="rx-num">' + money(paid, d.currency) + '</td><td class="rx-num">' + (remain === null ? '—' : money(remain, d.currency)) + '</td><td>' + statusChip(d.status) + '</td>' +
        '<td class="rx-actions">' + (f.can_manage && ['Approved', 'Partially Disbursed'].indexOf(d.status) !== -1 ? '<button type="button" class="wm-btn rx-btn-sm primary" data-pay="' + esc(d.id) + '" data-remain="' + remain + '">Record payment</button>' : '') + '<button type="button" class="wm-icon-btn" data-hist="' + esc(d.id) + '" title="View history"><svg viewBox="0 0 24 24"><path d="M3 11a9 9 0 1 1 3 7M3 4v7h7M12 7v5l4 2"/></svg></button></td></tr>' +
        ((pays[d.id] || []).length ? '<tr class="rx-subrow"><td></td><td colspan="8"><div class="rx-pay-list">' + pays[d.id].map(function (p, i) { return '<span>Payment ' + (i + 1) + ': <b>' + money(p.amount, d.currency) + '</b> · ' + fmtDay(p.payment_date || p.paid_at) + ' · ref ' + esc(p.reference) + (p.recipient ? ' · ' + esc(p.recipient) : '') + (p.payment_method ? ' · ' + esc(p.payment_method) : '') + ' · by ' + esc(p.recorded_by_name || '') + '</span>'; }).join('') + '</div></td></tr>' : '');
    });
    var main = f.summary.find(function (s) { return s.currency === f.budget_currency; }) || {};
    body.innerHTML = '<div class="rx-metrics">' + metric('Approved budget', money(f.approved_budget, f.approved_budget === null ? '' : f.budget_currency), 'info') + metric('Total disbursed', money(main.disbursed, f.budget_currency), 'indigo') + metric('Remaining budget to disburse', main.remaining_budget_to_disburse === null || main.remaining_budget_to_disburse === undefined ? '—' : money(main.remaining_budget_to_disburse, f.budget_currency), 'neutral') + metric('Approved, not yet paid', money(main.remaining_undisbursed_allocation, f.budget_currency), 'warning') + '</div>' +
      '<div class="rx-toolbar"><p class="rx-muted">Workflow: Pending Approval → Approved → Partially / Fully Disbursed. Only recorded payments count as disbursed.</p>' + (f.can_manage ? '<button type="button" class="wm-btn primary" id="fnNewDisb">New disbursement</button>' : '') + '</div>' +
      table(['Request ID', 'Purpose', 'Requested', 'Requested amt', 'Approved amt', 'Disbursed', 'Remaining', 'Status', ''], rows, { min: 1100, empty: 'No disbursement requests yet.' });
    if ($('fnNewDisb')) $('fnNewDisb').onclick = function () {
      dialog({ title: 'New disbursement request', width: 620, submit: 'Submit for approval', body:
        '<div class="wm-form-grid">' + field('Requested amount', '<input type="number" name="amount" min="0.01" step="0.01" required>', { req: true }) + field('Currency', '<input name="currency" value="' + esc(f.budget_currency) + '" maxlength="3" required>', { req: true }) + '</div>' +
        field('Purpose', '<input name="purpose" required maxlength="1000">', { req: true }) + '<div class="wm-form-grid">' + field('Recipient', '<input name="recipient" maxlength="200">') + field('Payment method', '<select name="method"><option value="">—</option>' + (f.methods || []).map(function (m) { return '<option>' + esc(m) + '</option>'; }).join('') + '</select>') + '</div>' +
        '<div class="wm-form-grid">' + field('Requested date', '<input type="date" name="date" value="' + todayStr() + '">') + field('Approver', '<select name="approver">' + userOptions(list, '', { empty: 'Automatic (routing rules)', exclude: [ME && ME.id], roles: ['System Admin', 'Project Manager'] }) + '</select>') + '</div>' +
        field('Supporting documents (link)', '<input type="url" name="attachment" placeholder="https://…">') + field('Notes', '<textarea name="notes" rows="2"></textarea>'),
        onSubmit: function (d) {
          var amount = Number(d.val('amount')); if (!(amount > 0)) throw new Error('Enter a positive amount.'); if (!String(d.val('purpose')).trim()) throw new Error('Purpose is required.');
          return api('/api/project-financials', { method: 'POST', body: { owner: ref.owner, project: ref.project, action: 'request_disbursement', amount: amount, currency: d.val('currency').toUpperCase(), purpose: d.val('purpose'), recipient: d.val('recipient'), payment_method: d.val('method'), requested_date: d.val('date'), approver_id: d.val('approver') || null, attachment_url: d.val('attachment'), notes: d.val('notes') } })
            .then(function () { toast('Disbursement submitted to the Approval Center'); reload(); });
        } });
    };
    body.querySelectorAll('[data-pay]').forEach(function (b) { b.onclick = function () {
      var remain = Number(b.dataset.remain);
      dialog({ title: 'Record payment', width: 560, submit: 'Record payment', body: '<p class="rx-muted">Remaining approved amount: <strong>' + money(remain, f.budget_currency) + '</strong>. Each payment is stored separately and never overwritten.</p>' +
        '<div class="wm-form-grid">' + field('Payment amount', '<input type="number" name="amount" min="0.01" max="' + remain + '" step="0.01" required value="' + remain + '">', { req: true }) + field('Payment date', '<input type="date" name="date" value="' + todayStr() + '" required>', { req: true }) + '</div>' +
        '<div class="wm-form-grid">' + field('Reference', '<input name="reference" required maxlength="120">', { req: true }) + field('Payment method', '<select name="method"><option value="">—</option>' + (f.methods || []).map(function (m) { return '<option>' + esc(m) + '</option>'; }).join('') + '</select>') + '</div>' + field('Recipient', '<input name="recipient" maxlength="200">'),
        onSubmit: function (d) {
          var amount = Number(d.val('amount')); if (!(amount > 0)) throw new Error('Enter a positive amount.'); if (amount > remain + 0.0001) throw new Error('Amount exceeds the remaining approved amount.');
          return api('/api/project-financials', { method: 'POST', body: { owner: ref.owner, project: ref.project, action: 'pay_disbursement', id: b.dataset.pay, amount: amount, reference: d.val('reference'), payment_date: d.val('date'), payment_method: d.val('method'), recipient: d.val('recipient') } })
            .then(function (r) { toast('Payment recorded — ' + r.status); reload(); });
        } });
    }; });
    body.querySelectorAll('[data-hist]').forEach(function (b) { b.onclick = function () { historyDialog(ref, 'disbursement:' + b.dataset.hist); }; });
  }
  function historyDialog(ref, key) {
    var d = dialog({ title: 'Audit history', width: 640, footer: '<button type="button" class="wm-btn primary" data-close>Close</button>', body: '<div id="fnHist"></div>' });
    var box = d.el.querySelector('#fnHist'); loading(box);
    api('/api/project-financials?owner=' + encodeURIComponent(ref.owner) + '&project=' + encodeURIComponent(ref.project) + '&history=' + encodeURIComponent(key)).then(function (j) {
      var all = j.events.map(function (e) { return { t: e.created_at, who: e.actor_name, what: e.action.replace(/_/g, ' '), det: e.details }; }).concat(j.approval_events.map(function (e) { return { t: e.created_at, who: e.actor_name, what: 'Approval: ' + e.action, det: e.reason ? JSON.stringify({ reason: e.reason }) : '' }; }))
        .sort(function (a, b) { return String(a.t) < String(b.t) ? -1 : 1; });
      box.innerHTML = all.length ? '<ul class="rx-timeline">' + all.map(function (e) { var det = ''; try { var o = JSON.parse(e.det || '{}'); det = Object.keys(o).map(function (k) { return k + ': ' + o[k]; }).join(' · '); } catch (x) {} return '<li><time>' + fmtTime(e.t) + '</time><span><strong>' + esc(e.who || 'System') + '</strong> ' + esc(e.what) + (det ? '<small>' + esc(det) + '</small>' : '') + '</span></li>'; }).join('') + '</ul>' : empty('No history yet.');
    }).catch(function (e) { errorBox(box, e); });
  }
  function financeHistory(body, f, ref) {
    var items = [];
    f.transactions.forEach(function (t) { items.push({ t: t.created_at, txt: 'Created ' + t.type.toLowerCase() + ' ' + money(t.amount, t.currency) + ' (' + t.reference + ')', who: t.created_by_name, key: 'transaction:' + t.id }); if (t.confirmed_at) items.push({ t: t.confirmed_at, txt: 'Confirmed ' + t.type.toLowerCase() + ' ' + t.reference, who: t.approved_by_name, key: 'transaction:' + t.id }); });
    f.disbursements.forEach(function (d) { items.push({ t: d.created_at, txt: 'Disbursement requested ' + money(d.requested_amount, d.currency) + ' — ' + d.purpose, who: d.requested_by_name, key: 'disbursement:' + d.id }); });
    f.payments.forEach(function (p) { items.push({ t: p.paid_at, txt: 'Payment ' + money(p.amount) + ' ref ' + p.reference, who: p.recorded_by_name, key: 'disbursement:' + p.request_id }); });
    items.sort(function (a, b) { return String(a.t) < String(b.t) ? 1 : -1; });
    body.innerHTML = items.length ? '<ul class="rx-timeline rx-card">' + items.map(function (i) { return '<li><time>' + fmtTime(i.t) + '</time><span><strong>' + esc(i.who || '') + '</strong> ' + esc(i.txt) + ' <button type="button" class="wm-btn rx-btn-sm ghost" data-key="' + esc(i.key) + '">Details</button></span></li>'; }).join('') + '</ul>' : empty('No financial activity yet.');
    body.querySelectorAll('[data-key]').forEach(function (b) { b.onclick = function () { historyDialog(ref, b.dataset.key); }; });
  }

  /* =============================================================== WBS + GANTT (Modules 5, 6) */
  var WBS = { mode: 'both', scale: 'week', collapsed: {}, q: '', status: '', selected: null };
  /**
   * ctx: {project, owner, tasks, subtasks, worklogs, users, canManage, openTask(id), openSubtask(id), newTask(), refresh()}
   * Renders inside the Project Detail page using natural page height (no nested vertical scroll).
   */
  function wbs(node, ctx) {
    var depState = {}, deps = [], settings = null;
    node.innerHTML = '<div class="rx-wbs-head"><h3>Tasks · WBS</h3><div class="rx-btn-row">' + tabs('wbsMode', [['wbs', 'WBS'], ['gantt', 'Gantt'], ['both', 'WBS + Gantt']], WBS.mode) +
      '<button type="button" class="wm-btn rx-btn-sm" id="wbsExpand">Expand all</button><button type="button" class="wm-btn rx-btn-sm" id="wbsCollapse">Collapse all</button>' +
      (ctx.canManage ? '<button type="button" class="wm-btn rx-btn-sm" id="wbsWorkflow">Workflow</button><button type="button" class="wm-btn rx-btn-sm" id="wbsTemplate">Apply template</button><button type="button" class="wm-btn primary rx-btn-sm" id="wbsAdd">+ Add task</button>' : '') + '</div></div>' +
      '<div class="rx-filter-row rx-wbs-filters"><label class="rx-inline-field rx-grow"><span class="rx-sr-only">Search tasks</span><input type="search" id="wbsQ" placeholder="Search tasks, subtasks or WBS number…" value="' + esc(WBS.q) + '"></label>' +
      '<label class="rx-inline-field">Status <select id="wbsStatus"><option value="">All</option><option>Not Started</option><option>In Progress</option><option>Review</option><option>Completed</option><option>Cancelled</option></select></label>' +
      '<label class="rx-inline-field" id="wbsScaleWrap">Scale <select id="wbsScale"><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></select></label></div><div id="wbsBody"></div>';
    $('wbsStatus').value = WBS.status; $('wbsScale').value = WBS.scale;
    node.querySelectorAll('#wbsMode [data-tab]').forEach(function (b) { b.onclick = function () { WBS.mode = b.dataset.tab; node.querySelectorAll('#wbsMode [data-tab]').forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); }); draw(); }; });
    $('wbsExpand').onclick = function () { WBS.collapsed = {}; draw(); };
    $('wbsCollapse').onclick = function () { ctx.tasks.forEach(function (t) { WBS.collapsed[t.id] = true; }); draw(); };
    var tq; $('wbsQ').oninput = function () { clearTimeout(tq); var v = this.value; tq = setTimeout(function () { WBS.q = v; draw(); }, 200); };
    $('wbsStatus').onchange = function () { WBS.status = this.value; draw(); }; $('wbsScale').onchange = function () { WBS.scale = this.value; draw(); };
    if ($('wbsAdd')) $('wbsAdd').onclick = ctx.newTask;
    if ($('wbsWorkflow')) $('wbsWorkflow').onclick = function () { workflowSettings(ctx, settings, function () { load(); }); };
    if ($('wbsTemplate')) $('wbsTemplate').onclick = function () { applyTemplate(ctx); };
    function load() {
      api('/api/task-dependencies?project=' + encodeURIComponent(ctx.project) + (ctx.owner ? '&owner=' + encodeURIComponent(ctx.owner) : '')).then(function (j) { deps = j.dependencies || []; depState = j.state || {}; settings = j.settings; draw(); }).catch(function () { draw(); });
    }
    var actual = function (taskId, subId) { return ctx.worklogs.filter(function (w) { return subId ? w.subtask_id === subId : w.task_id === taskId; }).reduce(function (s, w) { return s + (parseFloat(w.hours) || 0); }, 0); };
    function rowsModel() {
      var tasks = ctx.tasks.slice().sort(function (a, b) { return String(a.start_date || a.due_date || '9999') < String(b.start_date || b.due_date || '9999') ? -1 : String(a.start_date || a.due_date || '9999') > String(b.start_date || b.due_date || '9999') ? 1 : String(a.created_at || '') < String(b.created_at || '') ? -1 : 1; });
      var out = [], q = WBS.q.trim().toLowerCase();
      tasks.forEach(function (t, i) {
        var subs = ctx.subtasks.filter(function (s) { return s.task_id === t.id; }), num = String(i + 1);
        var subSum = subs.reduce(function (s, x) { return s + (parseFloat(x.estimated_hours) || 0); }, 0), est = parseFloat(t.estimated_hours) || 0;
        var subRows = subs.map(function (s, k) { return { kind: 'sub', num: num + '.' + (k + 1), id: s.id, parent: t.id, name: s.name, assignee: s.assignee_name || s.assignee || '', status: s.status || 'Not Started', priority: s.priority || '', start: t.start_date, due: s.due_date || t.due_date, est: parseFloat(s.estimated_hours) || 0, act: actual(t.id, s.id), progress: Number(s.progress) || 0 }; });
        var match = function (r) { return (!q || r.name.toLowerCase().indexOf(q) !== -1 || r.num.indexOf(q) === 0) && (!WBS.status || r.status === WBS.status); };
        var tRow = { kind: 'task', num: num, id: t.id, name: t.task, assignee: t.assignee_name || '', status: t.status, priority: t.priority, start: t.start_date, due: t.due_date, est: est, rollup: subs.length > 0 && est <= subSum && subSum > 0, subSum: subSum, act: actual(t.id), progress: Number(t.progress) || 0, children: subRows.length, dep: depState[t.id] };
        var shownSubs = subRows.filter(match);
        if (match(tRow) || shownSubs.length) { out.push(tRow); if (!WBS.collapsed[t.id]) (q || WBS.status ? shownSubs : subRows).forEach(function (s) { out.push(s); }); }
      });
      return out;
    }
    function timelineRange(rows) {
      var ds = []; rows.forEach(function (r) { if (r.start) ds.push(day(r.start)); if (r.due) ds.push(day(r.due)); });
      if (!ds.length) { var t = todayStr(); return [addDays(t, -7), addDays(t, 30)]; }
      ds.sort(); var a = addDays(ds[0], -3), b = addDays(ds[ds.length - 1], 7);
      if (WBS.scale === 'month') { a = monthStart(a); b = monthEnd(b); }
      return [a, b];
    }
    function draw() {
      var body = $('wbsBody'); if (!body) return;
      $('wbsScaleWrap').hidden = WBS.mode === 'wbs';
      var rows = rowsModel();
      if (!ctx.tasks.length) { body.innerHTML = empty('No tasks in this project yet.', ctx.canManage ? 'Use "+ Add task" or apply a workflow template.' : ''); return; }
      if (!rows.length) { body.innerHTML = empty('No tasks match these filters.'); return; }
      var left = '<div class="rx-wbs-table" role="treegrid" aria-label="Work breakdown structure"><div class="rx-wbs-row rx-wbs-hrow" role="row">' +
        ['WBS', 'Task / Subtask', 'Assignee', 'Status', 'Priority', 'Start', 'Due', 'Est. h', 'Actual h', 'Progress', ''].map(function (h, i) { return '<div class="rx-wbs-c rx-wc' + i + '" role="columnheader">' + esc(h) + '</div>'; }).join('') + '</div>' +
        rows.map(function (r) {
          var toggle = r.kind === 'task' && r.children ? '<button type="button" class="rx-tree-toggle" data-toggle="' + esc(r.id) + '" aria-expanded="' + !WBS.collapsed[r.id] + '" aria-label="' + (WBS.collapsed[r.id] ? 'Expand' : 'Collapse') + ' ' + esc(r.name) + '"><svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></button>' : '<span class="rx-tree-spacer"></span>';
          var estCell = r.kind === 'task' && r.children ? (r.rollup ? '<span title="Roll-up of subtask estimates — not counted twice">Σ ' + fmt(r.subSum) + '</span>' : fmt(r.est) + (r.subSum ? '<small class="rx-sub">incl. Σ' + fmt(r.subSum) + '</small>' : '')) : (r.est ? fmt(r.est) : '<span class="rx-muted" title="Unestimated">—</span>');
          return '<div class="rx-wbs-row' + (r.kind === 'sub' ? ' is-sub' : '') + (WBS.selected === r.id ? ' is-selected' : '') + '" role="row" data-row="' + esc(r.id) + '" aria-level="' + (r.kind === 'sub' ? 2 : 1) + '">' +
            '<div class="rx-wbs-c rx-wc0">' + esc(r.num) + '</div><div class="rx-wbs-c rx-wc1">' + (r.kind === 'sub' ? '<span class="rx-indent"></span>' : '') + toggle + '<button type="button" class="rx-wbs-name" data-open="' + esc(r.id) + '" data-kind="' + r.kind + '" title="' + esc(r.name) + '">' + esc(r.name) + '</button>' + (r.dep && r.dep !== 'No Dependencies' ? '<span class="rx-dep-dot is-' + (r.dep === 'Dependencies Satisfied' ? 'ok' : 'wait') + '" title="' + esc(r.dep) + '"></span>' : '') + '</div>' +
            '<div class="rx-wbs-c rx-wc2" title="' + esc(r.assignee) + '">' + esc(r.assignee || '—') + '</div><div class="rx-wbs-c rx-wc3">' + statusChip(r.status) + '</div><div class="rx-wbs-c rx-wc4">' + (r.priority ? statusChip(r.priority) : '') + '</div>' +
            '<div class="rx-wbs-c rx-wc5">' + (r.start ? fmtDay(r.start).slice(0, 6) : '—') + '</div><div class="rx-wbs-c rx-wc6">' + (r.due ? fmtDay(r.due).slice(0, 6) : '—') + '</div><div class="rx-wbs-c rx-wc7 rx-num">' + estCell + '</div><div class="rx-wbs-c rx-wc8 rx-num">' + fmt(r.act, 1) + '</div>' +
            '<div class="rx-wbs-c rx-wc9"><span class="rx-util"><span class="rx-util-track"><span class="rx-util-fill rx-tone-bg-' + (r.progress >= 100 ? 'success' : 'info') + '" style="width:' + Math.min(100, r.progress) + '%"></span></span><span>' + r.progress + '%</span></span></div>' +
            '<div class="rx-wbs-c rx-wc10">' + (ctx.canManage && r.kind === 'task' ? '<button type="button" class="wm-icon-btn" data-deps="' + esc(r.id) + '" title="Set dependencies"><svg viewBox="0 0 24 24"><path d="M9 15l6-6M8 11l-2 2a4 4 0 0 0 6 6l2-2M16 13l2-2a4 4 0 0 0-6-6l-2 2"/></svg></button>' : '') + '</div></div>';
        }).join('') + '</div>';
      var right = '';
      if (WBS.mode !== 'wbs') {
        var rg = timelineRange(rows), days = eachDay(rg[0], rg[1]);
        var px = WBS.scale === 'day' ? 30 : WBS.scale === 'week' ? 12 : 4, width = days.length * px;
        var idx = function (d) { var i = days.indexOf(day(d)); return i < 0 ? (day(d) < days[0] ? 0 : days.length - 1) : i; };
        var heads = '';
        if (WBS.scale === 'day') heads = days.map(function (d, i) { return '<span class="rx-gt-h' + ([0, 6].indexOf(new Date(d + 'T12:00:00Z').getUTCDay()) !== -1 ? ' is-weekend' : '') + '" style="left:' + i * px + 'px;width:' + px + 'px">' + (+d.slice(8)) + '</span>'; }).join('');
        else days.forEach(function (d, i) { var dt = new Date(d + 'T12:00:00Z'); if ((WBS.scale === 'week' && dt.getUTCDay() === 1) || (WBS.scale === 'month' && d.slice(8) === '01') || i === 0) heads += '<span class="rx-gt-h" style="left:' + i * px + 'px">' + (WBS.scale === 'week' ? fmtDay(d).slice(0, 6) : dt.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })) + '</span>'; });
        var todayI = days.indexOf(todayStr());
        var rowIndex = {}; rows.forEach(function (r, i) { rowIndex[r.id] = i; });
        var bars = rows.map(function (r, i) {
          if (!r.start && !r.due) return '<div class="rx-gt-row' + (WBS.selected === r.id ? ' is-selected' : '') + '" data-row="' + esc(r.id) + '"><span class="rx-gt-nodate">No dates</span></div>';
          var s = idx(r.start || r.due), e = idx(r.due || r.start); if (e < s) e = s;
          var left = s * px, w = Math.max(px, (e - s + 1) * px);
          var tone = r.status === 'Completed' ? 'done' : (r.due && day(r.due) < todayStr() && r.status !== 'Completed' && r.status !== 'Cancelled') ? 'late' : r.kind === 'sub' ? 'sub' : 'task';
          return '<div class="rx-gt-row' + (WBS.selected === r.id ? ' is-selected' : '') + '" data-row="' + esc(r.id) + '"><button type="button" class="rx-gt-bar is-' + tone + '" data-select="' + esc(r.id) + '" style="left:' + left + 'px;width:' + w + 'px" title="' + esc(r.num + ' ' + r.name + ' · ' + fmtDay(r.start) + ' → ' + fmtDay(r.due) + ' · ' + r.progress + '%') + '"><span class="rx-gt-prog" style="width:' + Math.min(100, r.progress) + '%"></span><span class="rx-gt-label">' + esc(r.name) + '</span></button></div>';
        }).join('');
        // FS dependency arrows: end of predecessor → start of successor (only between visible rows).
        var ROW = 36, lines = deps.map(function (d) {
          var a = rows[rowIndex[d.predecessor_id]], b = rows[rowIndex[d.successor_id]]; if (!a || !b || !(a.due || a.start) || !(b.start || b.due)) return '';
          var x1 = (idx(a.due || a.start) + 1) * px, y1 = rowIndex[a.id] * ROW + ROW / 2, x2 = idx(b.start || b.due) * px, y2 = rowIndex[b.id] * ROW + ROW / 2, mx = Math.max(x1 + 8, x2 - 8);
          return '<path d="M' + x1 + ' ' + y1 + ' H' + mx + ' V' + y2 + ' H' + (x2 - 2) + '" class="rx-gt-link"/><path d="M' + (x2 - 7) + ' ' + (y2 - 4) + ' L' + (x2 - 1) + ' ' + y2 + ' L' + (x2 - 7) + ' ' + (y2 + 4) + '" class="rx-gt-arrow"/>';
        }).join('');
        right = '<div class="rx-gantt" role="img" aria-label="Gantt timeline"><div class="rx-gt-scroll" tabindex="0"><div class="rx-gt-inner" style="width:' + width + 'px"><div class="rx-gt-heads">' + heads + '</div><div class="rx-gt-rows">' +
          (todayI >= 0 ? '<span class="rx-gt-today" style="left:' + todayI * px + 'px" title="Today"></span>' : '') + bars + '<svg class="rx-gt-links" width="' + width + '" height="' + rows.length * ROW + '" aria-hidden="true">' + lines + '</svg></div></div></div></div>';
      }
      body.innerHTML = '<div class="rx-wbs-layout is-' + WBS.mode + '">' + (WBS.mode !== 'gantt' ? left : '<div class="rx-wbs-table rx-wbs-narrow">' + '<div class="rx-wbs-row rx-wbs-hrow"><div class="rx-wbs-c rx-wc0">WBS</div><div class="rx-wbs-c rx-wc1">Task</div></div>' + rows.map(function (r) { return '<div class="rx-wbs-row' + (r.kind === 'sub' ? ' is-sub' : '') + (WBS.selected === r.id ? ' is-selected' : '') + '" data-row="' + esc(r.id) + '"><div class="rx-wbs-c rx-wc0">' + esc(r.num) + '</div><div class="rx-wbs-c rx-wc1">' + (r.kind === 'task' && r.children ? '<button type="button" class="rx-tree-toggle" data-toggle="' + esc(r.id) + '" aria-expanded="' + !WBS.collapsed[r.id] + '" aria-label="Toggle ' + esc(r.name) + '"><svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></button>' : '<span class="rx-tree-spacer"></span>') + '<button type="button" class="rx-wbs-name" data-open="' + esc(r.id) + '" data-kind="' + r.kind + '">' + esc(r.name) + '</button></div></div>'; }).join('') + '</div>') + right + '</div>' +
        '<p class="rx-muted rx-footnote">Σ = roll-up of subtask estimates (not double-counted in Resource Planning). Dependencies only send "Task Ready to Start" notifications — they never block, start, complete or re-date tasks.</p>';
      body.querySelectorAll('[data-toggle]').forEach(function (b) { b.onclick = function (ev) { ev.stopPropagation(); WBS.collapsed[b.dataset.toggle] = !WBS.collapsed[b.dataset.toggle]; draw(); }; });
      body.querySelectorAll('[data-open]').forEach(function (b) { b.onclick = function (ev) { ev.stopPropagation(); if (b.dataset.kind === 'sub') ctx.openSubtask(b.dataset.open); else ctx.openTask(b.dataset.open); }; });
      body.querySelectorAll('[data-row]').forEach(function (r) { r.addEventListener('click', function (ev) { if (ev.target.closest('button')) return; select(r.dataset.row); }); });
      body.querySelectorAll('[data-select]').forEach(function (b) { b.onclick = function () { select(b.dataset.select); var tr = body.querySelector('.rx-wbs-table [data-row="' + b.dataset.select + '"]'); if (tr) tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }; });
      body.querySelectorAll('[data-deps]').forEach(function (b) { b.onclick = function (ev) { ev.stopPropagation(); dependencyDialog(ctx, b.dataset.deps, deps, load); }; });
    }
    function select(id) { WBS.selected = id; $('wbsBody').querySelectorAll('[data-row]').forEach(function (r) { r.classList.toggle('is-selected', r.dataset.row === id); }); }
    load();
  }
  function dependencyDialog(ctx, taskId, deps, done) {
    var t = ctx.tasks.find(function (x) { return x.id === taskId; }); if (!t) return;
    var preds = deps.filter(function (d) { return d.successor_id === taskId; }).map(function (d) { return d.predecessor_id; });
    var name = function (id) { var x = ctx.tasks.find(function (q) { return q.id === id; }); return x ? x.task : id; };
    var d = dialog({ title: 'Dependencies — ' + t.task, width: 560, footer: '<button type="button" class="wm-btn primary" data-close>Done</button>', body:
      '<p class="rx-muted">Finish-to-Start: this task becomes "ready" when all predecessors are completed. Work can still start earlier.</p><h4 class="rx-section-h">Predecessors</h4><ul class="rx-dep-list" id="depList">' + (preds.length ? preds.map(function (p) { return '<li><span>' + esc(name(p)) + '</span><button type="button" class="wm-btn rx-btn-sm danger" data-rm="' + esc(p) + '">Remove</button></li>'; }).join('') : '<li class="rx-muted">None</li>') + '</ul>' +
      '<div class="rx-filter-row">' + field('Add predecessor', '<select id="depAdd"><option value="">Select a task…</option>' + ctx.tasks.filter(function (x) { return x.id !== taskId && preds.indexOf(x.id) === -1; }).map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.task) + '</option>'; }).join('') + '</select>', { cls: 'rx-grow' }) + '<button type="button" class="wm-btn" id="depAddBtn">Add</button></div><p class="rx-form-error" id="depErr" hidden></p>', onClose: done });
    var err = d.el.querySelector('#depErr');
    function call(method, pred) { err.hidden = true; return api('/api/task-dependencies', { method: method, body: { predecessor_id: pred, successor_id: taskId } }).then(function () { d.close(); toast(method === 'POST' ? 'Dependency added' : 'Dependency removed'); }).catch(function (e) { err.textContent = e.message; err.hidden = false; }); }
    d.el.querySelector('#depAddBtn').onclick = function () { var v = d.el.querySelector('#depAdd').value; if (v) call('POST', v); };
    d.el.querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { call('DELETE', b.dataset.rm); }; });
  }
  function workflowSettings(ctx, s, done) {
    s = s || { dependencies_enabled: true, workflow_notifications_enabled: false, notify_assignee: true, notify_project_manager: false };
    dialog({ title: 'Task workflow notifications', width: 520, submit: 'Save', body: '<p class="rx-muted">Mode: <strong>Notification only</strong>. Dependencies never lock or change tasks.</p>' +
      ['dependencies_enabled:Enable Gantt dependencies', 'workflow_notifications_enabled:Enable automatic "Task Ready to Start" notifications', 'notify_assignee:Notify the successor assignee', 'notify_project_manager:Notify the project manager (owner)'].map(function (p) { var k = p.split(':'); return '<label class="rx-check rx-check-row"><input type="checkbox" name="' + k[0] + '"' + (s[k[0]] ? ' checked' : '') + '> ' + esc(k[1]) + '</label>'; }).join('') +
      '<p class="rx-help">Turning notifications off keeps existing dependencies.</p>',
      onSubmit: function (d) { return api('/api/task-dependencies', { method: 'POST', body: { action: 'settings', owner: ctx.owner, project: ctx.project, dependencies_enabled: d.val('dependencies_enabled'), workflow_notifications_enabled: d.val('workflow_notifications_enabled'), notify_assignee: d.val('notify_assignee'), notify_project_manager: d.val('notify_project_manager') } }).then(function () { toast('Workflow settings saved'); done(); }); } });
  }
  function applyTemplate(ctx) {
    api('/api/workflow-templates').then(function (j) {
      var tpls = j.templates;
      dialog({ title: 'Workflow templates', width: 640, submit: tpls.length ? 'Create tasks from template' : null, body:
        (tpls.length ? field('Template', '<select name="tpl">' + tpls.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.name) + ' (' + t.steps.length + ' steps)</option>'; }).join('') + '</select>') + field('Start date', '<input type="date" name="start" value="' + todayStr() + '" required>', { req: true }) + '<div id="tplPreview" class="rx-tpl-preview"></div>' : empty('No templates yet.')) +
        '<details class="rx-details"><summary>Create a new template</summary>' + field('Name', '<input id="tplName" maxlength="200" placeholder="Monthly Accounting Process">') + field('Steps — one per line. Optional: "name | offset days | duration days"', '<textarea id="tplSteps" rows="6" placeholder="Receive Documents | 0 | 1&#10;Verify Documents | 1 | 1&#10;Process Transactions | 2 | 3"></textarea>', { help: 'Each step depends on the previous one (Finish-to-Start).' }) + '<button type="button" class="wm-btn" id="tplSave">Save template</button></details>',
        onOpen: function (d) {
          var sel = d.form.elements.tpl; function prev() { if (!sel) return; var t = tpls.find(function (x) { return x.id === sel.value; }); d.el.querySelector('#tplPreview').innerHTML = '<ol>' + t.steps.map(function (s) { return '<li>' + esc(s.name) + ' <small class="rx-muted">+' + s.offset_days + 'd, ' + s.duration_days + 'd' + (s.depends_on.length ? ' · after ' + s.depends_on.map(function (i) { return i + 1; }).join(', ') : '') + '</small></li>'; }).join('') + '</ol>'; }
          if (sel) { sel.onchange = prev; prev(); }
          d.el.querySelector('#tplSave').onclick = function () {
            var lines = d.el.querySelector('#tplSteps').value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
            var steps = lines.map(function (l, i) { var p = l.split('|').map(function (x) { return x.trim(); }); return { name: p[0], offset_days: +p[1] || 0, duration_days: +p[2] || 0, depends_on: i ? [i - 1] : [] }; });
            api('/api/workflow-templates', { method: 'POST', body: { action: 'save', name: d.el.querySelector('#tplName').value, steps: steps } }).then(function () { toast('Template saved'); d.close(); applyTemplate(ctx); }).catch(function (e) { d.error(e.message); });
          };
        },
        onSubmit: function (d) { return api('/api/workflow-templates', { method: 'POST', body: { action: 'apply', template_id: d.val('tpl'), owner: ctx.owner, project: ctx.project, start_date: d.val('start') } }).then(function (r) { toast(r.task_ids.length + ' tasks created from template'); ctx.refresh(); }); } });
    }).catch(function (e) { toast(e.message, 'error'); });
  }

  /* =============================================================== boot */
  window.REXUS221 = { hr: hr, resource: resource, approvals: approvals, financials: financials, financeDetail: financeDetail, wbs: wbs, bindAppearance: bindAppearance, applyTheme: applyTheme, syncThemeFromServer: syncThemeFromServer, FN: FN };
  // Keep the v2.1.0 entry points working, now backed by the v2.2.1 screens.
  window.REXUS210 = { organization: function (n) { hr(n, 'employees'); }, resource: function (n) { resource(n); }, approvals: approvals, financials: financials };
  // Theme follows the account: load once the session is known .
  var appEl = document.querySelector('.wm-app');
  if (appEl) { var obs = new MutationObserver(function () { if (appEl.style.display !== 'none') { obs.disconnect(); syncThemeFromServer(); } }); obs.observe(appEl, { attributes: true, attributeFilter: ['style'] }); if (appEl.style.display !== 'none') syncThemeFromServer(); }
})();
