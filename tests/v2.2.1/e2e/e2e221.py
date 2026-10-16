"""REXUS v2.2.1 end-to-end UI tests: Chromium → test server → real Netlify Function handlers → PGlite (PostgreSQL 16)."""
import sys, os, json, re
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8899'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'shots-221'
os.makedirs(OUT, exist_ok=True)
results = []
def check(name, cond, detail=''):
    results.append({'name': name, 'pass': bool(cond), 'detail': '' if cond else str(detail)[:300]})
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else '  → ' + str(detail)[:300]))

OVERFLOW_JS = "() => ({sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth})"

def new_page(browser, uid, width=1440, height=900):
    ctx = browser.new_context(viewport={'width': width, 'height': height})
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)[:200]))
    page.route(re.compile(r'^https?://(?!localhost).*'), lambda r: r.fulfill(status=200, body='', content_type='text/css' if 'font' in r.request.url else 'application/javascript'))
    page.goto(f'{BASE}/__test/login?uid={uid}&to=/')
    page.wait_for_selector('.wm-app', state='visible', timeout=20000); page.wait_for_timeout(1200)
    return ctx, page, errs

def go(page, view):
    page.evaluate("(v)=>{const t=document.querySelector('.wm-tab[data-view=\"'+v+'\"]'); t&&t.click();}", view); page.wait_for_timeout(700)

def toast_text(page):
    return page.evaluate("()=>{const p=document.getElementById('wmConfirmPopup');return p&&p.classList.contains('show')?document.getElementById('wmConfirmPopupText').textContent:''}")

