"""REXUS v2.3.1 end-to-end tests — module reorganisation (HRM employee record, no duplicate entry points, cross-module links).
Chromium → test server (tests/v2.2.1/backend/server.mjs, fresh database) → real Netlify Function handlers → PGlite.
usage: python3 e2e231.py [base_url] [screenshot_dir]"""
import sys, os, re
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8899'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'shots-231'
os.makedirs(OUT, exist_ok=True)
results = []
def check(name, cond, detail=''):
    results.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else '  → ' + str(detail)[:300]), flush=True)

ADMIN, PM, MEM = 'ADMIN_TIENNT', 'U_MINCT', 'U_TRUONGPN'
def new_ctx(b, w=1440, h=900):
    ctx = b.new_context(viewport={'width': w, 'height': h}); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    pg.route(re.compile(r'^https?://(?!localhost).*'), lambda r: r.fulfill(status=200, body=''))
    return ctx, pg, errs
def login_as(pg, uid):
    pg.goto(f'{BASE}/__test/login?uid={uid}&to=/'); pg.wait_for_selector('.wm-app', state='visible', timeout=20000); pg.wait_for_timeout(900)
def J(pg, m, u, body=None):
    return pg.evaluate("([m,u,b])=>fetch(u,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined}).then(async r=>({status:r.status, json:await r.json().catch(()=>({}))}))", [m, u, body])
def text(pg, sel): return pg.inner_text(sel) if pg.locator(sel).count() else ''
def emp_tabs(pg): return pg.evaluate("()=>[...document.querySelectorAll('#rxEmpTabs [data-tab]')].map(b=>b.dataset.tab)")
def tab(pg, t): pg.click(f'#rxEmpTabs [data-tab="{t}"]'); pg.wait_for_timeout(1200)
def dismiss(pg):
    pg.evaluate("()=>{const b=document.querySelector('.rx-notify [data-ok]'); if(b) b.click();}"); pg.wait_for_timeout(300)
def hr(pg):
    pg.click('.wm-tab[data-view="organization"]'); pg.wait_for_timeout(1200)

