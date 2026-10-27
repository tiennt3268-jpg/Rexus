"""REXUS v2.3.5 end-to-end tests — REXUS_Requirements_v2.3.4 Detailed Addendum
(UI-01/02, PRJ-01/02, DSH-01..03, DTL-01..03, ACT-01..03, LOG-01).
Chromium → test server (tests/v2.2.1/backend/server.mjs, fresh database) → real Netlify Function handlers → PGlite.
usage: python3 e2e235.py [base_url] [screenshot_dir]"""
import sys, os, re, json
from datetime import date, timedelta
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8899'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'shots-235'
os.makedirs(OUT, exist_ok=True)
results = []
def check(name, cond, detail=''):
    results.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else '  → ' + str(detail)[:300]), flush=True)

ADMIN, PM, MEM = 'ADMIN_TIENNT', 'U_MINCT', 'U_TRUONGPN'
P1 = 'Triển khai Hệ thống Quản lý Công việc'
TODAY = date.today()
def iso(d): return d.isoformat()
def new_ctx(b, w=1440, h=900, scheme='light'):
    ctx = b.new_context(viewport={'width': w, 'height': h}, color_scheme=scheme); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    pg.route(re.compile(r'^https?://(?!localhost).*'), lambda r: r.fulfill(status=200, body=''))
    return ctx, pg, errs
def login_as(pg, uid, to='/'):
    pg.goto(f'{BASE}/__test/login?uid={uid}&to={to}'); pg.wait_for_selector('.wm-app', state='visible', timeout=20000); pg.wait_for_timeout(1200)
def J(pg, m, u, body=None):
    return pg.evaluate("([m,u,b])=>fetch(u,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined}).then(async r=>({status:r.status, json:await r.json().catch(()=>({}))}))", [m, u, body])
def go(pg, view): pg.goto(f'{BASE}/?n={view}{nav()}#/{view}'); pg.wait_for_selector('.wm-app', state='visible'); pg.wait_for_timeout(1300)
def css(pg, sel, prop): return pg.evaluate("([s,p])=>{const e=document.querySelector(s);return e?getComputedStyle(e)[p]:null}", [sel, prop])
NAV = [0]
def nav(): NAV[0] += 1; return NAV[0]
def open_task(pg, tid): pg.goto(f'{BASE}/?n={nav()}#/f/task?id={tid}'); pg.wait_for_selector('#wmDetailActions .rx-actionbar', timeout=15000); pg.wait_for_timeout(800)
def open_sub(pg, sid): pg.goto(f'{BASE}/?n={nav()}#/f/subtask?id={sid}'); pg.wait_for_selector('#wmSubtaskActions .rx-actionbar', timeout=15000); pg.wait_for_timeout(800)
def confirm(pg, ok=True):
    pg.wait_for_selector('#wmConfirmModal.open', timeout=5000); pg.click('#wmConfirmOk' if ok else '#wmConfirmCancel'); pg.wait_for_timeout(600)
def visible_inputs(pg, body):
    return pg.evaluate("""(b)=>[...document.querySelectorAll(b+' .rx-field input:not([type=hidden]), '+b+' .rx-field select, '+b+' .rx-field textarea')].filter(e=>e.offsetParent!==null).length""", body)

