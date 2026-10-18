"""REXUS v2.2.3 end-to-end UI tests (Requirement V2.1.3: GEN-08…12): Chromium → test server → real Netlify Function handlers → PGlite.
usage: python3 e2e223.py [base_url] [screenshot_dir]   (start tests/v2.2.1/backend/server.mjs first)"""
import sys, os, re
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8899'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'shots-223'
ONLY = os.environ.get('ONLY', '')
os.makedirs(OUT, exist_ok=True)
results = []
def check(name, cond, detail=''):
    results.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else '  → ' + str(detail)[:300]), flush=True)
def want(sec): return not ONLY or sec in ONLY.split(',')

ADMIN, MEM, PM = 'ADMIN_TIENNT', 'U_TRUONGPN', 'U_MINCT'
def ctx_page(b, uid=None, width=1440, height=900, scheme='light'):
    ctx = b.new_context(viewport={'width': width, 'height': height}, color_scheme=scheme)
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)[:200]))
    page.route(re.compile(r'^https?://(?!localhost).*'), lambda r: r.fulfill(status=200, body=''))
    if uid:
        page.goto(f'{BASE}/__test/login?uid={uid}&to=/')
        page.wait_for_selector('.wm-app', state='visible', timeout=20000); page.wait_for_timeout(1200)
    return ctx, page, errs
def go(page, view): page.evaluate("(v)=>{const t=document.querySelector('.wm-tab[data-view=\"'+v+'\"]'); t&&t.click();}", view); page.wait_for_timeout(900)
def hr(page, tab): go(page, 'organization'); page.evaluate("(t)=>document.querySelector('#rxHrTabs [data-tab=\"'+t+'\"]').click()", tab); page.wait_for_timeout(1300)
def page_title(page): return page.evaluate("()=>{const t=document.querySelector('.rx-page.active .rx-page-title, .rx-page-host.active .rx-page-title');return t?t.textContent:''}")
def crumbs(page): return page.evaluate("()=>[...document.querySelectorAll('.wm-view.active .rx-breadcrumb li')].map(l=>l.textContent.trim()).join(' › ')")
import unicodedata
def REPLACE_FOLD(x): return ''.join(c for c in unicodedata.normalize('NFD', x) if unicodedata.category(c) != 'Mn').replace('đ','d').replace('Đ','D').lower()
def overlay_open(page): return page.evaluate("()=>!!document.querySelector('.wm-modal-overlay.open')")

