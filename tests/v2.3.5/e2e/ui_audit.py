"""REXUS v2.3.5 UI audit (adds dashboard tabs + timeline, project list performance, task/subtask read mode, global edit, More menu, clone/convert/archived dialogs) (v2.3.4 set: sign-in, calendar picker/week/day, worklog grid, notification Important tab, builder section) (v2.3.0 screens, with the HRM employee record, HR Settings and slimmed Configuration replacing the moved screens): walks every main screen in a given theme/mode and reports
 - text whose contrast against its real (composited) background is below 3:1 (fail) or 4.5:1 (warn)
 - large light surfaces left inside dark mode
 - page-level horizontal overflow and JavaScript errors
usage: python3 ui_audit.py <base_url> <out_dir> <mode light|dark> <theme mono|navy> [width]"""
import sys, os, json, re
from playwright.sync_api import sync_playwright

BASE, OUT, MODE, THEME = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
WIDTH = int(sys.argv[5]) if len(sys.argv) > 5 else 1440
os.makedirs(OUT, exist_ok=True)

AUDIT_JS = r"""
(dark) => {
  const parse = (c) => { const m = c && c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return {r:p[0], g:p[1], b:p[2], a: p.length > 3 ? p[3] : 1}; };
  const over = (top, under) => { const a = top.a + under.a * (1 - top.a); if (!a) return {r:0,g:0,b:0,a:0};
    return {r:(top.r*top.a + under.r*under.a*(1-top.a))/a, g:(top.g*top.a + under.g*under.a*(1-top.a))/a, b:(top.b*top.a + under.b*under.a*(1-top.a))/a, a}; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }; return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05); };
  const canvas = parse(getComputedStyle(document.documentElement).backgroundColor) || {r:255,g:255,b:255,a:1};
  const base = canvas.a ? canvas : (dark ? {r:15,g:19,b:25,a:1} : {r:255,g:255,b:255,a:1});
  function bgOf(el) {
    const layers = [];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 0.98) break; }
      else if (cs.backgroundImage && cs.backgroundImage !== 'none' && e !== document.body && e !== document.documentElement && !e.classList.contains('wm-app')) return null; // image/gradient: unknown
    }
    let acc = base; for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i], acc);
    return acc;
  }
  const name = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.classList.length ? '.' + [...el.classList].slice(0,3).join('.') : '')).slice(0, 70);
  const fails = [], warns = [], seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const t = n.nodeValue.trim(); if (!t) continue;
    const el = n.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    if (el.closest('script,style,noscript,svg,[aria-hidden="true"],.rx-sr-only,.wm-sr-only')) continue;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight * 3) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || +cs.opacity === 0 || el.offsetParent === null && cs.position !== 'fixed') continue;
    let op = 1; for (let e = el; e; e = e.parentElement) op *= +getComputedStyle(e).opacity; if (op < 0.4) continue;
    const fg = parse(cs.color); if (!fg) continue;
    const bg = bgOf(el); if (!bg) continue;
    const c = ratio(over(fg, bg), bg);
    const item = {el: name(el), text: t.slice(0, 40), ratio: Math.round(c*100)/100, fg: cs.color, bg: `rgb(${bg.r|0},${bg.g|0},${bg.b|0})`};
    if (c < 3) fails.push(item); else if (c < 4.5) warns.push(item);
  }
  const light = [];
  if (dark) {
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const c = parse(cs.backgroundColor); if (!c || c.a < 0.5) continue;
      const r = el.getBoundingClientRect(); if (r.width * r.height < 1500 || r.bottom < 0 || r.top > innerHeight * 3 || el.offsetParent === null && cs.position !== 'fixed') continue;
      const b = bgOf(el); if (b && lum(b) > 0.45) light.push({el: name(el), bg: cs.backgroundColor, area: Math.round(r.width*r.height)});
    }
  }
  return {fails: fails.slice(0, 40), failCount: fails.length, warnCount: warns.length, warns: warns.slice(0, 15), light: light.slice(0, 25), lightCount: light.length,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth};
}
"""

def setup(page):
    page.evaluate("([m,t])=>{try{localStorage.setItem('rexus-mode',m);localStorage.setItem('rexus-theme',t);}catch(e){} const h=document.documentElement; h.setAttribute('data-rx-mode-pref',m); h.setAttribute('data-rx-mode',m); h.setAttribute('data-rx-theme',t);}", [MODE, THEME])

def go(page, view):
    page.evaluate("(v)=>{const t=document.querySelector('.wm-tab[data-view=\"'+v+'\"]'); t&&t.click();}", view); page.wait_for_timeout(900)

