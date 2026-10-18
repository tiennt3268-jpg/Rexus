"""REXUS v2.2.2 end-to-end UI tests (Requirement V2.1.2): Chromium → test server → real Netlify Function handlers → PGlite.
usage: python3 e2e222.py [base_url] [screenshot_dir]   (start tests/v2.2.1/backend/server.mjs first, on a fresh database)"""
import sys, os, re
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8899'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'shots-222'
os.makedirs(OUT, exist_ok=True)
results = []
def check(name, cond, detail=''):
    results.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else '  → ' + str(detail)[:300]))

ADMIN, MEM, PT, PM = 'ADMIN_TIENNT', 'U_TRUONGPN', 'U_VYNHA', 'U_MINCT'
# Records whether the login screen was ever visible before the app (GEN-05).
WATCH_AUTH = """
window.__authSeen = false;
(function tick(){ var a = document.getElementById('wmAuthScreen'); if (a && getComputedStyle(a).display !== 'none' && a.getBoundingClientRect().height > 0) window.__authSeen = true;
  if (!document.querySelector('.wm-app') || getComputedStyle(document.querySelector('.wm-app')).display === 'none') requestAnimationFrame(tick); })();
"""
def ctx_page(b, uid=None, width=1440, height=900, scheme='light', watch=False):
    ctx = b.new_context(viewport={'width': width, 'height': height}, color_scheme=scheme)
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)[:200]))
    page.route(re.compile(r'^https?://(?!localhost).*'), lambda r: r.fulfill(status=200, body=''))
    if watch: page.add_init_script(WATCH_AUTH)
    if uid:
        page.goto(f'{BASE}/__test/login?uid={uid}&to=/')
        page.wait_for_selector('.wm-app', state='visible', timeout=20000); page.wait_for_timeout(1200)
    return ctx, page, errs
def go(page, view): page.evaluate("(v)=>{const t=document.querySelector('.wm-tab[data-view=\"'+v+'\"]'); t&&t.click();}", view); page.wait_for_timeout(900)
def menu(page, action): page.evaluate("(a)=>{const e=document.querySelector('#wmUserMenu [data-action=\"'+a+'\"]'); e&&e.click();}", action); page.wait_for_timeout(1300)
def hr(page, tab): go(page, 'organization'); page.evaluate("(t)=>document.querySelector('#rxHrTabs [data-tab=\"'+t+'\"]').click()", tab); page.wait_for_timeout(1300)
def toast(page): return page.evaluate("()=>{const l=window.REXUSNotify&&REXUSNotify.last;return l&&Date.now()-l.at<6000?l.text:''}")  # v2.2.3 GEN-10: shared centred notification
def sync_text(page): return page.evaluate("()=>{const s=document.getElementById('wmSync');return s?s.textContent:''}")

