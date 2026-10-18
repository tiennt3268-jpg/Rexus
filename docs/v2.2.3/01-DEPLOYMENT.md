# 01 — Deploying v2.2.3

v2.2.3 changes the front end only. Follow the v2.2.1 procedure ([../v2.2.1/01-DEPLOYMENT-AND-MIGRATION.md](../v2.2.1/01-DEPLOYMENT-AND-MIGRATION.md)) for staging first and recovery.

## What changes
- **No database migration** (schema stays at 001–034), **no API change**, **no new environment variables**, no change to Netlify Functions.
- New static files: `public/rexus-pages.js` (form pages) and `public/rexus-notify.js` (result notification). Both are loaded by `index.html` before the main app script.
- Changed static files: `index.html`, `rexus-ui.js`, `rexus-ui.css`, `rexus-dark.css`, `rexus-v221.js`, `rexus-document.js`. Their `?v=` query strings are bumped to `2.2.3`, so browsers fetch the new versions without a manual cache clear.

## Rollback
Redeploy the v2.2.2 build. Nothing is stored differently, so there is no data to roll back. Links of the form `#/f/...` created while v2.2.3 was live simply open the main screen in v2.2.2.

## Behaviour changes to tell users about
- Create/edit forms with more than four fields (task, subtask, project, work log, leave, employment, schedule requests, approval request, delegation, routing rule, income/expense, disbursement, payment) now open as a **page** with a Back button and their own link. Links can be bookmarked or shared; the receiver still needs the same permission.
- Leaving a form with unsaved changes now asks first, including the browser Back button and closing the tab.
- Results ("Task saved", "Could not save…") appear in the **centre** of the screen. Errors and warnings stay until **OK** is pressed.
- Long dropdowns (people, projects, folders…) have a **search box**; typing without accents works ("nguyen" finds "Nguyễn").
- Badges are calmer: only status, priority and counts are coloured; Low priority is now gray instead of green.

## Staging smoke test
- [ ] HRM → Monthly Schedule → Team Schedules → set a status filter → **Request schedules**: a page opens with breadcrumb *HRM › Monthly Schedule › Request schedules…*; search the recipients without accents; Back returns to the list with the filter kept.
- [ ] Refresh on that page: it reopens; the browser Back button then lands on HRM.
- [ ] Copy the page URL into a new tab: the same form opens.
- [ ] Type in a form, press the browser Back button: a prompt appears; cancel keeps the input.
- [ ] Save a leave draft: a green "Success" notification appears in the centre and closes by itself.
- [ ] Disconnect the network and cancel a leave request: a red "Something went wrong" notification waits for OK.
- [ ] Approval Center → New request → Approvers: search, Select all, Clear.
- [ ] Switch to Dark mode and repeat one form page and one notification.
- [ ] Sign in as an Employee and open `#/f/approval-rule-new`: you are sent back to the Approval Center with an error (admin only, as before).