SEQ = __import__('itertools').count(1)   # unique query → every screen that navigates gets a full page load (no state left from the previous screen)

def click(page, sel, wait=800):
    page.evaluate("(s)=>{const e=document.querySelector(s); e&&e.click();}", sel); page.wait_for_timeout(wait)

def close_modals(page):
    page.keyboard.press('Escape'); page.wait_for_timeout(250); page.keyboard.press('Escape'); page.wait_for_timeout(250)


GATE = {}
def gate_setup(p):
    """Admin creates an account and a mandatory survey for it, then signs out and signs in as that account."""
    J = lambda m, u, b=None: p.evaluate("([m,u,b])=>fetch(u,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined}).then(r=>r.json())", [m, u, b])
    a = J('POST', '/api/admin/users', {'full_name': 'Audit Gate', 'email': 'audit.gate.%s@ueh.edu.vn' % MODE + THEME + str(WIDTH), 'username': ('audit.gate.' + MODE + THEME + str(WIDTH))[:32], 'department': 'Audit Dept', 'position': 'Analyst'})
    sv = J('POST', '/api/surveys', {'action': 'create', 'name': 'Audit pulse', 'template': 'engagement', 'description': 'Contrast check of the mandatory flow.'})
    J('PUT', '/api/surveys', {'id': sv['id'], 'action': 'settings', 'mandatory': True, 'target': {'users': [a['user']['id']]}})
    J('POST', '/api/surveys', {'action': 'publish', 'id': sv['id']})
    J('POST', '/api/auth/logout', {})
    p.goto(BASE + '/'); p.wait_for_selector('#wmAuthScreen', state='visible', timeout=15000)
    p.fill('#wmAuthIdentifier', a['user']['username']); p.fill('#wmAuthPassword', a['temp_password']); p.click('#wmAuthSubmit'); p.wait_for_timeout(1800)
    GATE['pw'] = a['temp_password']
def gate_profile(p):
    p.fill('#pw_current_password', GATE['pw']); p.fill('#pw_new_password', 'AuditGate2026'); p.fill('#pw_confirm_password', 'AuditGate2026'); p.click('.sv-pw [type=submit]'); p.wait_for_timeout(1800)
    p.click('.sv-profile [type=submit]'); p.wait_for_timeout(900)   # show the field errors too
def gate_intro(p):
    p.fill('#pf_date_of_birth', '1990-01-01'); p.select_option('#pf_education_level', 'Bachelor'); p.click('.sv-profile [type=submit]'); p.wait_for_timeout(1800)