with sync_playwright() as p:
    b = p.chromium.launch()
    all_errs = []

    # ------------------------------------------------------------------ GEN-05 login / English
    ctx, page, errs = ctx_page(b, ADMIN, watch=True)
    page.reload(); page.wait_for_selector('.wm-app', state='visible'); page.wait_for_timeout(800)
    check('GEN-05 signed-in reload never shows the old login screen', page.evaluate('window.__authSeen') is False)
    check('GEN-05 launcher heading in English', 'My applications' in page.inner_text('.rx-launcher-heading') and 'ỨNG' not in page.content())
    all_errs += errs; ctx.close()
    ctx, page, errs = ctx_page(b, None)
    page.goto(BASE + '/'); page.wait_for_selector('#wmAuthScreen', state='visible', timeout=15000); page.wait_for_timeout(500)
    head_bg = page.evaluate("getComputedStyle(document.querySelector('.wm-auth-head')).backgroundColor")
    check('GEN-05 signed-out visitor gets the current (restyled) login screen', head_bg != 'rgb(18, 50, 92)', head_bg)
    page.screenshot(path=f'{OUT}/login@1440.png'); all_errs += errs; ctx.close()

    # GEN-05: sign in through the form, refresh, sign out, and session expiry (no stale screens, auth code intact)
    ctx, page, errs = ctx_page(b, ADMIN)
    acct = page.evaluate("""()=>fetch('/api/admin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({full_name:'Login Tester',email:'login.tester@ueh.edu.vn',username:'login.tester'})}).then(r=>r.json())""")
    ctx.close()
    ctx, page, errs = ctx_page(b, None, watch=True)
    page.goto(BASE + '/'); page.wait_for_selector('#wmAuthScreen', state='visible', timeout=15000)
    page.fill('#wmAuthIdentifier', 'login.tester'); page.fill('#wmAuthPassword', acct.get('temp_password', '')); page.click('#wmAuthSubmit')
    page.wait_for_selector('.wm-app', state='visible', timeout=15000); page.wait_for_timeout(800)
    check('GEN-05 sign in with username through the form', page.locator('#wmAuthScreen').is_hidden())
    page.add_init_script(WATCH_AUTH); page.reload(); page.wait_for_selector('.wm-app', state='visible'); page.wait_for_timeout(800)
    check('GEN-05 refresh keeps the session without flashing the login screen', page.evaluate('window.__authSeen') is False)
    ctx.clear_cookies(); go(page, 'approval-center'); page.wait_for_timeout(1500)
    check('GEN-05 expired session returns to the login screen', page.locator('#wmAuthScreen').is_visible())
    page.fill('#wmAuthIdentifier', 'login.tester'); page.fill('#wmAuthPassword', acct.get('temp_password', '')); page.click('#wmAuthSubmit')
    page.wait_for_selector('.wm-app', state='visible', timeout=15000); page.wait_for_timeout(800)
    page.evaluate("()=>document.getElementById('wmUserMenuBtn').click()"); page.wait_for_timeout(300)
    page.evaluate("()=>{const e=document.querySelector('#wmUserMenu [data-action=\"logout\"]'); e&&e.click();}"); page.wait_for_timeout(1800)
    check('GEN-05 sign out shows the login screen', page.locator('#wmAuthScreen').is_visible() and page.evaluate("fetch('/api/auth/me').then(r=>r.json()).then(j=>j.user)") is None)
    all_errs += errs; ctx.close()

    # ------------------------------------------------------------------ GEN-06 / GEN-04
    ctx, page, errs = ctx_page(b, ADMIN)
    go(page, 'projects'); page.evaluate("()=>{const c=document.querySelector('.wm-project-card,[data-open-project],.wm-project-row'); c&&c.click();}"); page.wait_for_timeout(2000)
    body = page.inner_text('#view-project-detail') if page.locator('#view-project-detail').count() else page.inner_text('.wm-body')
    check('GEN-06 no "Interactive Gantt (drag to reschedule)" section or drag chart', 'drag to reschedule' not in body.lower() and page.locator('#pdGanttChart, .gantt .bar-wrapper').count() == 0)
    check('GEN-06 Gantt timeline still shows bars and dependency links', page.locator('.rx-gt-bar').count() > 0 and page.locator('.rx-gt-link').count() >= 1)
    go(page, 'approval-center')
    check('GEN-04 redundant page subtitle removed (Approval Center)', page.locator('.rx-page-head p').count() == 0)
    go(page, 'project-financials')
    check('GEN-04 helpful guidance kept (Project Finance budget note)', page.locator('.rx-page-head p').count() == 1)

    # ------------------------------------------------------------------ GEN-07 column resize
    go(page, 'all'); page.wait_for_timeout(500)
    th = page.locator('.wm-view:visible table thead th').nth(2); h = th.locator('.rx-col-resizer')
    w0 = th.bounding_box()['width']; bb = h.bounding_box()
    page.mouse.move(bb['x'] + 4, bb['y'] + bb['height'] / 2); page.mouse.down(); page.mouse.move(bb['x'] + 104, bb['y'] + bb['height'] / 2, steps=5); page.mouse.up(); page.wait_for_timeout(200)
    w1 = th.bounding_box()['width']
    td = page.locator('.wm-view:visible table tbody tr').first.locator('td').nth(2).bounding_box()['width']
    check('GEN-07 drag a header edge widens the column; cells stay aligned', w1 > w0 + 80 and abs(td - w1) < 2, (w0, w1, td))
    h.focus(); page.keyboard.press('ArrowRight'); page.wait_for_timeout(100)
    check('GEN-07 keyboard resize (Arrow Right)', th.bounding_box()['width'] >= w1 + 15)
    page.reload(); page.wait_for_selector('.wm-app', state='visible'); page.wait_for_timeout(1200); go(page, 'all')
    th = page.locator('.wm-view:visible table thead th').nth(2)
    check('GEN-07 width remembered after reload (per browser)', th.bounding_box()['width'] >= w1 + 10, th.bounding_box()['width'])
    th.locator('.rx-col-resizer').dblclick(); page.wait_for_timeout(200)
    check('GEN-07 double-click resets the column', abs(th.bounding_box()['width'] - w0) < 25, (th.bounding_box()['width'], w0))
    check('GEN-07 no page-level horizontal overflow', page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth'))

    # ------------------------------------------------------------------ GEN-03 dark mode (server-saved)
    menu(page, 'my-account')
    check('GEN-03 Appearance offers Light / Dark / System', page.locator('[data-mode-choice]').count() == 3)
    page.click('[data-mode-choice="dark"]'); page.wait_for_timeout(800)
    check('GEN-03 switching to Dark applies immediately (no sign-out / reload)', page.evaluate("document.documentElement.getAttribute('data-rx-mode')") == 'dark')
    page.screenshot(path=f'{OUT}/my-account-dark@1440.png', full_page=True)
    page.reload(); page.wait_for_selector('.wm-app', state='visible'); page.wait_for_timeout(1000)
    check('GEN-03 theme kept after reload', page.evaluate("document.documentElement.getAttribute('data-rx-mode')") == 'dark')
    all_errs += errs; ctx.close()
    ctx, page, errs = ctx_page(b, ADMIN)   # fresh browser profile: no localStorage
    page.wait_for_timeout(800)
    check('GEN-03 mode follows the account to a new browser', page.evaluate("document.documentElement.getAttribute('data-rx-mode')") == 'dark')
    menu(page, 'my-account'); page.click('[data-mode-choice="system"]'); page.wait_for_timeout(800)
    check('GEN-03 System follows the OS (light here)', page.evaluate("document.documentElement.getAttribute('data-rx-mode')") == 'light')
    all_errs += errs; ctx.close()
    ctx, page, errs = ctx_page(b, ADMIN, scheme='dark'); page.wait_for_timeout(800)
    check('GEN-03 System follows the OS (dark here)', page.evaluate("document.documentElement.getAttribute('data-rx-mode')") == 'dark')
    menu(page, 'my-account'); page.click('[data-mode-choice="light"]'); page.wait_for_timeout(600)
    all_errs += errs; ctx.close()

    # ------------------------------------------------------------------ ACC-03 admin self-profile
    ctx, page, errs = ctx_page(b, ADMIN)
    menu(page, 'my-account')
    check('ACC-03 admin can edit own username / email / position / department', all(page.locator(s).count() == 1 for s in ['#wmAccountUsername', '#wmAccountEmail', '#wmAccountPosition', '#wmAccountDepartment']))
    page.fill('#wmAccountPosition', 'Teaching Assistant (QA)'); page.fill('#wmAccountUsername', 'Bad Name'); page.click('#wmAccountSaveBtn'); page.wait_for_timeout(500)
    check('ACC-03 invalid username shows a clear inline error', 'Username must be' in page.inner_text('#wmAccountError'))
    page.fill('#wmAccountUsername', 'tiennt'); page.click('#wmAccountSaveBtn'); page.wait_for_timeout(1500)
    page.reload(); page.wait_for_selector('.wm-app', state='visible'); page.wait_for_timeout(1000); menu(page, 'my-account')
    check('ACC-03 saved values shown after reload', page.input_value('#wmAccountPosition') == 'Teaching Assistant (QA)')
    check('ACC-03 role stays read-only', page.locator('#view-my-account select, #view-my-account input[id*=Role]').count() == 0 and 'System Admin' in page.inner_text('#view-my-account'))

    # ------------------------------------------------------------------ ACC-01 / ACC-02
    menu(page, 'configuration')
    page.click('#cfgAddEmployeeBtn'); page.fill('#cfgEmpNewFullName', 'Trần Thị QA Đức'); page.fill('#cfgEmpNewEmail', 'qa.duc@ueh.edu.vn')
    check('ACC-01 username suggested from the full name', page.input_value('#cfgEmpNewUsername') == 'tran.thi.qa.duc', page.input_value('#cfgEmpNewUsername'))
    page.fill('#cfgEmpNewUsername', 'tiennt'); page.click('#cfgEmpNewSubmit'); page.wait_for_timeout(1000)
    check('ACC-01 duplicate username refused with a clear message', 'already taken' in page.inner_text('#cfgEmpNewError'))
    page.fill('#cfgEmpNewUsername', 'qa.duc'); page.click('#cfgEmpNewSubmit'); page.wait_for_timeout(1500)
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    page.fill('#cfgEmpSearch', 'qa.duc'); page.wait_for_timeout(400)
    check('ACC-01 new account listed with its username', 'qa.duc' in page.inner_text('#cfgEmpTableWrap'))
    check('ACC-02 no delete button on your own row', page.locator('.wm-cfg-emp-row[data-emp-id="ADMIN_TIENNT"] [data-delete-emp]').count() == 0)
    page.click('[data-delete-emp]'); page.wait_for_timeout(500)
    dlg = page.locator('.rx-dialog, .rx-page.active .rx-page-form').last
    dlg.locator('input[name=confirm]').fill('qa'); dlg.locator('button[type=submit]').click(); page.wait_for_timeout(400)
    check('ACC-02 confirmation must match the username', dlg.locator('.rx-form-error').is_visible() and page.locator('.rx-dialog, .rx-page.active .rx-page-form').count() >= 1)
    page.screenshot(path=f'{OUT}/delete-account@1440.png')
    dlg.locator('input[name=confirm]').fill('qa.duc'); dlg.locator('button[type=submit]').click(); page.wait_for_timeout(1500)
    check('ACC-02 deleted account disappears from the list', 'qa.duc' not in page.inner_text('#cfgEmpTableWrap'))
    page.check('#cfgEmpShowDeleted'); page.wait_for_timeout(400)
    check('ACC-02 shown under "Show deleted accounts" with Restore', 'qa.duc' in page.inner_text('#cfgEmpTableWrap') and page.locator('[data-restore-emp]').count() >= 1)
    page.click('[data-restore-emp]'); page.wait_for_timeout(1500)
    check('ACC-02 restore brings it back', 'qa.duc' not in page.inner_text('#cfgEmpTableWrap'))
    all_errs += errs; ctx.close()

    # ------------------------------------------------------------------ HRM-04 settings, HRM-02/03 full-time, HRM-05 request
    ctx, page, errs = ctx_page(b, ADMIN)
    hr(page, 'schedules'); page.fill('#rxMinHours', '40'); page.click('#rxMinForm button[type=submit]'); page.wait_for_timeout(800)
    check('HRM-04 admin sets the part-time minimum', 'minimum saved' in toast(page).lower(), toast(page))
    all_errs += errs; ctx.close()

    ctx, page, errs = ctx_page(b, MEM)
    hr(page, 'capacity')
    check('HRM-02 full-time sees Monthly Schedule with regular (read-only) + OT per day', page.locator('.rx-cap-reg-ro').count() >= 28 and page.locator('.rx-cap-ot').count() >= 28 and page.locator('.rx-cap-hours').count() == 0)
    page.click('#rxCapNext'); page.wait_for_timeout(1200)
    cell = page.locator('.rx-cap-cell').filter(has=page.locator('.rx-cap-reg-ro', has_text='8')).first
    cell.locator('.rx-cap-ot').fill('2'); page.click('#rxCapSave'); page.wait_for_timeout(1200)
    check('HRM-03 OT saved separately from regular hours', '2 h OT' in toast(page), toast(page))
    check('HRM-03 summary shows regular and OT apart', 'Overtime' in page.inner_text('#rxCapContent') and '2 h' in page.locator('.rx-metric').nth(1).inner_text())
    page.click('#rxCapView [data-tab="list"]'); page.wait_for_timeout(300)
    page.locator('.rx-cap-note-l').first.fill('Client visit'); page.click('#rxCapSave'); page.wait_for_timeout(1200)
    page.click('#rxCapView [data-tab="list"]'); page.wait_for_timeout(300)
    check('HRM-02 a note per day is saved', page.locator('.rx-cap-note-l').first.input_value() == 'Client visit')
    all_errs += errs; ctx.close()

    ctx, page, errs = ctx_page(b, PT)
    hr(page, 'capacity'); page.click('#rxCapNext'); page.wait_for_timeout(1200)
    page.locator('.rx-cap-hours').first.fill('4'); page.click('#rxCapSave'); page.wait_for_timeout(1200)
    check('HRM-04 part-time below the minimum gets a warning', page.locator('.rx-banner-warn').count() == 1 and '40 h' in page.inner_text('.rx-banner-warn'))
    page.screenshot(path=f'{OUT}/hr-parttime-minimum@1440.png', full_page=True)
    all_errs += errs; ctx.close()

    ctx, page, errs = ctx_page(b, PM)
    hr(page, 'capacity'); page.click('#rxCapTabs [data-tab="team"]'); page.wait_for_timeout(1500)
    page.click('#rxTeamCapNext'); page.wait_for_timeout(1500)
    check('HRM-02 manager sees each person\'s regular capacity, OT and minimum', all(x in page.inner_text('#rxTeamCapTable').lower() for x in ['regular capacity', 'overtime', 'registered / minimum']))
    check('HRM-04 manager sees the part-time shortfall', page.locator('.rx-warn-text').count() >= 1)
    page.click('#rxSendReq'); page.wait_for_timeout(400)
    dlg = page.locator('.rx-dialog, .rx-page.active .rx-page-form').last
    dlg.locator('input[name=note]').fill('Please plan next month'); dlg.locator('button[type=submit]').click(); page.wait_for_timeout(1500)
    check('HRM-05 request sent to everyone managed', 'Request sent to' in toast(page), toast(page))
    check('HRM-05 status per person shows the request', 'Sent' in page.inner_text('#rxTeamCapTable'))
    page.click('#rxSendReq'); page.wait_for_timeout(400); page.locator('.rx-dialog, .rx-page.active .rx-page-form').last.locator('button[type=submit]').click(); page.wait_for_timeout(1500)
    check('HRM-05 sending again re-sends instead of duplicating', 're-sent' in toast(page) and '×2' in page.inner_text('#rxTeamCapTable'), toast(page))
    page.screenshot(path=f'{OUT}/hr-team@1440.png', full_page=True)
    all_errs += errs; ctx.close()

    ctx, page, errs = ctx_page(b, MEM)
    page.click('#wmNotifBellBtn'); page.wait_for_timeout(1000)
    item = page.locator('.wm-notif-item[data-entity-type="schedule_request"]').first
    check('HRM-05 employee gets an in-app notification', item.count() == 1)
    item.click(); page.wait_for_timeout(1800)
    check('HRM-05 notification opens the right month\'s form with the request banner', page.locator('.rx-banner-info').count() >= 1 and 'Please plan next month' in page.inner_text('.rx-banner-info'))
    all_errs += errs; ctx.close()

    # ------------------------------------------------------------------ DOC-01/02/03
    ctx, page, errs = ctx_page(b, ADMIN)
    page.evaluate("()=>document.querySelector('[data-rexus-app=\"document\"]').click()"); page.wait_for_timeout(1500)
    if page.locator('[data-rd="space"]').count() == 0:
        page.evaluate("()=>document.querySelector('[data-rd=\"new-space\"]').click()"); page.wait_for_timeout(500)
        page.fill('#rdDialogForm input[name=name]', 'QA Space'); page.click('#rdDialogForm [type=submit]'); page.wait_for_timeout(1500)
    page.evaluate("()=>{const s=document.querySelector('[data-rd=\"space\"]'); s&&s.click();}"); page.wait_for_timeout(1200)
    t = page.locator('[data-rd="toggle-section"]').first
    t.click(); page.wait_for_timeout(300)
    check('DOC-01 sidebar section hides on click (aria-expanded=false)', page.evaluate("document.getElementById('rdSec-space').hidden") and page.locator('[data-rd="toggle-section"]').first.get_attribute('aria-expanded') == 'false')
    page.locator('[data-rd="toggle-section"]').first.focus(); page.keyboard.press('Enter'); page.wait_for_timeout(300)
    check('DOC-01 keyboard (Enter) shows it again', not page.evaluate("document.getElementById('rdSec-space').hidden"))
    page.evaluate("()=>document.querySelector('[data-rd=\"new-page\"]').click()"); page.wait_for_timeout(600)
    w = page.evaluate("document.querySelector('.rd-dialog').getBoundingClientRect().width")
    check('DOC-02 New page dialog is wide enough on desktop', w >= 560, w)
    page.fill('#rdDialogForm input[name=title]', 'QA Page'); page.click('#rdDialogForm [type=submit]'); page.wait_for_timeout(1800)
    if page.locator('#rdRichSurface').count():
        page.click('#rdRichSurface'); page.keyboard.type('Seamless'); page.wait_for_timeout(200)
        st = page.evaluate("()=>{const s=getComputedStyle(document.getElementById('rdRichSurface')), t=getComputedStyle(document.querySelector('input.rd-paper-title')); return {o:s.outlineStyle, sh:s.boxShadow, tb:t.borderTopWidth+' '+t.borderLeftWidth}}")
        check('DOC-03 no box around the writing area or title while typing', st['o'] == 'none' and st['sh'] == 'none' and st['tb'] == '0px 0px', st)
    else:
        check('DOC-03 editor opened', False, 'no editor')
    all_errs += errs; ctx.close()
    ctx, page, errs = ctx_page(b, ADMIN, width=375, height=800)
    page.evaluate("()=>document.querySelector('[data-rexus-app=\"document\"]').click()"); page.wait_for_timeout(1500)
    page.evaluate("()=>{const s=document.querySelector('[data-rd=\"space\"]'); s&&s.click();}"); page.wait_for_timeout(1000)
    page.evaluate("()=>document.querySelector('[data-rd=\"new-page\"]').click()"); page.wait_for_timeout(600)
    r = page.evaluate("()=>{const r=document.querySelector('.rd-dialog').getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom, innerWidth, innerHeight]}")
    check('DOC-02 dialog stays inside the viewport on mobile', r[0] >= 0 and r[1] <= r[4] and r[2] >= 0 and r[3] <= r[5], r)
    all_errs += errs; ctx.close()

    check('No JavaScript page errors in any v2.2.2 flow', not all_errs, all_errs[:3])
    b.close()

passed = sum(1 for _, ok in results if ok)
print(f'\n{passed}/{len(results)} e2e checks passed')
sys.exit(0 if passed == len(results) else 1)
