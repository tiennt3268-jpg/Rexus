/* =============================================================================
   REXUS v2.3.0 — REXUS Survey v1.0.0 workspace (spec §02–§06, §10–§11, §14; UI/UX B + C).
   A separate workspace in the App Switcher, like REXUS Document; same account and session.
   Routes: #survey/overview | list | builder/<id> | settings/<id> | analytics/<id> | answer/<id> | profiles[/<uid>] | fields
   Every action calls /api/surveys, /api/survey-respond, /api/onboarding or /api/profile-fields; the server
   decides permissions. Numbers on screen come from those APIs only (no illustrative metrics).
   ========================================================================== */
(function () {
  'use strict';
  var root = document.querySelector('.wm-app'); if (!root) return;
  var switcher = document.getElementById('rexusAppSwitch');
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var api = function (p, m, b) { return window.REXUSGate.api(p, m, b); };
  var notify = function (t, k, o) { if (window.REXUSNotify) return window.REXUSNotify(t, k || 'success', o); };
  var TZ = 'Asia/Ho_Chi_Minh';
  function fmtDate(v, time) { if (!v) return '—'; try { return new Date(v).toLocaleString('en-GB', Object.assign({ day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ }, time ? { hour: '2-digit', minute: '2-digit' } : {})); } catch (e) { return String(v); } }
  function localInput(v) { if (!v) return ''; var d = new Date(Date.parse(v) + 7 * 3600e3); return d.toISOString().slice(0, 16); }   // UTC → Asia/Ho_Chi_Minh wall clock for <input type=datetime-local>
  function fold(s) { return window.REXUSui && REXUSui.fold ? REXUSui.fold(s) : String(s || '').toLowerCase(); }
  var STATUS_TONE = { Draft: 'neutral', Scheduled: 'info', Active: 'success', Closed: 'warning', Archived: 'neutral' };
  function chip(status) { return '<span class="rx-chip rx-chip-' + (STATUS_TONE[status] || 'neutral') + '">' + esc(status) + '</span>'; }
  function dialog(o) { return window.REXUS221 && window.REXUS221.dialog(o); }
  function confirmBox(msg, title) { return window.REXUSLegacy && window.REXUSLegacy.confirm ? window.REXUSLegacy.confirm(msg, title) : Promise.resolve(window.confirm(msg)); }
  function debounce(fn, ms) { var t; return function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms); }; }

  /* ------------------------------------------------------------------ shell */
  var shell = document.getElementById('rexusSurveyShell');
  if (!shell) { shell = document.createElement('section'); shell.id = 'rexusSurveyShell'; shell.setAttribute('aria-label', 'REXUS Survey'); (document.getElementById('rexusDocsShell') || root.lastElementChild).insertAdjacentElement('afterend', shell); }
  shell.innerHTML = '<div class="sv-layout"><nav class="sv-side" id="svSide" aria-label="Survey workspace"></nav><main class="sv-main" id="svMain" tabindex="-1"></main></div>';
  var side = shell.querySelector('#svSide'), main = shell.querySelector('#svMain');
  var S = { data: null, route: 'overview', id: '', list: { q: '', status: '', sort: 'updated', mine: false }, analytics: { from: '', to: '', department: '', position: '', tab: 'summary' }, users: null, dirty: false };

  function setMode(on) {
    root.classList.toggle('rexus-survey-mode', on);
    if (on) root.classList.remove('rexus-document-mode');
    if (switcher) switcher.querySelectorAll('[data-rexus-app]').forEach(function (b) { var a = on ? b.dataset.rexusApp === 'survey' : b.classList.contains('rx-selected') && b.dataset.rexusApp !== 'survey'; if (on || b.dataset.rexusApp === 'survey') { b.classList.toggle('rx-selected', a); b.setAttribute('aria-current', a ? 'page' : 'false'); } });
    var title = root.querySelector('.wm-title');
    if (on) { document.title = 'REXUS Survey'; if (title) title.innerHTML = 'REXUS <span class="rx-doc-word">Survey</span>'; }
    else if (title && /Survey/.test(title.textContent)) { title.innerHTML = 'REXUS'; document.title = 'REXUS – Work Management'; }
    if (window.REXUSv205 && window.REXUSv205.closeLauncher) window.REXUSv205.closeLauncher();
  }
  function leaveGuard() { if (!S.dirty) return Promise.resolve(true); return confirmBox('You have unsaved changes in the builder. Leave without saving?', 'Discard changes').then(function (ok) { if (ok) S.dirty = false; return ok; }); }
  function open(route) { leaveGuard().then(function (ok) { if (!ok) return; route = route || 'overview'; setMode(true); if (location.hash !== '#survey/' + route) history.pushState(null, '', location.pathname + location.search + '#survey/' + route); render(route); }); }
  function fromHash() { var m = /^#survey\/(.+)$/.exec(location.hash); return m ? decodeURIComponent(m[1]) : null; }

  function nav(active) {
    var d = S.data || {}, items = [['overview', 'Overview', '◉']];
    if (d.can_create || (d.surveys || []).length) items.push(['list', 'My Surveys', '▤'], ['builder', 'Survey Builder', '☷'], ['settings', 'Survey Settings', '⚙'], ['analytics', 'Analytics', '▥']);
    if (d.is_admin) items.push(['profiles', 'Employee Profiles', '♙'], ['fields', 'Profile Fields', '≡']);
    side.innerHTML = '<div class="sv-side-brand"><span class="sv-logo" aria-hidden="true">RX</span><div><strong>REXUS</strong><small>Survey workspace</small></div></div><p class="sv-side-h">Workspace</p><ul>' +
      items.map(function (it) { return '<li><a href="#survey/' + it[0] + (S.id && /builder|settings|analytics/.test(it[0]) ? '/' + encodeURIComponent(S.id) : '') + '" class="' + (it[0] === active ? 'is-active' : '') + '"' + (it[0] === active ? ' aria-current="page"' : '') + '><span aria-hidden="true">' + it[2] + '</span>' + it[1] + '</a></li>'; }).join('') +
      '</ul><div class="sv-side-foot"><strong>REXUS Platform</strong><span>Work Management · Document · Survey</span></div>';
    side.querySelectorAll('a').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); open(a.getAttribute('href').slice(8)); }; });
  }
  function head(page, title, lead, actions) {
    return '<div class="sv-crumb"><span>REXUS</span> / <span>Survey</span> / <span>' + esc(page) + '</span></div><div class="sv-head"><div><p class="sv-eyebrow">Survey workspace</p><h1>' + esc(title) + '</h1>' + (lead ? '<p class="sv-muted">' + lead + '</p>' : '') + '</div>' + (actions ? '<div class="sv-head-actions">' + actions + '</div>' : '') + '</div>';
  }
  function loading() { main.innerHTML = '<p class="sv-muted sv-pad" role="status">Loading…</p>'; }
  function fail(e) { if (e && e.status === 401) return location.reload();   // signed out, or a required step is now pending
    main.innerHTML = '<div class="sv-card sv-pad"><p class="sv-error" role="alert">' + esc(e.message || e) + '</p><button type="button" class="sv-btn" data-go="overview">Back to overview</button></div>'; wireGo(); }
  function wireGo() { main.querySelectorAll('[data-go]').forEach(function (b) { b.onclick = function (e) { e.preventDefault(); open(b.dataset.go); }; }); }
  function refresh() { return api('/api/surveys').then(function (d) { S.data = d; return d; }); }

  function render(route) {
    S.route = route; var parts = route.split('/'), page = parts[0], id = parts[1] ? decodeURIComponent(parts[1]) : '';
    if (/^(builder|settings|analytics)$/.test(page)) { if (id) S.id = id; else if (S.id) { history.replaceState(null, '', '#survey/' + page + '/' + encodeURIComponent(S.id)); id = S.id; } }
    loading();
    refresh().then(function () {
      nav(page); main.scrollTop = 0; window.scrollTo(0, 0);
      if (/^(builder|settings|analytics)$/.test(page) && !id) return pickSurvey(page);
      ({ overview: overview, list: list, builder: builder, settings: settings, analytics: analytics, answer: answer, profiles: profiles, fields: fields }[page] || overview)(id);
      try { main.focus({ preventScroll: true }); } catch (e) {}
    }).catch(fail);
  }

  /* ------------------------------------------------------------------ overview */
  function overview() {
    var d = S.data, k = d.kpi, byId = {}; d.surveys.forEach(function (s) { byId[s.id] = s; });
    var att = d.attention.map(function (id) { return byId[id]; }).filter(Boolean).slice(0, 6);
    var days = []; for (var i = 6; i >= 0; i--) { var t = new Date(Date.now() + 7 * 3600e3 - i * 864e5).toISOString().slice(0, 10); days.push({ day: t, n: (d.activity.find(function (a) { return a.day === t; }) || {}).n || 0 }); }
    var max = Math.max(1, Math.max.apply(null, days.map(function (x) { return x.n; }))), week = days.reduce(function (a, x) { return a + x.n; }, 0);
    var forMe = '<section class="sv-card"><div class="sv-card-head"><div><h3>Surveys for you</h3><p class="sv-muted">Open surveys assigned to you that you have not answered yet.</p></div></div>' +
      (d.for_me.length ? '<ul class="sv-rows">' + d.for_me.map(function (s) { return '<li><div><strong>' + esc(s.name) + '</strong><small>' + (s.closes_at ? 'Closes ' + fmtDate(s.closes_at) : 'No closing date') + '</small></div><button type="button" class="sv-btn sv-btn-primary sv-btn-sm" data-go="answer/' + esc(s.id) + '">Answer</button></li>'; }).join('') + '</ul>'
        : '<p class="sv-empty">Nothing to answer right now.</p>') + '</section>';
    if (!d.can_create && !d.surveys.length) { main.innerHTML = head('Overview', 'Survey Overview', 'Surveys assigned to you.') + forMe; return wireGo(); }
    main.innerHTML = head('Overview', 'Survey Overview', 'All surveys, engagement and next actions in one workspace.', d.can_create ? '<button type="button" class="sv-btn sv-btn-primary" data-new>+ Create survey</button>' : '') +
      '<div class="sv-kpis">' + [['Active surveys', k.active, 'Accepting responses now', 'info'], ['Valid responses', k.responses, 'Across active surveys', 'success'],
        ['Completion rate', k.completion === null ? '—' : k.completion + '%', 'Mandatory survey coverage', 'success'], ['Needs attention', k.attention, 'Closing soon, near the limit, scheduled or empty', 'warning']].map(function (x) {
        return '<article class="sv-kpi"><span class="sv-kpi-dot sv-tone-' + x[3] + '" aria-hidden="true"></span><small>' + x[0] + '</small><strong>' + x[1] + '</strong><span>' + x[2] + '</span></article>'; }).join('') + '</div>' +
      '<div class="sv-two"><section class="sv-card"><div class="sv-card-head"><div><h3>Needs your attention</h3><p class="sv-muted">Surveys that may need a decision</p></div><a href="#survey/list" data-go="list" class="sv-link">View all →</a></div>' +
        (att.length ? '<div class="sv-table-wrap"><table class="sv-table"><thead><tr><th>Survey</th><th>Status</th><th>Responses</th><th>Closes</th><th><span class="rx-sr-only">Action</span></th></tr></thead><tbody>' + att.map(function (s) {
          var soon = s.effective_status === 'Active' && s.closes_at && Date.parse(s.closes_at) < Date.now() + 3 * 864e5;
          return '<tr><td><strong>' + esc(s.name) + '</strong><small>' + (s.mandatory ? 'Mandatory · ' : '') + (s.mode === 'public' ? 'Public link' : 'Authenticated') + '</small></td><td>' + (soon ? '<span class="rx-chip rx-chip-warning">Closing soon</span>' : chip(s.effective_status)) + '</td><td>' + s.responses + (s.max_responses ? ' / ' + s.max_responses : '') + '</td><td>' + fmtDate(s.closes_at) + '</td>' +
            '<td><button type="button" class="sv-btn sv-btn-sm" data-go="' + (s.status === 'Draft' ? 'builder/' : s.effective_status === 'Scheduled' ? 'settings/' : 'analytics/') + esc(s.id) + '">' + (s.status === 'Draft' ? 'Edit' : s.effective_status === 'Scheduled' ? 'Settings' : 'Review') + '</button></td></tr>'; }).join('') + '</tbody></table></div>'
          : '<p class="sv-empty">Nothing needs attention.</p>') + '</section>' +
      '<section class="sv-card"><div class="sv-card-head"><div><h3>Quick actions</h3><p class="sv-muted">Your next action in one click</p></div></div><ul class="sv-quick">' +
        (d.can_create ? '<li><button type="button" data-new><strong>+ Create a survey</strong><small>Start blank or from a template</small></button></li>' : '') +
        '<li><button type="button" data-go="list"><strong>◎ View responses</strong><small>Open a survey and review its answers</small></button></li>' +
        '<li><button type="button" data-deadlines><strong>◷ Check deadlines</strong><small>Active surveys sorted by closing date</small></button></li></ul></section></div>' +
      '<section class="sv-card"><div class="sv-card-head"><div><h3>Response activity</h3><p class="sv-muted">Valid responses received over the last 7 days</p></div></div><div class="sv-activity"><div class="sv-bars" role="img" aria-label="Responses per day: ' + days.map(function (x) { return x.day.slice(5) + ' ' + x.n; }).join(', ') + '">' +
        days.map(function (x) { return '<div class="sv-bar"><span class="sv-bar-n">' + x.n + '</span><span class="sv-bar-col" style="height:' + Math.round(x.n * 100 / max) + '%"></span><small>' + new Date(x.day + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }) + '</small></div>'; }).join('') +
        '</div><div class="sv-activity-sum"><p class="sv-eyebrow">This week</p><strong>+' + week + '</strong><span class="sv-muted">New valid responses</span></div></div></section>' + forMe;
    wireGo();
    main.querySelectorAll('[data-new]').forEach(function (b) { b.onclick = newSurvey; });
    var dl = main.querySelector('[data-deadlines]'); if (dl) dl.onclick = function () { S.list.status = 'Active'; S.list.sort = 'closes'; open('list'); };
  }
  function newSurvey() {
    dialog({ title: 'Create a survey', width: 560, submit: 'Create survey',
      body: window.REXUS221.field('Name', '<input name="name" required maxlength="200" placeholder="Employee Experience 2026">', { req: true }) +
        window.REXUS221.field('Description', '<textarea name="description" rows="2" maxlength="4000"></textarea>') +
        '<div class="wm-form-grid">' + window.REXUS221.field('Start from', '<select name="template"><option value="blank">Blank survey</option><option value="engagement">Template: Employee engagement</option><option value="training">Template: Training feedback</option></select>') +
        window.REXUS221.field('Respondents', '<select name="mode"><option value="authenticated">REXUS accounts (linked to User ID)</option><option value="public">Anyone with the link (not linked)</option></select>') + '</div>',
      onSubmit: function (x) {
        if (!String(x.val('name')).trim()) throw new Error('The survey needs a name.');
        return api('/api/surveys', 'POST', { action: 'create', name: x.val('name'), description: x.val('description'), template: x.val('template'), mode: x.val('mode') }).then(function (r) { notify('Survey created'); open('builder/' + r.id); });
      } });
  }
  function pickSurvey(page) {
    var list = S.data.surveys;
    main.innerHTML = head({ builder: 'Survey Builder', settings: 'Survey Settings', analytics: 'Analytics' }[page], { builder: 'Survey Builder', settings: 'Survey Settings', analytics: 'Analytics' }[page], 'Choose a survey to continue.') +
      '<section class="sv-card">' + (list.length ? '<ul class="sv-rows">' + list.map(function (s) { return '<li><div><strong>' + esc(s.name) + '</strong><small>' + esc(s.effective_status) + ' · ' + s.responses + ' responses</small></div><button type="button" class="sv-btn sv-btn-sm" data-go="' + page + '/' + esc(s.id) + '">Open</button></li>'; }).join('') + '</ul>' : '<p class="sv-empty">No surveys yet.' + (S.data.can_create ? ' <button type="button" class="sv-link" data-new>Create one</button>' : '') + '</p>') + '</section>';
    wireGo(); var n = main.querySelector('[data-new]'); if (n) n.onclick = newSurvey;
  }

  /* ------------------------------------------------------------------ my surveys */
  function list() {
    var d = S.data, L = S.list;
    main.innerHTML = head('My Surveys', 'My Surveys', d.is_admin ? 'Every survey in REXUS (System Admin).' : 'Surveys you own.', d.can_create ? '<button type="button" class="sv-btn sv-btn-primary" data-new>+ Create survey</button>' : '') +
      '<section class="sv-card"><div class="sv-toolbar"><label class="sv-search"><span class="rx-sr-only">Search surveys</span><input type="search" id="svQ" placeholder="Search surveys…" value="' + esc(L.q) + '"></label>' +
        '<label>Status <select id="svStatus"><option value="">All</option>' + ['Draft', 'Scheduled', 'Active', 'Closed', 'Archived'].map(function (s) { return '<option' + (L.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></label>' +
        (d.is_admin ? '<label>Owner <select id="svOwner"><option value="">Everyone</option><option value="mine"' + (L.mine ? ' selected' : '') + '>Me</option></select></label>' : '') +
        '<label>Sort <select id="svSort">' + [['updated', 'Last updated'], ['name', 'Name A–Z'], ['closes', 'Closing date'], ['responses', 'Responses']].map(function (s) { return '<option value="' + s[0] + '"' + (L.sort === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select></label></div><div id="svTable"></div></section>';
    function draw() {
      var me = (window.REXUSLegacy && window.REXUSLegacy.currentUserId && window.REXUSLegacy.currentUserId()) || '';
      var rows = d.surveys.filter(function (s) { return (!L.q || fold(s.name + ' ' + s.description + ' ' + s.owner_name).indexOf(fold(L.q)) !== -1) && (!L.status || s.effective_status === L.status) && (!L.mine || s.owner_id === me); });
      rows.sort(function (a, b) { return L.sort === 'name' ? a.name.localeCompare(b.name) : L.sort === 'closes' ? (Date.parse(a.closes_at || '9999-01-01') - Date.parse(b.closes_at || '9999-01-01')) : L.sort === 'responses' ? b.responses - a.responses : Date.parse(b.updated_at) - Date.parse(a.updated_at); });
      main.querySelector('#svTable').innerHTML = rows.length ? '<div class="sv-table-wrap"><table class="sv-table"><thead><tr><th>Survey</th><th>Status</th><th>Responses</th><th>Closes</th>' + (d.is_admin ? '<th>Owner</th>' : '') + '<th><span class="rx-sr-only">Actions</span></th></tr></thead><tbody>' + rows.map(function (s) {
        var pct = s.max_responses ? Math.min(100, Math.round(s.responses * 100 / s.max_responses)) : null;
        return '<tr><td><a href="#survey/builder/' + esc(s.id) + '" data-go="builder/' + esc(s.id) + '" class="sv-row-title">' + esc(s.name) + '</a><small>' + (s.mandatory ? 'Mandatory · ' : '') + (s.mode === 'public' ? 'Public link' : 'Authenticated') + ' · v' + (s.version || 0) + ' · ' + s.question_count + ' questions</small></td><td>' + chip(s.effective_status) + '</td>' +
          '<td><span class="sv-num">' + s.responses + (s.max_responses ? ' / ' + s.max_responses : '') + '</span>' + (pct !== null ? '<span class="sv-mini" aria-hidden="true"><span style="width:' + pct + '%"></span></span>' : '') + '</td><td>' + fmtDate(s.closes_at) + '</td>' + (d.is_admin ? '<td>' + esc(s.owner_name) + '</td>' : '') +
          '<td class="sv-actions-cell"><button type="button" class="sv-btn sv-btn-sm" data-go="analytics/' + esc(s.id) + '">Responses</button><details class="sv-menu"><summary class="sv-btn sv-btn-sm" aria-label="More actions for ' + esc(s.name) + '">⋯</summary><div class="sv-menu-pop">' +
            '<button type="button" data-go="builder/' + esc(s.id) + '">Edit questions</button><button type="button" data-go="settings/' + esc(s.id) + '">Settings & availability</button>' +
            (s.status !== 'Archived' ? '<button type="button" data-act="publish" data-id="' + esc(s.id) + '">' + (s.version ? 'Publish changes' : 'Publish') + '</button>' : '') +
            '<button type="button" data-act="duplicate" data-id="' + esc(s.id) + '">Duplicate</button>' + (s.version && s.status !== 'Archived' ? '<button type="button" data-act="link" data-id="' + esc(s.id) + '" data-mode="' + s.mode + '">Copy link</button>' : '') +
            (s.status === 'Active' ? '<button type="button" data-act="close" data-id="' + esc(s.id) + '">Close now</button>' : '') + (s.status === 'Closed' ? '<button type="button" data-act="reopen" data-id="' + esc(s.id) + '">Reopen</button>' : '') +
            (s.status !== 'Archived' ? '<button type="button" data-act="archive" data-id="' + esc(s.id) + '" class="is-danger">Archive</button>' : '') + '</div></details></td></tr>'; }).join('') + '</tbody></table></div>'
        : '<p class="sv-empty">' + (d.surveys.length ? 'No surveys match these filters.' : 'No surveys yet.') + '</p>';
      wireGo();
      main.querySelectorAll('[data-act]').forEach(function (b) { b.onclick = function () { act(b.dataset.act, b.dataset.id, b.dataset.mode); }; });
    }
    var t; main.querySelector('#svQ').oninput = function () { var v = this.value; clearTimeout(t); t = setTimeout(function () { L.q = v; draw(); }, 300); };
    main.querySelector('#svStatus').onchange = function () { L.status = this.value; draw(); };
    main.querySelector('#svSort').onchange = function () { L.sort = this.value; draw(); };
    var ow = main.querySelector('#svOwner'); if (ow) ow.onchange = function () { L.mine = this.value === 'mine'; draw(); };
    var nb = main.querySelector('[data-new]'); if (nb) nb.onclick = newSurvey;
    draw();
  }
  function link(id, mode) { return location.origin + (mode === 'public' ? '/survey.html?id=' + encodeURIComponent(id) : '/#survey/answer/' + encodeURIComponent(id)); }
  function act(a, id, mode) {
    var s = S.data.surveys.find(function (x) { return x.id === id; }) || {};
    if (a === 'link') { var l = link(id, mode); (navigator.clipboard ? navigator.clipboard.writeText(l) : Promise.reject()).then(function () { notify('Link copied'); }, function () { notify(l, 'info', { sticky: true, title: 'Survey link' }); }); return; }
    var msg = { publish: s.version ? 'Publish the current questions as a new version? Earlier answers stay linked to the version they answered.' : 'Publish "' + s.name + '"? Respondents can answer once it opens.',
      close: 'Close "' + s.name + '" now? It stops accepting responses immediately' + (s.mandatory ? ' and people who have not answered are no longer blocked.' : '.'),
      archive: 'Archive "' + s.name + '"? It stops accepting responses and is no longer mandatory. Responses are kept.', reopen: 'Reopen "' + s.name + '"?', duplicate: null }[a];
    (msg ? confirmBox(msg, { publish: 'Publish survey', close: 'Close survey', archive: 'Archive survey', reopen: 'Reopen survey' }[a]) : Promise.resolve(true)).then(function (ok) {
      if (!ok) return;
      return api('/api/surveys', 'POST', { action: a, id: id }).then(function (r) {
        notify({ publish: r.new_version === false ? 'Already up to date (version ' + r.version + ')' : 'Published — version ' + r.version, close: 'Survey closed', archive: 'Survey archived', reopen: 'Survey reopened', duplicate: 'Copy created' }[a]);
        if (a === 'duplicate') return open('builder/' + r.id);
        render(S.route);
      });
    }).catch(function (e) { notify(e.message, 'error'); });
  }

  /* ------------------------------------------------------------------ builder */
  var T = window.REXUSSurveyForm ? window.REXUSSurveyForm.typeLabel : {};
  var TYPES = ['short', 'long', 'single', 'multiple', 'dropdown', 'rating', 'scale', 'date', 'number'];
  var ICON = { short: '▱', long: '▤', single: '◉', multiple: '☑', dropdown: '▾', rating: '☆', scale: '↔', date: '▣', number: '#' };
  function qid() { return 'q_' + Math.random().toString(36).slice(2, 12); }
  function newQ(type) {
    var q = { id: qid(), type: type, title: '', description: '', required: false };
    if (/single|multiple|dropdown/.test(type)) q.options = ['Option 1', 'Option 2'];
    if (type === 'short') q.max_length = 300; if (type === 'long') q.max_length = 5000;
    if (type === 'rating') q.max = 5; if (type === 'scale') { q.min = 1; q.max = 5; q.min_label = ''; q.max_label = ''; }
    if (type === 'number') { q.min = null; q.max = null; }
    return q;
  }
  function builder(id) {
    api('/api/surveys?id=' + encodeURIComponent(id)).then(function (r) {
      var s = r.survey, qs = s.questions.slice(), sel = qs.length ? 0 : -1, saving = null, savedAt = null, err = '';
      S.dirty = false;
      function status() { return chip(s.effective_status) + ' <span class="sv-muted">' + (s.version ? 'Version ' + String(s.version).padStart(2, '0') : 'Not published') + (s.has_unpublished_changes || (S.dirty && s.version) ? ' · unpublished changes' : '') + '</span>'; }
      function draw() {
        var q = qs[sel];
        main.innerHTML = head('Survey Builder', 'Survey Builder', 'Build questions, review details and preview before publishing.',
            '<span class="sv-save-state" aria-live="polite">' + (saving ? 'Saving…' : S.dirty ? 'Unsaved changes' : savedAt ? 'Saved' : '') + '</span><button type="button" class="sv-btn" data-save>Save draft</button><button type="button" class="sv-btn" data-preview>Preview</button><button type="button" class="sv-btn sv-btn-primary" data-publish' + (s.status === 'Archived' ? ' disabled title="Archived surveys cannot be published"' : '') + '>' + (s.version ? 'Publish changes' : 'Publish survey') + '</button>') +
          (err ? '<div class="sv-banner" role="alert">' + esc(err) + '</div>' : '') +
          '<div class="sv-builder"><aside class="sv-card sv-types"><h3>Add questions</h3><p class="sv-muted">Choose a question type</p><p class="sv-side-h">Question types</p>' +
            TYPES.map(function (t) { return '<button type="button" class="sv-type" data-add="' + t + '"><span aria-hidden="true">' + ICON[t] + '</span>' + esc(T[t]) + '</button>'; }).join('') + '</aside>' +
          '<section class="sv-canvas"><p class="sv-eyebrow">' + status() + '</p>' +
            '<label class="rx-sr-only" for="svName">Survey name</label><input id="svName" class="sv-title-input" maxlength="200" value="' + esc(s.name) + '">' +
            '<label class="rx-sr-only" for="svDesc">Description</label><textarea id="svDesc" class="sv-desc-input" rows="2" maxlength="4000" placeholder="Add a short introduction for respondents">' + esc(s.description) + '</textarea>' +
            '<label class="sv-mode">Respondents <select id="svMode"' + (s.responses ? ' disabled title="Cannot change after responses were received"' : '') + '><option value="authenticated"' + (s.mode === 'authenticated' ? ' selected' : '') + '>REXUS accounts (linked to User ID)</option><option value="public"' + (s.mode === 'public' ? ' selected' : '') + '>Anyone with the link (not linked)</option></select></label>' +
            (qs.length ? qs.map(function (x, i) { return card(x, i, i === sel); }).join('') : '<div class="sv-empty sv-drop">No questions yet — pick a type on the left to add the first one.</div>') + '</section>' +
          '<aside class="sv-card sv-props">' + (q ? props(q) : '<h3>Question properties</h3><p class="sv-muted">Select a question to edit it.</p>') +
            '<div class="sv-note-box"><strong>Before publishing</strong><p>Preview on desktop and mobile. Published versions are kept: answers stay linked to the questions they answered.</p></div></aside></div>';
        wire();
      }
      function card(x, i, on) {
        var pv = '';
        if (/single|multiple/.test(x.type)) pv = (x.options || []).map(function (o) { return '<div class="sv-pv-opt"><span class="sv-pv-' + (x.type === 'single' ? 'radio' : 'check') + '"></span>' + esc(o) + '</div>'; }).join('');
        else if (x.type === 'dropdown') pv = '<div class="sv-pv-input">' + esc((x.options || [])[0] || 'Select…') + ' ▾</div>';
        else if (x.type === 'rating' || x.type === 'scale') { var lo = x.type === 'rating' ? 1 : x.min, b = ''; for (var n = lo; n <= x.max; n++) b += '<span class="sv-pv-num">' + n + '</span>'; pv = '<div class="sv-pv-scale">' + b + '</div>'; }
        else pv = '<div class="sv-pv-input sv-pv-' + x.type + '">' + esc({ short: 'Short answer', long: 'Long answer', date: 'dd/mm/yyyy', number: 'Number' }[x.type]) + '</div>';
        return '<article class="sv-qcard' + (on ? ' is-selected' : '') + '" data-sel="' + i + '" tabindex="0" aria-label="Question ' + (i + 1) + ': ' + esc(x.title || 'untitled') + '"' + (on ? ' aria-current="true"' : '') + '><div class="sv-qcard-top"><span class="sv-eyebrow">Question ' + String(i + 1).padStart(2, '0') + ' · ' + esc(T[x.type]) + '</span><span class="sv-qcard-acts">' +
          '<button type="button" data-up="' + i + '" aria-label="Move question ' + (i + 1) + ' up"' + (i === 0 ? ' disabled' : '') + '>↑</button><button type="button" data-down="' + i + '" aria-label="Move question ' + (i + 1) + ' down"' + (i === qs.length - 1 ? ' disabled' : '') + '>↓</button>' +
          '<button type="button" data-dup="' + i + '">Duplicate</button><button type="button" data-del="' + i + '" class="is-danger">Delete</button></span></div>' +
          '<h4>' + (x.title ? esc(x.title) : '<span class="sv-muted">Untitled question</span>') + (x.required ? ' <span class="sv-req">*</span>' : '') + '</h4>' + (x.description ? '<p class="sv-muted">' + esc(x.description) + '</p>' : '') + pv + '</article>';
      }
      function props(q) {
        var f = window.REXUS221.field, h = '<h3>Question properties</h3><p class="sv-muted">Selected: Question ' + String(sel + 1).padStart(2, '0') + '</p>' +
          f('Question type', '<select id="pType">' + TYPES.map(function (t) { return '<option value="' + t + '"' + (q.type === t ? ' selected' : '') + '>' + esc(T[t]) + '</option>'; }).join('') + '</select>', { for: 'pType' }) +
          f('Question', '<textarea id="pTitle" rows="2" maxlength="500">' + esc(q.title) + '</textarea>', { for: 'pTitle', req: true }) +
          f('Helper text', '<input id="pDesc" maxlength="1000" value="' + esc(q.description) + '" placeholder="Optional description">', { for: 'pDesc' }) +
          '<label class="sv-switch"><input type="checkbox" id="pReq"' + (q.required ? ' checked' : '') + '><span aria-hidden="true"></span>Required answer</label>';
        if (/single|multiple|dropdown/.test(q.type)) h += f('Answer options — one per line', '<textarea id="pOpts" rows="5">' + esc((q.options || []).join('\n')) + '</textarea>', { for: 'pOpts', help: 'At least two different options.' });
        if (q.type === 'short' || q.type === 'long') h += f('Maximum characters', '<input id="pMaxLen" type="number" min="1" max="' + (q.type === 'short' ? 300 : 5000) + '" value="' + q.max_length + '">', { for: 'pMaxLen' });
        if (q.type === 'rating') h += f('Number of stars', '<input id="pMax" type="number" min="3" max="10" value="' + q.max + '">', { for: 'pMax' });
        if (q.type === 'scale') h += '<div class="wm-form-grid">' + f('From', '<select id="pMin"><option' + (q.min === 0 ? ' selected' : '') + '>0</option><option' + (q.min === 1 ? ' selected' : '') + '>1</option></select>', { for: 'pMin' }) + f('To', '<input id="pMax" type="number" min="3" max="10" value="' + q.max + '">', { for: 'pMax' }) + '</div>' +
          '<div class="wm-form-grid">' + f('Low label', '<input id="pMinL" maxlength="60" value="' + esc(q.min_label || '') + '">', { for: 'pMinL' }) + f('High label', '<input id="pMaxL" maxlength="60" value="' + esc(q.max_label || '') + '">', { for: 'pMaxL' }) + '</div>';
        if (q.type === 'number') h += '<div class="wm-form-grid">' + f('Minimum', '<input id="pMin" type="number" value="' + (q.min == null ? '' : q.min) + '">', { for: 'pMin' }) + f('Maximum', '<input id="pMax" type="number" value="' + (q.max == null ? '' : q.max) + '">', { for: 'pMax' }) + '</div>';
        return h;
      }
      function changed() { S.dirty = true; var st = main.querySelector('.sv-save-state'); if (st) st.textContent = 'Unsaved changes'; autosave(); }
      var autosave = debounce(function () { save(true); }, 1500);
      function save(quiet) {
        if (!S.dirty) return Promise.resolve(true);
        saving = true; var st = main.querySelector('.sv-save-state'); if (st) st.textContent = 'Saving…';
        return api('/api/surveys', 'PUT', { id: s.id, name: main.querySelector('#svName').value, description: main.querySelector('#svDesc').value, mode: main.querySelector('#svMode').value, questions: qs }).then(function (res) {
          saving = false; S.dirty = false; savedAt = Date.now(); err = '';
          res.questions.forEach(function (x, i) { qs[i].id = x.id; });
          s.name = main.querySelector('#svName').value; s.description = main.querySelector('#svDesc').value; s.mode = main.querySelector('#svMode').value;
          if (st) st.textContent = 'Saved'; if (!quiet) notify('Draft saved');
          return true;
        }).catch(function (e) { saving = false; if (st) st.textContent = 'Not saved'; if (!quiet) notify(e.message, 'error'); else { err = e.message; var b = main.querySelector('.sv-banner'); if (!b) { draw(); } } return false; });
      }
      function wire() {
        main.querySelectorAll('[data-add]').forEach(function (b) { b.onclick = function () { var q = newQ(b.dataset.add); qs.splice(sel + 1, 0, q); sel = sel + 1; draw(); changed(); var t = main.querySelector('#pTitle'); if (t) t.focus(); }; });
        main.querySelectorAll('[data-sel]').forEach(function (c) { c.onclick = function (e) { if (e.target.closest('button')) return; sel = +c.dataset.sel; draw(); }; c.onkeydown = function (e) { if (e.key === 'Enter' && e.target === c) { sel = +c.dataset.sel; draw(); var t = main.querySelector('#pTitle'); if (t) t.focus(); } }; });
        main.querySelectorAll('[data-up],[data-down]').forEach(function (b) { b.onclick = function () { var i = +(b.dataset.up || b.dataset.down), j = b.dataset.up !== undefined ? i - 1 : i + 1; var t = qs[i]; qs[i] = qs[j]; qs[j] = t; sel = j; draw(); changed(); var nb = main.querySelector('[data-' + (b.dataset.up !== undefined ? 'up' : 'down') + '="' + j + '"]'); if (nb && !nb.disabled) nb.focus(); }; });
        main.querySelectorAll('[data-dup]').forEach(function (b) { b.onclick = function () { var i = +b.dataset.dup, c = JSON.parse(JSON.stringify(qs[i])); c.id = qid(); qs.splice(i + 1, 0, c); sel = i + 1; draw(); changed(); }; });
        main.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () { var i = +b.dataset.del; confirmBox('Delete question ' + (i + 1) + '?', 'Delete question').then(function (ok) { if (!ok) return; qs.splice(i, 1); sel = Math.min(sel, qs.length - 1); draw(); changed(); }); }; });
        ['#svName', '#svDesc'].forEach(function (k) { main.querySelector(k).oninput = changed; });
        main.querySelector('#svMode').onchange = changed;
        var q = qs[sel];
        if (q) {
          var g = function (k) { return main.querySelector(k); };
          g('#pType').onchange = function () { var n = newQ(this.value); n.id = q.id; n.title = q.title; n.description = q.description; n.required = q.required; if (q.options && n.options) n.options = q.options; qs[sel] = n; draw(); changed(); };
          g('#pTitle').oninput = function () { q.title = this.value; var h = main.querySelector('.sv-qcard.is-selected h4'); if (h) h.innerHTML = (q.title ? esc(q.title) : '<span class="sv-muted">Untitled question</span>') + (q.required ? ' <span class="sv-req">*</span>' : ''); changed(); };
          g('#pDesc').oninput = function () { q.description = this.value; changed(); };
          g('#pReq').onchange = function () { q.required = this.checked; draw(); changed(); };
          if (g('#pOpts')) g('#pOpts').oninput = function () { q.options = this.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean); changed(); };
          if (g('#pOpts')) g('#pOpts').onblur = draw;
          if (g('#pMaxLen')) g('#pMaxLen').oninput = function () { q.max_length = +this.value || q.max_length; changed(); };
          if (g('#pMax')) g('#pMax').onchange = function () { q.max = this.value === '' ? null : +this.value; draw(); changed(); };
          if (g('#pMin')) g('#pMin').onchange = function () { q.min = this.value === '' ? null : +this.value; draw(); changed(); };
          if (g('#pMinL')) g('#pMinL').oninput = function () { q.min_label = this.value; changed(); };
          if (g('#pMaxL')) g('#pMaxL').oninput = function () { q.max_label = this.value; changed(); };
        }
        main.querySelector('[data-save]').onclick = function () { save(false); };
        main.querySelector('[data-preview]').onclick = function () { preview(s, qs); };
        main.querySelector('[data-publish]').onclick = function () {
          save(true).then(function (ok) {
            if (!ok) return notify(err || 'Fix the problems above before publishing.', 'error');
            var msg = s.version ? 'Publish the current questions? If they changed, version ' + (s.version + 1) + ' is created; answers already received stay linked to version ' + s.version + '.' : 'Publish "' + s.name + '"? Check Survey Settings for who answers and when it opens.';
            confirmBox(msg, 'Publish survey').then(function (yes) {
              if (!yes) return;
              api('/api/surveys', 'POST', { action: 'publish', id: s.id }).then(function (r) { notify(r.new_version === false ? 'No changes to publish (version ' + r.version + ')' : 'Published — version ' + r.version); S.dirty = false; open('settings/' + s.id); }).catch(function (e) { err = e.message; draw(); notify(e.message, 'error'); });
            });
          });
        };
      }
      draw();
    }).catch(fail);
  }
  function preview(s, qs) {
    var bad = qs.findIndex(function (q) { return !q.title || (/single|multiple|dropdown/.test(q.type) && (q.options || []).length < 2); });
    if (!qs.length) return notify('Add at least one question to preview.', 'warning');
    if (bad !== -1) return notify('Question ' + (bad + 1) + ' is incomplete (text or options missing).', 'warning');
    var wrap = document.createElement('div'); wrap.className = 'sv-preview'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', 'Survey preview');
    wrap.innerHTML = '<div class="sv-preview-bar"><strong>Preview</strong><div class="sv-seg" role="group" aria-label="Device"><button type="button" aria-pressed="true" data-dev="desktop">Desktop</button><button type="button" aria-pressed="false" data-dev="mobile">Mobile</button></div><button type="button" class="sv-btn" data-close>Close preview</button></div><div class="sv-preview-stage"><div class="sv-preview-frame" id="svPvFrame"></div></div>';
    document.body.appendChild(wrap);
    var frame = wrap.querySelector('#svPvFrame'), back = document.activeElement;
    function mount() { window.REXUSSurveyForm.mount(frame, { survey: { id: 'preview', name: s.name, description: s.description, mode: s.mode, version_id: 'preview' }, questions: qs, respondent: null }, { preview: true, onDone: function () { notify('End of preview — nothing was saved.', 'info'); } }); }
    function close() { wrap.remove(); document.removeEventListener('keydown', onKey, true); if (back) back.focus(); }
    function onKey(e) { if (e.key === 'Escape' && !document.querySelector('.rx-notify-layer:not(.is-out)')) { e.preventDefault(); e.stopPropagation(); close(); } }
    document.addEventListener('keydown', onKey, true);
    wrap.querySelector('[data-close]').onclick = close;
    wrap.querySelectorAll('[data-dev]').forEach(function (b) { b.onclick = function () { wrap.querySelectorAll('[data-dev]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); frame.classList.toggle('is-mobile', b.dataset.dev === 'mobile'); }; });
    mount(); wrap.querySelector('[data-close]').focus();
  }

  /* ------------------------------------------------------------------ settings: targets + availability */
  function users() { return S.users ? Promise.resolve(S.users) : api('/api/users').then(function (j) { S.users = (j.users || []).filter(function (u) { return u.status !== 'Inactive'; }); return S.users; }); }
  function settings(id) {
    Promise.all([api('/api/surveys?id=' + encodeURIComponent(id)), users()]).then(function (res) {
      var s = res[0].survey, admin = res[0].is_admin, us = res[1], t = s.target || {};
      var deps = Array.from(new Set(us.map(function (u) { return u.department; }).filter(Boolean))).sort(), poss = Array.from(new Set(us.map(function (u) { return u.position; }).filter(Boolean))).sort();
      function opts(list, picked, label) { return list.map(function (v) { var val = label ? v.id : v; return '<option value="' + esc(val) + '"' + ((picked || []).indexOf(val) !== -1 ? ' selected' : '') + (label ? ' data-search="' + esc([v.username, v.email].join(' ')) + '"' : '') + '>' + esc(label ? (v.full_name || v.username) + ' · ' + (v.department || '—') : v) + '</option>'; }).join(''); }
      var locked = !admin && s.mandatory;
      main.innerHTML = head('Survey Settings', s.name, 'Who must answer, when the survey accepts responses, and when it stops.', '<a href="#survey/builder/' + esc(s.id) + '" data-go="builder/' + esc(s.id) + '" class="sv-btn">Edit questions</a><button type="button" class="sv-btn sv-btn-primary" data-save>Save settings</button>') +
        '<form class="sv-settings" novalidate><section class="sv-card"><div class="sv-card-head"><div><h3>Mandatory survey on login</h3><p class="sv-muted">' + (s.mode === 'public' ? 'Not available: this survey is answered through a public link and is not linked to REXUS accounts.' : 'People in the target groups must answer it before they can use REXUS. Only a System Admin can turn this on.') + '</p></div>' +
          '<label class="sv-switch"><input type="checkbox" name="mandatory"' + (s.mandatory ? ' checked' : '') + (admin && s.mode === 'authenticated' ? '' : ' disabled') + '><span aria-hidden="true"></span>Mandatory on login</label></div>' +
          '<div class="sv-inline"><label>Priority <input type="number" name="priority" min="1" max="1000" value="' + s.priority + '"' + (admin ? '' : ' disabled') + ' aria-describedby="svPriHelp"></label><span class="sv-hint" id="svPriHelp">When several mandatory surveys are open, the lowest number is asked first, then the earliest published.</span></div></section>' +
        '<section class="sv-card"><div class="sv-card-head"><div><h3>Target respondents</h3><p class="sv-muted">Groups are combined with <strong>OR</strong>: a person in any selected group is included once.' + (s.mode === 'public' ? ' Not used for public surveys.' : ' Leave empty for a non-mandatory survey anyone in REXUS can answer with the link.') + '</p></div></div>' +
          '<div class="sv-tiles">' +
            '<label class="sv-tile"><input type="checkbox" name="all"' + (t.all ? ' checked' : '') + (locked ? ' disabled' : '') + '><span><strong>All employees</strong><small>Every active account</small></span></label>' +
            '<div class="sv-tile"><label for="svDeps"><strong>Departments</strong><small>From current HR data</small></label><select id="svDeps" name="departments" multiple size="4" data-rx-search' + (locked ? ' disabled' : '') + '>' + opts(deps, t.departments) + '</select></div>' +
            '<div class="sv-tile"><label for="svPos"><strong>Job positions</strong><small>Not the same as the system role</small></label><select id="svPos" name="positions" multiple size="4" data-rx-search' + (locked ? ' disabled' : '') + '>' + opts(poss, t.positions) + '</select></div>' +
            '<div class="sv-tile"><label for="svUsers"><strong>Specific employees</strong><small>Matched by User ID, not by name</small></label><select id="svUsers" name="users" multiple size="4" data-rx-search' + (locked ? ' disabled' : '') + '>' + opts(us, t.users, true) + '</select></div></div>' +
          '<p class="sv-estimate" aria-live="polite"><strong id="svEst">' + s.target_count + '</strong> unique employees currently match.</p></section>' +
        '<section class="sv-card"><div class="sv-card-head"><div><h3>Availability</h3><p class="sv-muted">Time zone: Asia/Ho_Chi_Minh (UTC+7). The survey stops at whichever happens first.</p></div><span>' + chip(s.effective_status) + '</span></div>' +
          '<div class="sv-avail"><div class="sv-avail-card"><h4>Schedule</h4><label>Opens at <input type="datetime-local" name="opens_at" value="' + localInput(s.opens_at) + '"></label><label>Closes at <input type="datetime-local" name="closes_at" value="' + localInput(s.closes_at) + '"></label></div>' +
          '<div class="sv-avail-card"><h4>Response limit</h4><label>Maximum valid responses <input type="number" min="1" name="max_responses" value="' + (s.max_responses || '') + '" placeholder="No limit"></label><p class="sv-muted">' + s.responses + ' valid response' + (s.responses === 1 ? '' : 's') + ' so far.</p></div>' +
          '<div class="sv-avail-card"><h4>Manual close</h4><p class="sv-muted">' + (s.status === 'Active' ? 'Stop accepting responses now.' : s.status === 'Closed' ? 'Closed manually.' : 'Available once the survey is published.') + '</p>' +
            (s.status === 'Active' ? '<button type="button" class="sv-btn" data-close>Close now</button>' : s.status === 'Closed' ? '<button type="button" class="sv-btn" data-reopen>Reopen</button>' : '') + '</div></div>' +
          '<p class="sv-summary" id="svSummary"></p>' + (s.mandatory || admin ? '<p class="sv-hint">When a mandatory survey closes for any of these reasons, people who did not answer are no longer blocked.</p>' : '') + '</section>' +
        '<p class="sv-error sv-form-error" role="alert" hidden></p></form>';
      var f = main.querySelector('form');
      function target() { var sel = function (n) { return [].slice.call(f.elements[n].selectedOptions).map(function (o) { return o.value; }); }; return { all: f.elements.all.checked, departments: sel('departments'), positions: sel('positions'), users: sel('users') }; }
      function summary() {
        var parts = []; var o = f.elements.opens_at.value, c = f.elements.closes_at.value, m = f.elements.max_responses.value;
        parts.push(o ? 'opens ' + o.replace('T', ' ') : 'opens when published');
        var stop = []; if (c) stop.push('on ' + c.replace('T', ' ')); if (m) stop.push('after ' + m + ' valid responses'); stop.push('when closed manually');
        main.querySelector('#svSummary').textContent = 'In force: the survey ' + parts[0] + ' and stops ' + stop.join(', or ') + ' — whichever comes first.';
      }
      var est = debounce(function () { api('/api/surveys', 'POST', { action: 'estimate', target: target() }).then(function (r) { main.querySelector('#svEst').textContent = r.count; }).catch(function () {}); }, 300);
      f.addEventListener('change', function (e) { if (/all|departments|positions|users/.test(e.target.name)) est(); summary(); });
      f.addEventListener('input', summary); summary();
      wireGo();
      var cl = main.querySelector('[data-close]'); if (cl) cl.onclick = function () { act('close', s.id); };
      var ro = main.querySelector('[data-reopen]'); if (ro) ro.onclick = function () { act('reopen', s.id); };
      main.querySelector('[data-save]').onclick = function () {
        var fe = main.querySelector('.sv-form-error'); fe.hidden = true;
        var o = f.elements.opens_at.value, c = f.elements.closes_at.value;
        if (o && c && c <= o) { fe.hidden = false; fe.textContent = 'The closing time must be after the opening time.'; f.elements.closes_at.focus(); return; }
        var b = this; b.disabled = true; b.setAttribute('aria-busy', 'true');
        api('/api/surveys', 'PUT', { id: s.id, action: 'settings', mandatory: f.elements.mandatory.checked, priority: f.elements.priority.value, target: target(), opens_at: o || null, closes_at: c || null, max_responses: f.elements.max_responses.value || null })
          .then(function (r) { main.querySelector('#svEst').textContent = r.target_count; notify('Settings saved'); render(S.route); })
          .catch(function (e) { fe.hidden = false; fe.textContent = e.message; notify(e.message, 'error'); })
          .then(function () { b.disabled = false; b.removeAttribute('aria-busy'); });
      };
    }).catch(fail);
  }

  /* ------------------------------------------------------------------ analytics */
  function analytics(id) {
    var A = S.analytics, qs = ['from', 'to', 'department', 'position'].filter(function (k) { return A[k]; }).map(function (k) { return '&' + k + '=' + encodeURIComponent(A[k]); }).join('');
    api('/api/surveys?id=' + encodeURIComponent(id) + '&analytics=1' + qs).then(function (d) {
      var s = d.survey, pct = function (n, t) { return t ? Math.round(n * 100 / t) : 0; };
      main.innerHTML = head('Analytics', s.name, 'Responses and automatic summaries by question type.', '<button type="button" class="sv-btn" data-exp="csv">Export CSV</button><button type="button" class="sv-btn" data-exp="xlsx">Export Excel</button>') +
        '<div class="sv-kpis">' + [['Valid responses', d.valid, s.max_responses ? 'Limit ' + s.max_responses : 'No limit'], ['Excluded', d.void, 'Kept in history with a reason'], ['Status', s.effective_status, s.closes_at ? 'Closes ' + fmtDate(s.closes_at) : 'No closing date'], ['Version', 'v' + (s.version || 0), s.question_count + ' questions']].map(function (x) { return '<article class="sv-kpi"><small>' + x[0] + '</small><strong>' + esc(x[1]) + '</strong><span>' + esc(x[2]) + '</span></article>'; }).join('') + '</div>' +
        '<section class="sv-card"><form class="sv-toolbar" id="svFilt"><label>From <input type="date" name="from" value="' + esc(A.from) + '"></label><label>To <input type="date" name="to" value="' + esc(A.to) + '"></label>' +
          (d.shows_respondent ? '<label>Department <select name="department"><option value="">All</option>' + d.filters.departments.map(function (x) { return '<option' + (A.department === x ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select></label><label>Job position <select name="position"><option value="">All</option>' + d.filters.positions.map(function (x) { return '<option' + (A.position === x ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select></label>' : '') +
          '<button type="submit" class="sv-btn">Apply</button><button type="button" class="sv-link" data-reset>Reset</button></form>' +
          '<div class="sv-tabs" role="tablist"><button type="button" role="tab" data-tab="summary" aria-selected="' + (A.tab === 'summary') + '">Summary</button><button type="button" role="tab" data-tab="responses" aria-selected="' + (A.tab === 'responses') + '">Responses <span class="rx-count">' + d.responses.length + '</span></button></div><div id="svAnBody"></div></section>';
      var body = main.querySelector('#svAnBody');
      function bars(items, total) { return '<ul class="sv-hbars">' + items.map(function (o) { var p = pct(o.count, total); return '<li><span class="sv-hb-label">' + esc(o.label) + '</span><span class="sv-hb-track" aria-hidden="true"><span style="width:' + p + '%"></span></span><span class="sv-hb-val">' + o.count + ' · ' + p + '%</span></li>'; }).join('') + '</ul>'; }
      function summary() {
        var trendMax = Math.max(1, Math.max.apply(null, d.trend.map(function (x) { return x.count; }).concat([0])));
        body.innerHTML = (d.trend.length ? '<div class="sv-qsum"><h4>Responses over time</h4><div class="sv-bars sv-bars-sm" role="img" aria-label="' + d.trend.map(function (x) { return x.day + ': ' + x.count; }).join(', ') + '">' + d.trend.slice(-30).map(function (x) { return '<div class="sv-bar"><span class="sv-bar-n">' + x.count + '</span><span class="sv-bar-col" style="height:' + Math.round(x.count * 100 / trendMax) + '%"></span><small>' + x.day.slice(5) + '</small></div>'; }).join('') + '</div></div>' : '') +
          (d.valid ? d.questions.map(function (q, i) {
            var h = '<div class="sv-qsum"><p class="sv-eyebrow">Question ' + (i + 1) + ' · ' + esc(T[q.type]) + ' · ' + q.answered + ' answer' + (q.answered === 1 ? '' : 's') + '</p><h4>' + esc(q.title) + '</h4>';
            if (q.options) h += bars(q.options, q.type === 'multiple' ? d.valid : q.answered) + (q.type === 'multiple' ? '<p class="sv-hint">Percentages are of all valid responses; people could pick several options.</p>' : '');
            else if (q.distribution) h += '<p class="sv-big">Average <strong>' + (q.average === null ? '—' : q.average) + '</strong></p>' + bars(q.distribution, q.answered);
            else if (q.type === 'number') h += '<p class="sv-big">Average <strong>' + (q.average === null ? '—' : q.average) + '</strong> · min ' + (q.min === null ? '—' : q.min) + ' · max ' + (q.max === null ? '—' : q.max) + '</p>';
            else h += q.latest.length ? '<ul class="sv-texts">' + q.latest.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' + (q.answered > q.latest.length ? '<p class="sv-hint">Showing the latest ' + q.latest.length + ' — export for all answers.</p>' : '') : '<p class="sv-empty">No answers.</p>';
            return h + '</div>';
          }).join('') : '<p class="sv-empty">No valid responses' + (qs ? ' match these filters' : ' yet') + '.</p>');
      }
      function responses() {
        var qmap = {}; d.questions.forEach(function (q, i) { qmap[q.id] = (i + 1) + '. ' + q.title; });
        body.innerHTML = d.responses.length ? '<div class="sv-table-wrap"><table class="sv-table"><thead><tr><th>Submitted</th>' + (d.shows_respondent ? '<th>Respondent</th><th>Department</th><th>Job position</th>' : '') + '<th>Status</th><th><span class="rx-sr-only">Actions</span></th></tr></thead><tbody>' + d.responses.map(function (r) {
          return '<tr><td>' + fmtDate(r.submitted_at, true) + '</td>' + (d.shows_respondent ? '<td>' + esc(r.respondent) + '</td><td>' + esc(r.department || '—') + '</td><td>' + esc(r.position || '—') + '</td>' : '') +
            '<td>' + (r.status === 'valid' ? '<span class="rx-chip rx-chip-success">Valid</span>' : '<span class="rx-chip rx-chip-neutral" title="' + esc(r.void_reason) + '">Excluded</span>') + '</td>' +
            '<td class="sv-actions-cell"><details class="sv-answers"><summary class="sv-btn sv-btn-sm">View answers</summary><dl>' + Object.keys(r.answers).map(function (k) { var v = r.answers[k]; return '<dt>' + esc(qmap[k] || k) + '</dt><dd>' + esc(Array.isArray(v) ? v.join(', ') : v) + '</dd>'; }).join('') + (r.void_reason ? '<dt>Excluded because</dt><dd>' + esc(r.void_reason) + '</dd>' : '') + '</dl></details>' +
            (r.status === 'valid' ? '<button type="button" class="sv-btn sv-btn-sm" data-void="' + esc(r.id) + '">Exclude</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' + (d.responses.length >= 200 ? '<p class="sv-hint">Showing the latest 200 responses — export for all of them.</p>' : '')
          : '<p class="sv-empty">No responses' + (qs ? ' match these filters' : ' yet') + '.</p>';
        body.querySelectorAll('[data-void]').forEach(function (b) { b.onclick = function () {
          dialog({ title: 'Exclude response', width: 480, submit: 'Exclude', body: '<p class="rx-muted">The response is kept unchanged and marked as excluded; it no longer counts in summaries or the response limit.</p>' + window.REXUS221.field('Reason', '<textarea name="reason" rows="2" required maxlength="500"></textarea>', { req: true }),
            onSubmit: function (x) { if (!String(x.val('reason')).trim()) throw new Error('A reason is required.'); return api('/api/surveys', 'POST', { action: 'void_response', id: s.id, response_id: b.dataset.void, reason: x.val('reason') }).then(function () { notify('Response excluded'); render(S.route); }); } });
        }; });
      }
      function tab(t) { A.tab = t; main.querySelectorAll('[data-tab]').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === t)); }); (t === 'responses' ? responses : summary)(); }
      main.querySelectorAll('[data-tab]').forEach(function (b) { b.onclick = function () { tab(b.dataset.tab); }; });
      main.querySelector('#svFilt').onsubmit = function (e) { e.preventDefault(); var f = e.target; ['from', 'to', 'department', 'position'].forEach(function (k) { A[k] = f.elements[k] ? f.elements[k].value : ''; }); render(S.route); };
      main.querySelector('[data-reset]').onclick = function () { A.from = A.to = A.department = A.position = ''; render(S.route); };
      main.querySelectorAll('[data-exp]').forEach(function (b) { b.onclick = function () { exportRows(s, b.dataset.exp); }; });
      tab(A.tab);
    }).catch(fail);
  }
  function exportRows(s, kind) {
    api('/api/surveys?id=' + encodeURIComponent(s.id) + '&export=1').then(function (x) {
      var name = (x.name || 'survey').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '-responses';
      if (kind === 'xlsx' && window.XLSX) { var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([x.columns].concat(x.rows)), 'Responses'); XLSX.writeFile(wb, name + '.xlsx'); return notify('Excel file downloaded'); }
      var cell = function (v) { v = v == null ? '' : String(v); if (/^[=+\-@]/.test(v)) v = "'" + v; return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };   // neutralise spreadsheet formulas
      var csv = '﻿' + [x.columns].concat(x.rows).map(function (r) { return r.map(cell).join(','); }).join('\r\n');
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = name + '.csv'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      notify(kind === 'xlsx' ? 'Excel export is unavailable here — CSV downloaded instead' : 'CSV downloaded', kind === 'xlsx' ? 'info' : 'success');
    }).catch(function (e) { notify(e.message, 'error'); });
  }

  /* ------------------------------------------------------------------ answer (non-mandatory) */
  function answer(id) {
    api('/api/survey-respond?id=' + encodeURIComponent(id)).then(function (d) {
      main.innerHTML = '<div class="sv-crumb"><span>REXUS</span> / <span>Survey</span> / <span>Answer</span></div><div id="svAnswer"></div>';
      var host = main.querySelector('#svAnswer');
      if (d.answered_at || d.closed_reason) { host.innerHTML = '<section class="sv-card sv-pad"><h2>' + esc(d.survey.name) + '</h2><p>' + (d.answered_at ? 'You answered this survey on ' + fmtDate(d.answered_at, true) + '. Thank you.' : esc(d.closed_reason)) + '</p><button type="button" class="sv-btn" data-go="overview">Back to overview</button></section>'; return wireGo(); }
      window.REXUSSurveyForm.mount(host, d, { onReload: function () { answer(id); }, onDone: function (r) { notify(r.closed ? r.message : 'Thank you — your answers were saved.', r.closed ? 'info' : 'success'); open('overview'); } });
    }).catch(fail);
  }

  /* ------------------------------------------------------------------ employee profiles + fields (admin) */
  function profiles(uid) {
    users().then(function (us) {
      main.innerHTML = head('Employee Profiles', 'Employee Profiles', 'Account and personal information, onboarding status. Personal information is visible to the employee and System Admins only; every change is audit-logged.') +
        '<div class="sv-profiles"><section class="sv-card sv-people"><label class="sv-search"><span class="rx-sr-only">Search employees</span><input type="search" id="svPeopleQ" placeholder="Search name, username or email…"></label><ul id="svPeople" class="sv-people-list"></ul></section><section id="svPerson" class="sv-person"></section></div>';
      var listEl = main.querySelector('#svPeople');
      function draw(q) { var f = fold(q || ''); var rows = us.filter(function (u) { return !f || fold([u.full_name, u.username, u.email, u.department].join(' ')).indexOf(f) !== -1; });
        listEl.innerHTML = rows.length ? rows.map(function (u) { return '<li><a href="#survey/profiles/' + esc(u.id) + '" data-uid="' + esc(u.id) + '"' + (u.id === uid ? ' aria-current="true" class="is-active"' : '') + '><strong>' + esc(u.full_name || u.username) + '</strong><small>' + esc([u.position, u.department].filter(Boolean).join(' · ') || u.username) + '</small></a></li>'; }).join('') : '<li class="sv-empty">No results found</li>';
        listEl.querySelectorAll('[data-uid]').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); open('profiles/' + a.dataset.uid); }; }); }
      var t; main.querySelector('#svPeopleQ').oninput = function () { var v = this.value; clearTimeout(t); t = setTimeout(function () { draw(v); }, 300); };
      draw('');
      var host = main.querySelector('#svPerson');
      if (!uid) { host.innerHTML = '<section class="sv-card sv-pad"><p class="sv-empty">Choose an employee to see their profile.</p></section>'; return; }
      host.innerHTML = '<div id="svPersonStatus"></div><div id="svPersonForm"></div>';
      window.REXUSGate.mountProfile(host.querySelector('#svPersonForm'), { userId: uid, submitLabel: 'Save personal information' }).then(function (d) {
        if (!d || !d.status) return;
        var st = d.status;
        host.querySelector('#svPersonStatus').innerHTML = '<section class="sv-card"><div class="sv-card-head"><div><h3>Onboarding status</h3><p class="sv-muted">' + esc(d.user.full_name) + ' · User ID ' + esc(d.user.id) + '</p></div><button type="button" class="sv-btn" data-reset>Reset password</button></div><ul class="sv-status-list">' +
          '<li>' + (st.must_change_password ? '<span class="rx-chip rx-chip-warning">Pending</span>' : '<span class="rx-chip rx-chip-success">Done</span>') + ' Personal password</li>' +
          '<li>' + (st.onboarding_completed_at ? '<span class="rx-chip rx-chip-success">Completed</span> Profile — ' + fmtDate(st.onboarding_completed_at, true) : st.profile_gate ? '<span class="rx-chip rx-chip-warning">Pending</span> Profile' : '<span class="rx-chip rx-chip-neutral">Not required</span> Profile (existing account)') + '</li></ul></section>';
        host.querySelector('[data-reset]').onclick = function () {
          confirmBox('Create a new temporary password for ' + d.user.full_name + '? They must replace it at the next sign-in.', 'Reset password').then(function (ok) {
            if (!ok) return;
            api('/api/admin/users/' + encodeURIComponent(uid), 'POST', { action: 'reset_password' }).then(function (r) { notify('Temporary password for ' + d.user.username + ': ' + r.temp_password + '\nShare it privately. It is shown only once.', 'success', { sticky: true, title: 'Password reset' }); profiles(uid); }).catch(function (e) { notify(e.message, 'error'); });
          });
        };
      });
    }).catch(fail);
  }
  function fields() {
    api('/api/profile-fields').then(function (d) {
      main.innerHTML = head('Profile Fields', 'Profile Fields', 'Choose which personal information REXUS collects. Collect only what you need; a hidden field is never required.', '<button type="button" class="sv-btn sv-btn-primary" data-save>Save fields</button>') +
        '<section class="sv-card"><div class="sv-table-wrap"><table class="sv-table sv-fields"><thead><tr><th>Label</th><th>Type</th><th>Shown</th><th>Required</th><th>Who edits</th><th>Order</th><th>Options (dropdown)</th></tr></thead><tbody>' +
        d.fields.map(function (f) { return '<tr data-key="' + esc(f.key) + '"><td><label class="rx-sr-only" for="fl_' + f.key + '">Label</label><input id="fl_' + f.key + '" name="label" maxlength="80" value="' + esc(f.label) + '"></td><td>' + esc({ date: 'Date', dropdown: 'Dropdown', text: 'Text', year: 'Year' }[f.field_type]) + '</td>' +
          '<td><input type="checkbox" name="visible" aria-label="Show ' + esc(f.label) + '"' + (f.visible ? ' checked' : '') + '></td><td><input type="checkbox" name="required" aria-label="Require ' + esc(f.label) + '"' + (f.required ? ' checked' : '') + (f.visible ? '' : ' disabled') + '></td>' +
          '<td>' + (f.self_service ? 'Employee' : 'HR (admin)') + '</td><td><input type="number" name="sort_order" aria-label="Order of ' + esc(f.label) + '" value="' + f.sort_order + '" class="sv-input-xs"></td>' +
          '<td>' + (f.field_type === 'dropdown' ? '<textarea name="options" rows="3" aria-label="Options of ' + esc(f.label) + ', one per line">' + esc(f.options.join('\n')) + '</textarea>' : '<span class="sv-muted">—</span>') + '</td></tr>'; }).join('') + '</tbody></table></div></section>' +
        '<section class="sv-card"><div class="sv-card-head"><div><h3>Existing accounts</h3><p class="sv-muted">New accounts must complete the required fields at first sign-in. Accounts created before this release are not asked until you apply the rule to them.</p></div><button type="button" class="sv-btn" data-apply>Apply required fields to existing accounts…</button></div></section>';
      main.querySelectorAll('input[name=visible]').forEach(function (c) { c.onchange = function () { var r = c.closest('tr').querySelector('input[name=required]'); r.disabled = !c.checked; if (!c.checked) r.checked = false; }; });
      main.querySelector('[data-save]').onclick = function () {
        var rows = [].slice.call(main.querySelectorAll('tr[data-key]')).map(function (tr) { var g = function (n) { return tr.querySelector('[name=' + n + ']'); }; var o = { key: tr.dataset.key, label: g('label').value, visible: g('visible').checked, required: g('required').checked, sort_order: g('sort_order').value }; if (g('options')) o.options = g('options').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean); return o; });
        api('/api/profile-fields', 'PUT', { fields: rows }).then(function (r) { notify('Fields saved' + (r.accounts_now_incomplete ? ' — ' + r.accounts_now_incomplete + ' account(s) must now complete their profile' : ''), r.accounts_now_incomplete ? 'warning' : 'success'); fields(); }).catch(function (e) { notify(e.message, 'error'); });
      };
      main.querySelector('[data-apply]').onclick = function () {
        confirmBox('Every active account that is missing a required field will have to complete it at its next request before using REXUS. Continue?', 'Apply to existing accounts').then(function (ok) {
          if (ok) api('/api/profile-fields', 'POST', { action: 'apply_existing' }).then(function (r) { notify('Applied to ' + r.accounts + ' existing account(s)'); }).catch(function (e) { notify(e.message, 'error'); });
        });
      };
    }).catch(fail);
  }

  /* ------------------------------------------------------------------ wiring */
  if (switcher) switcher.addEventListener('click', function (e) { var b = e.target.closest('[data-rexus-app]'); if (!b) return; if (b.dataset.rexusApp === 'survey') open(fromHash() || 'overview'); else { leaveGuard(); setMode(false); if (/^#survey\//.test(location.hash) && b.dataset.rexusApp === 'rexus') history.replaceState(null, '', location.pathname + location.search + '#/overview'); } });
  window.addEventListener('hashchange', function () { var r = fromHash(); if (r !== null) { if (r !== S.route || !root.classList.contains('rexus-survey-mode')) { setMode(true); render(r); } } else if (root.classList.contains('rexus-survey-mode') && !/^#document\//.test(location.hash)) setMode(false); });
  window.addEventListener('popstate', function () { var r = fromHash(); if (r !== null && r !== S.route) { setMode(true); render(r); } });
  window.addEventListener('beforeunload', function (e) { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
  window.REXUSSurvey = { open: open, isOpen: function () { return root.classList.contains('rexus-survey-mode'); } };
  // Direct link / refresh on a survey route: open once the main app has signed in (it shows .wm-app).
  (function waitForApp() { var r = fromHash(); if (r === null) return; if (getComputedStyle(root).display === 'none' || document.documentElement.classList.contains('rx-gated')) return setTimeout(waitForApp, 300); setMode(true); render(r); })();
})();