SCREENS = [
    ('overview', lambda p: go(p, 'overview')),
    ('all-tasks', lambda p: go(p, 'all')),
    ('projects', lambda p: go(p, 'projects')),
    ('project-detail', lambda p: (go(p, 'projects'), click(p, '.wm-project-card, [data-open-project], .wm-project-row', 1800))),
    # v2.3.5
    ('projects-list-perf', lambda p: (go(p, 'projects'), click(p, '[data-pj-mode="list"]', 800))),
    ('dashboard-tabs', lambda p: (go(p, 'overview'), click(p, '#rxDashTab-upcoming', 500))),
    ('dashboard-gantt', lambda p: (go(p, 'overview'), p.evaluate("()=>{const g=document.querySelector('.rx-gantt'); g&&g.scrollIntoView()}"), p.wait_for_timeout(400))),
    ('task-read', lambda p: (p.goto(BASE + '/?n=' + str(next(SEQ)) + '#/f/task?id=T_DEV01'), p.wait_for_timeout(2500))),
    ('task-activity', lambda p: (p.evaluate("()=>{const a=document.querySelector('#wmDetailActivity'); a&&a.scrollIntoView()}"), p.wait_for_timeout(500))),
    ('task-edit-all', lambda p: (p.goto(BASE + '/?n=' + str(next(SEQ)) + '#/f/task?id=T_DEV01'), p.wait_for_timeout(2500), click(p, '#wmDetailActions [data-act=edit]', 600))),
    ('task-more-menu', lambda p: (p.goto(BASE + '/?n=' + str(next(SEQ)) + '#/f/task?id=T_DEV01'), p.wait_for_timeout(2500), click(p, '#wmDetailActions [data-act=more]', 500))),
    ('task-clone-dialog', lambda p: click(p, '[data-menu=clone]', 600)),
    ('task-convert-dialog', lambda p: (p.goto(BASE + '/?n=' + str(next(SEQ)) + '#/f/task?id=T_DEV01'), p.wait_for_timeout(2500), click(p, '#wmDetailActions [data-act=more]', 300), click(p, '[data-menu=convert]', 600))),
    ('subtask-read', lambda p: (p.evaluate("()=>fetch('/api/subtasks').then(r=>r.json()).then(j=>{location.href='/?n=st'+Date.now()+'#/f/subtask?id='+j.subtasks[0].id})"), p.wait_for_timeout(3500))),
    ('archived-dialog', lambda p: (go(p, 'all'), click(p, '#rxArchivedBtn', 1200))),
    ('worklog', lambda p: go(p, 'worklog')),
    ('calendar', lambda p: go(p, 'calendar')),
    ('calendar-picker', lambda p: click(p, '#calTitleBtn', 600)),
    ('calendar-week', lambda p: (p.keyboard.press('Escape'), click(p, '[data-mode="week"]', 900))),
    ('calendar-day', lambda p: click(p, '[data-mode="day"]', 900)),
    ('worklog-grid', lambda p: (go(p, 'worklog'), p.evaluate("()=>{const b=[...document.querySelectorAll('#view-worklog button')].find(x=>x.textContent.trim()==='Grid'); b&&b.click()}"), p.wait_for_timeout(900))),
    ('hr-employees', lambda p: (go(p, 'organization'), p.fill('#rxEmpQ', 'a'), p.wait_for_timeout(900))),
    ('hr-leave', lambda p: (go(p, 'organization'), click(p, '#rxHrTabs [data-tab="leave"]', 1000))),
    ('hr-capacity', lambda p: (go(p, 'organization'), click(p, '#rxHrTabs [data-tab="capacity"]', 1000))),
    ('hr-team', lambda p: (go(p, 'organization'), click(p, '#rxHrTabs [data-tab="team"]', 1000))),
    ('resource-planning', lambda p: (go(p, 'organization'), click(p, '#rxHrTabs [data-tab="resources"]', 1500))),
    ('approval-center', lambda p: go(p, 'approval-center')),
    ('finance', lambda p: go(p, 'finance')),
    ('project-financials', lambda p: (go(p, 'finance'), click(p, '[data-fin-mode="financials"]', 1500))),
    ('my-account', lambda p: (p.evaluate("()=>{const e=document.querySelector('#wmUserMenu [data-action=\"my-account\"]'); e&&e.click();}"), p.wait_for_timeout(1300))),
    ('user-menu', lambda p: (go(p, 'overview'), click(p, '#wmUserMenuBtn', 500))),
    ('notifications', lambda p: (close_modals(p), click(p, '#wmNotifBellBtn', 900))),
    ('notif-important', lambda p: click(p, '[data-notif-filter="important"]', 700)),
    ('new-task-modal', lambda p: (close_modals(p), go(p, 'all'), click(p, '#wmNewTaskBtn, .wm-new-btn', 1000))),
    # v2.2.3
    ('page-request-schedules', lambda p: (p.goto(BASE + '/?n=' + str(next(SEQ)) + '#/f/hr-request-schedules'), p.wait_for_timeout(2500), p.evaluate("()=>{const r=document.querySelector('.rx-page.active input[name=scope][value=selected]'); r&&r.click()}"))),
    ('page-leave', lambda p: (p.goto(BASE + '/?n=' + str(next(SEQ)) + '#/f/hr-leave-new'), p.wait_for_timeout(2500))),
    ('page-approval-search', lambda p: (p.goto(BASE + '/?n=' + str(next(SEQ)) + '#/f/approval-new'), p.wait_for_timeout(2500), click(p, '.rx-page.active .rx-combo.is-multi .rx-combo-btn', 300), p.keyboard.type('ng'), p.wait_for_timeout(500))),
    ('notify-error', lambda p: (p.keyboard.press('Escape'), p.evaluate("()=>{REXUSNotify('Could not save: network error', 'error');}"), p.wait_for_timeout(400))),
    ('notify-success', lambda p: (p.keyboard.press('Escape'), p.evaluate("()=>{REXUSNotify('Task saved', 'success', {duration: 60000});}"), p.wait_for_timeout(400))),
    # v2.3.0 REXUS Survey workspace
    ('survey-overview', lambda p: (p.evaluate("()=>fetch('/api/surveys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create',name:'Audit survey',template:'engagement'})}).then(r=>r.json()).then(j=>fetch('/api/surveys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'publish',id:j.id})}))"), p.goto(BASE + '/?n=' + str(next(SEQ)) + '#survey/overview'), p.wait_for_timeout(2500))),
    ('survey-list', lambda p: (p.goto(BASE + '/?n=' + str(next(SEQ)) + '#survey/list'), p.wait_for_timeout(2500))),
    ('survey-builder', lambda p: (p.goto(BASE + '/?n=' + str(next(SEQ)) + '#survey/list'), p.wait_for_timeout(2000), click(p, '#svTable .sv-row-title', 2500))),
    ('survey-builder-section', lambda p: click(p, '[data-add="section"]', 900)),
    ('survey-settings', lambda p: (click(p, '#svSide a[href^="#survey/settings"]', 2500))),
    ('survey-analytics', lambda p: (click(p, '#svSide a[href^="#survey/analytics"]', 2500))),
    # v2.3.1 HRM employee record (replaces Survey → Employee Profiles / Profile Fields and Configuration → Employees / Hourly Rates)
    ('emp-overview', lambda p: (p.goto(BASE + '/?fresh=1#/overview'), p.wait_for_selector('.wm-app', state='visible'), p.wait_for_timeout(1800), p.evaluate("()=>REXUS221.openEmployee('U_TRUONGPN')"), p.wait_for_timeout(2500))),
    ('emp-employment', lambda p: click(p, '#rxEmpTabs [data-tab="employment"]', 1500)),
    ('emp-personal', lambda p: click(p, '#rxEmpTabs [data-tab="personal"]', 1500)),
    ('emp-compensation', lambda p: click(p, '#rxEmpTabs [data-tab="compensation"]', 1800)),
    ('emp-account', lambda p: click(p, '#rxEmpTabs [data-tab="account"]', 1500)),
    ('hr-accounts', lambda p: (p.evaluate("()=>REXUS221.openEmployee(null)"), p.wait_for_timeout(2000), p.evaluate("()=>{const a=document.getElementById('rxAccounts'); a&&a.scrollIntoView()}"), p.wait_for_timeout(300))),
    ('hr-settings', lambda p: (p.evaluate("()=>REXUS221.openHrSettings()"), p.wait_for_timeout(2000), p.evaluate("()=>{const a=document.getElementById('rxProfileFields'); a&&a.scrollIntoView()}"), p.wait_for_timeout(300))),
    ('configuration', lambda p: (p.goto(BASE + '/?n=' + str(next(SEQ)) + '#/configuration'), p.wait_for_timeout(2000), p.evaluate("()=>{const a=document.querySelector('.rx-cfg-moved'); a&&a.scrollIntoView()}"), p.wait_for_timeout(300))),
    ('launcher', lambda p: (close_modals(p), p.goto(BASE + '/?n=' + str(next(SEQ)) + '#/overview'), p.wait_for_timeout(2000), click(p, '#rexusLauncherButton', 600))),
    ('documents', lambda p: (close_modals(p), click(p, '[data-rexus-app="document"]', 1800))),
    # v2.3.0 First Login + mandatory survey (signs in as a new account; keep these last)
    ('gate-password', gate_setup),
    ('gate-profile', gate_profile),
    ('gate-intro', gate_intro),
    ('gate-form', lambda p: (click(p, '[data-start]', 1500), click(p, '[data-next]', 400))),
    ('login', lambda p: (p.context.clear_cookies(), p.goto(BASE + '/?signed-out=1'), p.wait_for_timeout(1800))),
]

