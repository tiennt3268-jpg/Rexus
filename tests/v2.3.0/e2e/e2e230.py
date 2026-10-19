"""REXUS v2.3.0 end-to-end tests — REXUS Survey v1.0.0 + First Login (AC01–AC09, UIAC01–UIAC10).
Chromium → test server → real Netlify Function handlers → PGlite.
usage: python3 e2e230.py [base_url] [screenshot_dir]   (start tests/v2.2.1/backend/server.mjs first, fresh database)"""
import sys, os, re
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8899'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'shots-230'
os.makedirs(OUT, exist_ok=True)
results = []
def check(name, cond, detail=''):
    results.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else '  → ' + str(detail)[:300]), flush=True)

ADMIN, PM, MEM = 'ADMIN_TIENNT', 'U_MINCT', 'U_TRUONGPN'
EXIT_WORDS = re.compile(r'\b(skip|later|dismiss|close|dashboard|cancel)\b', re.I)
def new_ctx(b, w=1440, h=900, scheme='light'):
    ctx = b.new_context(viewport={'width': w, 'height': h}, color_scheme=scheme, accept_downloads=True)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    pg.route(re.compile(r'^https?://(?!localhost).*'), lambda r: r.fulfill(status=200, body=''))
    return ctx, pg, errs
def login_as(pg, uid):
    pg.goto(f'{BASE}/__test/login?uid={uid}&to=/'); pg.wait_for_selector('.wm-app', state='visible', timeout=20000); pg.wait_for_timeout(900)
def login_gated(pg, uid):
    pg.goto(f'{BASE}/__test/login?uid={uid}&to=/'); pg.wait_for_selector('#rxGate', timeout=20000); pg.wait_for_timeout(900)
def J(pg, m, u, body=None):
    return pg.evaluate("([m,u,b])=>fetch(u,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined}).then(async r=>({status:r.status, json:await r.json().catch(()=>({}))}))", [m, u, body])
def form_login(pg, user, pw):
    pg.goto(BASE + '/'); pg.wait_for_selector('#wmAuthScreen', state='visible', timeout=15000)
    pg.fill('#wmAuthIdentifier', user); pg.fill('#wmAuthPassword', pw); pg.click('#wmAuthSubmit'); pg.wait_for_timeout(1500)
def exit_buttons(pg):
    return pg.evaluate("()=>[...document.querySelectorAll('#rxGate button, #rxGate a')].map(b=>b.textContent.trim()).filter(Boolean)")
def gate_step(pg):
    return pg.evaluate("()=>{const g=document.getElementById('rxGate'); if(!g) return 'none'; if(g.querySelector('.sv-pw')) return 'password'; if(g.querySelector('.sv-profile')) return 'profile'; if(g.querySelector('.sv-intro')) return 'intro'; if(g.querySelector('.sv-form')) return 'form'; return 'other'}")
def app_visible(pg): return pg.evaluate("()=>getComputedStyle(document.querySelector('.wm-app')).display !== 'none' && !document.getElementById('rxGate')")
def answer_current(pg):
    """Answer whatever the current question is (option, scale, dropdown, text, date, number)."""
    pg.evaluate("""()=>{const q=document.querySelector('.sv-q'); const o=q.querySelector('.sv-option input'); if(o){o.click(); return;}
      const s=q.querySelector('.sv-scale-btn:not([aria-checked=true])'); if(s && !q.querySelector('.sv-scale-btn[aria-checked=true]')){q.querySelectorAll('.sv-scale-btn')[Math.min(3, q.querySelectorAll('.sv-scale-btn').length-1)].click(); return;}
      const sel=q.querySelector('select'); if(sel){sel.value=sel.options[1].value; sel.dispatchEvent(new Event('change',{bubbles:true})); return;}
      const i=q.querySelector('input,textarea'); if(i && !i.value){i.value=i.type==='date'?'2026-01-15':i.type==='number'?'3':'Fine'; i.dispatchEvent(new Event('input',{bubbles:true}));}}""")
def fullscreen_box(pg, sel):
    return pg.evaluate("(s)=>{const e=document.querySelector(s); const r=e.getBoundingClientRect(); return {w:r.width, h:e.scrollHeight, vw:innerWidth, vh:innerHeight, overflow: document.documentElement.scrollWidth > innerWidth + 1}}", sel)

