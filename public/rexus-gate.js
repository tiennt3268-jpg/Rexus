/* =============================================================================
   REXUS v2.3.0 — First Login gate + survey answering (REXUS Survey v1.0.0, spec §07–§13).
   - REXUSGate.start(user, onboarding): fullscreen steps in the order the server reports them:
       Change temporary password → Complete personal profile → Mandatory survey(s) → workspace.
     No Skip / Close / Dashboard. The server enforces the same order on every API call; this screen only
     shows it. After the last step the page reloads into the normal workspace.
   - REXUSSurveyForm.mount(host, data, opts): one-question-at-a-time form, shared by the mandatory flow,
     the Survey workspace ("Surveys for me", preview) and the public survey page.
   - REXUSGate.mountProfile(host, opts): personal information form (onboarding, My Account, admin view).
   ========================================================================== */
(function () {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function api(path, method, body) {
    return fetch(path, { method: method || 'GET', credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || ('Request failed (' + r.status + ')')); e.status = r.status; e.data = j; throw e; } return j; }); });
  }
  function initials(n) { return String(n || '?').trim().split(/\s+/).map(function (p) { return p[0]; }).slice(-2).join('').toUpperCase(); }
  function fmtDate(v) { if (!v) return '—'; try { return new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }); } catch (e) { return String(v); } }
  function store(kind, key, val) { try { if (val === undefined) return JSON.parse(window[kind].getItem(key) || 'null'); if (val === null) window[kind].removeItem(key); else window[kind].setItem(key, JSON.stringify(val)); } catch (e) { return null; } }
  function token() { var a = new Uint8Array(12); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.random() * 256; }); return 'sv' + Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  var TYPE_LABEL = { short: 'Short answer', long: 'Long answer', single: 'Single choice', multiple: 'Multiple choice', dropdown: 'Dropdown', rating: 'Rating', scale: 'Linear scale', date: 'Date', number: 'Number' };

  /* ======================================================================== survey form */
  function blank(v) { return v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length); }
  function checkAnswer(q, v) {
    if (blank(v)) return q.required ? 'This question is required.' : null;
    if ((q.type === 'short' || q.type === 'long') && String(v).length > q.max_length) return 'At most ' + q.max_length + ' characters.';
    if (q.type === 'number') { var x = Number(v); if (!isFinite(x)) return 'Enter a number.'; if ((q.min !== null && q.min !== undefined && x < q.min) || (q.max !== null && q.max !== undefined && x > q.max)) return 'Enter a number' + (q.min != null ? ' from ' + q.min : '') + (q.max != null ? ' to ' + q.max : '') + '.'; }
    return null;
  }
  function questionHtml(q, i, total, v, err) {
    var name = 'svq_' + q.id, req = q.required ? ' <span class="sv-req" aria-hidden="true">*</span>' : '';
    var head = '<div class="sv-q-meta"><span>Question ' + String(i + 1).padStart(2, '0') + ' · ' + esc(TYPE_LABEL[q.type] || q.type) + '</span>' + (q.required ? '<span class="rx-chip rx-chip-warning">Required</span>' : '<span class="rx-chip rx-chip-neutral">Optional</span>') + '</div>' +
      '<h2 class="sv-q-title" id="svqt_' + q.id + '">' + esc(q.title) + req + '</h2>' + (q.description ? '<p class="sv-q-help">' + esc(q.description) + '</p>' : '');
    var body = '', lab = ' aria-labelledby="svqt_' + q.id + '"', invalid = err ? ' aria-invalid="true" aria-describedby="sverr_' + q.id + '"' : '';
    if (q.type === 'short') body = '<input class="sv-input" name="' + name + '" maxlength="' + q.max_length + '" value="' + esc(v || '') + '"' + lab + invalid + '>';
    else if (q.type === 'long') body = '<textarea class="sv-input" rows="5" name="' + name + '" maxlength="' + q.max_length + '"' + lab + invalid + '>' + esc(v || '') + '</textarea><div class="sv-count">' + String(v || '').length + ' / ' + q.max_length + '</div>';
    else if (q.type === 'single' || q.type === 'multiple') body = '<div class="sv-options" role="' + (q.type === 'single' ? 'radiogroup' : 'group') + '"' + lab + invalid + '>' + q.options.map(function (o) {
      var on = q.type === 'single' ? v === o : Array.isArray(v) && v.indexOf(o) !== -1;
      return '<label class="sv-option' + (on ? ' is-on' : '') + '"><input type="' + (q.type === 'single' ? 'radio' : 'checkbox') + '" name="' + name + '" value="' + esc(o) + '"' + (on ? ' checked' : '') + '><span>' + esc(o) + '</span></label>';
    }).join('') + '</div>' + (q.type === 'multiple' ? '<p class="sv-q-help">Select all that apply.</p>' : '');
    else if (q.type === 'dropdown') body = '<select class="sv-input" name="' + name + '"' + lab + invalid + '><option value="">Select an answer…</option>' + q.options.map(function (o) { return '<option' + (v === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>';
    else if (q.type === 'rating' || q.type === 'scale') {
      var lo = q.type === 'rating' ? 1 : q.min, nums = []; for (var n = lo; n <= q.max; n++) nums.push(n);
      body = '<div class="sv-scale" role="radiogroup"' + lab + invalid + '>' + nums.map(function (n) { return '<button type="button" class="sv-scale-btn" role="radio" aria-checked="' + (Number(v) === n) + '" data-val="' + n + '">' + (q.type === 'rating' ? '<span aria-hidden="true">★</span> ' : '') + n + '</button>'; }).join('') + '</div>' +
        (q.type === 'scale' && (q.min_label || q.max_label) ? '<div class="sv-scale-labels"><span>' + esc(q.min_label) + '</span><span>' + esc(q.max_label) + '</span></div>' : '');
    }
    else if (q.type === 'date') body = '<input class="sv-input sv-input-sm" type="date" name="' + name + '" value="' + esc(v || '') + '"' + lab + invalid + '>';
    else if (q.type === 'number') body = '<input class="sv-input sv-input-sm" type="number" inputmode="decimal" name="' + name + '" value="' + esc(v === undefined || v === null ? '' : v) + '"' + (q.min != null ? ' min="' + q.min + '"' : '') + (q.max != null ? ' max="' + q.max + '"' : '') + lab + invalid + '>';
    return head + '<div class="sv-q-input">' + body + '</div>' + (err ? '<p class="sv-error" id="sverr_' + q.id + '" role="alert">' + esc(err) + '</p>' : '');
  }

  /** data = {survey, questions, respondent}; opts = {fullscreen, mandatory, queue:'1 of 2', preview, onDone(result), onSignOut} */
  function surveyForm(host, data, opts) {
    opts = opts || {};
    var s = data.survey, qs = data.questions, who = data.respondent;
    var draftKey = 'sv-draft-' + s.id + '-' + s.version_id, tokKey = 'sv-token-' + s.id;
    var answers = (!opts.preview && store('localStorage', draftKey)) || {}, idx = 0, errs = {}, busy = false, banner = '';
    function answeredCount() { return qs.filter(function (q) { return !blank(answers[q.id]); }).length; }
    function render(focusQ) {
      var q = qs[idx], last = idx === qs.length - 1, pct = Math.round((idx + 1) * 100 / qs.length);
      host.innerHTML = '<div class="sv-form' + (opts.fullscreen ? ' sv-fullscreen' : '') + '">' +
        (opts.fullscreen ? topBar(s.name, opts.mandatory ? 'Required' + (opts.queue ? ' · ' + opts.queue : '') : '', who, opts.onSignOut) : '') +
        '<section class="sv-form-head"><div><p class="sv-eyebrow"><span class="sv-dot" aria-hidden="true"></span>' + esc(s.name) + '</p><h1>' + esc(opts.preview ? 'Preview' : (s.mandatory ? 'Required survey' : 'Survey')) + '</h1>' +
          '<p class="sv-muted">' + (opts.preview ? 'This is how respondents will see the survey. Answers are not saved.' : 'Answer all required questions to complete the survey.') + '</p></div>' +
          '<div class="sv-counter"><strong>' + String(idx + 1).padStart(2, '0') + '</strong> / ' + qs.length + '<small>Questions completed: ' + answeredCount() + '</small></div></section>' +
        '<div class="sv-progress" role="progressbar" aria-label="Survey progress" aria-valuemin="1" aria-valuemax="' + qs.length + '" aria-valuenow="' + (idx + 1) + '"><span style="width:' + pct + '%"></span></div>' +
        '<div class="sv-body"><main class="sv-q" aria-live="polite">' + (banner ? '<div class="sv-banner" role="alert">' + banner + '</div>' : '') + questionHtml(q, idx, qs.length, answers[q.id], errs[q.id]) +
          '<p class="sv-note">You can go back and change an answer before submitting.</p></main>' +
          '<aside class="sv-nav" aria-label="Question navigator"><p class="sv-eyebrow">Survey progress</p><h3>Question navigator</h3><p class="sv-muted">You are on question ' + (idx + 1) + ' of ' + qs.length + '.</p>' +
          '<div class="sv-nav-grid">' + qs.map(function (x, i) { return '<button type="button" data-go="' + i + '" class="' + (i === idx ? 'is-current' : '') + (blank(answers[x.id]) ? '' : ' is-done') + (errs[x.id] ? ' is-error' : '') + '" aria-label="Question ' + (i + 1) + (blank(answers[x.id]) ? '' : ', answered') + (errs[x.id] ? ', needs attention' : '') + '"' + (i === idx ? ' aria-current="step"' : '') + '>' + (i + 1) + '</button>'; }).join('') + '</div>' +
          '<h4>Completion rule</h4><p class="sv-muted">All required answers are checked when you submit.</p>' +
          (s.mode === 'authenticated' ? '<h4>Your identity</h4><p class="sv-muted">Responses are linked to your signed-in REXUS account' + (who ? ' (' + esc(who.name) + ')' : '') + '. It cannot be changed here.</p>' : '<h4>No account needed</h4><p class="sv-muted">This survey does not record who answers.</p>') +
          '</aside></div>' +
        '<footer class="sv-actions"><span class="sv-status">' + (opts.mandatory ? '<span class="sv-dot" aria-hidden="true"></span><strong>Required survey in progress</strong> <span class="sv-muted">Other REXUS modules stay unavailable until it is submitted.</span>' : '') + '</span>' +
          '<button type="button" class="sv-btn" data-prev' + (idx === 0 ? ' disabled' : '') + '>← Previous</button>' +
          (last ? '<button type="button" class="sv-btn sv-btn-primary" data-submit' + (busy ? ' disabled aria-busy="true"' : '') + '>' + (busy ? 'Submitting…' : opts.preview ? 'Finish preview' : 'Submit survey') + '</button>'
                : '<button type="button" class="sv-btn sv-btn-primary" data-next>Next question →</button>') + '</footer></div>';
      wire();
      if (focusQ) {   // move focus to the new question (or to its input when it has an error)
        var f = host.querySelector('.sv-q input, .sv-q textarea, .sv-q select, .sv-q .sv-scale-btn'), t = host.querySelector('.sv-q-title'), target = errs[q.id] && f ? f : t;
        if (target) { if (target === t) t.setAttribute('tabindex', '-1'); target.focus(); }
      }
    }
    function save() { if (!opts.preview) store('localStorage', draftKey, answers); }
    function readCurrent() {
      var q = qs[idx], name = 'svq_' + q.id, f = host.querySelector('.sv-q');
      if (q.type === 'single') { var c = f.querySelector('input[name="' + name + '"]:checked'); answers[q.id] = c ? c.value : ''; }
      else if (q.type === 'multiple') answers[q.id] = [].slice.call(f.querySelectorAll('input[name="' + name + '"]:checked')).map(function (x) { return x.value; });
      else if (q.type === 'rating' || q.type === 'scale') { /* set on click */ }
      else { var e = f.querySelector('[name="' + name + '"]'); if (e) answers[q.id] = q.type === 'number' ? (e.value === '' ? '' : Number(e.value)) : e.value; }
      save();
    }
    function go(i) { readCurrent(); idx = Math.max(0, Math.min(qs.length - 1, i)); render(true); }
    function wire() {
      var q = qs[idx];
      host.querySelectorAll('[data-go]').forEach(function (b) { b.onclick = function () { go(+b.dataset.go); }; });
      host.querySelector('[data-prev]').onclick = function () { go(idx - 1); };
      var nx = host.querySelector('[data-next]'); if (nx) nx.onclick = function () { readCurrent(); var e = checkAnswer(q, answers[q.id]); if (e) { errs[q.id] = e; render(true); return; } delete errs[q.id]; go(idx + 1); };
      var sb = host.querySelector('[data-submit]'); if (sb) sb.onclick = submit;
      host.querySelectorAll('.sv-scale-btn').forEach(function (b) { b.onclick = function () { answers[q.id] = Number(b.dataset.val); delete errs[q.id]; save(); host.querySelectorAll('.sv-scale-btn').forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); }); updateNav(); }; });
      host.querySelectorAll('.sv-scale').forEach(function (g) { g.onkeydown = function (e) { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; var bs = [].slice.call(g.querySelectorAll('button')), i = bs.indexOf(document.activeElement); if (i < 0) return; e.preventDefault(); var n = bs[Math.max(0, Math.min(bs.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)))]; n.focus(); n.click(); }; });
      host.querySelectorAll('.sv-option input').forEach(function (inp) { inp.onchange = function () { host.querySelectorAll('.sv-option').forEach(function (l) { l.classList.toggle('is-on', l.querySelector('input').checked); }); readCurrent(); delete errs[q.id]; updateNav(); }; });
      var ta = host.querySelector('.sv-q textarea'); if (ta) ta.oninput = function () { host.querySelector('.sv-count').textContent = ta.value.length + ' / ' + q.max_length; readCurrent(); };
      host.querySelectorAll('.sv-q input:not([type=radio]):not([type=checkbox]), .sv-q select').forEach(function (inp) { inp.oninput = inp.onchange = function () { readCurrent(); updateNav(); }; inp.onkeydown = function (e) { if (e.key === 'Enter' && inp.tagName === 'INPUT') { e.preventDefault(); (host.querySelector('[data-next]') || host.querySelector('[data-submit]')).click(); } }; });
    }
    function updateNav() { var b = host.querySelector('[data-go="' + idx + '"]'); if (b) b.classList.toggle('is-done', !blank(answers[qs[idx].id])); var c = host.querySelector('.sv-counter small'); if (c) c.textContent = 'Questions completed: ' + answeredCount(); }
    function submit() {
      readCurrent();
      errs = {}; qs.forEach(function (q) { var e = checkAnswer(q, answers[q.id]); if (e) errs[q.id] = e; });
      var first = qs.findIndex(function (q) { return errs[q.id]; });
      if (first !== -1) { idx = first; banner = 'Some answers need attention before you can submit.'; render(true); return; }
      if (opts.preview) { banner = ''; if (opts.onDone) opts.onDone({ preview: true }); return; }
      var tk = store('sessionStorage', tokKey) || token(); store('sessionStorage', tokKey, tk);   // same token on retry → counted once
      busy = true; banner = ''; render();
      var payload = {}; qs.forEach(function (q) { if (!blank(answers[q.id])) payload[q.id] = answers[q.id]; });
      api('/api/survey-respond', 'POST', { id: s.id, version_id: s.version_id, client_token: tk, answers: payload }).then(function (r) {
        store('localStorage', draftKey, null); store('sessionStorage', tokKey, null);
        if (opts.onDone) opts.onDone(r);
      }).catch(function (e) {
        busy = false;
        var d = e.data || {};
        if (d.already || d.closed) { store('localStorage', draftKey, null); store('sessionStorage', tokKey, null); if (opts.onDone) return opts.onDone({ already: d.already, closed: d.closed, message: e.message }); }
        if (d.reload && opts.onReload) return opts.onReload();
        if (d.question) { var i = qs.findIndex(function (q) { return q.id === d.question; }); if (i !== -1) { idx = i; errs[d.question] = e.message.replace(/^Question \d+: ?/, ''); } }
        banner = e.status ? esc(e.message) : 'Could not reach the server — your answers are kept on this device. <button type="button" class="sv-link" data-retry>Retry</button>';
        render(true);
        var rt = host.querySelector('[data-retry]'); if (rt) rt.onclick = submit;
      });
    }
    render(false);
    return { destroy: function () { host.innerHTML = ''; } };
  }

  function topBar(title, badge, who, onSignOut) {
    return '<header class="sv-top"><div class="sv-brand"><span class="sv-logo" aria-hidden="true">RX</span><strong>REXUS SURVEY</strong>' + (title ? '<span class="sv-top-title">' + esc(title) + '</span>' : '') + '</div>' +
      '<div class="sv-top-right">' + (badge ? '<span class="rx-chip rx-chip-warning sv-badge-req">' + esc(badge) + '</span>' : '') +
      (who ? '<span class="sv-who"><span class="sv-avatar" aria-hidden="true">' + esc(initials(who.name)) + '</span><span class="sv-who-name">' + esc(who.name) + (who.department ? ' · ' + esc(who.department) : '') + '</span></span>' : '') +
      (onSignOut ? '<button type="button" class="sv-link" data-signout>Sign out</button>' : '') + '</div></header>';
  }

  /* ======================================================================== profile form */
  /** opts = {userId, submitLabel, onSaved(res), intro, fullscreen} */
  function mountProfile(host, opts) {
    opts = opts || {};
    host.innerHTML = '<p class="sv-muted" role="status">Loading…</p>';
    return api('/api/onboarding' + (opts.userId ? '?user_id=' + encodeURIComponent(opts.userId) : '')).then(function (d) {
      var u = d.user, admin = d.can_edit_managed;
      function field(f, err) {
        var v = d.values[f.key] || '', id = 'pf_' + f.key, ro = !f.self_service && !admin;
        var input = f.field_type === 'dropdown' ? '<select id="' + id + '" name="' + f.key + '"' + (ro ? ' disabled' : '') + '><option value="">Select…</option>' + f.options.map(function (o) { return '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>'
          : '<input id="' + id + '" name="' + f.key + '" type="' + (f.field_type === 'date' ? 'date' : f.field_type === 'year' ? 'number' : 'text') + '"' + (f.field_type === 'year' ? ' min="1900" max="' + (new Date().getFullYear() + 6) + '" step="1"' : '') + (f.field_type === 'date' && f.key === 'date_of_birth' ? ' max="' + new Date().toISOString().slice(0, 10) + '"' : '') + ' value="' + esc(v) + '"' + (ro ? ' readonly' : '') + (f.field_type === 'text' ? ' maxlength="200"' : '') + '>';
        return '<div class="sv-field' + (ro ? ' is-managed' : '') + (err ? ' has-error' : '') + '"><label for="' + id + '">' + esc(f.label) + (f.required ? ' <span class="sv-req" aria-hidden="true">*</span><span class="rx-sr-only"> (required)</span>' : ' <span class="sv-opt">Optional</span>') + '</label>' + input.replace('<input ', '<input aria-describedby="' + id + '_e" ').replace('<select ', '<select aria-describedby="' + id + '_e" ') +
          '<p class="sv-error" id="' + id + '_e"' + (err ? ' role="alert"' : ' hidden') + '>' + esc(err || '') + '</p>' + (ro ? '<p class="sv-hint">Managed by HR</p>' : '') + '</div>';
      }
      function draw(errors) {
        errors = errors || {};
        host.innerHTML = (opts.intro || '') +
          '<form class="sv-profile" novalidate><section class="sv-card sv-card-managed"><h3>Account information</h3><p class="sv-muted">Provided by your administrator. Contact HR to change it.</p><div class="sv-grid">' +
            [['Full name', u.full_name], ['Username', u.username], ['Department', u.department || '—'], ['Job position', u.position || '—']].map(function (p) { return '<div class="sv-field is-managed"><span class="sv-label">' + p[0] + '</span><span class="sv-value">' + esc(p[1]) + '</span></div>'; }).join('') + '</div></section>' +
          '<section class="sv-card"><h3>Personal information</h3><p class="sv-muted">Fields marked <span class="sv-req">*</span> are required. This information is visible only to you and System Admins.</p>' +
            '<div class="sv-grid">' + d.fields.map(function (f) { return field(f, errors[f.key]); }).join('') + '</div></section>' +
          '<p class="sv-error sv-form-error" role="alert" hidden></p><div class="sv-form-actions"><button type="submit" class="sv-btn sv-btn-primary">' + esc(opts.submitLabel || 'Save') + '</button></div></form>';
        var form = host.querySelector('form');
        var firstErr = form.querySelector('.has-error input, .has-error select'); if (firstErr) firstErr.focus();
        form.onsubmit = function (e) {
          e.preventDefault();
          var values = {}; d.fields.forEach(function (f) { var el = form.elements[f.key]; if (el && !el.disabled && !el.readOnly) values[f.key] = el.value.trim(); });
          var btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.textContent = 'Saving…';
          api('/api/onboarding', 'POST', { values: values, user_id: opts.userId || undefined }).then(function (r) {
            Object.assign(d.values, values);
            if (opts.onSaved) opts.onSaved(r); else { draw(); if (window.REXUSNotify) REXUSNotify('Personal information saved'); }
          }).catch(function (x) {
            Object.assign(d.values, values);
            if (x.data && x.data.fields) return draw(x.data.fields);
            draw(); var fe = host.querySelector('.sv-form-error'); fe.hidden = false; fe.textContent = x.message;
          });
        };
      }
      draw();
      return d;
    }).catch(function (e) { host.innerHTML = '<p class="sv-error" role="alert">' + esc(e.message) + '</p>'; });
  }

  /* ======================================================================== gate */
  var root = null, current = null;
  /* Profile Fields configuration (System Admin). Mounted in HRM → HR Settings. */
  function mountFields(host) {
    var main = host, notify = function (m, t) { return window.REXUSNotify ? window.REXUSNotify(m, t || 'success') : null; };
    var confirmBox = function (msg, title) { return window.REXUSLegacy && window.REXUSLegacy.confirm ? window.REXUSLegacy.confirm(msg, title) : Promise.resolve(window.confirm(msg)); };
    return api('/api/profile-fields').then(function (d) {
      main.innerHTML = '<section class="sv-card"><div class="sv-card-head"><div><h3>Personal information fields</h3><p class="sv-muted">Choose which personal information REXUS collects at first sign-in and in My Account. Collect only what you need; a hidden field is never required.</p></div><button type="button" class="sv-btn sv-btn-primary" data-save>Save fields</button></div></section>' +
        '<section class="sv-card"><div class="sv-table-wrap"><table class="sv-table sv-fields"><thead><tr><th>Label</th><th>Type</th><th>Shown</th><th>Required</th><th>Who edits</th><th>Order</th><th>Options (dropdown)</th></tr></thead><tbody>' +
        d.fields.map(function (f) { return '<tr data-key="' + esc(f.key) + '"><td><label class="rx-sr-only" for="fl_' + f.key + '">Label</label><input id="fl_' + f.key + '" name="label" maxlength="80" value="' + esc(f.label) + '"></td><td>' + esc({ date: 'Date', dropdown: 'Dropdown', text: 'Text', year: 'Year' }[f.field_type]) + '</td>' +
          '<td><input type="checkbox" name="visible" aria-label="Show ' + esc(f.label) + '"' + (f.visible ? ' checked' : '') + '></td><td><input type="checkbox" name="required" aria-label="Require ' + esc(f.label) + '"' + (f.required ? ' checked' : '') + (f.visible ? '' : ' disabled') + '></td>' +
          '<td>' + (f.self_service ? 'Employee' : 'HR (admin)') + '</td><td><input type="number" name="sort_order" aria-label="Order of ' + esc(f.label) + '" value="' + f.sort_order + '" class="sv-input-xs"></td>' +
          '<td>' + (f.field_type === 'dropdown' ? '<textarea name="options" rows="3" aria-label="Options of ' + esc(f.label) + ', one per line">' + esc(f.options.join('\n')) + '</textarea>' : '<span class="sv-muted">—</span>') + '</td></tr>'; }).join('') + '</tbody></table></div></section>' +
        '<section class="sv-card"><div class="sv-card-head"><div><h3>Existing accounts</h3><p class="sv-muted">New accounts must complete the required fields at first sign-in. Accounts created before this release are not asked until you apply the rule to them.</p></div><button type="button" class="sv-btn" data-apply>Apply required fields to existing accounts…</button></div></section>';
      main.querySelectorAll('input[name=visible]').forEach(function (c) { c.onchange = function () { var r = c.closest('tr').querySelector('input[name=required]'); r.disabled = !c.checked; if (!c.checked) r.checked = false; }; });
      main.querySelector('[data-save]').onclick = function () {
        var rows = [].slice.call(main.querySelectorAll('tr[data-key]')).map(function (tr) { var g = function (n) { return tr.querySelector('[name=' + n + ']'); }; var o = { key: tr.dataset.key, label: g('label').value, visible: g('visible').checked, required: g('required').checked, sort_order: g('sort_order').value }; if (g('options')) o.options = g('options').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean); return o; });
        api('/api/profile-fields', 'PUT', { fields: rows }).then(function (r) { notify('Fields saved' + (r.accounts_now_incomplete ? ' — ' + r.accounts_now_incomplete + ' account(s) must now complete their profile' : ''), r.accounts_now_incomplete ? 'warning' : 'success'); mountFields(host); }).catch(function (e) { notify(e.message, 'error'); });
      };
      main.querySelector('[data-apply]').onclick = function () {
        confirmBox('Every active account that is missing a required field will have to complete it at its next request before using REXUS. Continue?', 'Apply to existing accounts').then(function (ok) {
          if (ok) api('/api/profile-fields', 'POST', { action: 'apply_existing' }).then(function (r) { notify('Applied to ' + r.accounts + ' existing account(s)'); }).catch(function (e) { notify(e.message, 'error'); });
        });
      };
    }).catch(function (e) { host.innerHTML = '<p class="sv-error" role="alert">' + esc(e.message) + '</p>'; });
  }


  function signOut() { api('/api/auth/logout', 'POST', {}).catch(function () {}).then(function () { location.reload(); }); }
  function shell(html) {
    if (!root) {
      root = document.createElement('div'); root.id = 'rxGate'; root.className = 'sv-gate'; root.setAttribute('role', 'main');
      document.body.appendChild(root);
      document.documentElement.classList.add('rx-gated');
    }
    var app = document.querySelector('.wm-app'); if (app) app.style.display = 'none';
    var auth = document.getElementById('wmAuthScreen'); if (auth) auth.style.display = 'none';
    root.innerHTML = html; window.scrollTo(0, 0);
    var so = root.querySelector('[data-signout]'); if (so) so.onclick = signOut;
    return root;
  }
  function steps(active, onb) {
    var list = [['password', 'Change password'], ['profile', 'Personal profile'], ['survey', 'Required survey']];
    var order = ['password', 'profile', 'survey'], at = order.indexOf(active);
    return '<ol class="sv-steps" aria-label="First sign-in steps">' + list.map(function (s, i) { var st = i < at ? 'done' : i === at ? 'current' : 'todo'; return '<li class="is-' + st + '"' + (st === 'current' ? ' aria-current="step"' : '') + '><span>' + (st === 'done' ? '✓' : i + 1) + '</span>' + s[1] + '<span class="rx-sr-only"> (' + (st === 'done' ? 'completed' : st === 'current' ? 'current step' : 'next') + ')</span></li>'; }).join('') + '</ol>';
  }
  function load() {
    api('/api/onboarding').then(function (d) {
      current = d;
      var step = d.onboarding && d.onboarding.step;
      if (!step) return finish();
      if (step === 'password') passwordStep(d);
      else if (step === 'profile') profileStep(d);
      else introStep(d, 0);
    }).catch(function (e) {
      if (e.status === 401) return location.reload();
      shell('<div class="sv-center"><p class="sv-error" role="alert">' + esc(e.message) + '</p><button class="sv-btn sv-btn-primary" type="button" data-retry>Retry</button></div>').querySelector('[data-retry]').onclick = load;
    });
  }
  function finish() { document.documentElement.classList.remove('rx-gated'); location.reload(); }
  function who(d) { return { name: d.user.full_name || d.user.username, department: d.user.department }; }

  function passwordStep(d) {
    var r = shell(topBar('First sign-in', 'Action required', who(d), signOut) +
      '<div class="sv-onb"><div class="sv-onb-card">' + steps('password') +
      '<h1>Create your own password</h1><p class="sv-muted">You signed in with a temporary password from your administrator. Choose a personal password to continue.</p>' +
      '<form class="sv-pw" novalidate>' +
        ['current_password|Temporary password|current-password', 'new_password|New password|new-password', 'confirm_password|Confirm new password|new-password'].map(function (x) { var p = x.split('|'); return '<div class="sv-field"><label for="pw_' + p[0] + '">' + p[1] + ' <span class="sv-req" aria-hidden="true">*</span></label><input id="pw_' + p[0] + '" name="' + p[0] + '" type="password" autocomplete="' + p[2] + '" required aria-describedby="pw_' + p[0] + '_e"><p class="sv-error" id="pw_' + p[0] + '_e" hidden></p></div>'; }).join('') +
        '<p class="sv-hint" id="pwRule">At least 8 characters, with a letter and a digit. It must differ from the temporary password.</p>' +
        '<p class="sv-error sv-form-error" role="alert" hidden></p><button type="submit" class="sv-btn sv-btn-primary sv-btn-block">Change password and continue</button></form></div></div>');
    var f = r.querySelector('form'); f.elements.current_password.focus();
    f.onsubmit = function (e) {
      e.preventDefault();
      var v = { current_password: f.elements.current_password.value, new_password: f.elements.new_password.value, confirm_password: f.elements.confirm_password.value }, errs = {};
      if (!v.current_password) errs.current_password = 'Enter the temporary password.';
      if (!(v.new_password.length >= 8 && /[A-Za-z]/.test(v.new_password) && /\d/.test(v.new_password))) errs.new_password = 'At least 8 characters, with a letter and a digit.';
      if (v.new_password !== v.confirm_password) errs.confirm_password = 'The new passwords do not match.';
      show(errs); if (Object.keys(errs).length) return;
      var btn = f.querySelector('[type=submit]'); btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.textContent = 'Saving…';
      api('/api/auth/change-password', 'POST', v).then(function () { load(); }).catch(function (x) {
        btn.disabled = false; btn.removeAttribute('aria-busy'); btn.textContent = 'Change password and continue';
        var o = {}; if (x.data && x.data.field) o[x.data.field] = x.message; else o._ = x.message; show(o);
      });
    };
    function show(errs) {
      ['current_password', 'new_password', 'confirm_password'].forEach(function (k) { var p = r.querySelector('#pw_' + k + '_e'), i = f.elements[k]; p.hidden = !errs[k]; p.textContent = errs[k] || ''; if (errs[k]) { p.setAttribute('role', 'alert'); i.setAttribute('aria-invalid', 'true'); } else i.removeAttribute('aria-invalid'); });
      var fe = r.querySelector('.sv-form-error'); fe.hidden = !errs._; fe.textContent = errs._ || '';
      var first = ['current_password', 'new_password', 'confirm_password'].find(function (k) { return errs[k]; }); if (first) f.elements[first].focus();
    }
  }
  function profileStep(d) {
    var r = shell(topBar('First sign-in', 'Action required', who(d), signOut) + '<div class="sv-onb sv-onb-wide"><div class="sv-onb-card">' + steps('profile') +
      '<h1>Complete your personal profile</h1><p class="sv-muted">A few details are required before you can use REXUS. You can update the optional ones later in My Account.</p><div id="svProfileHost"></div></div></div>');
    mountProfile(r.querySelector('#svProfileHost'), { submitLabel: 'Save and continue', onSaved: function (res) { if (res.onboarding && res.onboarding.step === 'profile') return profileStep(d); load(); } });
  }
  function introStep(d, i) {
    var s = d.surveys[i]; if (!s) return finish();
    var queue = d.surveys.length > 1 ? (i + 1) + ' of ' + d.surveys.length : '';
    var r = shell('<div class="sv-intro">' + topBar(s.name, 'Required survey' + (queue ? ' · ' + queue : ''), who(d), signOut) +
      '<div class="sv-intro-body"><section class="sv-intro-main"><p class="sv-eyebrow"><span class="sv-dot" aria-hidden="true"></span>Mandatory survey · Internal employee</p>' +
        '<h1>' + esc(s.name) + '</h1>' + (s.description ? '<p class="sv-intro-desc">' + esc(s.description) + '</p>' : '') +
        '<p class="sv-muted">This survey is required before you continue to your REXUS workspace.</p>' +
        '<dl class="sv-stats"><div><dt>Questions</dt><dd>' + s.question_count + '</dd></div><div><dt>Estimated time</dt><dd>~' + s.estimated_minutes + ' min</dd></div><div><dt>Closing date</dt><dd>' + (s.closes_at ? fmtDate(s.closes_at) : 'Open') + '</dd></div></dl>' +
        '<p class="sv-info">ⓘ Answers are linked to your signed-in REXUS account (User ID). Your identity cannot be changed here.</p>' +
        '<div class="sv-intro-cta"><button type="button" class="sv-btn sv-btn-primary sv-btn-lg" data-start>Start survey →</button><span class="sv-muted">Other workspaces open after your answers are saved.</span></div></section>' +
      '<aside class="sv-intro-side"><p class="sv-eyebrow">What to expect</p><h2>One clear step at a time.</h2><ol class="sv-expect">' +
        '<li><span>01</span><div><strong>Answer each question</strong><p>Required items are clearly marked.</p></div></li>' +
        '<li><span>02</span><div><strong>Review and submit</strong><p>Your answers are checked securely.</p></div></li>' +
        '<li><span>03</span><div><strong>Return to REXUS</strong><p>Access resumes after the server confirms your submission.</p></div></li></ol>' +
        '<p class="sv-muted sv-side-foot">Required survey · You are signed in as ' + esc(who(d).name) + '.</p></aside></div>' +
      '<footer class="sv-foot"><span>REXUS Platform / Survey</span><span>Secure required flow</span></footer></div>');
    r.querySelector('[data-start]').focus();
    r.querySelector('[data-start]').onclick = function () { formStep(d, i, queue); };
  }
  function formStep(d, i, queue) {
    var s = d.surveys[i];
    api('/api/survey-respond?id=' + encodeURIComponent(s.id)).then(function (data) {
      if (data.answered_at || data.closed_reason) return load();   // already done elsewhere, or closed meanwhile → the server decides the next step
      var host = shell('<div id="svFormHost"></div>').querySelector('#svFormHost');
      surveyForm(host, data, { fullscreen: true, mandatory: true, queue: queue, onSignOut: signOut, onReload: function () { formStep(d, i, queue); },
        onDone: function (res) {
          if (window.REXUSNotify) REXUSNotify(res.closed ? res.message : res.already ? 'This survey was already submitted.' : 'Thank you — your answers were saved.', res.closed ? 'info' : 'success');
          load();
        } });
    }).catch(function () { load(); });
  }

  window.REXUSGate = { start: function () { load(); }, mountProfile: mountProfile, mountFields: mountFields, api: api };
  window.REXUSSurveyForm = { mount: surveyForm, topBar: topBar, typeLabel: TYPE_LABEL, check: checkAnswer };
})();