with sync_playwright() as p:
    b = p.chromium.launch(); all_errs = []
    ctx, pg, errs = new_ctx(b); all_errs.append(errs)
    login_as(pg, ADMIN)
    TODAY = date.fromisoformat(pg.evaluate("()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}"))   # the browser's local day

    # ---------- test data through the API (admin = owner of P1)
    r = J(pg, 'POST', '/api/projects', {'project': {'name': 'Metrics Lab', 'status': 'Active', 'start_date': iso(TODAY - timedelta(days=20)), 'deadline': iso(TODAY + timedelta(days=20))}})
    mk = lambda body: J(pg, 'POST', '/api/tasks', {'task': body})['json']
    a = mk({'task': 'Lab done early', 'project': 'Metrics Lab', 'estimated_hours': 50, 'status': 'Completed', 'start_date': iso(TODAY - timedelta(days=20)), 'due_date': iso(TODAY - timedelta(days=11))})
    bb = mk({'task': 'Lab later work', 'project': 'Metrics Lab', 'estimated_hours': 50, 'status': 'In Progress', 'start_date': iso(TODAY + timedelta(days=4)), 'due_date': iso(TODAY + timedelta(days=13)), 'assignee_id': ADMIN, 'assignee_name': 'Ngo Trong Tien'})
    J(pg, 'PUT', '/api/tasks/' + bb['id'], {'progress': 20})
    J(pg, 'POST', '/api/worklogs', {'log': {'task_id': a['id'], 'date': iso(TODAY - timedelta(days=12)), 'hours': 40}})
    J(pg, 'POST', '/api/worklogs', {'log': {'task_id': bb['id'], 'date': iso(TODAY), 'hours': 10}})
    nodates = mk({'task': 'Undated in progress', 'project': 'Metrics Lab', 'status': 'In Progress'})
    J(pg, 'POST', '/api/projects', {'project': {'name': 'Cancelled Pilot', 'status': 'Cancelled'}})
    J(pg, 'POST', '/api/projects', {'project': {'name': 'Odd Status', 'status': 'Paused for audit'}})
    today_t = mk({'task': 'Due today task', 'project': P1, 'due_date': iso(TODAY)})
    done_t = mk({'task': 'Finished task', 'project': P1, 'due_date': iso(TODAY - timedelta(days=2)), 'status': 'Completed'})

    # ================================================================ UI-01 / UI-02
    go(pg, 'overview')
    rad = pg.evaluate("""()=>{const q=s=>{const e=document.querySelector(s);return e?getComputedStyle(e).borderTopLeftRadius:null};
      return {btn:q('.wm-period-btn'), card:q('.wm-stat-card'), tab:q('.rx-tab'), input:q('.wm-gsearch input, input[type=text]')}}""")
    check('UI-01 buttons, cards, tabs and inputs have square corners', all(v in ('0px', None) for v in rad.values()) and rad['card'] == '0px', rad)
    av = pg.evaluate("()=>{const e=[...document.querySelectorAll('span[title]')].find(s=>s.style.borderRadius==='50%');return e?getComputedStyle(e).borderTopLeftRadius:null}")
    check('UI-01 avatars stay round (exception)', av in ('50%',) or (av and av.endswith('px') and av != '0px'), av)
    pg.keyboard.press('Tab'); pg.keyboard.press('Tab'); pg.wait_for_timeout(150)
    ow = pg.evaluate("()=>{const e=document.activeElement;return e?getComputedStyle(e).outlineStyle:null}")
    check('UI-01 keyboard focus stays visible', ow not in (None, 'none'), ow)
    go(pg, 'projects'); pg.click('#wmNewProjectBtn'); pg.wait_for_timeout(1000)
    pad = pg.evaluate("()=>{const e=[...document.querySelectorAll('.wm-form-row input')].find(i=>i.offsetParent);const c=getComputedStyle(e);return [parseFloat(c.paddingTop),parseFloat(c.paddingLeft),parseFloat(c.lineHeight)]}")
    check('UI-02 input padding 6–8 px vertical, 10–12 px horizontal', 6 <= pad[0] <= 8 and 10 <= pad[1] <= 12, pad)
    gap = pg.evaluate("()=>{const l=[...document.querySelectorAll('.wm-form-row > label')].find(i=>i.offsetParent);return parseFloat(getComputedStyle(l).marginBottom)}")
    check('UI-02 label-to-input gap 4–6 px', 4 <= gap <= 6, gap)
    lh = pg.evaluate("()=>{const c=getComputedStyle(document.body);return parseFloat(c.lineHeight)/parseFloat(c.fontSize)}")
    check('UI-02 body line-height 1.35–1.45', 1.35 <= lh <= 1.45, lh)
    pg.screenshot(path=f'{OUT}/01-compact-form.png')

    # ================================================================ PRJ-01 / PRJ-02
    go(pg, 'projects'); pg.click('[data-pj-mode="list"]'); pg.wait_for_timeout(600)
    row = pg.locator('tr[data-project="Metrics Lab"]')
    txt = row.inner_text()
    check('PRJ-01 project list shows completion 60% (done scope, not hours)', '60%' in txt, txt)
    chip = row.locator('.rx-perf')
    check('PRJ-01 worked example: performance 120 labelled Ahead in green', chip.inner_text().strip() == '120 · Ahead' and 'rx-perf--ahead' in chip.get_attribute('class') and css(pg, 'tr[data-project="Metrics Lab"] .rx-perf', 'color') == 'rgb(22, 101, 52)', chip.inner_text())
    chip.focus(); pg.wait_for_timeout(300)
    tip = pg.evaluate("()=>{const t=document.getElementById('rxTip');return t&&!t.hidden?t.textContent:''}")
    check('PRJ-01 tooltip (keyboard focus) lists estimated, logged, planned earned, earned, SPI and EI', all(k in tip for k in ['Estimated hours: 100h', 'Logged hours: 50h', 'Planned earned hours (by today): 50h', 'Earned hours: 60h', 'SPI): 120', 'EI): 120']), tip)
    pg.screenshot(path=f'{OUT}/02-project-list-tooltip.png')
    na = pg.locator('tr[data-project="Odd Status"] .rx-perf').inner_text()
    check('PRJ-01 project without tasks shows N/A text, no NaN', 'No tasks' in na and 'NaN' not in pg.locator('#pjResults').inner_text(), na)
    allpct = [int(x) for x in re.findall(r'(\d+)%', pg.locator('#pjResults').inner_text())]
    check('PRJ-01 completion never above 100 %', allpct and max(allpct) <= 100, allpct)
    bg = lambda n: css(pg, f'tr[data-project="{n}"] .rx-st', 'background-color')
    check('PRJ-02 Active is green', bg('Metrics Lab') == 'rgb(220, 252, 231)', bg('Metrics Lab'))
    check('PRJ-02 Cancelled is blue', bg('Cancelled Pilot') == 'rgb(219, 234, 254)', bg('Cancelled Pilot'))
    check('PRJ-02 unknown status falls back to neutral', 'rx-st-neutral' in pg.get_attribute('tr[data-project="Odd Status"] .rx-st', 'class'))
    pg.goto(f'{BASE}/?n=pd#project/Metrics%20Lab'); pg.wait_for_timeout(1800)
    hdr = pg.locator('.wm-pd-header').inner_text()
    check('PRJ-01/02 project header: status badge + performance chip + completion', 'Active' in hdr and '120 · Ahead' in hdr and '60% complete' in hdr, hdr)
    go(pg, 'overview'); pg.click('#rxDashTab-inprogress'); pg.wait_for_timeout(300)
    st = pg.evaluate("()=>{const e=document.querySelector('#rxDashList .wm-badge.status-In-Progress');return e?getComputedStyle(e).backgroundColor:null}")
    check('PRJ-02 task badges use the same map (In Progress = teal)', st == 'rgb(204, 251, 241)', st)
    pg.goto(f'{BASE}/?n=pd2#project/Metrics%20Lab'); pg.wait_for_timeout(1500); pg.screenshot(path=f'{OUT}/03-project-header.png')

    # ================================================================ DSH-01..03
    go(pg, 'overview')
    labels = pg.eval_on_selector_all('.rx-dash-panel [role=tab] .rx-tab-label', 'e=>e.map(x=>x.textContent)')
    check('DSH-01 five tabs with the exact labels', labels == ['Today', 'Upcoming', 'In Progress', 'Overdue', 'Completed'], labels)
    ok_counts = True; detail = []
    for tb in ['today', 'upcoming', 'inprogress', 'overdue', 'completed']:
        pg.click(f'#rxDashTab-{tb}'); pg.wait_for_timeout(250)
        n = int(pg.inner_text(f'#rxDashTab-{tb} .rx-tab-count')); rows = pg.locator('#rxDashList .wm-task-row').count()
        detail.append((tb, n, rows)); ok_counts = ok_counts and n == rows and pg.get_attribute(f'#rxDashTab-{tb}', 'aria-selected') == 'true'
    check('DSH-01 every tab count equals its rows, selected tab marked, no page navigation', ok_counts and '#/overview' in pg.url, detail)
    pg.click('#rxDashTab-today'); pg.wait_for_timeout(200)
    check('DSH-01 Today lists the task due today', 'Due today task' in pg.inner_text('#rxDashList'), [pg.inner_text('#rxDashList')[:200], pg.evaluate('()=>new Date().toString()'), str(TODAY)])
    pg.click('#rxDashTab-completed'); pg.wait_for_timeout(200)
    check('DSH-01 Completed lists closed tasks', 'Finished task' in pg.inner_text('#rxDashList'))
    pg.focus('#rxDashTab-completed'); pg.keyboard.press('ArrowLeft'); pg.wait_for_timeout(200)
    check('DSH-01 arrow keys move between tabs', pg.get_attribute('#rxDashTab-overdue', 'aria-selected') == 'true')
    pg.click('#rxDashTab-upcoming'); pg.wait_for_timeout(200)
    pg.locator('#rxDashList .wm-task-row').first.click(); pg.wait_for_timeout(1200)
    check('DSH-01 a row opens the task detail', pg.locator('#view-task-detail.active').count() == 1)
    go(pg, 'overview')
    check('DSH-01 selected tab kept after returning', pg.get_attribute('#rxDashTab-upcoming', 'aria-selected') == 'true')
    check('DSH-03 no Progress section or Overall Progress card', pg.locator('#ovProgressBody, #ovPeriodToggle').count() == 0 and 'Overall Progress' not in pg.inner_text('#view-overview'))
    bars = pg.locator('.rx-g-bar').count(); inprog = pg.eval_on_selector_all('.rx-g-bar', 'e=>e.map(x=>x.dataset.open)')
    check('DSH-02 Gantt draws a bar for every dated in-progress task', bb['id'] in inprog and 'T_REQ01' in inprog, inprog)
    check('DSH-02 tasks without dates are listed, not drawn', 'Undated in progress' in pg.inner_text('.rx-g-undated') and nodates['id'] not in inprog)
    check('DSH-02 time axis and today marker', pg.locator('.rx-g-axis .rx-g-month').count() >= 1 and pg.locator('.rx-g-today-label').count() == 1)
    check('DSH-02 horizontal scrolling container', css(pg, '.rx-g-scroll', 'overflowX') == 'auto')
    box = pg.locator(f'.rx-g-bar[data-open="{bb["id"]}"]').bounding_box()
    pg.mouse.move(box['x'] + 5, box['y'] + 5); pg.mouse.down(); pg.mouse.move(box['x'] + 200, box['y'] + 5, steps=8); pg.mouse.up(); pg.wait_for_timeout(1200)
    after = J(pg, 'GET', '/api/tasks')['json']['tasks']; t2 = [t for t in after if t['id'] == bb['id']][0]
    check('DSH-02 dragging a bar does not change dates (read-only)', t2['start_date'] == iso(TODAY + timedelta(days=4)) and t2['due_date'] == iso(TODAY + timedelta(days=13)), t2)
    go(pg, 'overview'); pg.click('.rx-gantt [data-scope="mine"]'); pg.wait_for_timeout(300)
    mine = pg.eval_on_selector_all('.rx-g-bar', 'e=>e.map(x=>x.dataset.open)')
    check('DSH-02 "Assigned to me" filter', mine == [bb['id']], mine)
    pg.screenshot(path=f'{OUT}/04-dashboard.png', full_page=True)
    pg.click(f'.rx-g-bar[data-open="{bb["id"]}"]'); pg.wait_for_timeout(1200)
    check('DSH-02 clicking a bar opens the task', pg.locator('#view-task-detail.active').count() == 1)

    # ================================================================ DTL-01 / DTL-02 / DTL-03 (task)
    T = 'T_DEV01'
    open_task(pg, T)
    check('DTL-01 default read mode: no form controls in field rows', visible_inputs(pg, '#wmDetailBody') == 0, visible_inputs(pg, '#wmDetailBody'))
    check('DTL-01 empty values read as text ("Not set" / "No labels")', 'Not set' in pg.inner_text('#wmDetailBody') and 'No labels' in pg.inner_text('#wmDetailBody'))
    check('DTL-03 no Participants panel', 'Participants' not in pg.inner_text('#wmDetailBody') and pg.locator('#wmDetailMembers').count() == 0)
    meta = pg.inner_text('#wmDetailActivity .rx-tl-meta')
    check('DTL-03 Created by / Created / Last updated shown in Activity at the end', 'Created by' in meta and 'Created' in meta and 'Last updated' in meta, meta)
    btns = pg.eval_on_selector_all('#wmDetailActions .rx-actionbar-btns > button, #wmDetailActions [data-act=more]', 'e=>e.map(x=>x.textContent.trim())')
    check('DTL-02 header actions: Edit, Assign, Comment, More', btns[:3] == ['Edit', 'Assign', 'Comment'] and any(x.startswith('More') for x in btns), btns)
    check('DTL-02 old footer buttons are gone from view', not pg.is_visible('#wmDetailSave'))
    pr = pg.locator('.rx-field[data-rx-keys="priority"]')
    pen = pr.locator('.rx-field-edit')
    o0 = pen.evaluate('e=>getComputedStyle(e).opacity'); pr.hover(); pg.wait_for_timeout(250); o1 = pen.evaluate('e=>getComputedStyle(e).opacity')
    check('DTL-01 edit icon appears on hover', o0 == '0' and o1 == '1', (o0, o1))
    pg.mouse.move(5, 5); pen.focus(); pg.wait_for_timeout(250)
    check('DTL-01 edit icon appears on keyboard focus', pen.evaluate('e=>getComputedStyle(e).opacity') == '1')
    sent = []
    pg.on('request', lambda rq: sent.append(rq.post_data) if rq.method == 'PUT' and '/api/tasks/' in rq.url else None)
    pen.click(); pg.wait_for_timeout(300)
    check('DTL-01 single-field edit opens only that field', pg.is_visible('#dPriority') and visible_inputs(pg, '#wmDetailBody') == 1, visible_inputs(pg, '#wmDetailBody'))
    pg.select_option('#dPriority', 'Low'); pr.locator('[data-rx=save-field]').click(); pg.wait_for_timeout(1800)
    body = json.loads(sent[-1]) if sent else {}
    check('DTL-01 Save sends only the changed field (+ version)', set(body.keys()) == {'priority', 'expected_updated_at'} and body['priority'] == 'Low', body)
    check('DTL-01 saved value shown in read mode', 'Low' in pg.locator('.rx-field[data-rx-keys="priority"] .rx-field-view').inner_text())
    tl = pg.inner_text('#wmDetailActivity')
    check('LOG-01 change appears in the task timeline with from → to and actor', 'Priority: High → Low' in tl and 'Ngo Trong Tien' in tl, tl[:300])
    # unsaved-change guard
    pg.locator('.rx-field[data-rx-keys="task"]').hover(); pg.locator('.rx-field[data-rx-keys="task"] .rx-field-edit').click()
    pg.fill('#dTask', 'Changed but not saved'); pg.click('.rx-page-back'); pg.wait_for_timeout(500)
    check('DTL-01 leaving with unsaved changes asks first', pg.locator('.rx-confirm-leave, #wmConfirmModal.open, [role=alertdialog], .rx-notify').count() > 0 and pg.locator('#view-task-detail.active').count() == 1)
    pg.screenshot(path=f'{OUT}/05-unsaved-guard.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    for sel in ['#wmConfirmCancel', '.rx-notify [data-cancel]', '[data-x=cancel]']:
        if pg.locator(sel).count() and pg.is_visible(sel): pg.click(sel); break
    pg.wait_for_timeout(300)
    open_task(pg, T)
    check('DTL-01 cancel / discard keeps the last saved value', 'Phát triển module Task & Project' in pg.inner_text('.rx-field[data-rx-keys="task"] .rx-field-view'))
    # global edit
    pg.click('#wmDetailActions [data-act=edit]'); pg.wait_for_timeout(300)
    check('DTL-01 global Edit unlocks all editable fields', visible_inputs(pg, '#wmDetailBody') >= 10 and pg.is_visible('#wmDetailActions [data-act=save]'))
    pg.screenshot(path=f'{OUT}/06-global-edit.png')
    pg.fill('#dEstHours', '64'); pg.fill('#dDonePct', '30')
    pg.click('#wmDetailActions [data-act=cancel]'); pg.wait_for_timeout(300); confirm(pg)
    check('DTL-01 Cancel restores saved values and read mode', visible_inputs(pg, '#wmDetailBody') == 0 and '60h' in pg.inner_text('.rx-field[data-rx-keys="estimated_hours"]'))
    pg.click('#wmDetailActions [data-act=edit]'); pg.fill('#dEstHours', '64'); pg.fill('#dDonePct', '30'); sent.clear()
    pg.click('#wmDetailActions [data-act=save]'); pg.wait_for_timeout(1800)
    body = json.loads(sent[-1]) if sent else {}
    check('DTL-01 global Save sends just the changed fields', set(body.keys()) == {'estimated_hours', 'progress', 'expected_updated_at'}, body)
    # invalid value
    pg.click('#wmDetailActions [data-act=edit]'); pg.fill('#dTask', '  '); pg.click('#wmDetailActions [data-act=save]'); pg.wait_for_timeout(500)
    check('DTL-01 invalid value (empty name) is refused with a message', pg.locator('.rx-notify').count() > 0 or pg.is_visible('#wmConfirmModal'))
    pg.evaluate("()=>{const b=document.querySelector('.rx-notify [data-ok]'); if(b) b.click();}"); pg.wait_for_timeout(300)
    pg.click('#wmDetailActions [data-act=cancel]'); confirm(pg)
    # concurrent save conflict
    open_task(pg, T)
    J(pg, 'PUT', f'/api/tasks/{T}', {'notes': 'edited elsewhere'})
    pr = pg.locator('.rx-field[data-rx-keys="priority"]'); pr.hover(); pr.locator('.rx-field-edit').click(); pg.select_option('#dPriority', 'High')
    pr.locator('[data-rx=save-field]').click(); pg.wait_for_timeout(1200)
    check('DTL-01 concurrent change → conflict message, nothing overwritten', pg.is_visible('#wmConfirmModal') and 'someone else' in pg.inner_text('#wmConfirmMessage').lower())
    pg.screenshot(path=f'{OUT}/07-conflict.png')
    confirm(pg); pg.wait_for_timeout(800)
    cur = [t for t in J(pg, 'GET', '/api/tasks')['json']['tasks'] if t['id'] == T][0]
    check('DTL-01 conflict kept the other person\'s edit', cur['priority'] == 'Low' and 'edited elsewhere' in cur['notes'], cur['priority'])
    # Assign + Comment
    open_task(pg, T)
    pg.click('#wmDetailActions [data-act=assign]'); pg.wait_for_timeout(300)
    check('DTL-02 Assign opens the existing user picker', pg.evaluate("()=>document.activeElement&&document.activeElement.id")=='dAssigneeSearch')
    pg.click('.rx-field[data-rx-keys^="assignee"] > label'); pg.wait_for_timeout(300)   # close the people list
    pg.click('.rx-field[data-rx-keys^="assignee"] [data-rx=cancel-field]'); pg.wait_for_timeout(400)
    pg.click('#wmDetailActions [data-act=comment]'); pg.wait_for_timeout(600)
    check('DTL-02 Comment focuses the composer', pg.evaluate("()=>document.activeElement&&document.activeElement.id") == 'wmDetailCommentsInput')
    pg.click('#wmDetailActions [data-act=more]'); pg.wait_for_timeout(200)
    items = pg.eval_on_selector_all('#wmDetailActions [role=menuitem]', 'e=>e.map(x=>x.textContent)')
    check('DTL-02 More: Clone, Archive, Move, Convert, Share, Delete', items == ['Clone…', 'Archive', 'Move…', 'Convert…', 'Share', 'Delete'], items)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    check('DTL-02 Escape closes the menu', not pg.is_visible('#wmDetailActions .rx-menu'))

    # ================================================================ ACT-01 clone / archive / restore
    open_task(pg, 'T_DES01')
    pg.click('#wmDetailActions [data-act=more]'); pg.click('[data-menu=clone]'); pg.wait_for_timeout(300)
    check('ACT-01 clone dialog offers the optional subtask copy', pg.is_checked('#rxCloneSubs') and 'Not copied' in pg.inner_text('.rx-dialog'))
    pg.screenshot(path=f'{OUT}/08-clone-dialog.png')
    pg.click('.rx-dialog [data-x=ok]'); pg.wait_for_timeout(2500)
    newid = re.search(r'id=(T[^&]+)', pg.url)
    check('ACT-01 clone opens the new task with a new ID', newid and newid.group(1) != 'T_DES01' and 'Thiết kế hệ thống (copy)' in pg.inner_text('#wmDetailBody'), pg.url)
    CL = newid.group(1) if newid else ''
    subs = [s for s in J(pg, 'GET', '/api/subtasks')['json']['subtasks'] if s['task_id'] == CL]
    check('ACT-01 subtasks copied, work logs not', len(subs) == 2 and not [l for l in J(pg, 'GET', '/api/worklogs')['json'].get('worklogs', []) if l.get('task_id') == CL])
    pg.click('#wmDetailActions [data-act=more]'); pg.click('[data-menu=archive]'); confirm(pg); pg.wait_for_timeout(1500)
    go(pg, 'all'); pg.select_option('#atTimeFilter', 'all'); pg.wait_for_timeout(500)
    check('ACT-01 archived task leaves active lists (All Tasks, every date)', 'Thiết kế hệ thống' in pg.inner_text('#view-all') and 'Thiết kế hệ thống (copy)' not in pg.inner_text('#view-all'))
    pg.click('#rxArchivedBtn'); pg.wait_for_timeout(1200)
    check('ACT-01 Archived view lists it', 'Thiết kế hệ thống (copy)' in pg.inner_text('.rx-arch-list'))
    pg.screenshot(path=f'{OUT}/09-archived.png')
    pg.click(f'.rx-arch-list [data-id="{CL}"]'); pg.wait_for_timeout(1500)
    pg.click('.rx-dialog [data-x=ok]'); pg.wait_for_timeout(500)
    if pg.locator('#atTimeFilter').count(): pg.select_option('#atTimeFilter', 'all'); pg.wait_for_timeout(500)
    check('ACT-01 restore brings it back', 'Thiết kế hệ thống (copy)' in pg.inner_text('#view-all'))
    acts = [a['action'] for a in J(pg, 'GET', f'/api/activity?entity=task&id={CL}')['json']['activity']]
    check('LOG-01 clone, archive and restore are in the timeline', all(x in acts for x in ['clone_task', 'archive_task', 'restore_task']), acts)

    # ================================================================ ACT-03 move
    open_task(pg, CL)
    pg.click('#wmDetailActions [data-act=more]'); pg.click('[data-menu=move]'); pg.wait_for_timeout(300)
    opts = pg.eval_on_selector_all('#rxMoveDest option', 'e=>e.map(x=>x.textContent)')
    check('ACT-03 destination list excludes the current project', P1 not in opts and 'Metrics Lab' in opts, opts)
    pg.click('.rx-dialog [data-x=ok]'); pg.wait_for_timeout(300)
    check('ACT-03 no destination → explained, nothing sent', 'Choose a destination' in pg.inner_text('.rx-dlg-error'))
    pg.select_option('#rxMoveDest', label='Metrics Lab'); pg.click('.rx-dialog [data-x=ok]'); pg.wait_for_timeout(2500)
    moved = [t for t in J(pg, 'GET', '/api/tasks')['json']['tasks'] if t['id'] == CL][0]
    check('ACT-03 task moved, same ID', moved['project'] == 'Metrics Lab')
    check('ACT-03 breadcrumb shows the new project', 'Metrics Lab' in pg.inner_text('.rx-page-crumbs, .rx-crumbs, nav, body'))
    tl = pg.inner_text('#wmDetailActivity')
    check('LOG-01 move shows actor, source and destination', 'Moved' in tl and P1 in tl and 'Metrics Lab' in tl, tl[:300])

    # ================================================================ ACT-02 convert + old links
    sid = subs[0]['id']
    open_sub(pg, sid)
    check('DTL-01 subtask detail also opens in read mode with the action bar', visible_inputs(pg, '#wmSubtaskModalBody') == 0 and 'Participants' not in pg.inner_text('#wmSubtaskModalBody'))
    pg.click('#wmSubtaskActions [data-act=more]'); pg.click('[data-menu=convert]'); pg.wait_for_timeout(300)
    check('ACT-02 convert dialog previews the consequences', 'new task ID' in pg.inner_text('.rx-dialog') and 'links to' in pg.inner_text('.rx-dialog'))
    pg.click('.rx-dialog [data-x=ok]'); pg.wait_for_timeout(2500)
    nt = re.search(r'id=(T[^&]+)', pg.url)
    check('ACT-02 subtask → task opens the new task', nt is not None and pg.locator('#view-task-detail.active').count() == 1, pg.url)
    pg.goto(f'{BASE}/?n=old#/f/subtask?id={sid}'); pg.wait_for_timeout(3000)
    check('ACT-02 old subtask link opens the converted task', nt and nt.group(1) in pg.url, pg.url)
    open_task(pg, CL)
    pg.click('#wmDetailActions [data-act=more]'); pg.click('[data-menu=convert]'); pg.wait_for_timeout(300)
    check('ACT-02 a task with subtasks cannot become a subtask (option disabled)', pg.is_disabled('[name=rxConvTo][value=subtask]'))
    pg.fill('#rxConvName', 'Converted Programme')
    check('ACT-02 preview follows the typed name', 'Converted Programme' in pg.inner_text('.rx-preview'))
    pg.screenshot(path=f'{OUT}/10-convert-dialog.png')
    pg.click('.rx-dialog [data-x=ok]'); pg.wait_for_timeout(3000)
    check('ACT-02 task → project opens the new project with its tasks', 'Converted Programme' in pg.inner_text('.wm-pd-header'))
    pg.goto(f'{BASE}/?n=old2#/f/task?id={CL}'); pg.wait_for_timeout(3000)
    check('ACT-02 old task link opens the new project', 'Converted' in pg.url or 'Converted Programme' in pg.inner_text('body'), pg.url)
    r = J(pg, 'POST', '/api/work-actions', {'action': 'convert', 'type': 'task', 'id': 'T_REQ01', 'to': 'project', 'name': 'Converted Programme'})
    check('ACT-02 invalid conversion (name taken) is refused with an explanation', r['status'] == 409 and 'already exists' in r['json'].get('error', ''), r)
    ctx2, mp, e2 = new_ctx(b); all_errs.append(e2); login_as(mp, MEM)
    r = J(mp, 'POST', '/api/work-actions', {'action': 'archive', 'type': 'task', 'id': 'T_QA01'})
    check('ACT-01 server refuses archive by someone who cannot edit the task', r['status'] == 403, r)
    r = J(mp, 'GET', '/api/activity?entity=project&project=Metrics%20Lab&owner=' + ADMIN)
    check('LOG-01 people without access cannot read a timeline', r['status'] == 403, r['status'])
    ctx2.close()

    # ================================================================ LOG-01 paging
    for i in range(55): J(pg, 'PUT', f'/api/tasks/{T}', {'estimated_hours': 60 + (i % 2)})
    open_task(pg, T)
    n1 = pg.locator('#wmDetailActivity .rx-tl-item').count()
    pg.click('#wmDetailActivity .rx-tl-more'); pg.wait_for_timeout(1200)
    n2 = pg.locator('#wmDetailActivity .rx-tl-item').count()
    check('LOG-01 long history pages 50 at a time with Load older', n1 == 50 and n2 > 50, (n1, n2))
    times = pg.eval_on_selector_all('#wmDetailActivity .rx-tl-item time', 'e=>e.map(x=>x.getAttribute("datetime"))')
    check('LOG-01 newest first, consistent order', times == sorted(times, reverse=True))
    pg.screenshot(path=f'{OUT}/11-timeline.png')

    # ================================================================ phone width + dark
    ctx3, sp, e3 = new_ctx(b, 375, 812, 'dark'); all_errs.append(e3); login_as(sp, ADMIN)
    open_task(sp, T)
    sp.click('#wmDetailActions [data-act=more]'); sp.wait_for_timeout(300)
    mb = sp.locator('#wmDetailActions .rx-menu').bounding_box()
    check('DTL-02 More menu stays inside a 375 px screen', mb and mb['x'] >= 0 and mb['x'] + mb['width'] <= 375, mb)
    sw = sp.evaluate('()=>document.documentElement.scrollWidth')
    check('375 px: no horizontal page overflow on task detail', sw <= 376, sw)
    sp.screenshot(path=f'{OUT}/12-detail-375-dark.png')
    go(sp, 'overview')
    check('375 px: dashboard tabs and timeline without page overflow', sp.evaluate('()=>document.documentElement.scrollWidth') <= 376)
    sp.screenshot(path=f'{OUT}/13-dashboard-375-dark.png', full_page=True)
    ctx3.close()

    errs_all = [e for es in all_errs for e in es]
    check('No JavaScript page errors', not errs_all, errs_all[:3])
    b.close()

print(f"\n{sum(1 for _, ok in results if ok)}/{len(results)} e2e235 checks passed")
sys.exit(0 if all(ok for _, ok in results) else 1)
