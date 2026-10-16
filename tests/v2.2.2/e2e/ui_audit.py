"""REXUS v2.2.2 UI audit: walks every main screen in a given theme/mode and reports
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

def click(page, sel, wait=800):
    page.evaluate("(s)=>{const e=document.querySelector(s); e&&e.click();}", sel); page.wait_for_timeout(wait)

def close_modals(page):
    page.keyboard.press('Escape'); page.wait_for_timeout(250); page.keyboard.press('Escape'); page.wait_for_timeout(250)

SCREENS = [
    ('overview', lambda p: go(p, 'overview')),
    ('all-tasks', lambda p: go(p, 'all')),
    ('projects', lambda p: go(p, 'projects')),
    ('project-detail', lambda p: (go(p, 'projects'), click(p, '.wm-project-card, [data-open-project], .wm-project-row', 1800))),
    ('worklog', lambda p: go(p, 'worklog')),
    ('calendar', lambda p: go(p, 'calendar')),
    ('hr-employees', lambda p: (go(p, 'organization'), p.fill('#rxEmpQ', 'a'), p.wait_for_timeout(900))),
    ('hr-leave', lambda p: (go(p, 'organization'), click(p, '#rxHrTabs [data-tab="leave"]', 1000))),
    ('hr-capacity', lambda p: (go(p, 'organization'), click(p, '#rxHrTabs [data-tab="capacity"]', 1000))),
    ('hr-team', lambda p: (go(p, 'organization'), click(p, '#rxHrTabs [data-tab="team"]', 1000))),
    ('resource-planning', lambda p: go(p, 'resource-planning')),
    ('approval-center', lambda p: go(p, 'approval-center')),
    ('finance', lambda p: go(p, 'finance')),
    ('project-financials', lambda p: go(p, 'project-financials')),
    ('my-account', lambda p: (p.evaluate("()=>{const e=document.querySelector('#wmUserMenu [data-action=\"my-account\"]'); e&&e.click();}"), p.wait_for_timeout(1300))),
    ('user-menu', lambda p: (go(p, 'overview'), click(p, '#wmUserMenuBtn', 500))),
    ('notifications', lambda p: (close_modals(p), click(p, '#wmNotifBtn, .wm-notif-btn', 700))),
    ('new-task-modal', lambda p: (close_modals(p), go(p, 'all'), click(p, '#wmNewTaskBtn, .wm-new-btn', 1000))),
    ('launcher', lambda p: (close_modals(p), click(p, '#rexusLauncherButton', 600))),
    ('documents', lambda p: (close_modals(p), click(p, '[data-rexus-app="document"]', 1800))),
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
