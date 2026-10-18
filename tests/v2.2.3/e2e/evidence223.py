"""Before/after screenshots for v2.2.3 (GEN-08…12). usage: python3 evidence223.py <base_url> <out_dir> <before|after> [light|dark]"""
import sys, os, re
from playwright.sync_api import sync_playwright
BASE, OUT, TAG = sys.argv[1], sys.argv[2], sys.argv[3]
MODE = sys.argv[4] if len(sys.argv) > 4 else 'light'
os.makedirs(OUT, exist_ok=True)
def shot(page, name): page.screenshot(path=f'{OUT}/{name}-{TAG}{"-dark" if MODE == "dark" else ""}.png')
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1440, 'height': 900}, color_scheme=MODE); page = ctx.new_page()
    page.route(re.compile(r'^https?://(?!localhost).*'), lambda r: r.fulfill(status=200, body=''))
    page.goto(f'{BASE}/__test/login?uid=ADMIN_TIENNT&to=/'); page.wait_for_selector('.wm-app', state='visible'); page.wait_for_timeout(1200)
    page.evaluate("(m)=>{document.documentElement.setAttribute('data-rx-mode', m)}", MODE)
    def go(v): page.evaluate("(v)=>{const t=document.querySelector('.wm-tab[data-view=\"'+v+'\"]'); t&&t.click();}", v); page.wait_for_timeout(1800)
    for v, n in [('overview', 'overview'), ('all', 'all-tasks'), ('projects', 'projects'), ('worklog', 'work-log'), ('calendar', 'calendar'), ('approval-center', 'approval-center'), ('finance', 'finance')]:
        go(v); shot(page, n)
    go('approval-center'); page.evaluate("()=>{const t=document.querySelector('#apTabs [data-tab=\"all\"]'); t&&t.click()}"); page.wait_for_timeout(1500); shot(page, 'approval-all')
    go('organization'); page.evaluate("()=>document.querySelector('#rxHrTabs [data-tab=\"leave\"]').click()"); page.wait_for_timeout(1500); shot(page, 'hrm-leave')
    page.evaluate("()=>document.querySelector('#rxHrTabs [data-tab=\"capacity\"]').click()"); page.wait_for_timeout(1500)
    page.evaluate("()=>{const t=document.querySelector('#rxCapTabs [data-tab=\"team\"]'); t&&t.click()}"); page.wait_for_timeout(1500); shot(page, 'hrm-team-schedules')
    page.click('#rxSendReq'); page.wait_for_timeout(800); shot(page, 'request-schedules')
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    if page.evaluate("()=>!!document.querySelector('.rx-page.active')"): page.click('.rx-page.active [data-rx-back]'); page.wait_for_timeout(500)
    go('finance'); page.evaluate("()=>{const b=[...document.querySelectorAll('#view-finance button')].find(x=>/project financ/i.test(x.textContent)); b&&b.click()}"); page.wait_for_timeout(1500)
    page.evaluate("()=>{const r=document.querySelector('#fnList tr[data-i]'); r&&r.click()}"); page.wait_for_timeout(1500)
    page.evaluate("()=>{const t=document.querySelector('#fnTabs [data-tab=\"ledger\"]'); t&&t.click()}"); page.wait_for_timeout(1500); shot(page, 'finance-ledger')
    # a result notification
    page.evaluate("()=>{ if (window.REXUSNotify) REXUSNotify('Task saved', 'success', {duration: 60000}); else { const t=document.getElementById('wmConfirmPopupText'); t.textContent='Task saved'; document.getElementById('wmConfirmPopup').className='wm-confirm-popup show'; } }"); page.wait_for_timeout(400); shot(page, 'notification-success')
    page.evaluate("()=>{ if (window.REXUSNotify) REXUSNotify('Could not save: network error', 'error'); else { const t=document.getElementById('wmConfirmPopupText'); t.textContent='Could not save: network error'; document.getElementById('wmConfirmPopup').className='wm-confirm-popup show error'; } }"); page.wait_for_timeout(400); shot(page, 'notification-error')
    page.keyboard.press('Escape')
    # REXUS Document
    page.evaluate("()=>{const a=document.querySelector('[data-rexus-app=\"document\"]'); a&&a.click()}"); page.wait_for_timeout(2500); shot(page, 'document')
    b.close()
print('ok')