report = {}
with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': WIDTH, 'height': 900 if WIDTH > 600 else 800})
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)[:200]))
    page.route(re.compile(r'^https?://(?!localhost).*'), lambda r: r.fulfill(status=200, body='', content_type='text/css' if 'font' in r.request.url else 'application/javascript'))
    page.goto(f'{BASE}/__test/login?uid=ADMIN_TIENNT&to=/')
    page.wait_for_selector('.wm-app', state='visible', timeout=20000); page.wait_for_timeout(1500)
    setup(page)
    only = os.environ.get('ONLY')
    for name, nav in SCREENS:
        if only and name not in only.split(','): continue
        try:
            nav(page); setup(page); page.wait_for_timeout(300)
            res = page.evaluate(AUDIT_JS, MODE == 'dark')
        except Exception as e:
            res = {'error': str(e)[:200]}
        report[name] = res
        page.screenshot(path=f'{OUT}/{name}-{THEME}-{MODE}@{WIDTH}.png', full_page=False)
        if 'error' in res: print(f'{name:20s} ERROR {res["error"]}'); continue
        print(f'{name:20s} fail<3={res["failCount"]:3d} warn<4.5={res["warnCount"]:3d} light={res["lightCount"]:3d} overflow={res["overflow"]}')
    report['_errors'] = errs
    print('JS errors:', errs[:5])
    b.close()
json.dump(report, open(f'{OUT}/audit-{THEME}-{MODE}-{WIDTH}.json', 'w'), indent=1)