with sync_playwright() as p:
    b = p.chromium.launch(); all_errs = []
    ctx, pg, errs = new_ctx(b); login_as(pg, ADMIN); all_errs.append(errs)

    # ---------------------------------------------------------------- no duplicate entry points, legacy code gone
    check('no hidden duplicate tabs (Resource Planning / Project Financials)', pg.locator('.wm-tab[data-view="resource-planning"], .wm-tab[data-view="project-financials"]').count() == 0)
    check('legacy v2.1.0 screens and auto bulk-copy script are not loaded', pg.evaluate("()=>!window.REXUS210 && ![...document.scripts].some(s=>/rexus-v21[01]\\.js/.test(s.src)) && !document.querySelector('.rx211-check-col')"))
    pg.goto(f'{BASE}/#/resource-planning'); pg.wait_for_timeout(1800)
    check('old #/resource-planning link opens HRM → Resource Planning', pg.locator('#view-organization.active').count() == 1 and pg.get_attribute('#rxHrTabs [data-tab="resources"]', 'aria-selected') == 'true')
    pg.goto(f'{BASE}/#/project-financials'); pg.wait_for_timeout(1800)
    check('old #/project-financials link opens Finance → Project Financials', pg.locator('#view-finance.active').count() == 1 and 'active' in (pg.get_attribute('[data-fin-mode="financials"]', 'class') or ''))

    # ---------------------------------------------------------------- Configuration keeps only company-wide settings
    pg.goto(f'{BASE}/#/configuration'); pg.wait_for_timeout(1500)
    cfg = text(pg, '#view-configuration')
    check('Configuration keeps Company info, Task types, Performance-pay rules', all(s in cfg for s in ['Company Information', 'Task Types', 'Performance-Based Pay']), cfg[:200])
    check('Configuration no longer holds accounts or hourly rates (points to HRM)', pg.locator('#view-configuration #cfgEmpTableWrap, #view-configuration #wmRateEmployee').count() == 0 and 'Employees, accounts and pay' in cfg)
    pg.click('#cfgOpenHrEmployees'); pg.wait_for_timeout(1500)
    check('"Open employees in HRM" lands on HRM → Employee Search', pg.locator('#view-organization.active #rxEmpQ').count() == 1)

    # ---------------------------------------------------------------- HRM: accounts list (admin) → employee record
    check('HRM → Employee Search shows the account list for System Admin', pg.locator('#rxAccounts #cfgEmpTableWrap tr[data-emp-id]').count() >= 3)
    pg.click('#cfgAddEmployeeBtn'); pg.fill('#cfgEmpNewFullName', 'Hoang Lan Vu'); pg.fill('#cfgEmpNewEmail', 'lan.vu@ueh.edu.vn')
    check('create account form still suggests the username', pg.input_value('#cfgEmpNewUsername') == 'hoang.lan.vu')
    pg.click('#cfgEmpNewSubmit'); pg.wait_for_timeout(1500)
    created = 'Temporary password' in pg.inner_text('body')
    check('account created from HRM shows the temporary password once', created)
    dismiss(pg)
    pg.fill('#cfgEmpSearch', 'hoang.lan'); pg.wait_for_timeout(400)
    check('new account listed in HRM', 'hoang.lan.vu' in text(pg, '#cfgEmpTableWrap'))
    pg.click('#cfgEmpTableWrap tr[data-emp-id] td'); pg.wait_for_timeout(2000)
    check('row click opens the HRM employee record (not a modal)', pg.locator('#rxEmpProfile:not([hidden]) #rxEmpTabs').count() == 1 and not pg.locator('#wmEmployeeModal.open').count())
    check('System Admin sees Overview, Employment & leave, Personal information, Compensation, Account', emp_tabs(pg) == ['overview', 'employment', 'personal', 'compensation', 'account'], emp_tabs(pg))
    tab(pg, 'account')
    check('Account tab: onboarding status of a new account is pending', 'Pending' in text(pg, '#rxEmpTabBody') and 'Personal password' in text(pg, '#rxEmpTabBody'))
    pg.click('#rxAccEdit'); pg.wait_for_timeout(500)
    check('Edit role/department/status opens the account editor on its Account pane', pg.locator('#wmEmployeeModal.open').count() == 1 and pg.is_visible('#wmEmployeeAccountPane'))
    pg.fill('#empAcctDepartment', 'Studio'); pg.click('#wmEmployeeAcctSaveBtn'); pg.wait_for_timeout(1200)
    pg.click('#wmEmployeeModalClose'); pg.wait_for_timeout(300)
    lan = next(u for u in J(pg, 'GET', '/api/users')['json']['users'] if u['username'] == 'hoang.lan.vu')
    check('account edit saved', lan['department'] == 'Studio', lan)
    pg.click('#rxAccReset'); pg.wait_for_timeout(400); pg.click('.wm-modal-overlay.open button[type=submit]'); pg.wait_for_timeout(1200)
    check('Reset password from the Account tab shows the temporary password', 'Temporary password for hoang.lan.vu' in pg.inner_text('body'))
    pg.screenshot(path=f'{OUT}/01-employee-account.png')
    dismiss(pg)

    # ---------------------------------------------------------------- employee record of an existing employee: overview links, personal, compensation
    pg.evaluate("()=>window.REXUS221.openEmployee('U_TRUONGPN')"); pg.wait_for_timeout(2500)
    check('REXUS221.openEmployee opens the record from any module', 'TRUONGPN' in (pg.get_attribute('#rxEmpProfile', 'hidden') or 'x') or pg.locator('#rxEmpProfile:not([hidden]) #rxEmpTabs').count() == 1)
    ov = text(pg, '#rxEmpTabBody')
    check('Overview shows account info and linked work (open tasks, projects, hours)', 'Work in REXUS' in ov and 'Open tasks' in ov and 'Hours logged this month' in ov, ov[:300])
    links = pg.locator('#rxEmpTabBody [data-project]')
    if links.count():
        name = links.first.get_attribute('data-project'); links.first.click(); pg.wait_for_timeout(1500)
        check('project link in the record opens Project Detail', pg.locator('#view-project-detail.active').count() == 1 and name in text(pg, '#view-project-detail'))
        fin = text(pg, '#pdFinance')
        check('Project Detail shows a finance summary with "Open in Project Finance" (no second ledger)', 'Open in Project Finance' in fin and pg.locator('#pdFinance #fnTabs').count() == 0, fin[:200])
        pg.click('#pdFinOpen'); pg.wait_for_timeout(1800)
        check('"Open in Project Finance" opens that project in Finance → Project Financials', pg.locator('#view-finance.active #fnTabs').count() == 1 and name in text(pg, '#view-finance'))
        pg.evaluate("()=>{window.REXUS221.FN.open=null}")
    else:
        check('project link in the record opens Project Detail', False, 'no project links for U_TRUONGPN')
    pg.evaluate("()=>window.REXUS221.openEmployee('U_TRUONGPN','personal')"); pg.wait_for_timeout(2500)
    check('Personal information tab (System Admin) shows the profile form', pg.locator('#rxEmpTabBody #pf_date_of_birth').count() == 1)
    pg.fill('#pf_date_of_birth', '1995-03-02'); pg.evaluate("()=>{const e=document.getElementById('pf_education_level'); if(e && !e.value){e.value=e.options[1].value; e.dispatchEvent(new Event('change',{bubbles:true}));}}"); pg.locator('#rxEmpTabBody button[type=submit]').click(); pg.wait_for_timeout(1500); dismiss(pg)
    d = J(pg, 'GET', '/api/onboarding?user_id=U_TRUONGPN')['json']
    check('personal information saved from HRM', (d.get('values') or {}).get('date_of_birth') == '1995-03-02', d.get('values'))
    tab(pg, 'compensation')
    comp = text(pg, '#rxEmpTabBody')
    check('Compensation tab: salary history, hourly-rate history and Edit Salary', 'Salary history' in comp and 'Hourly rate history' in comp and pg.locator('#finEditSalaryBtn').count() == 1, comp[:300])
    check('Compensation tab (System Admin): hourly-rate editor fixed to this employee', pg.locator('#rxCompRates #wmRateNewAmount').count() == 1 and pg.evaluate("()=>document.getElementById('wmRateEmployee').value") == 'U_TRUONGPN' and not pg.is_visible('#wmRateEmployee'))
    pg.fill('#wmRateNewAmount', '150000'); pg.click('#wmRateSaveBtn'); pg.wait_for_timeout(1500); dismiss(pg)
    check('new hourly rate saved and listed', '150,000' in text(pg, '#wmRateHistory') or '150.000' in text(pg, '#wmRateHistory'), text(pg, '#wmRateHistory'))
    pg.screenshot(path=f'{OUT}/02-employee-compensation.png', full_page=True)

    # ---------------------------------------------------------------- HR Settings holds Profile Fields; Survey no longer does
    hr(pg); pg.click('#rxHrTabs [data-tab="schedules"]'); pg.wait_for_timeout(1800)
    check('HR admin tab renamed to "HR Settings"', 'HR Settings' in text(pg, '#rxHrTabs [data-tab="schedules"]'))
    check('HR Settings shows Profile fields with Apply to existing accounts', pg.locator('#rxProfileFields tr[data-key="date_of_birth"]').count() == 1 and pg.locator('#rxProfileFields [data-apply]').count() == 1)
    pg.locator('#rxProfileFields tr[data-key="gender"] input[name=visible]').uncheck(); pg.click('#rxProfileFields [data-save]'); pg.wait_for_timeout(1500); dismiss(pg)
    f = J(pg, 'GET', '/api/profile-fields')['json']['fields']
    check('profile fields saved from HR Settings', next(x for x in f if x['key'] == 'gender')['visible'] is False)
    pg.screenshot(path=f'{OUT}/03-hr-settings.png', full_page=True)
    pg.goto(f'{BASE}/#survey/overview'); pg.wait_for_timeout(1800)
    nav = pg.evaluate("()=>[...document.querySelectorAll('#svSide a')].map(a=>a.textContent.trim())")
    check('Survey navigation no longer has Employee Profiles / Profile Fields', not any('Profile' in n for n in nav), nav)
    pg.goto(f'{BASE}/#survey/profiles/U_TRUONGPN'); pg.wait_for_timeout(2500)
    check('old #survey/profiles/<id> link opens the HRM record (Personal information)', pg.locator('#view-organization.active #rxEmpTabs [data-tab="personal"][aria-selected="true"]').count() == 1)
    pg.goto(f'{BASE}/#survey/fields'); pg.wait_for_timeout(2500)
    check('old #survey/fields link opens HR Settings', pg.locator('#view-organization.active #rxProfileFields').count() == 1)

    # ---------------------------------------------------------------- Finance By Personnel → HRM Compensation
    pg.click('.wm-tab[data-view="finance"]'); pg.wait_for_timeout(1200)
    pg.click('[data-fin-mode="personnel"]'); pg.wait_for_timeout(1500)
    pg.click('#finListTableWrap .wm-fin-row'); pg.wait_for_timeout(2500)
    check('Finance By Personnel row opens the HRM record on Compensation', pg.locator('#view-organization.active #rxEmpTabs [data-tab="compensation"][aria-selected="true"]').count() == 1 and 'Salary history' in text(pg, '#rxEmpTabBody'))

    # ---------------------------------------------------------------- Approval Center → related record (the member's manager decides)
    ctx2, mem, errs2 = new_ctx(b); login_as(mem, MEM); all_errs.append(errs2)
    r = J(mem, 'POST', '/api/hr/leave', {'action': 'submit', 'leave_type': 'Annual Leave', 'start_date': '2026-11-12', 'end_date': '2026-11-12', 'unit': 'full', 'reason': 'e2e231'})
    check('setup: member submits leave', r['status'] in (200, 201), r)
    ctx2.close()
    ctx5, mgr, errs5 = new_ctx(b); login_as(mgr, PM); all_errs.append(errs5)
    mgr.click('.wm-tab[data-view="approval-center"]'); mgr.wait_for_timeout(1800)
    if mgr.locator('#apList [data-open]').count():
        mgr.locator('#apList [data-open]').first.click(); mgr.wait_for_timeout(1500)
    check('approval request detail opens', mgr.locator('#apDetail .rx-kv').count() >= 1)
    check('detail offers "Open related record"', mgr.locator('#apOpenRelated').count() == 1)
    if mgr.locator('#apOpenRelated').count():
        mgr.click('#apOpenRelated'); mgr.wait_for_timeout(1800)
        check('"Open related record" for leave opens HRM → Leave Management (team calendar)', mgr.locator('#view-organization.active').count() == 1 and mgr.get_attribute('#rxHrTabs [data-tab="leave"]', 'aria-selected') == 'true')
    ctx5.close()

    # ---------------------------------------------------------------- permissions unchanged: PM and Member records
    ctx3, pm, errs3 = new_ctx(b); login_as(pm, PM); all_errs.append(errs3)
    pm.evaluate("()=>window.REXUS221.openEmployee('U_TRUONGPN')"); pm.wait_for_timeout(2500)
    t3 = emp_tabs(pm)
    check('Project Manager: no Personal information or Account tab on someone else', 'personal' not in t3 and 'account' not in t3, t3)
    if 'compensation' in t3:
        tab(pm, 'compensation')
        check('Project Manager Compensation: no hourly-rate editor (rates stay System Admin only)', pm.locator('#rxCompRates').count() == 0)
    check('Project Manager: no account list in HRM', pm.locator('#rxAccounts').count() == 0)
    ctx3.close()
    ctx4, m, errs4 = new_ctx(b); login_as(m, MEM); all_errs.append(errs4)
    m.evaluate("()=>window.REXUS221.openEmployee('U_MINCT')"); m.wait_for_timeout(2500)
    t4 = emp_tabs(m)
    check('Member viewing a colleague: Overview only (no pay, personal or account data)', all(x not in t4 for x in ['personal', 'compensation', 'account']), t4)
    m.evaluate("()=>window.REXUS221.openEmployee('U_TRUONGPN')"); m.wait_for_timeout(2500)
    check('Member viewing themself: Personal information tab available', 'personal' in emp_tabs(m), emp_tabs(m))
    ctx4.close()

    errs_all = [e for es in all_errs for e in es]
    check('No JavaScript page errors', not errs_all, errs_all[:3])
    b.close()

print(f"\n{sum(1 for _, ok in results if ok)}/{len(results)} e2e231 checks passed")
sys.exit(0 if all(ok for _, ok in results) else 1)