with sync_playwright() as p:
    b = p.chromium.launch()
    # ---------------------------------------------------------- Member: leave + appearance
    ctx, page, errs = new_page(b, 'U_TRUONGPN')
    check('M4 sidebar renamed to Human Resources Management', 'Human Resources Management' in page.inner_text('.wm-sidebar'))
    go(page, 'organization')
    check('M4 HR page title + section tabs', page.locator('.rx-page-head h2').inner_text() == 'Human Resources Management' and page.locator('#rxHrTabs [data-tab]').count() >= 4)
    check('M4 search-first: no org chart / no directory before searching', page.locator('#orgChartCanvas').count() == 0 and page.locator('#rxEmpProfile').is_hidden() and page.locator('.rx-result').count() == 0)
    page.fill('#rxEmpQ', 'truongpn'); page.wait_for_timeout(900)
    check('M4 employee search returns results', page.locator('.rx-result').count() >= 1, page.locator('#rxEmpHint').inner_text())
    page.keyboard.press('ArrowDown'); page.keyboard.press('Enter'); page.wait_for_timeout(900)
    check('M4 keyboard selection opens profile; results hidden', page.locator('#rxEmpProfile').is_visible() and page.locator('#rxEmpList').is_hidden())
    check('M4 own profile shows employment & capacity', 'Employment & capacity' in page.inner_text('#rxEmpProfile'))
    page.screenshot(path=f'{OUT}/hr-profile@1440.png', full_page=True)
    page.click('#rxHrTabs [data-tab="leave"]'); page.wait_for_timeout(900)
    page.click('#rxNewLeave'); page.wait_for_timeout(400)
    dlg = page.locator('.rx-dialog').last
    dlg.locator('select[name=leave_type]').select_option('Personal Leave')
    dlg.locator('input[name=start_date]').fill('2026-12-07'); dlg.locator('input[name=start_date]').dispatch_event('change')
    dlg.locator('input[name=end_date]').fill('2026-12-08')
    dlg.locator('textarea[name=reason]').fill('Moving house')
    page.screenshot(path=f'{OUT}/leave-form@1440.png')
    dlg.locator('button[data-action=submit]').click(); page.wait_for_timeout(1500)
    check('M4 leave submitted through UI (routed to manager)', 'submitted for approval' in toast_text(page).lower(), toast_text(page))
    check('M4 leave appears as Pending Approval', 'Pending Approval' in page.inner_text('#rxLeaveBody'))
    page.screenshot(path=f'{OUT}/leave-list@1440.png', full_page=True)
    page.click('#rxLeaveTabs [data-tab="calendar"]'); page.wait_for_timeout(800)
    check('M4 leave calendar renders month grid', page.locator('.rx-cal .rx-cal-cell').count() >= 28)
    # appearance
    page.evaluate("()=>document.querySelector('#wmUserMenu [data-action=\"my-account\"]').click()"); page.wait_for_timeout(1200)
    check('M1 Google linking removed (no login button, no Connected Accounts)', page.locator('#rxGoogleLogin').count() == 0 and 'Connected Accounts' not in page.inner_text('#view-my-account'))
    check('M9 Appearance with two themes', page.locator('[data-theme-choice]').count() == 2)
    page.click('[data-theme-choice="navy"]'); page.wait_for_timeout(900)
    check('M9 theme applies immediately (no reload)', page.evaluate("document.documentElement.getAttribute('data-rx-theme')") == 'navy')
    page.screenshot(path=f'{OUT}/account-navy@1440.png', full_page=True)
    ctx.close()
    # same user, fresh browser profile (no localStorage) → server preference
    ctx, page, errs2 = new_page(b, 'U_TRUONGPN'); page.wait_for_timeout(800)
    check('M9 theme persists across devices/logins (server-side per user)', page.evaluate("document.documentElement.getAttribute('data-rx-theme')") == 'navy')
    page.screenshot(path=f'{OUT}/overview-navy@1440.png', full_page=False)
    go(page, 'all'); page.screenshot(path=f'{OUT}/tasks-navy@1440.png', full_page=False)
    ctx.close()
    ctx, page, errs3 = new_page(b, 'U_MINCT')
    check('M9 other users keep their own theme', page.evaluate("document.documentElement.getAttribute('data-rx-theme')") == 'mono')
    # ---------------------------------------------------------- Manager: approval center
    go(page, 'approval-center'); page.wait_for_timeout(800)
    rows = page.locator('#apList tbody tr[data-id]')
    check('M3 pending tab lists the leave request', rows.count() >= 1 and 'Leave Request' in page.inner_text('#apList'), page.inner_text('#apList')[:300])
    page.screenshot(path=f'{OUT}/approvals@1440.png', full_page=True)
    page.locator('#apList [data-open]').first.click(); page.wait_for_timeout(900)
    check('M3 detail shows related record + steps + history', 'Related record' in page.inner_text('.rx-dialog') and page.locator('.rx-step').count() >= 1)
    page.screenshot(path=f'{OUT}/approval-detail@1440.png')
    page.click('#apReject'); page.wait_for_timeout(300)
    page.locator('.rx-dialog').last.locator('button[type=submit]').click(); page.wait_for_timeout(300)
    check('M3 reject requires a reason (client validation)', page.locator('.rx-dialog').last.locator('.rx-form-error').is_visible() and 'reason is required' in page.locator('.rx-dialog').last.inner_text().lower())
    page.locator('.rx-dialog').last.locator('[data-close]').first.click(); page.wait_for_timeout(200)
    page.click('#apApprove'); page.wait_for_timeout(300); page.locator('.rx-dialog').last.locator('button[type=submit]').click(); page.wait_for_timeout(1500)
    check('M3 approve via UI', 'approved' in toast_text(page).lower(), toast_text(page))
    page.click('#apTabs [data-tab="delegations"]'); page.wait_for_timeout(700)
    check('M3 delegations tab', 'New delegation' in page.inner_text('#apBody'))
    # direct URL + refresh
    page.goto(f'{BASE}/#/approval-center'); page.wait_for_selector('.wm-app', state='visible'); page.wait_for_timeout(1500)
    check('M10 direct URL #/approval-center survives refresh', page.locator('#view-approval-center').evaluate("e=>e.classList.contains('active')"))
    go(page, 'overview'); page.go_back(); page.wait_for_timeout(900)
    check('M10 browser Back returns to previous view', page.locator('#view-approval-center').evaluate("e=>e.classList.contains('active')"))
    ctx.close()
    # ---------------------------------------------------------- Part-timer: capacity declaration
    ctx, page, errs4 = new_page(b, 'U_VYNHA')
    go(page, 'organization'); page.click('#rxHrTabs [data-tab="capacity"]'); page.wait_for_timeout(1200)
    check('M2 capacity calendar for declaration-based employee', page.locator('.rx-cap-cell').count() >= 28, page.inner_text('#rxHrBody')[:200])
    page.click('#rxCapWeekly'); page.wait_for_timeout(300)
    d = page.locator('.rx-dialog').last
    for wd in ['1', '3', '5']: d.locator(f'input[name=w{wd}]').fill('4')
    d.locator('button[type=submit]').click(); page.wait_for_timeout(400)
    filled = page.evaluate("()=>[...document.querySelectorAll('.rx-cap-hours')].filter(i=>i.value==='4').length")
    check('M2 apply weekly availability fills matching weekdays', filled >= 10, filled)
    page.screenshot(path=f'{OUT}/capacity@1440.png', full_page=True)
    page.click('#rxCapSubmit'); page.wait_for_timeout(300); page.locator('.rx-dialog').last.locator('button[type=submit]').click(); page.wait_for_timeout(1600)
    check('M2 declaration submitted → Pending Approval', 'Pending Approval' in page.inner_text('#rxCapContent'), page.inner_text('#rxCapContent')[:300])
    check('M2 pending month locked for editing', page.evaluate("()=>[...document.querySelectorAll('.rx-cap-hours')].every(i=>i.disabled)"))
    page.click('#rxCapView [data-tab="list"]'); page.wait_for_timeout(300)
    check('M2 accessible list alternative', page.locator('.rx-cap-hours-l').count() >= 28)
    ctx.close()
    # ---------------------------------------------------------- Admin: resource planning, finance, WBS
    ctx, page, errs5 = new_page(b, 'ADMIN_TIENNT')
    go(page, 'organization'); page.click('#rxHrTabs [data-tab="resources"]'); page.wait_for_timeout(2000)
    check('M2 resource dashboard summary cards', page.locator('#rpData .rx-metric').count() == 7)
    check('M2 pending declaration shown as not confirmed', 'Pending Approval' in page.inner_text('#rpBody'))
    page.screenshot(path=f'{OUT}/resource@1440.png', full_page=True)
    page.click('#rpView [data-tab="timeline"]'); page.wait_for_timeout(1500)
    check('M2 timeline/heatmap renders cells', page.locator('.rx-heat').count() > 50)
    page.screenshot(path=f'{OUT}/heatmap@1440.png', full_page=False)
    page.select_option('#rpScale', 'week'); page.wait_for_timeout(500)
    check('M2 weekly heatmap scale', page.locator('.rx-tl-hcell').count() <= 7)
    page.click('#rxHrTabs [data-tab="schedules"]'); page.wait_for_timeout(900)
    check('M4 holidays admin list shows seeded holiday', 'Company Foundation Day' in page.inner_text('#rxHolList'))
    # finance
    page.goto(f'{BASE}/#/project-financials'); page.wait_for_selector('.wm-app', state='visible'); page.wait_for_timeout(2000)
    fin_txt = page.inner_text('#finModeBody') if page.locator('#finModeBody').count() else page.inner_text('.wm-body')
    check('M7 Project Finance lists registered + task-only projects', 'Student Conference' in fin_txt and 'Not registered' in fin_txt, fin_txt[:300])
    page.screenshot(path=f'{OUT}/finance-list@1440.png', full_page=True)
    page.locator('#fnList tr[data-i]').filter(has_text='Triển khai').first.click(); page.wait_for_timeout(1500)
    check('M7 project finance overview metrics', page.locator('#fnBody .rx-metric').count() >= 7)
    page.click('#fnTabs [data-tab="ledger"]'); page.wait_for_timeout(1000)
    page.click('#fnAddIncome'); page.wait_for_timeout(300)
    d = page.locator('.rx-dialog').last
    d.locator('input[name=amount]').fill('12000000'); d.locator('input[name=reference]').fill('UI-INC-1'); d.locator('select[name=method]').select_option('Bank Transfer')
    d.locator('button[type=submit]').click(); page.wait_for_timeout(1500)
    check('M7 income added through dialog (draft)', 'UI-INC-1' in page.inner_text('#fnLedgerTable') and 'Draft' in page.inner_text('#fnLedgerTable'))
    page.locator('#fnLedgerTable [data-act="confirm_transaction"]').first.click(); page.wait_for_timeout(300)
    page.locator('.rx-dialog').last.locator('button[type=submit]').click(); page.wait_for_timeout(1500)
    page.click('#fnTabs [data-tab="overview"]'); page.wait_for_timeout(900)
    check('M7 confirmed income updates cash received', '12,000,000' in page.inner_text('#fnBody'), page.inner_text('#fnBody')[:400])
    page.screenshot(path=f'{OUT}/finance-detail@1440.png', full_page=True)
    # project detail WBS
    go(page, 'projects'); page.locator('.wm-project-card').filter(has_text='Triển khai').first.click(); page.wait_for_timeout(1800)
    check('M6 WBS section replaces flat task list', page.locator('#pdWbs .rx-wbs-row').count() > 2)
    nums = page.evaluate("()=>[...document.querySelectorAll('#pdWbs .rx-wbs-table .rx-wc0')].slice(1,5).map(e=>e.textContent)")
    check('M6 hierarchical WBS numbering (1, 1.1, …)', any('.' in n for n in nums) and nums[0] == '1', nums)
    check('M6 WBS + Gantt rows aligned (same count)', page.locator('#pdWbs .rx-wbs-table .rx-wbs-row:not(.rx-wbs-hrow)').count() == page.locator('#pdWbs .rx-gt-row').count())
    h_before = page.locator('#pdWbs .rx-gt-row').count()
    page.locator('#pdWbs [data-toggle]').first.click(); page.wait_for_timeout(300)
    check('M6 collapse updates both WBS and Gantt', page.locator('#pdWbs .rx-gt-row').count() < h_before and page.locator('#pdWbs .rx-wbs-table .rx-wbs-row:not(.rx-wbs-hrow)').count() == page.locator('#pdWbs .rx-gt-row').count())
    page.click('#wbsExpand'); page.wait_for_timeout(300)
    page.locator('#pdWbs .rx-gt-bar').nth(1).click(); page.wait_for_timeout(200)
    check('M6 selecting a Gantt bar highlights its WBS row', page.locator('#pdWbs .rx-wbs-table .rx-wbs-row.is-selected').count() == 1)
    nested = page.evaluate("()=>{const w=document.querySelector('#pdWbs .rx-wbs-layout');const cs=getComputedStyle(w);return [cs.overflowY, w.scrollHeight>w.clientHeight+2]}")
    check('M6 no nested vertical scrollbar on the task list', nested[1] is False, nested)
    check('M5 dependency line drawn', page.locator('#pdWbs .rx-gt-link').count() >= 1)
    page.screenshot(path=f'{OUT}/wbs@1440.png', full_page=True)
    page.click('#wbsMode [data-tab="wbs"]'); page.wait_for_timeout(300); page.screenshot(path=f'{OUT}/wbs-only@1440.png', full_page=False)
    check('M7 project financials section inside project detail', page.locator('#pdFinance .rx-metric').count() >= 7)
    page.locator('#pdWbs [data-deps]').first.click(); page.wait_for_timeout(400)
    check('M5 dependency dialog opens', 'Predecessors' in page.locator('.rx-dialog').last.inner_text())
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    check('M10 Escape closes v2.2.1 dialogs', page.locator('.rx-dialog').count() == 0)
    all_errs = errs + errs2 + errs3 + errs4 + errs5
    check('No JavaScript page errors in any flow', not all_errs, all_errs[:5])
    ctx.close()
    # ---------------------------------------------------------- responsive sweep of new screens
    sweep = {}
    for w in [320, 375, 768, 1024, 1440, 1920]:
        ctx, page, e = new_page(b, 'ADMIN_TIENNT', width=w, height=900 if w > 500 else 780)
        for name, fn in [('hr', lambda: (go(page, 'organization'),)), ('resource', lambda: (go(page, 'organization'), page.click('#rxHrTabs [data-tab="resources"]'), page.wait_for_timeout(1500))),
                         ('approvals', lambda: go(page, 'approval-center')), ('finance', lambda: (page.goto(f'{BASE}/#/project-financials'), page.wait_for_timeout(1800))),
                         ('wbs', lambda: (go(page, 'projects'), page.locator('.wm-project-card').first.click(), page.wait_for_timeout(1500)))]:
            fn(); page.wait_for_timeout(300)
            m = page.evaluate(OVERFLOW_JS); sweep[f'{name}@{w}'] = m
            if w in (375, 1024, 1920): page.screenshot(path=f'{OUT}/{name}@{w}.png', full_page=True)
        sweep[f'errors@{w}'] = e
        ctx.close()
    over = {k: v for k, v in sweep.items() if not k.startswith('errors') and v['sw'] > v['vw']}
    check('Responsive: no page-level horizontal overflow on new screens (6 widths × 5 screens)', not over, over)
    check('Responsive: no JS errors in sweep', not any(v for k, v in sweep.items() if k.startswith('errors')), [v for k, v in sweep.items() if k.startswith('errors') and v])
    b.close()
ok = sum(1 for r in results if r['pass']); print(f'\n{ok}/{len(results)} e2e checks passed')
json.dump(results, open(os.path.join(OUT, 'e2e-results.json'), 'w'), indent=1)