with sync_playwright() as p:
    b = p.chromium.launch(); all_errs = []

    # ------------------------------------------------------------ admin prepares: account, survey, mandatory target (UI)
    ctx, admin, errs = new_ctx(b); login_as(admin, ADMIN)
    acct = J(admin, 'POST', '/api/admin/users', {'full_name': 'Minh Anh Do', 'email': 'minh.anh.do@ueh.edu.vn', 'username': 'minh.anh', 'department': 'Finance Ops', 'position': 'Accountant'})['json']
    other = J(admin, 'POST', '/api/admin/users', {'full_name': 'Quoc Bao Le', 'email': 'quoc.bao@ueh.edu.vn', 'username': 'quoc.bao', 'department': 'Studio', 'position': 'Designer'})['json']
    check('setup: two new accounts with temporary passwords', acct.get('temp_password') and other.get('temp_password'), acct)

    admin.click('#rexusLauncherButton'); admin.wait_for_timeout(300)
    check('App Switcher lists REXUS Survey next to Work Management and Document', admin.locator('[data-rexus-app="survey"]').is_visible())
    admin.click('[data-rexus-app="survey"]'); admin.wait_for_timeout(1500)
    check('Survey workspace opens with its own navigation (Overview, My Surveys, Builder, Settings, Analytics)', admin.evaluate("()=>[...document.querySelectorAll('#svSide a')].map(a=>a.textContent.replace(/^\\W+/,'').trim()).join('|')").startswith('Overview|My Surveys|Survey Builder|Survey Settings|Analytics') and admin.evaluate("location.hash") == '#survey/overview')
    check('work views are hidden in Survey mode', admin.evaluate("()=>getComputedStyle(document.querySelector('.wm-shell')).display") == 'none')
    admin.screenshot(path=f'{OUT}/01-overview.png')
    # create from template (≤ 4 fields → modal), builder
    admin.click('#svMain [data-new]'); admin.wait_for_timeout(400)
    admin.fill('.wm-modal-overlay.open input[name=name]', 'Employee Experience 2026')
    admin.fill('.wm-modal-overlay.open textarea[name=description]', 'Help us understand what works and what we can improve.')
    admin.select_option('.wm-modal-overlay.open select[name=template]', 'engagement')
    admin.click('.wm-modal-overlay.open button[type=submit]'); admin.wait_for_timeout(1800)
    sid = admin.evaluate("location.hash").split('/')[-1]
    check('create → Survey Builder with the template questions', admin.evaluate("location.hash").startswith('#survey/builder/') and admin.locator('.sv-qcard').count() == 5)
    # builder operations
    admin.click('[data-add="dropdown"]'); admin.wait_for_timeout(200)
    admin.fill('#pTitle', 'Which office do you work in?'); admin.fill('#pOpts', 'Ho Chi Minh City\nNha Trang\nHanoi'); admin.locator('#pOpts').blur(); admin.wait_for_timeout(200)
    admin.check('#pReq', force=True); admin.wait_for_timeout(200)
    check('add a question (dropdown) after the selected one, required', admin.locator('.sv-qcard').count() == 6 and 'Which office' in admin.inner_text('.sv-qcard.is-selected'))
    admin.click('.sv-qcard.is-selected [data-dup]'); admin.wait_for_timeout(200)
    check('duplicate a question', admin.locator('.sv-qcard').count() == 7)
    admin.click('.sv-qcard.is-selected [data-del]'); admin.wait_for_timeout(200); admin.evaluate("()=>document.getElementById('wmConfirmOk').click()"); admin.wait_for_timeout(300)
    check('delete a question (with confirmation)', admin.locator('.sv-qcard').count() == 6)
    first = admin.inner_text('.sv-qcard >> nth=1')
    admin.click('[data-up="1"]'); admin.wait_for_timeout(200)
    check('reorder (move up)', admin.inner_text('.sv-qcard >> nth=0').split('\n')[1:2] == first.split('\n')[1:2])
    admin.click('[data-save]'); admin.wait_for_timeout(1200)
    check('save draft', admin.inner_text('.sv-save-state').strip() in ('Saved', ''), admin.inner_text('.sv-save-state'))
    admin.click('[data-preview]'); admin.wait_for_timeout(500)
    check('preview opens (desktop)', admin.locator('.sv-preview .sv-form').count() == 1)
    admin.click('.sv-preview [data-dev=mobile]'); admin.wait_for_timeout(200)
    check('preview on mobile width', admin.evaluate("()=>document.getElementById('svPvFrame').getBoundingClientRect().width") <= 392)
    admin.screenshot(path=f'{OUT}/03-preview-mobile.png')
    admin.click('.sv-preview [data-close]'); admin.wait_for_timeout(200)
    admin.screenshot(path=f'{OUT}/02-builder.png')
    admin.click('[data-publish]'); admin.wait_for_timeout(400); admin.evaluate("()=>document.getElementById('wmConfirmOk').click()"); admin.wait_for_timeout(1800)
    check('publish → version 1, then Survey Settings', admin.evaluate("location.hash").startswith('#survey/settings/') and 'Version' not in admin.inner_text('#svMain h1'))
    # targets via the searchable list (GEN-08)
    admin.check('input[name=mandatory]', force=True)
    admin.click('.sv-tile:has(#svDeps) .rx-combo-btn'); admin.wait_for_timeout(200); admin.keyboard.type('finance ops'); admin.wait_for_timeout(450); admin.keyboard.press('Enter'); admin.keyboard.press('Escape'); admin.wait_for_timeout(600)
    est = admin.inner_text('#svEst')
    check('AC03 target by department with the searchable list; unique estimate shown (OR rule explained)', est.strip() == '1' and 'OR' in admin.inner_text('.sv-settings'), est)
    admin.fill('input[name=priority]', '10')
    admin.click('[data-save]'); admin.wait_for_timeout(1500)
    s = J(admin, 'GET', f'/api/surveys?id={sid}')['json']['survey']
    check('AC03 settings saved: mandatory, Finance Ops department', s['mandatory'] and s['target']['departments'] == ['Finance Ops'], s.get('target'))
    admin.screenshot(path=f'{OUT}/04-settings.png', full_page=True)
    all_errs += errs

    # ------------------------------------------------------------ AC01 First Login: password
    c2, u, e2 = new_ctx(b)
    form_login(u, 'minh.anh', acct['temp_password'])
    check('AC01 new user signs in but lands on Change password (not the workspace)', gate_step(u) == 'password' and not app_visible(u), gate_step(u))
    check('UIAC06 no Skip / Close / Later on the password step', not any(EXIT_WORDS.search(t) for t in exit_buttons(u)), exit_buttons(u))
    u.keyboard.press('Escape'); u.wait_for_timeout(200)
    check('Esc does not leave the step', gate_step(u) == 'password')
    u.goto(BASE + '/#/all'); u.wait_for_timeout(2000)
    check('UIAC06 typing a module URL still shows the password step', gate_step(u) == 'password' and not app_visible(u))
    r = J(u, 'GET', '/api/tasks'); check('AC01 business API refused while the step is pending (server-side gate)', r['status'] == 401, r)
    u.screenshot(path=f'{OUT}/05-first-login-password.png')
    u.fill('#pw_current_password', acct['temp_password']); u.fill('#pw_new_password', 'short'); u.fill('#pw_confirm_password', 'short'); u.click('.sv-pw [type=submit]'); u.wait_for_timeout(300)
    check('validation at the field (weak password)', u.is_visible('#pw_new_password_e') and u.get_attribute('#pw_new_password', 'aria-invalid') == 'true')
    u.fill('#pw_current_password', 'wrong-temp1'); u.fill('#pw_new_password', 'MinhAnh2026'); u.fill('#pw_confirm_password', 'MinhAnh2026'); u.click('.sv-pw [type=submit]'); u.wait_for_timeout(1000)
    check('server error shown at the field (wrong temporary password)', 'incorrect' in u.inner_text('#pw_current_password_e').lower())
    u.fill('#pw_current_password', acct['temp_password']); u.click('.sv-pw [type=submit]'); u.wait_for_timeout(1500)

    # ------------------------------------------------------------ AC02 profile
    check('AC02 after the password: Complete personal profile', gate_step(u) == 'profile', gate_step(u))
    check('UIAC06 no Skip / Close on the profile step', not any(EXIT_WORDS.search(t) for t in exit_buttons(u)), exit_buttons(u))
    check('managed fields (name, department, position) are read-only', 'Finance Ops' in u.inner_text('.sv-card-managed') and u.locator('.sv-card-managed input').count() == 0)
    u.click('.sv-profile [type=submit]'); u.wait_for_timeout(1000)
    check('required DOB and Education errors shown at the fields', u.locator('.sv-field.has-error').count() == 2)
    u.screenshot(path=f'{OUT}/06-first-login-profile.png', full_page=True)
    u.reload(); u.wait_for_timeout(2500)
    check('AC02 refresh keeps the profile step (no Dashboard)', gate_step(u) == 'profile' and not app_visible(u))
    u.fill('#pf_date_of_birth', '1997-08-14'); u.select_option('#pf_education_level', 'Bachelor'); u.fill('#pf_field_of_study', 'Accounting')
    u.click('.sv-profile [type=submit]'); u.wait_for_timeout(1800)

    # ------------------------------------------------------------ AC04 mandatory intro (fullscreen)
    check('AC03/AC04 targeted user gets the Mandatory Intro', gate_step(u) == 'intro', gate_step(u))
    box = fullscreen_box(u, '.sv-intro')
    check('UIAC07 intro fills 100% of the viewport (not a centred card)', box['w'] == box['vw'] and box['h'] >= box['vh'] and not box['overflow'], box)
    btns = exit_buttons(u)
    check('AC04 only Start survey (+ Sign out); no Skip / Close / Dashboard', 'Start survey →' in btns and not any(EXIT_WORDS.search(t) for t in btns) and len([t for t in btns if t != 'Sign out']) == 1, btns)
    check('intro shows name, question count, estimate and the User ID note', all(x in u.inner_text('.sv-intro') for x in ['Employee Experience 2026', 'Questions', 'Estimated time', 'User ID']))
    u.screenshot(path=f'{OUT}/07-mandatory-intro.png')
    u.click('[data-start]'); u.wait_for_timeout(1200)
    box = fullscreen_box(u, '.sv-form')
    check('UIAC07 form fills 100% of the viewport', box['w'] == box['vw'] and box['h'] >= box['vh'] and not box['overflow'], box)
    check('form: progress, navigator, Previous / Next, no exit buttons', u.locator('.sv-progress').count() == 1 and u.locator('.sv-nav-grid button').count() == 6 and not any(EXIT_WORDS.search(t) for t in exit_buttons(u)), exit_buttons(u))
    u.click('[data-next]'); u.wait_for_timeout(300)
    check('required question validated at the question', 'required' in u.inner_text('.sv-q .sv-error').lower())
    answer_current(u); u.click('[data-next]'); u.wait_for_timeout(300)
    # keyboard on a rating / scale question: focus the first value, then arrows
    for _ in range(6):
        if u.locator('.sv-scale-btn').count(): break
        answer_current(u); u.click('[data-next]'); u.wait_for_timeout(250)
    u.focus('.sv-scale-btn >> nth=0'); u.keyboard.press('ArrowRight'); u.keyboard.press('ArrowRight'); u.wait_for_timeout(100)
    check('keyboard: arrow keys choose on a rating scale', u.get_attribute('.sv-scale-btn >> nth=2', 'aria-checked') == 'true')
    u.screenshot(path=f'{OUT}/08-mandatory-form.png')
    # AC05: refresh in the middle
    u.reload(); u.wait_for_timeout(2500)
    check('AC05 refresh before submit → back in the mandatory flow', gate_step(u) == 'intro' and not app_visible(u))
    u.click('[data-signout]'); u.wait_for_timeout(1500)
    form_login(u, 'minh.anh', 'MinhAnh2026')
    check('AC05 sign out + sign in again → still the missing step', gate_step(u) == 'intro', gate_step(u))
    u.click('[data-start]'); u.wait_for_timeout(1000)
    check('draft answers kept on this device after refresh', u.evaluate("()=>document.querySelectorAll('.sv-nav-grid .is-done').length") >= 2)
    for i in range(12):
        answer_current(u)
        if u.locator('[data-submit]').count(): break
        u.click('[data-next]'); u.wait_for_timeout(250)
    u.screenshot(path=f'{OUT}/09-last-question.png')
    u.click('[data-submit]'); u.wait_for_timeout(3500)
    check('AC06 submit → workspace opens', app_visible(u), gate_step(u))
    resp = J(admin, 'GET', f'/api/surveys?id={sid}&export=1')['json']
    check('AC06 response linked to the signed-in User ID', any(row[2] == acct['user']['id'] for row in resp['rows']), resp['rows'])
    r = J(u, 'GET', '/api/tasks'); check('business APIs open after server confirmation', r['status'] == 200)
    all_errs += e2; c2.close()

    # ------------------------------------------------------------ non-targeted user: no mandatory survey
    c3, o, e3 = new_ctx(b)
    form_login(o, 'quoc.bao', other['temp_password'])
    o.fill('#pw_current_password', other['temp_password']); o.fill('#pw_new_password', 'QuocBao2026'); o.fill('#pw_confirm_password', 'QuocBao2026'); o.click('.sv-pw [type=submit]'); o.wait_for_timeout(1500)
    o.fill('#pf_date_of_birth', '1999-02-01'); o.select_option('#pf_education_level', 'College'); o.click('.sv-profile [type=submit]'); o.wait_for_timeout(3000)
    check('AC03 a user outside the target group goes straight to the workspace', app_visible(o), gate_step(o))
    r = J(o, 'GET', '/api/onboarding?user_id=' + acct['user']['id']); check('AC08 an employee cannot read another person\'s demographics', r['status'] == 403)
    r = J(o, 'GET', f'/api/surveys?id={sid}&analytics=1'); check('AC08 …nor identified responses', r['status'] == 404)
    all_errs += e3; c3.close()

    # ------------------------------------------------------------ AC07 availability releases the gate
    J(admin, 'PUT', f'/api/surveys', {'id': sid, 'action': 'settings', 'mandatory': True, 'priority': 10, 'target': {'departments': ['Finance Ops', 'Studio']}})
    c4, o, e4 = new_ctx(b); form_login(o, 'quoc.bao', 'QuocBao2026')
    check('adding a group gates that group on the next sign-in', gate_step(o) == 'intro', gate_step(o))
    J(admin, 'POST', '/api/surveys', {'action': 'close', 'id': sid})
    o.reload(); o.wait_for_timeout(2500)
    check('AC07 survey closed → the user is not blocked any more', app_visible(o), gate_step(o))
    r = J(o, 'POST', '/api/survey-respond', {'id': sid, 'client_token': 'tok_e2e_closed1', 'answers': {}})
    check('AC07 server refuses new answers after closing', r['status'] in (400, 409), r)
    J(admin, 'POST', '/api/surveys', {'action': 'reopen', 'id': sid})
    all_errs += e4; c4.close()

    # ------------------------------------------------------------ mid-session: mandatory survey published while working
    c5, m, e5 = new_ctx(b); login_as(m, MEM)
    J(admin, 'PUT', '/api/surveys', {'id': sid, 'action': 'settings', 'mandatory': True, 'priority': 10, 'target': {'departments': ['Finance Ops', 'Studio'], 'users': [MEM]}})
    m.evaluate("()=>document.querySelector('.wm-tab[data-view=\"approval-center\"]').click()"); m.wait_for_timeout(3500)
    check('a survey published mid-session: the next request shows the intro (not the login screen)', gate_step(m) == 'intro' and m.evaluate("()=>getComputedStyle(document.getElementById('wmAuthScreen')).display") == 'none', gate_step(m))
    all_errs += e5; c5.close()
    J(admin, 'PUT', '/api/surveys', {'id': sid, 'action': 'settings', 'mandatory': True, 'priority': 10, 'target': {'departments': ['Finance Ops']}})

    # ------------------------------------------------------------ mobile + dark (UIAC08 / UIAC10)
    J(admin, 'PUT', '/api/surveys', {'id': sid, 'action': 'settings', 'mandatory': True, 'priority': 10, 'target': {'departments': ['Finance Ops'], 'users': [PM]}})
    c6, mob, e6 = new_ctx(b, 390, 844, 'dark'); login_gated(mob, PM)
    mob.evaluate("()=>document.documentElement.setAttribute('data-rx-mode','dark')")
    check('mobile: intro shown for the targeted PM', gate_step(mob) == 'intro', gate_step(mob))
    box = fullscreen_box(mob, '.sv-intro'); check('UIAC08 mobile intro: full width, no horizontal overflow', box['w'] == box['vw'] and not box['overflow'], box)
    mob.screenshot(path=f'{OUT}/10-mobile-dark-intro.png')
    mob.click('[data-start]'); mob.wait_for_timeout(1200); mob.evaluate("()=>document.documentElement.setAttribute('data-rx-mode','dark')")
    box = fullscreen_box(mob, '.sv-form')
    nb = mob.evaluate("()=>{const r=document.querySelector('[data-next]').getBoundingClientRect(); return [r.top, r.bottom, innerHeight]}")
    check('UIAC08 mobile form: 100vw, no overflow, Next reachable in the viewport', box['w'] == box['vw'] and not box['overflow'] and nb[1] <= nb[2] and nb[0] >= 0, (box, nb))
    bg = mob.evaluate("()=>getComputedStyle(document.querySelector('.sv-form')).backgroundColor")
    check('UIAC10 dark mode applies to the mandatory form', bg != 'rgb(243, 246, 251)' and bg != 'rgb(255, 255, 255)', bg)
    mob.screenshot(path=f'{OUT}/11-mobile-dark-form.png')
    all_errs += e6; c6.close()
    J(admin, 'PUT', '/api/surveys', {'id': sid, 'action': 'settings', 'mandatory': True, 'priority': 10, 'target': {'departments': ['Finance Ops']}})

    # ------------------------------------------------------------ analytics / export / versioning
    admin.goto(f'{BASE}/#survey/analytics/{sid}'); admin.wait_for_timeout(2500)
    check('Analytics: one valid response, choice bars with counts', admin.inner_text('.sv-kpi >> nth=0').split('\n')[1].strip() == '1' and admin.locator('.sv-hbars li').count() >= 4)
    admin.screenshot(path=f'{OUT}/12-analytics.png')
    with admin.expect_download() as dl: admin.click('[data-exp=csv]')
    path = dl.value.path(); csv = open(path, encoding='utf-8-sig').read()
    check('CSV export with User ID column (authenticated survey)', csv.startswith('Response ID') and 'User ID' in csv.split('\n')[0] and acct['user']['id'] in csv, csv[:200])
    admin.click('[data-tab=responses]'); admin.wait_for_timeout(300)
    check('responses list shows the respondent to the owner', 'Minh Anh Do' in admin.inner_text('#svAnBody'))
    admin.goto(f'{BASE}/#survey/builder/{sid}'); admin.wait_for_timeout(2000)
    admin.click('[data-add="short"]'); admin.fill('#pTitle', 'One word for your team'); admin.wait_for_timeout(200)
    admin.click('[data-publish]'); admin.wait_for_timeout(1500); admin.evaluate("()=>document.getElementById('wmConfirmOk').click()"); admin.wait_for_timeout(1800)
    s = J(admin, 'GET', f'/api/surveys?id={sid}')['json']['survey']
    check('re-publishing after an edit creates version 2 (answers stay on version 1)', s['version'] == 2, s['version'])

    # ------------------------------------------------------------ non-mandatory survey for me + public survey page
    pub = J(admin, 'POST', '/api/surveys', {'action': 'create', 'name': 'Canteen feedback', 'mode': 'public', 'template': 'training'})['json']['id']
    J(admin, 'POST', '/api/surveys', {'action': 'publish', 'id': pub})
    c7, anon, e7 = new_ctx(b, 390, 844)
    anon.goto(f'{BASE}/survey.html?id={pub}'); anon.wait_for_timeout(1500)
    check('public survey opens without signing in, no account shown', anon.locator('.sv-form').count() == 1 and 'linked to your signed-in' not in anon.inner_text('body'))
    for i in range(8):
        answer_current(anon)
        if anon.locator('[data-submit]').count(): break
        anon.click('[data-next]'); anon.wait_for_timeout(200)
    anon.click('[data-submit]'); anon.wait_for_timeout(1500)
    check('public answer saved (thank-you page)', 'Thank you' in anon.inner_text('body'))
    all_errs += e7; c7.close()
    inv = J(admin, 'POST', '/api/surveys', {'action': 'create', 'name': 'Team lunch poll', 'template': 'blank'})['json']['id']
    J(admin, 'PUT', '/api/surveys', {'id': inv, 'questions': [{'type': 'single', 'title': 'Friday or Saturday?', 'required': True, 'options': ['Friday', 'Saturday']}]})
    J(admin, 'POST', '/api/surveys', {'action': 'publish', 'id': inv})
    c8, mm, e8 = new_ctx(b); login_as(mm, MEM)
    mm.click('#rexusLauncherButton'); mm.wait_for_timeout(300); mm.click('[data-rexus-app="survey"]'); mm.wait_for_timeout(1500)
    check('a Member sees "Surveys for you" and no builder', 'Team lunch poll' in mm.inner_text('#svMain') and mm.locator('#svSide a').count() == 1)
    mm.click('[data-go="answer/' + inv + '"]'); mm.wait_for_timeout(1200)
    mm.click('.sv-option >> nth=0'); mm.click('[data-submit]'); mm.wait_for_timeout(1500)
    check('Member answers a non-mandatory survey and returns to the overview', 'Team lunch poll' not in mm.inner_text('#svMain') and mm.evaluate('location.hash') == '#survey/overview')
    # My Account personal information
    mm.click('#rexusLauncherButton'); mm.wait_for_timeout(300); mm.click('[data-rexus-app="rexus"]'); mm.wait_for_timeout(800)
    mm.evaluate("()=>{const e=document.querySelector('#wmUserMenu [data-action=\"my-account\"]'); e&&e.click();}"); mm.wait_for_timeout(1500)
    check('My Account has the Personal information card', mm.locator('#rxMyPersonal .sv-profile').count() == 1)
    mm.fill('#rxMyPersonal #pf_date_of_birth', '1995-03-03'); mm.select_option('#rxMyPersonal #pf_education_level', 'Postgraduate'); mm.click('#rxMyPersonal [type=submit]'); mm.wait_for_timeout(1200)
    r = J(mm, 'GET', '/api/onboarding')['json']['values']
    check('self-service personal information saved from My Account', r.get('education_level') == 'Postgraduate', r)
    all_errs += e8; c8.close()

    # ------------------------------------------------------------ admin: employee profiles + reset password + fields
    admin.goto(f'{BASE}/#survey/profiles/{acct["user"]["id"]}'); admin.wait_for_timeout(2500)
    check('Employee Profiles: status + personal information for System Admin', 'Completed' in admin.inner_text('#svPersonStatus') and admin.input_value('#pf_date_of_birth') == '1997-08-14')
    admin.screenshot(path=f'{OUT}/13-employee-profile.png')
    admin.click('#svPersonStatus [data-reset]'); admin.wait_for_timeout(300); admin.evaluate("()=>document.getElementById('wmConfirmOk').click()"); admin.wait_for_timeout(1200)
    txt = admin.evaluate("()=>{const n=document.querySelector('.rx-notify'); return n?n.textContent:''}")
    check('reset password shows the temporary password once and waits for OK', 'Temporary password' in txt and admin.locator('.rx-notify [data-ok]').count() == 1, txt)
    admin.click('.rx-notify [data-ok]')
    admin.goto(f'{BASE}/#survey/fields'); admin.wait_for_timeout(2000)
    admin.uncheck('tr[data-key=gender] input[name=visible]')
    check('a hidden field cannot be required (UI)', admin.is_disabled('tr[data-key=gender] input[name=required]'))
    admin.click('[data-save]'); admin.wait_for_timeout(1200)
    f = J(admin, 'GET', '/api/profile-fields')['json']['fields']
    check('field configuration saved', next(x for x in f if x['key'] == 'gender')['visible'] is False)
    admin.check('tr[data-key=gender] input[name=visible]'); admin.click('[data-save]'); admin.wait_for_timeout(800)
    all_errs += errs; ctx.close()
    check('No JavaScript errors', not all_errs, all_errs[:5])
    b.close()
print(f"\n{sum(1 for _, ok in results if ok)}/{len(results)} passed")
