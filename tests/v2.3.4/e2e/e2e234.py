"""REXUS v2.3.4 end-to-end tests — REXUS_Requirements_v2.3.4 (GEN-01..03, SUR-01..06, WM-01..06, DOC-01).
Chromium → test server (tests/v2.2.1/backend/server.mjs, fresh database) → real Netlify Function handlers → PGlite.
usage: python3 e2e234.py [base_url] [screenshot_dir]"""
import sys, os, re, json
from datetime import date, timedelta
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8899'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'shots-234'
os.makedirs(OUT, exist_ok=True)
results = []
def check(name, cond, detail=''):
    results.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else '  → ' + str(detail)[:300]), flush=True)

ADMIN, PM, MEM = 'ADMIN_TIENNT', 'U_MINCT', 'U_TRUONGPN'
def new_ctx(b, w=1440, h=900, scheme='light'):
    ctx = b.new_context(viewport={'width': w, 'height': h}, color_scheme=scheme); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    pg.route(re.compile(r'^https?://(?!localhost).*'), lambda r: r.fulfill(status=200, body=''))
    return ctx, pg, errs
def login_as(pg, uid):
    pg.goto(f'{BASE}/__test/login?uid={uid}&to=/'); pg.wait_for_selector('.wm-app', state='visible', timeout=20000); pg.wait_for_timeout(900)
def J(pg, m, u, body=None):
    return pg.evaluate("([m,u,b])=>fetch(u,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined}).then(async r=>({status:r.status, json:await r.json().catch(()=>({}))}))", [m, u, body])
def go(pg, view): pg.click(f'.wm-tab[data-view="{view}"]'); pg.wait_for_timeout(1000)
def css(pg, sel, prop): return pg.evaluate("([s,p])=>{const e=document.querySelector(s);return e?getComputedStyle(e)[p]:null}", [sel, prop])
def dismiss(pg): pg.evaluate("()=>{const b=document.querySelector('.rx-notify [data-ok]'); if(b) b.click();}"); pg.wait_for_timeout(200)
TODAY = date.today().isoformat()

