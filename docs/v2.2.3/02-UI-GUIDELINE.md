# 02 — UI guideline (v2.2.3)

Rules for new screens. The shared components already implement them; use the components instead of copying styles.

## 1. Page, modal or notification?

| Situation | Use | How |
|---|---|---|
| A form with **more than 4 fields** (create / edit a record) | **Page** | v2.2.1 module: `dialog({ title, body, submit, onSubmit, page: pageOpts(route, crumbs, parent, ctx, prepare) })`. Elsewhere: `REXUSPages.open({ node, route, title, crumbs, parentHash })`. Register a route builder with `REXUSPages.register(name, fn(q, ctx))` so the URL works after a refresh, in a new tab and from a shared link. |
| A confirmation (Delete? Approve?) | Modal | `confirmDialog()` (v2.2.1 module) or `askConfirm()` (main app) |
| A short input of 1–2 fields (a reason, a rename) or 3–4 fields that belong to the current screen (holiday, estimate, reassign, new Document page/folder) | Modal | `dialog({...})` without `page`, or the Document `dialog()` |
| Read-only detail opened from a list (approval detail, workload, audit history, dependencies) | Modal | `dialog({ footer: Close })` |
| The **result** of an action (saved, failed, sent) | **Notification** | `REXUSNotify(text, 'success' | 'error' | 'warning' | 'info', { action, sticky })` |
| Progress of a background action ("Saving…") | Corner indicator | `showSync(text)` without a kind (main app) |
| A validation problem in a form | Inline at the field / in the form | `d.error(msg)` / throw from `onSubmit` |

### Form pages
- URL: `#/f/<form>?<params>`. The parent screen is kept underneath (not re-rendered), so filters, tabs and scroll survive Back.
- Header: Back button + breadcrumb (`Section › Sub-section › Form title`) + page title.
- The action bar (Cancel / Save / Submit) is sticky at the bottom.
- Leaving with unsaved changes asks first: in-app navigation and Back use the app's confirm dialog, the browser Back button and refresh/close use the browser's own prompt.
- Permissions: a route builder loads the same data from the same API as the in-app button. If the API refuses, the person is sent back to the parent screen with an error notification.
- Elements that should not count as "unsaved changes" (search boxes inside the form) carry `data-rx-nodirty`.

### Notifications
- Centre of the screen, icon and colour per type, short English text.
- Success and Info close after ~2.5 s; click or Esc closes them earlier.
- Error and Warning wait for **OK** (focus moves to OK; Esc also works). An action button (e.g. Retry) can be added with `{ action: { label, run } }`.
- A new notification replaces the old one; they never stack.
- Errors and warnings use `role="alert"` (assertive), success and info `role="status"` (polite).
- One-time information that must be read (e.g. a temporary password) uses `{ sticky: true }`.

## 2. Badges (GEN-11 / GEN-12)

Badges are **only** for **Status**, **Priority** and **counts / notifications**. At most 1–2 per row or card, never a badge inside a badge, and no badge when the column header already says it. Everything else (type, category, labels, roles) is plain text.

Full fill: light background + darker text of the same tone. No outline, no dot. Tokens live in `rexus-ui.css` (light) and `rexus-dark.css` (dark):

| Tone | Token | Used for | Light bg / text | Dark bg / text |
|---|---|---|---|---|
| Primary navy | `--rx-badge-navy-*` | Assigned to me, Mine | `#E0E7F5` / `#1E3A8A` | `#1E2A4A` / `#C7D2FE` |
| Info blue | `--rx-badge-info-*` | In progress, Submitted, Partially disbursed | `#DBEAFE` / `#1D4ED8` | `#172554` / `#93C5FD` |
| Success green | `--rx-badge-success-*` | Done, Approved, Completed, Active | `#DCFCE7` / `#166534` | `#052E16` / `#86EFAC` |
| Warning amber | `--rx-badge-warning-*` | Pending, Due soon, Draft, Review, Medium | `#FEF3C7` / `#92400E` | `#3B2506` / `#FCD34D` |
| Danger red | `--rx-badge-danger-*` | Rejected, Overdue, High, Urgent | `#FEE2E2` / `#991B1B` | `#450A0A` / `#FCA5A5` |
| Neutral gray | `--rx-badge-neutral-*` | Not started, Archived, Cancelled, Low, Normal | `#F1F5F9` / `#334155` | `#1E293B` / `#CBD5E1` |

Markup: `<span class="rx-chip rx-chip-<tone>">Text</span>` (tones: `navy`, `info`, `success`, `warning`, `danger`, `neutral`). In the v2.2.1 module use `statusChip(status)`; the status → tone map is `TONE` in `rexus-v221.js`. Legacy task badges (`wm-badge priority-*` / `status-*`) map to the same tokens.

Every pair reaches WCAG AA (≥ 4.5:1); the E2E suite measures the rendered badges in both modes.

## 3. Flat surfaces (GEN-11)
- Cards, tables and metric tiles: surface colour + 1 px hairline border, **no drop shadow**, no glass highlight, no coloured side bars.
- Only floating layers (menus, dialogs, the searchable list, the notification) keep one soft shadow.
- Separate sections with whitespace and thin lines, not boxes inside boxes.

## 4. Selection lists (GEN-08)
- Any `<select>` with **more than 7 options** becomes a searchable list automatically (`rexus-ui.js` §6). The native `<select>` stays in the form and keeps the value, so form code does not change. Opt out with `data-rx-nosearch`.
- A checkbox list becomes searchable when its container has `data-rx-searchlist` and more than 7 items.
- Search: live (~300 ms), ignores case and Vietnamese diacritics ("nguyen" finds "Nguyễn"), and matches the visible name plus `data-search` (put `username email` there).
- Multi-selection: "N selected", **Select all** applies to the filtered results only, **Clear**, selections survive a new search, "No results found" when empty.
- Keyboard: the search box gets focus when the list opens; ↑/↓ move, Enter (or Space after moving) selects, Esc closes and returns focus to the field, Tab cycles search / Select all / Clear.
- Large lists render at most 300 rows at a time with a "keep typing" hint, so lists with hundreds of entries stay fast.