with sync_playwright() as p:
    b = p.chromium.launch()
    all_errs = []
    if want('09'):
        ctx, page, errs = ctx_page(b, ADMIN)
        # --- Request schedules (the screen from the requirement) becomes a page
        hr(page, 'capacity')
        page.evaluate("()=>{const t=document.querySelector('#rxCapTabs [data-tab=\"team\"]'); t&&t.click()}"); page.wait_for_timeout(1300)
        page.evaluate("()=>{const f=document.getElementById('rxTeamCapFilter'); f.value='Draft'; f.dispatchEvent(new Event('change'))}")
        page.click('#rxSendReq'); page.wait_for_timeout(600)
        check('GEN-09 Request schedules opens as a page, not a pop-up', page_title(page).startswith('Request schedules') and not overlay_open(page), page_title(page))
        check('GEN-09 page has its own URL', page.evaluate('location.hash').startswith('#/f/hr-request-schedules?month='), page.evaluate('location.hash'))
        check('GEN-09 breadcrumb HRM › Monthly Schedule › Request schedules', crumbs(page).startswith('HRM › Monthly Schedule › Request schedules'), crumbs(page))
        foot = page.evaluate("()=>{const f=document.querySelector('.rx-page.active .wm-modal-footer');return f?getComputedStyle(f).position:''}")
        check('GEN-09 action buttons are sticky', foot == 'sticky', foot)
        page.screenshot(path=f'{OUT}/gen09-request-schedules-page.png')
        # Back keeps the filter of the previous screen
        page.click('.rx-page.active [data-rx-back]'); page.wait_for_timeout(600)
        check('GEN-09 Back returns to Team Schedules with its filter kept', page.evaluate("()=>document.getElementById('rxTeamCapFilter') && document.getElementById('rxTeamCapFilter').value") == 'Draft' and page.evaluate('location.hash') == '#/organization', page.evaluate('location.hash'))
        # Unsaved-changes guard
        page.click('#rxSendReq'); page.wait_for_timeout(600)
        page.fill('.rx-page.active input[name=note]', 'Please register')
        page.click('.rx-page.active [data-rx-back]'); page.wait_for_timeout(500)
        dlg = page.evaluate("()=>{const o=document.querySelector('.wm-modal-overlay.open');return o?o.textContent:''}")
        check('GEN-09 leaving with unsaved changes asks first', 'unsaved' in dlg.lower(), dlg)
        page.evaluate("()=>{const o=document.querySelector('.wm-modal-overlay.open'); const c=[...o.querySelectorAll('button')].find(b=>/cancel|stay|keep/i.test(b.textContent)); c&&c.click()}"); page.wait_for_timeout(400)
        check('GEN-09 cancelling the warning stays on the page with the input', page.evaluate("()=>{const i=document.querySelector('.rx-page.active input[name=note]');return i?i.value:''}") == 'Please register')
        # Browser Back with unsaved changes → native confirm (dismiss keeps the page)
        page.once('dialog', lambda d: d.dismiss())
        page.go_back(); page.wait_for_timeout(600)
        check('GEN-09 browser Back with unsaved changes can be cancelled', page_title(page).startswith('Request schedules'), page.evaluate('location.hash'))
        # Refresh keeps the page; Back then lands on the parent
        page.evaluate("()=>{const i=document.querySelector('.rx-page.active input[name=note]'); i.value=''; }")
        page.evaluate("()=>REXUSPages.markClean()")
        page.reload(); page.wait_for_selector('.wm-app', state='visible'); page.wait_for_timeout(2500)
        check('GEN-09 refresh reopens the page', page_title(page).startswith('Request schedules'), page.evaluate('location.hash'))
        page.go_back(); page.wait_for_timeout(1500)
        check('GEN-09 after refresh, browser Back lands on HRM', page.evaluate('location.hash') == '#/organization' and page.evaluate("()=>document.querySelector('.wm-view.active').id") == 'view-organization', page.evaluate('location.hash'))
        # Submit from the page
        page.click('#rxSendReq'); page.wait_for_timeout(600)
        page.click('.rx-page.active button[type=submit]'); page.wait_for_timeout(1500)
        check('GEN-09 submitting closes the page and returns to the list', not page.evaluate("()=>!!document.querySelector('.rx-page.active')") and page.evaluate('location.hash') == '#/organization', page.evaluate('location.hash'))
        all_errs += errs
        # New tab / shared link to other forms
        for route, title, parent in [('approval-new', 'New approval request', 'view-approval-center'), ('approval-rule-new', 'Add routing rule', 'view-approval-center'),
                                     ('approval-delegation-new', 'Delegate my approvals', 'view-approval-center'), ('hr-leave-new', 'New leave request', 'view-organization'),
                                     ('hr-employment?user=U_TRUONGPN', 'Employment', 'view-organization'), ('project-new', 'New project', None), ('task-new', 'New task', None)]:
            pg = ctx.new_page(); pg.on('pageerror', lambda e: all_errs.append(str(e)[:200]))
            pg.goto(f'{BASE}/#/f/{route}'); pg.wait_for_selector('.wm-app', state='visible'); pg.wait_for_timeout(2500)
            t = pg.evaluate("()=>{const t=document.querySelector('.wm-view.active .rx-page-title, .wm-view.active .wm-modal-head h3, .wm-view.active h2');return t?t.textContent:''}")
            check(f'GEN-09 direct link #/f/{route} opens "{title}"', title.lower() in (t or '').lower() and not overlay_open(pg), t)
            if parent:
                pg.go_back(); pg.wait_for_timeout(1200)
                check(f'GEN-09 Back from {route} lands on its screen', pg.evaluate("()=>document.querySelector('.wm-view.active').id") == parent, pg.evaluate('location.hash'))
            pg.close()
        ctx.close()

        # --- nested pages: All Tasks → task detail → log time → Back → Back
        ctx, page, errs = ctx_page(b, ADMIN)
        go(page, 'all'); page.evaluate("()=>{const f=document.getElementById('atSearch')||document.querySelector('#view-all input[type=search], #view-all input[placeholder^=\"Search\"]'); if(f){f.value='';}}")
        tid = page.evaluate("()=>{const r=document.querySelector('#view-all [data-id]'); return r?r.getAttribute('data-id'):''}")
        page.evaluate("(id)=>REXUSDeepLink('task', id)", tid); page.wait_for_timeout(900)
        check('GEN-09 task detail is a page with breadcrumb All Tasks › …', page.evaluate('location.hash').startswith('#/f/task?id=') and crumbs(page).startswith('All Tasks'), (page.evaluate('location.hash'), crumbs(page)))
        page.click('#dLogWorkBtn'); page.wait_for_timeout(800)
        check('GEN-09 log time opens as a nested page on top of the task', page.evaluate('location.hash').startswith('#/f/worklog-new') and page.evaluate("()=>REXUSPages.current() && document.querySelectorAll('.rx-page-host').length") >= 2, page.evaluate('location.hash'))
        page.go_back(); page.wait_for_timeout(800)
        check('GEN-09 browser Back returns to the task page', page.evaluate('location.hash').startswith('#/f/task?id=') and page.evaluate("()=>document.querySelector('.wm-view.active').id") == 'view-task-detail', page.evaluate('location.hash'))
        page.click('#view-task-detail [data-rx-back]'); page.wait_for_timeout(800)
        check('GEN-09 Back again lands on All Tasks', page.evaluate("()=>document.querySelector('.wm-view.active').id") == 'view-all', page.evaluate('location.hash'))
        # --- finance form page keeps the ledger tab underneath
        go(page, 'finance'); page.evaluate("()=>{const b=[...document.querySelectorAll('#view-finance button')].find(x=>/project financ/i.test(x.textContent)); b&&b.click()}"); page.wait_for_timeout(1500)
        page.evaluate("()=>{const r=document.querySelector('#fnList tr[data-i]'); r&&r.click()}"); page.wait_for_timeout(1500)
        page.evaluate("()=>{const t=document.querySelector('#fnTabs [data-tab=\"ledger\"]'); t&&t.click()}"); page.wait_for_timeout(1200)
        page.evaluate("()=>{const f=document.getElementById('fnLStatus'); f.value='Draft'; f.dispatchEvent(new Event('change'))}")
        if page.locator('#fnAddExpense').count():
            page.click('#fnAddExpense'); page.wait_for_timeout(600)
            check('GEN-09 Add expense is a page under Project Finance', page.evaluate('location.hash').startswith('#/f/finance-transaction-new?owner=') and crumbs(page).startswith('Project Finance'), (page.evaluate('location.hash'), crumbs(page)))
            u = page.url
            p2 = ctx.new_page(); p2.goto(u); p2.wait_for_selector('.wm-app', state='visible'); p2.wait_for_timeout(2500)
            check('GEN-09 the same link opens the expense form in a new tab', 'Add expense' in (p2.evaluate("()=>{const t=document.querySelector('.rx-page.active .rx-page-title');return t?t.textContent:''}") or ''))
            p2.close()
            page.click('.rx-page.active [data-rx-back]'); page.wait_for_timeout(600)
            check('GEN-09 Back returns to the ledger with its filter', page.evaluate("()=>{const f=document.getElementById('fnLStatus');return f?f.value:''}") == 'Draft')
        all_errs += errs; ctx.close()
        # Permission: a member cannot open the admin-only routing-rule page by link
        ctx, page, errs = ctx_page(b, MEM)
        page.goto(f'{BASE}/#/f/approval-rule-new'); page.wait_for_selector('.wm-app', state='visible'); page.wait_for_timeout(2500)
        check('GEN-09 permissions unchanged: member cannot open routing-rule page by link', not page.evaluate("()=>!!document.querySelector('.rx-page.active')") and page.evaluate('location.hash') == '#/approval-center', page.evaluate('location.hash'))
        all_errs += errs; ctx.close()

    if want('08'):
        ctx, page, errs = ctx_page(b, ADMIN)
        # --- Checkbox list: Request schedules recipients
        page.goto(f'{BASE}/#/f/hr-request-schedules'); page.wait_for_timeout(2500)
        page.check('.rx-page.active input[name=scope][value=selected]')
        q = '.rx-page.active .rx-pick-q'
        check('GEN-08 recipients list has a search box at the top', page.locator(q).count() == 1)
        vis = lambda: page.evaluate("()=>[...document.querySelectorAll('.rx-page.active .rx-req-people label')].filter(l=>!l.hidden).map(l=>l.textContent.trim())")
        total = len(vis())
        page.fill(q, 'nguyen hoang'); page.wait_for_timeout(450)
        v = vis(); check('GEN-08 live filter, no diacritics needed ("nguyen hoang" → Nguyễn Hoàng…)', len(v) >= 1 and all('Nguyễn Hoàng' in x for x in v), v)
        page.fill(q, 'NGUYỄN HOÀNG'); page.wait_for_timeout(450)
        check('GEN-08 case-insensitive, with diacritics too', vis() == v, vis())
        u = page.evaluate("()=>fetch('/api/users').then(r=>r.json())")
        users = u.get('users', u) if isinstance(u, dict) else u
        target = next((x for x in users if x.get('id') == 'U_TRUONGPN'), None)
        if target and target.get('username'):
            page.fill(q, target['username']); page.wait_for_timeout(450)
            check('GEN-08 matches username', any((target.get('full_name') or '') in x for x in vis()), (target['username'], vis()))
        page.fill(q, 'nguyen'); page.wait_for_timeout(450); n_ng = len(vis())
        page.click('.rx-page.active .rx-pick-bar [data-all]')
        cnt = page.inner_text('.rx-page.active .rx-pick-count')
        checked = page.evaluate("()=>[...document.querySelectorAll('.rx-page.active .rx-req-people input:checked')].length")
        check('GEN-08 "Select all" applies to the filtered results only', checked == n_ng and cnt.startswith(str(n_ng) + ' selected'), (checked, n_ng, cnt))
        page.fill(q, 'zzzz-no-match'); page.wait_for_timeout(450)
        check('GEN-08 empty state "No results found"', page.is_visible('.rx-page.active .rx-pick-empty') and 'No results found' in page.inner_text('.rx-page.active .rx-pick-empty'))
        page.fill(q, ''); page.wait_for_timeout(450)
        check('GEN-08 selections are kept when the query changes', page.evaluate("()=>[...document.querySelectorAll('.rx-page.active .rx-req-people input:checked')].length") == n_ng and len(vis()) == total)
        page.click('.rx-page.active .rx-pick-bar [data-clear]')
        check('GEN-08 "Clear" empties the selection', page.inner_text('.rx-page.active .rx-pick-count').startswith('0 selected'))
        page.screenshot(path=f'{OUT}/gen08-recipients.png')
        # keyboard: ArrowDown from search → first person, Enter toggles
        page.focus(q); page.keyboard.press('ArrowDown'); page.keyboard.press('Enter'); page.wait_for_timeout(200);
        check('GEN-08 keyboard: arrows move into the list, Enter selects', page.inner_text('.rx-page.active .rx-pick-count').startswith('1 selected'))
        page.evaluate("()=>REXUSPages.markClean()"); page.click('.rx-page.active [data-rx-back]'); page.wait_for_timeout(500)
        # --- Multi-select: approvers on New approval request
        page.goto(f'{BASE}/#/f/approval-new'); page.wait_for_timeout(2500)
        btn = '.rx-page.active select[name=approvers] ~ .rx-combo-btn, .rx-page.active .rx-combo.is-multi .rx-combo-btn'
        check('GEN-08 approvers multi-select is searchable', page.locator('.rx-page.active .rx-combo.is-multi').count() == 1)
        page.click('.rx-page.active .rx-combo.is-multi .rx-combo-btn'); page.wait_for_timeout(200)
        check('GEN-08 focus goes to the search box when the list opens', page.evaluate("()=>document.activeElement.classList.contains('rx-combo-q')"))
        page.keyboard.type('tran'); page.wait_for_timeout(450)
        opts = page.evaluate("()=>[...document.querySelectorAll('.rx-combo-pop .rx-combo-opt')].map(o=>o.textContent)")
        check('GEN-08 combobox filters without diacritics ("tran" → Trần/Trân…)', len(opts) >= 1 and all('tran' in REPLACE_FOLD(o) for o in opts), opts)
        page.keyboard.press('ArrowDown'); page.keyboard.press(' '); page.keyboard.press('Escape'); page.wait_for_timeout(200)
        sel = page.evaluate("()=>[...document.querySelector('.rx-page.active select[name=approvers]').selectedOptions].length")
        check('GEN-08 keyboard Space selects; the native field holds the value', sel == 1, sel)
        check('GEN-08 Esc closes the list and returns focus to the field', page.evaluate("()=>document.activeElement.classList.contains('rx-combo-btn') && !document.querySelector('.rx-combo-pop')"))
        page.screenshot(path=f'{OUT}/gen08-approvers.png')
        page.click('.rx-page.active .rx-combo.is-multi .rx-combo-btn'); page.wait_for_timeout(200)
        page.keyboard.type('qqqq'); page.wait_for_timeout(450)
        check('GEN-08 combobox empty state', page.is_visible('.rx-combo-pop .rx-combo-empty'))
        page.keyboard.press('Escape')
        # --- Single select: Delegate (>7 users)
        page.evaluate("()=>REXUSPages.markClean()")
        page.goto(f'{BASE}/#/f/approval-delegation-new'); page.wait_for_timeout(2500)
        page.click('.rx-page.active select[name=delegate] + .rx-combo-btn, .rx-page.active .rx-combo:has(select[name=delegate]) .rx-combo-btn')
        page.wait_for_timeout(200); page.keyboard.type('vy'); page.wait_for_timeout(450); page.keyboard.press('Enter'); page.wait_for_timeout(200)
        val = page.evaluate("()=>{const s=document.querySelector('.rx-page.active select[name=delegate]');return [s.value, s.options[s.selectedIndex].text]}")
        lab = page.inner_text('.rx-page.active .rx-combo:has(select[name=delegate]) .rx-combo-label')
        check('GEN-08 single select: type + Enter picks the match and shows it', val[0] != '' and lab == val[1], (val, lab))
        # --- Large list performance (150 options)
        t = page.evaluate("""()=>{const s=document.createElement('select'); s.id='perfSel'; for(let i=0;i<150;i++){const o=document.createElement('option'); o.value=i; o.text='Người dùng số '+i; s.appendChild(o);} document.querySelector('.rx-page.active .wm-modal-body').appendChild(s); return true}""")
        page.wait_for_timeout(300)
        ms = page.evaluate("""async()=>{const b=document.querySelector('#perfSelPick'); const t0=performance.now(); b.click(); const q=document.querySelector('.rx-combo-pop .rx-combo-q'); q.value='nguoi dung so 1'; q.dispatchEvent(new Event('input')); await new Promise(r=>setTimeout(r,320)); const n=document.querySelectorAll('.rx-combo-pop .rx-combo-opt').length; return [performance.now()-t0-300, n]}""")
        check('GEN-08 150-item list opens and filters fast (< 150 ms excl. debounce)', ms[0] < 150 and ms[1] == 61, ms)
        # --- legacy user picker (task form assignee): diacritics + keyboard
        page.evaluate("()=>REXUSPages.markClean()")
        page.goto(f'{BASE}/#/f/task-new'); page.wait_for_timeout(2500)
        inp = page.locator('#view-task-form input[id$=AssigneeSearch]').first
        inp.click(); inp.fill('nguyen hoang'); page.wait_for_timeout(300)
        names = page.evaluate("()=>[...document.querySelectorAll('#view-task-form [id$=AssigneeDropdown] [data-uid] .wm-upi-name')].filter(e=>e.offsetParent).map(e=>e.textContent)")
        check('GEN-08 task-form people picker ignores diacritics', len(names) >= 1 and all('Nguyễn Hoàng' in n for n in names), names)
        page.keyboard.press('ArrowDown'); page.keyboard.press('ArrowDown'); page.keyboard.press('Enter'); page.wait_for_timeout(200)   # first row is "— Unassigned —"
        hid = page.evaluate("()=>{const s=document.querySelector('#view-task-form input[id$=AssigneeSearch]'); const i=document.getElementById(s.id.replace(/Search$/,''));return i?i.value:''}")
        check('GEN-08 task-form people picker: arrows + Enter pick a person', hid != '', hid)
        inp.fill('zzzz'); page.wait_for_timeout(200)
        check('GEN-08 task-form people picker empty state', 'No results found' in page.inner_text('#view-task-form [id$=AssigneeDropdown]'))
        all_errs += errs; ctx.close()

    if want('10'):
        ctx, page, errs = ctx_page(b, ADMIN)
        cur = lambda: page.evaluate("()=>{const l=[...document.querySelectorAll('.rx-notify-layer:not(.is-out)')]; if(!l.length) return null; const n=l[l.length-1].querySelector('.rx-notify'), r=n.getBoundingClientRect(); return {n:l.length, cls:l[l.length-1].className, role:n.getAttribute('role'), live:n.getAttribute('aria-live'), text:n.textContent, cx:r.left+r.width/2, cy:r.top+r.height/2, w:innerWidth, h:innerHeight, ok:!!n.querySelector('[data-ok]')}}")
        # a real success: save a leave draft
        page.goto(f'{BASE}/#/f/hr-leave-new'); page.wait_for_timeout(2500)
        page.click('.rx-page.active button[data-action=save]'); page.wait_for_timeout(700)
        c = cur()
        check('GEN-10 success result shows in the centre of the screen', c and 'rx-notify-success' in c['cls'] and abs(c['cx'] - c['w'] / 2) < 4 and abs(c['cy'] - c['h'] / 2) < 40, c)
        check('GEN-10 success has an icon, short English text and role=status', c and c['role'] == 'status' and c['live'] == 'polite' and 'Draft saved' in c['text'] and 'Success' in c['text'], c)
        check('GEN-10 the old corner/ring popup is gone', page.evaluate("()=>!document.getElementById('wmConfirmPopup')"))
        page.screenshot(path=f'{OUT}/gen10-success.png')
        page.wait_for_timeout(2300)
        check('GEN-10 success closes by itself after ~2.5 s', cur() is None)
        page.evaluate("()=>{REXUSNotify('Saved', 'success');}"); page.wait_for_timeout(200); page.keyboard.press('Escape'); page.wait_for_timeout(300)
        check('GEN-10 Esc closes a success notification early', cur() is None)
        page.evaluate("()=>{REXUSNotify('Saved', 'success');}"); page.wait_for_timeout(200); page.click('.rx-notify'); page.wait_for_timeout(300)
        check('GEN-10 click closes a success notification early', cur() is None)
        # a real error: the network fails while saving
        hr(page, 'leave'); page.click('#rxNewLeave'); page.wait_for_timeout(1200)
        page.route('**/api/hr/leave', lambda r: r.abort() if r.request.method == 'POST' else r.continue_())
        page.click('.rx-page.active button[data-action=save]'); page.wait_for_timeout(800)
        err_inline = page.evaluate("()=>{const e=document.querySelector('.rx-page.active .rx-form-error');return e&&!e.hidden?e.textContent:''}")
        page.unroute('**/api/hr/leave')
        check('GEN-10 a failed form submit keeps the message at the form (inline), not a pop-up', err_inline != '' and cur() is None, (err_inline, cur()))
        page.evaluate("()=>REXUSPages.markClean()"); page.click('.rx-page.active [data-rx-back]'); page.wait_for_timeout(500)
        # an action error from a list (cancel leave fails) → centred error that waits for OK
        page.route('**/api/hr/leave', lambda r: r.abort() if r.request.method == 'POST' else r.continue_())
        page.evaluate("()=>{const b=document.querySelector('[data-cancel]'); b&&b.click()}"); page.wait_for_timeout(500)
        page.evaluate("()=>{const o=document.querySelector('.wm-modal-overlay.open'); const ok=o&&[...o.querySelectorAll('button[type=submit]')][0]; ok&&ok.click()}"); page.wait_for_timeout(900)
        page.unroute('**/api/hr/leave')
        c = cur()
        check('GEN-10 network error shows a centred Error with OK (role=alert)', c and 'rx-notify-error' in c['cls'] and c['ok'] and c['role'] == 'alert' and c['live'] == 'assertive', c)
        check('GEN-10 focus moves to OK', page.evaluate("()=>document.activeElement && document.activeElement.hasAttribute('data-ok')"))
        page.screenshot(path=f'{OUT}/gen10-error.png')
        page.wait_for_timeout(3000)
        check('GEN-10 error does not close by itself', cur() is not None)
        page.evaluate("()=>{REXUSNotify('Second message', 'warning');}"); page.wait_for_timeout(300)
        c = cur(); check('GEN-10 a new notification replaces the old one (never stacked)', c and c['n'] == 1 and 'Second message' in c['text'] and 'rx-notify-warning' in c['cls'], c)
        page.keyboard.press('Enter'); page.wait_for_timeout(300)
        check('GEN-10 OK closes a warning', cur() is None)
        r = page.evaluate("()=>{let ran=false; REXUSNotify('Could not load', 'error', {action:{label:'Retry', run:()=>{window.__retried=true}}}); return true}"); page.wait_for_timeout(200)
        page.click('.rx-notify [data-act]'); page.wait_for_timeout(200)
        check('GEN-10 error can offer an action (Retry)', page.evaluate('window.__retried === true') and cur() is None)
        # legacy screens use the same component (showSync result + showAlert)
        page.evaluate("()=>{const t=document.querySelector('.wm-tab[data-view=\"all\"]'); t.click()}"); page.wait_for_timeout(800)
        sync_kept = page.evaluate("()=>!!document.getElementById('wmSync')")
        check('GEN-10 background progress keeps the small corner indicator', sync_kept)
        # dark + mobile
        page.evaluate("()=>document.documentElement.setAttribute('data-rx-mode','dark')"); page.set_viewport_size({'width': 375, 'height': 760})
        page.evaluate("()=>{REXUSNotify('Could not save: network error', 'error');}"); page.wait_for_timeout(300)
        c = cur(); box = page.evaluate("()=>{const r=document.querySelector('.rx-notify').getBoundingClientRect();return [r.left, r.right, getComputedStyle(document.querySelector('.rx-notify')).backgroundColor]}")
        check('GEN-10 fits a phone screen in dark mode', box[0] >= 8 and box[1] <= 367 and box[2] != 'rgb(255, 255, 255)', box)
        page.screenshot(path=f'{OUT}/gen10-error-dark-mobile.png')
        page.keyboard.press('Escape')
        all_errs += errs; ctx.close()

    if want('12'):
        ctx, page, errs = ctx_page(b, ADMIN)
        CONTRAST = r"""()=>{const parse=c=>c.match(/[\d.]+/g).map(Number); const lum=c=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2])};
          const out=[]; document.querySelectorAll('.wm-view.active .rx-chip, .wm-view.active .wm-badge, .wm-view.active .wm-status-badge').forEach(e=>{const cs=getComputedStyle(e); const bg=parse(cs.backgroundColor), fg=parse(cs.color); if(bg.length>3&&bg[3]<1) {out.push({t:e.textContent, err:'transparent bg'}); return;}
            const a=lum(bg),b=lum(fg); out.push({t:e.textContent.trim(), r:Math.round((Math.max(a,b)+.05)/(Math.min(a,b)+.05)*100)/100, border:cs.borderTopWidth, dot:getComputedStyle(e,'::before').content});}); return out;}"""
        for mode in ['light', 'dark']:
            page.evaluate(f"()=>document.documentElement.setAttribute('data-rx-mode','{mode}')")
            badges = []
            for v in ['overview', 'all']:
                go(page, v); badges += page.evaluate(CONTRAST)
            go(page, 'approval-center'); page.evaluate("()=>{const t=document.querySelector('#apTabs [data-tab=\"all\"]'); t&&t.click()}"); page.wait_for_timeout(1300); badges += page.evaluate(CONTRAST)
            hr(page, 'capacity'); page.evaluate("()=>{const t=document.querySelector('#rxCapTabs [data-tab=\"team\"]'); t&&t.click()}"); page.wait_for_timeout(1300); badges += page.evaluate(CONTRAST)
            low = [x for x in badges if x.get('err') or x['r'] < 4.5]
            check(f'GEN-12 every badge reaches 4.5:1 in {mode} mode ({len(badges)} checked)', badges and not low, low[:5])
            flat = [x for x in badges if not x.get('err') and (x['border'] not in ('0px',) or x['dot'] not in ('none', 'normal'))]
            check(f'GEN-12 badges are full-fill, no outline or dot ({mode})', not flat, flat[:3])
        page.evaluate("()=>document.documentElement.setAttribute('data-rx-mode','light')")
        tok = page.evaluate("()=>{const cs=getComputedStyle(document.documentElement); return ['navy','info','success','warning','danger','neutral'].map(t=>cs.getPropertyValue('--rx-badge-'+t+'-bg').trim()+'/'+cs.getPropertyValue('--rx-badge-'+t+'-fg').trim())}")
        check('GEN-12 central tokens match palette 4.1 (light)', tok == ['#E0E7F5/#1E3A8A', '#DBEAFE/#1D4ED8', '#DCFCE7/#166534', '#FEF3C7/#92400E', '#FEE2E2/#991B1B', '#F1F5F9/#334155'], tok)
        # GEN-11: at most 2 badges per row/card on the reviewed screens
        mx = 0
        for v in ['overview', 'all', 'projects', 'worklog', 'calendar', 'approval-center', 'finance']:
            go(page, v); mx = max(mx, page.evaluate("()=>Math.max(0,...[...document.querySelectorAll('.wm-view.active tr, .wm-view.active .wm-task-row, .wm-view.active .wm-project-card, .wm-view.active .rx-card')].map(r=>r.querySelectorAll('.rx-chip, .wm-badge, .wm-status-badge').length))"))
        check('GEN-11 no row or card carries more than 2 badges', mx <= 2, mx)
        nested = page.evaluate("()=>document.querySelectorAll('.rx-chip .rx-chip, .wm-badge .wm-badge, .rx-chip .wm-badge, .wm-badge .rx-chip').length")
        check('GEN-11 no badge inside a badge', nested == 0, nested)
        sh = page.evaluate("()=>{go=v=>0; const c=document.querySelector('.wm-view.active .rx-card, .wm-view.active .wm-table-wrap, .wm-view.active .rx-metric'); return c?getComputedStyle(c).boxShadow:'none'}")
        check('GEN-11 flat cards (no drop shadow)', sh == 'none', sh)
        all_errs += errs; ctx.close()

    check('No JavaScript errors', not all_errs, all_errs[:5])
    b.close()
print(f"\n{sum(1 for _, ok in results if ok)}/{len(results)} passed")