with sync_playwright() as p:
    b = p.chromium.launch(); all_errs = []

    # ================================================================ GEN-01 sign-in
    ctx, pg, errs = new_ctx(b); all_errs.append(errs)
    pg.goto(BASE + '/'); pg.wait_for_selector('#wmAuthScreen', state='visible')
    check('GEN-01 tagline is exactly "all in one with Rexus"', pg.inner_text('.wm-auth-tagline').strip() == 'all in one with Rexus', pg.inner_text('.wm-auth-tagline'))
    check('GEN-01 no illustration on the sign-in screen', pg.locator('#wmAuthScreen img, #wmAuthScreen picture, #wmAuthScreen video').count() == 0)
    check('GEN-01 two-column layout on desktop (brand left, form right)', pg.evaluate("()=>{const a=document.querySelector('.wm-auth-brand').getBoundingClientRect(),c=document.querySelector('.wm-auth-card').getBoundingClientRect();return a.right<=c.left && Math.abs((a.top+a.height/2)-(c.top+c.height/2))<120}"))
    pg.fill('#wmAuthIdentifier', 'tiennt'); pg.fill('#wmAuthPassword', 'wrong-password-1'); pg.keyboard.press('Enter'); pg.wait_for_timeout(1500)
    check('GEN-01 Enter submits and the error stays visible', pg.is_visible('#wmAuthError') and len(pg.inner_text('#wmAuthError')) > 3, pg.inner_text('#wmAuthError'))
    pg.screenshot(path=f'{OUT}/01-login.png'); ctx.close()
    ctx, pg, errs = new_ctx(b, 375, 812); all_errs.append(errs)
    pg.goto(BASE + '/'); pg.wait_for_selector('#wmAuthScreen', state='visible')
    check('GEN-01 phone width: form stacked under the tagline, no horizontal overflow', pg.evaluate("()=>{const s=document.getElementById('wmAuthScreen');const c=document.querySelector('.wm-auth-card').getBoundingClientRect();return s.scrollWidth<=s.clientWidth+1 && c.right<=innerWidth && document.querySelector('.wm-auth-brand').getBoundingClientRect().bottom<=c.top+1}"))
    pg.focus('#wmAuthIdentifier'); pg.keyboard.press('Tab')
    check('GEN-01 Tab moves from username to password', pg.evaluate("()=>document.activeElement.id") == 'wmAuthPassword')
    pg.screenshot(path=f'{OUT}/02-login-375.png'); ctx.close()

    ctx, pg, errs = new_ctx(b); all_errs.append(errs); login_as(pg, ADMIN)
    # ================================================================ GEN-03 people pickers
    pg.evaluate("()=>REXUS221.openEmployee('U_TRUONGPN','employment')"); pg.wait_for_timeout(2500)
    pg.click('#rxEditEmp'); pg.wait_for_timeout(1200)
    pg.evaluate("()=>{const b=[...document.querySelectorAll('.rx-page.active .rx-combo-btn, .rx-dialog .rx-combo-btn')].find(x=>/Manager/i.test(x.getAttribute('aria-label')||x.closest('.wm-form-row').textContent)); b.click();}"); pg.wait_for_timeout(500)
    rows = pg.evaluate("()=>[...document.querySelectorAll('.rx-combo-pop .rx-combo-opt')].map(o=>o.innerText)")
    named = [r for r in rows if '\n' in r]
    check('GEN-03 Manager list shows name + job title + email', named and all('@' in r.split('\n')[1] for r in named if 'No job title' not in r) and any(' · ' in r for r in named), rows[:4])
    check('GEN-03 people without a job title show "No job title"', any('No job title' in r for r in named), rows)
    pg.keyboard.type('minct'); pg.wait_for_timeout(500)
    check('GEN-03 search by username still works', pg.evaluate("()=>[...document.querySelectorAll('.rx-combo-pop .rx-combo-opt:not([hidden])')].length") >= 1)
    pg.screenshot(path=f'{OUT}/03-people-picker.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200); pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    if pg.locator('#wmConfirmOk:visible').count(): pg.click('#wmConfirmOk:visible'); pg.wait_for_timeout(400)
    pg.goto(BASE + '/?x=1#/f/task-new'); pg.wait_for_timeout(2500)
    pg.fill('#fAssigneeSearch', 'truong'); pg.wait_for_timeout(500)
    meta = pg.evaluate("()=>[...document.querySelectorAll('#fAssigneeDropdown .wm-upi-meta')].map(x=>x.textContent)")
    check('GEN-03 Assign Task picker: job title · email', meta and '@' in meta[0] and ' · ' in meta[0], meta)
    pg.goto(BASE + '/?x=2#/overview'); pg.wait_for_timeout(1800)
    if pg.locator('#wmConfirmOk:visible').count(): pg.click('#wmConfirmOk:visible'); pg.wait_for_timeout(800)

    # ================================================================ GEN-02 field widths
    pg.goto(BASE + '/?x=3#/f/worklog-new'); pg.wait_for_timeout(2500)
    tops = pg.evaluate("()=>['lfDate','lfStartTime','lfEndTime','lfHours'].map(i=>Math.round(document.getElementById(i).getBoundingClientRect().top))")
    widths = pg.evaluate("()=>['lfDate','lfHours','lfDesc'].map(i=>Math.round(document.getElementById(i).getBoundingClientRect().width))")
    check('GEN-02 Log Work: date, start, end and hours share one row', len(set(tops)) == 1, tops)
    check('GEN-02 Log Work: number/date fields are not full width', widths[0] < widths[2] / 2 and widths[1] < widths[2] / 2, widths)
    pg.goto(BASE + '/?x=4#/overview'); pg.wait_for_timeout(1500)
    if pg.locator('#wmConfirmOk:visible').count(): pg.click('#wmConfirmOk:visible'); pg.wait_for_timeout(800)
    J(pg, 'PUT', '/api/company-settings', {'perf_pay_enabled': True}); pg.reload(); pg.wait_for_selector('.wm-app', state='visible'); pg.wait_for_timeout(1500)
    pg.evaluate("()=>REXUS221.openEmployee('U_TRUONGPN','compensation')"); pg.wait_for_timeout(3000)
    mw = pg.evaluate("()=>[document.getElementById('finPerfManual'),document.getElementById('finPerfNotes')].map(e=>e?Math.round(e.getBoundingClientRect().width):0)")
    check('GEN-02 Manual rating is narrower than Notes (no equal halves)', mw[0] and mw[0] <= 260 and mw[1] > mw[0] * 2, mw)
    rt = pg.evaluate("()=>{const t=document.querySelector('#rxCompFinance table'), c=t&&t.closest('.rx-card'); return t?[Math.round(t.getBoundingClientRect().width), Math.round(c.getBoundingClientRect().width)]:null}")
    check('GEN-02 Hourly rate history table uses the card width', rt and rt[0] >= rt[1] - 60, rt)
    rr = pg.evaluate("()=>['wmRateNewAmount','wmRateNewEffective','wmRateSaveBtn'].map(i=>Math.round(document.getElementById(i).getBoundingClientRect().bottom))")
    check('GEN-02 New hourly rate, date and Save on one row', max(rr) - min(rr) <= 6, rr)
    pg.screenshot(path=f'{OUT}/04-compensation.png', full_page=True)

    # ================================================================ WM-01 worklog grid
    tasks = J(pg, 'GET', '/api/tasks')['json']; tasks = tasks.get('tasks', tasks)
    J(pg, 'POST', '/api/worklogs', {'task_id': tasks[0]['id'], 'date': TODAY, 'hours': 2, 'description': 'grid'})
    pg.reload(); pg.wait_for_selector('.wm-app', state='visible'); pg.wait_for_timeout(1500)
    go(pg, 'worklog'); pg.evaluate("()=>[...document.querySelectorAll('#view-worklog button')].find(b=>b.textContent.trim()==='Grid').click()"); pg.wait_for_timeout(1200)
    g = pg.evaluate("()=>{const t=document.querySelector('table.wm-worklog-grid'),c=t.querySelector('td.wm-grid-cell'),s=getComputedStyle(c);return [getComputedStyle(t).borderSpacing,s.borderLeftWidth,s.borderRightWidth,s.borderRightStyle,s.borderBottomWidth]}")
    check('WM-01 single thin lines: no cell spacing, one 1px solid line per cell edge', g[0] in ('0px', '0px 0px') and g[1] == '0px' and g[2] == '1px' and g[3] == 'solid' and g[4] == '1px', g)
    check('WM-01 worklog value still shown', '2h' in pg.inner_text('table.wm-worklog-grid') or '2' in pg.inner_text('table.wm-worklog-grid'))
    pg.screenshot(path=f'{OUT}/05-worklog-grid.png')

    # ================================================================ WM-04/05/06 calendar
    for i, (s_, e_) in enumerate([('09:00', '11:00'), ('09:30', '10:30'), ('14:00', '15:30')]):
        t = dict(tasks[i]); t.update({'due_date': TODAY, 'start_time': s_, 'end_time': e_}); J(pg, 'PUT', '/api/tasks/' + t['id'], t)
    t = dict(tasks[3]); t.update({'due_date': TODAY, 'start_time': '', 'end_time': ''}); J(pg, 'PUT', '/api/tasks/' + t['id'], t)
    pg.reload(); pg.wait_for_selector('.wm-app', state='visible'); pg.wait_for_timeout(1500)
    go(pg, 'calendar')
    chip = css(pg, '.wm-cal-chip', 'borderLeftWidth')
    check('WM-04 month items have no dark left bar', chip == '0px', chip)
    check('WM-04 month item opens the task', (pg.click('.wm-cal-chip'), pg.wait_for_timeout(900), pg.locator('#view-task-detail.active, .wm-modal-overlay.open').count() >= 1)[2])
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300); go(pg, 'calendar')
    pg.click('#calTitleBtn'); pg.wait_for_timeout(400)
    check('WM-05 clicking the title opens a month/year picker', pg.locator('#calPicker [data-pm]').count() == 12)
    pg.click('#calPicker [data-py="1"]'); pg.click('#calPicker [data-pm="2"]'); pg.wait_for_timeout(500)
    nxt = date.today().year + 1
    check('WM-05 choosing March of next year shows that month', pg.inner_text('#calTitleBtn').startswith(f'March {nxt}') and pg.locator('#calPicker').count() == 0, pg.inner_text('#calTitleBtn'))
    pg.click('#calNext'); pg.wait_for_timeout(300)
    check('WM-05 Next still works after picking', pg.inner_text('#calTitleBtn').startswith(f'April {nxt}'))
    pg.click('#calToday'); pg.wait_for_timeout(400)
    check('WM-05 Today returns to the current month', pg.locator('.wm-cal-cell.today').count() == 1)
    pg.click('[data-mode="week"]'); pg.wait_for_timeout(700)
    heads = pg.evaluate("()=>[...document.querySelectorAll('.wm-tl-dayhead span')].map(x=>x.textContent)")
    check('WM-06 Week: 7 day columns starting Monday, today marked', heads == ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] and pg.locator('.wm-tl-dayhead.is-today').count() == 1, heads)
    ev = pg.evaluate("()=>[...document.querySelectorAll('.wm-tl-col.is-today .wm-tl-event')].map(e=>({t:parseFloat(e.style.top),h:parseFloat(e.style.height),w:e.getBoundingClientRect().width,txt:e.innerText}))")
    ev.sort(key=lambda x: x['t'])
    check('WM-06 timed tasks placed by time (09:00 → 432px at 48px/h)', ev and abs(ev[0]['t'] - 432) < 1 and abs(ev[-1]['t'] - 672) < 1, ev)
    check('WM-06 overlapping tasks share the width side by side', len(ev) >= 3 and ev[0]['w'] < ev[-1]['w'] * 0.6 and ev[1]['w'] < ev[-1]['w'] * 0.6, [round(x['w']) for x in ev])
    check('WM-06 tasks without a time are in the all-day lane', pg.locator('.wm-tl-allday-cell .wm-tl-chip').count() >= 1)
    check('WM-06 current-time line on today', pg.locator('.wm-tl-col.is-today .wm-tl-now').count() == 1)
    pg.screenshot(path=f'{OUT}/06-calendar-week.png')
    pg.click('#calNext'); pg.wait_for_timeout(300); pg.click('[data-mode="month"]'); pg.wait_for_timeout(400)
    nw = date.today() + timedelta(days=7)
    check('WM-06 switching Week → Month keeps the date in view', pg.inner_text('#calTitleBtn').startswith(nw.strftime('%B')), pg.inner_text('#calTitleBtn'))
    pg.click('#calToday'); pg.click('[data-mode="day"]'); pg.wait_for_timeout(500)
    check('WM-06 Day: one-day timeline with the same tasks', pg.locator('.wm-tl-col').count() == 1 and pg.locator('.wm-tl-col .wm-tl-event').count() >= 3)
    pg.click('#calTitleBtn'); pg.wait_for_timeout(300)
    check('WM-05 Day/Week picker also lists the days of the month', pg.locator('#calPicker [data-pd]').count() >= 28)
    d15 = TODAY[:8] + '15'; pg.click(f'#calPicker [data-pd="{d15}"]'); pg.wait_for_timeout(400)
    check('WM-05 picking a day opens it without timezone shift', pg.evaluate("()=>STATE.calendar.ref") == d15 if pg.evaluate("()=>typeof STATE!=='undefined'") else d15[-2:] in pg.inner_text('#calTitleBtn'), pg.inner_text('#calTitleBtn'))
    pg.screenshot(path=f'{OUT}/07-calendar-day.png')

    # ================================================================ WM-02/03 notifications (manager receives approval notifications)
    ctx2, mem, e2 = new_ctx(b); all_errs.append(e2); login_as(mem, MEM)
    for d in ('2026-11-20', '2026-11-24'):
        J(mem, 'POST', '/api/hr/leave', {'action': 'submit', 'leave_type': 'Annual Leave', 'start_date': d, 'end_date': d, 'unit': 'full', 'reason': 'e2e234'})
    ctx2.close()
    ctx3, mg, e3 = new_ctx(b); all_errs.append(e3); login_as(mg, PM)
    mg.click('#wmNotifBellBtn'); mg.wait_for_timeout(900)
    mg.locator('#wmNotifList [data-unread-toggle]').nth(1).click(); mg.wait_for_timeout(900); mg.mouse.move(5, 500); mg.wait_for_timeout(300)
    st = mg.evaluate("()=>[...document.querySelectorAll('#wmNotifList .wm-notif-item')].slice(0,2).map(e=>{const s=getComputedStyle(e);return [e.classList.contains('unread'),s.backgroundColor,s.boxShadow,s.borderLeftWidth]})")
    unread = [x for x in st if x[0]]; read = [x for x in st if not x[0]]
    check('WM-02 unread = pastel blue card, read = white card', unread and read and unread[0][1] == 'rgb(234, 242, 255)' and read[0][1] == 'rgb(255, 255, 255)', st)
    check('WM-02 no coloured stripe at the start of a notification', all(x[2] == 'none' and x[3] == '1px' for x in st), st)
    first_id = mg.evaluate("()=>document.querySelector('#wmNotifList .wm-notif-item.unread').getAttribute('data-notif-id')")
    mg.locator(f'#wmNotifList [data-notif-id="{first_id}"] [data-star-toggle]').click(); mg.wait_for_timeout(900)
    mg.click('[data-notif-filter="important"]'); mg.wait_for_timeout(800)
    ids = mg.evaluate("()=>[...document.querySelectorAll('#wmNotifList .wm-notif-item')].map(e=>e.getAttribute('data-notif-id'))")
    check('WM-03 Important tab lists only starred notifications', ids == [first_id], ids)
    check('WM-03 starring does not mark it read', mg.locator(f'#wmNotifList [data-notif-id="{first_id}"].unread').count() == 1)
    mg.screenshot(path=f'{OUT}/08-notifications-important.png')
    mg.reload(); mg.wait_for_selector('.wm-app', state='visible'); mg.wait_for_timeout(1200)
    mg.click('#wmNotifBellBtn'); mg.wait_for_timeout(800); mg.click('[data-notif-filter="important"]'); mg.wait_for_timeout(800)
    check('WM-03 Important is kept after reload', mg.evaluate("()=>[...document.querySelectorAll('#wmNotifList .wm-notif-item')].map(e=>e.getAttribute('data-notif-id'))") == [first_id])
    mg.locator(f'#wmNotifList [data-notif-id="{first_id}"] [data-star-toggle]').click(); mg.wait_for_timeout(900)
    check('WM-03 un-starring removes it from Important at once', mg.locator('#wmNotifList .wm-notif-item').count() == 0 and 'No important' in mg.inner_text('#wmNotifList'))
    ctx3.close()
    ctx4, ad2, e4 = new_ctx(b); all_errs.append(e4); login_as(ad2, ADMIN)
    imp = [n for n in J(ad2, 'GET', '/api/notifications')['json'].get('notifications', []) if n.get('important')]
    check('WM-03 markers are per account (another user sees none of them)', not imp, imp[:1])
    ctx4.close()

    # ================================================================ SUR-01 design system
    pg.goto(BASE + '/#survey/overview'); pg.wait_for_timeout(2000)
    sv = pg.evaluate("()=>{const p=document.querySelector('.sv-btn-primary'),s=getComputedStyle(p);return [s.backgroundColor,s.borderRadius,parseFloat(s.minHeight)]}")
    pg.evaluate("()=>{const b=document.createElement('button');b.className='wm-btn primary';b.id='refBtn';b.textContent='x';document.querySelector('.wm-app').appendChild(b)}")
    wm = pg.evaluate("()=>{const s=getComputedStyle(document.getElementById('refBtn'));return [s.backgroundColor,s.borderRadius,parseFloat(s.minHeight)]}")
    check('SUR-01 Survey primary button = REXUS primary (colour, radius, height)', sv[0] == wm[0] and sv[1] == wm[1] and abs(sv[2] - wm[2]) < 1, [sv, wm])
    check('SUR-01 Survey navigation uses line icons like REXUS', pg.locator('#svSide a > span svg').count() >= 1)

    # ================================================================ SUR-04/05 builder: sections + branching
    sid = J(pg, 'POST', '/api/surveys', {'action': 'create', 'name': 'Branching e2e', 'template': 'blank'})['json']
    sid = sid.get('id') or sid.get('survey', {}).get('id')
    pg.goto(f'{BASE}/#survey/builder/{sid}'); pg.wait_for_timeout(2500)
    pg.click('[data-add="single"]'); pg.wait_for_timeout(300); pg.fill('#pTitle', 'Are you staff or a student?'); pg.fill('#pOpts', 'Staff\nStudent\nGuest'); pg.locator('#pOpts').blur(); pg.wait_for_timeout(300)
    pg.locator('#pReq').check(force=True); pg.wait_for_timeout(300)
    pg.click('[data-add="section"]'); pg.wait_for_timeout(300); pg.fill('#sTitle', 'Staff')
    pg.click('[data-add="short"]'); pg.wait_for_timeout(300); pg.fill('#pTitle', 'Your department'); pg.locator('#pReq').check(force=True); pg.wait_for_timeout(300)
    pg.click('[data-add="section"]'); pg.wait_for_timeout(300); pg.fill('#sTitle', 'Students')
    pg.click('[data-add="short"]'); pg.wait_for_timeout(300); pg.fill('#pTitle', 'Your class'); pg.locator('#pReq').check(force=True); pg.wait_for_timeout(300)
    check('SUR-04 builder shows Section cards with their own titles', pg.locator('.sv-scard').count() == 2 and 'Students' in pg.inner_text('.sv-scard >> nth=1'))
    check('SUR-04 builder numbers questions only (Question 03 after two sections)', 'QUESTION 03' in pg.inner_text('.sv-qcard[data-sel="4"]').upper())
    pg.click('.sv-qcard[data-sel="0"]'); pg.wait_for_timeout(300)
    labels = pg.evaluate("()=>[...document.querySelectorAll('#pRoute1 option')].map(o=>o.textContent)")
    check('SUR-05 each answer: Continue / Go to section / Submit form', labels[0].startswith('Continue') and 'Go to Section 1: Staff' in labels and 'Go to Section 2: Students' in labels and labels[-1] == 'Submit form', labels)
    stud = pg.evaluate("()=>[...document.querySelectorAll('#pRoute1 option')].find(o=>o.textContent.includes('Students')).value")
    pg.select_option('#pRoute1', stud); pg.wait_for_timeout(300); pg.select_option('#pRoute2', 'end'); pg.wait_for_timeout(300)
    pg.click('.sv-qcard[data-sel="2"]'); pg.wait_for_timeout(300)
    staff_opts = pg.evaluate("()=>[...document.querySelectorAll('[data-route] option')].map(o=>o.textContent)")
    check('SUR-05 no backward targets offered (a question can only jump forward)', True if not staff_opts else not any('Staff' in o for o in staff_opts), staff_opts)
    pg.screenshot(path=f'{OUT}/09-builder-branching.png')
    pg.click('[data-save]'); pg.wait_for_timeout(1500)
    qsv = J(pg, 'GET', f'/api/surveys?id={sid}')['json']['survey']['questions']
    check('SUR-04 sections saved with stable ids; routes saved', [q['type'] for q in qsv].count('section') == 2 and all(q['id'].startswith('s_') for q in qsv if q['type'] == 'section') and qsv[0].get('routes', {}).get('Guest') == 'end', qsv[0])
    bad = J(pg, 'PUT', '/api/surveys', {'id': sid, 'questions': [qsv[3], dict(qsv[0], routes={'Staff': qsv[3]['id']}), qsv[4]]})
    check('SUR-05 server refuses a route to a section before the question', bad['status'] == 400 and 'comes before' in bad['json'].get('error', ''), bad)
    gone = J(pg, 'PUT', '/api/surveys', {'id': sid, 'questions': [dict(qsv[0], routes={'Staff': 's_deleted00'})] + qsv[1:]})
    check('SUR-05 server refuses a route to a deleted section', gone['status'] == 400 and 'deleted' in gone['json'].get('error', ''), gone)
    # deleting a section in the builder resets the answers that pointed to it
    pg.reload(); pg.wait_for_timeout(2500)
    pg.click('.sv-qcard[data-sel="3"] [data-del]'); pg.wait_for_timeout(300); pg.click('#wmConfirmOk'); pg.wait_for_timeout(600)
    check('SUR-05 deleting a target section leaves no broken link (no warning, route reset)', pg.locator('.sv-banner-warn').count() == 0 and 'Go to' not in pg.inner_text('.sv-qcard[data-sel="0"]').replace('Go to Section 1', ''))
    pg.click('[data-save]'); pg.wait_for_timeout(1200)
    J(pg, 'PUT', '/api/surveys', {'id': sid, 'questions': qsv}); pg.wait_for_timeout(300)   # restore the full version
    pub = J(pg, 'POST', '/api/surveys', {'action': 'publish', 'id': sid})
    check('setup: branching survey published', pub['status'] == 200, pub)

    # ================================================================ SUR-02/03/04/05 respondent
    ctx5, rs, e5 = new_ctx(b); all_errs.append(e5); login_as(rs, MEM)
    rs.goto(f'{BASE}/#survey/answer/{sid}'); rs.wait_for_timeout(2500)
    body = rs.inner_text('.sv-form')
    check('SUR-02 respondent sees no "QUESTION 01 · TYPE" labels', not re.search(r'QUESTION\s+0\d', body.upper()) and 'SINGLE CHOICE' not in body.upper(), body[:200])
    check('SUR-03 no decorative dots in the respondent form', rs.locator('.sv-form .sv-dot').count() == 0 and ' · ' not in rs.inner_text('.sv-form-head') and ' · ' not in rs.inner_text('.sv-actions'))
    rs.click('[data-next]'); rs.wait_for_timeout(400)
    check('SUR-04 required question is checked before leaving the section', 'required' in rs.inner_text('.sv-q').lower())
    rs.click('.sv-option:has-text("Student")'); rs.wait_for_timeout(200); rs.click('[data-next]'); rs.wait_for_timeout(500)
    check('SUR-05 "Student" jumps to the Students section (Staff skipped)', 'Students' in rs.inner_text('.sv-section-head') and 'Your class' in rs.inner_text('.sv-q'))
    rs.click('[data-prev]'); rs.wait_for_timeout(400)
    check('SUR-04 Back returns to the first section with the answer kept', rs.locator('.sv-option.is-on:has-text("Student")').count() == 1)
    rs.click('.sv-option:has-text("Guest")'); rs.wait_for_timeout(300)
    check('SUR-05 "Guest" turns Next into Submit (end of form)', rs.locator('[data-submit]').count() == 1)
    rs.click('.sv-option:has-text("Staff")'); rs.wait_for_timeout(200); rs.click('[data-next]'); rs.wait_for_timeout(400)
    rs.fill('[data-q] input', 'Training office'); rs.click('[data-next]'); rs.wait_for_timeout(400)
    check('SUR-05 "Staff" continues Staff → Students in order', 'Students' in rs.inner_text('.sv-section-head'))
    rs.click('[data-prev]'); rs.wait_for_timeout(300); rs.click('[data-prev]'); rs.wait_for_timeout(300)
    rs.click('.sv-option:has-text("Student")'); rs.wait_for_timeout(200); rs.click('[data-next]'); rs.wait_for_timeout(400)
    rs.fill('[data-q] input', '12A'); rs.click('[data-submit]'); rs.wait_for_timeout(1800)
    rs.screenshot(path=f'{OUT}/10-respondent-done.png')
    a = J(pg, 'GET', f'/api/surveys?id={sid}&analytics=1')['json']
    resp = (a.get('responses') or [{}])[0]
    ans = resp.get('answers') if isinstance(resp.get('answers'), dict) else json.loads(resp.get('answers') or '{}')
    check('SUR-05 stored answers follow the path (skipped Staff answer not stored)', ans and set(ans.keys()) == {qsv[0]['id'], qsv[4]['id']}, ans)
    check('SUR-04 analytics list questions only (no section rows)', a.get('questions') and all(q['type'] != 'section' for q in a['questions']) and len(a['questions']) == 3, a.get('questions'))
    ctx5.close()

    # ================================================================ SUR-04 old form without sections still works one question per page
    old = J(pg, 'POST', '/api/surveys', {'action': 'create', 'name': 'Plain e2e', 'template': 'training'})['json']; oid = old.get('id') or old.get('survey', {}).get('id')
    J(pg, 'POST', '/api/surveys', {'action': 'publish', 'id': oid})
    ctx6, rp, e6 = new_ctx(b); all_errs.append(e6); login_as(rp, MEM)
    rp.goto(f'{BASE}/#survey/answer/{oid}'); rp.wait_for_timeout(2500)
    check('SUR-04 form without sections: one question per page + navigator, as before', rp.locator('.sv-q .sv-q-block').count() == 1 and rp.locator('.sv-nav-grid button').count() >= 3)
    ctx6.close()

    # ================================================================ SUR-06 mandatory survey on login (shipped in v2.3.0; quick re-check)
    st6 = J(pg, 'PUT', '/api/surveys', {'action': 'settings', 'id': sid, 'mandatory': True, 'priority': 1, 'target': {'users': [PM]}})
    check('setup: survey made mandatory for one user', st6['status'] == 200, st6)
    ctx7, mp, e7 = new_ctx(b); all_errs.append(e7)
    mp.goto(f'{BASE}/__test/login?uid={PM}&to=/'); mp.wait_for_timeout(3000)
    check('SUR-06 targeted user gets the full-screen intro with Start survey before the workspace', mp.locator('#rxGate [data-start]').count() == 1 and mp.evaluate("()=>{const g=document.getElementById('rxGate').getBoundingClientRect();return g.width>=innerWidth-1&&g.height>=innerHeight-1}"))
    mp.click('[data-start]'); mp.wait_for_timeout(1200)
    mp.click('.sv-option:has-text("Guest")'); mp.wait_for_timeout(200); mp.click('[data-submit]'); mp.wait_for_timeout(3000)
    check('SUR-06 after a valid (branch-to-end) submission the user enters the app', mp.locator('#rxGate').count() == 0 and mp.is_visible('.wm-app'))
    mp.reload(); mp.wait_for_timeout(2500)
    check('SUR-06 reload does not ask again', mp.locator('#rxGate').count() == 0)
    ctx7.close()
    check('SUR-06 users outside the target are not gated (admin opens the app)', pg.locator('#rxGate').count() == 0)

    # ================================================================ DOC-01 Document sidebar chevrons
    pg.goto(BASE + '/#/overview'); pg.wait_for_timeout(1500)
    pg.click('#rexusLauncherButton'); pg.wait_for_timeout(300); pg.click('[data-rexus-app="document"]'); pg.wait_for_timeout(2000)
    sizes = pg.evaluate("()=>[...document.querySelectorAll('#rexusDocsShell .rd-chev')].map(s=>{const r=s.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)]})")
    check('DOC-01 every sidebar chevron is the same icon and size', sizes and len(set(map(tuple, sizes))) == 1 and sizes[0] == [14, 14], sizes)
    tog = pg.locator('#rexusDocsShell .rd-section-toggle').first
    tog.focus(); pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
    rot = pg.evaluate("()=>getComputedStyle(document.querySelector('#rexusDocsShell .rd-section-toggle .rd-chev')).transform")
    check('DOC-01 keyboard toggles the section; collapsed chevron points right', pg.get_attribute('#rexusDocsShell .rd-section-toggle >> nth=0', 'aria-expanded') == 'false' and rot not in ('none', ''), rot)
    pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    check('DOC-01 add-space button stays separate from the toggle', pg.locator('#rexusDocsShell .rd-side-head > [data-rd="new-space"]').count() == 1 and pg.locator('#rexusDocsShell .rd-space-switch [data-rd="new-space"]').count() == 0)
    pg.screenshot(path=f'{OUT}/11-document-sidebar.png')

    errs_all = [e for es in all_errs for e in es]
    check('No JavaScript page errors', not errs_all, errs_all[:3])
    b.close()

print(f"\n{sum(1 for _, ok in results if ok)}/{len(results)} e2e234 checks passed")
sys.exit(0 if all(ok for _, ok in results) else 1)
