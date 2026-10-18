# REXUS Work Management v2.2.3 — Release Notes

Release date: 2026-10-18 · Source requirement: **Requirement V2.1.3 (Updated)** · Builds on v2.2.2 · Schema: migrations 001–034 (**no new migration**)

> **Version note.** The requirement document is titled "V2.1.3", and the system was already at v2.2.2, so this release is numbered **v2.2.3**. All V2.1.2 requirements stay in force.

Full documentation: [`docs/v2.2.3/`](docs/v2.2.3/README.md) · UI guideline: [`docs/v2.2.3/02-UI-GUIDELINE.md`](docs/v2.2.3/02-UI-GUIDELINE.md) · Before/after screenshots: [`docs/v2.2.3/evidence/`](docs/v2.2.3/evidence).

## Decisions confirmed by the product owner (2026-10-18)

| Question | Decision |
|---|---|
| GEN-09 Which pop-ups become pages | **All forms with more than 4 fields.** |
| GEN-10 Notification behaviour | The document defaults (centred; Success auto-closes ~2.5 s; Error/Warning wait for OK; replace, never stack). |
| GEN-11/12 Palette | Section 4.1 palette, light and dark. |

Q12 (search scope) uses the document's proposal: every list with more than 7 items. See [decisions & limitations](docs/v2.2.3/04-DECISIONS-AND-LIMITATIONS.md).

## Changes by requirement

### GEN-08 — Search in every selection list (CH-223-08)
- One shared component (`rexus-ui.js` §6). Every dropdown or multi-select with more than 7 options gets a search box at the top; so does the recipient list of *Request schedules*.
- Live filtering (~300 ms, no Enter), ignoring case and Vietnamese diacritics; matches the name, username and email.
- Multi-selection shows "N selected", **Select all** applies to the filtered results, **Clear** empties the selection, and selections are kept when the query changes. An empty search shows "No results found".
- Keyboard: focus goes to the search box when the list opens; ↑/↓, Enter/Space to select, Esc to close.
- Large lists stay fast: a 150-item list opens and filters in well under 150 ms (measured).
- The original `<select>` stays in the form and holds the value, so saving, validation and APIs are unchanged.

### GEN-09 — Forms become pages (CH-223-09)
- New `rexus-pages.js`. Pages: task (new / detail), subtask, project (new / edit), work log (new / edit), leave request, employment, request schedules, new approval request, delegation, routing rule, add income / expense, new disbursement, record payment.
- Each page has a breadcrumb (e.g. *HRM › Monthly Schedule › Request schedules for October 2026*), a **Back** button that returns to the exact previous screen with its filters, its **own URL** (`#/f/...`: refresh, new tab, shared link and browser Back/Forward work), and sticky action buttons.
- Leaving with unsaved changes asks first (in-app links, Back, browser Back, refresh / closing the tab).
- Pages can stack: logging time from a task page opens the work-log page on top; Back returns to the task.
- Same permissions as before: a page opened from a link loads its data from the same API, and if the server refuses, the person goes back to the parent screen with an error.
- Confirmations, alerts and 1–4-field inputs stay modals (list in the decisions doc). DOC-02 continues to apply to those.

### GEN-10 — Centred result notification (CH-223-10)
- New `rexus-notify.js` (`REXUSNotify`). Success / Error / Warning / Info, each with its own icon and colour, in the centre of the screen.
- Success (and Info) close after ~2.5 s, or on click / Esc. Error and Warning wait for **OK** (focus moves to OK) and can offer an action such as Retry.
- A new notification replaces the previous one.
- Replaces: the ring popup of the main app, the v2.2.1 module's `toast()`, the REXUS Document toast and the `showAlert()` notice dialog. The small corner indicator remains only for background progress ("Saving…"). Form validation stays inline.
- `role="alert"` for errors / warnings, `role="status"` for success / info; light / dark and phone layouts.

### GEN-11 — Fewer badges, flat design (CH-223-11)
- Badges only for status, priority and counts. The finance ledger "Type" (Income / Expense) and REXUS Document labels are plain text now.
- Flat surfaces: no drop shadows or glass highlights on cards, tables, metric tiles, project cards and segmented controls; thin hairline borders instead. Metric tiles lose the coloured side bar (danger/warning values are coloured text instead).
- Reviewed screens: Overview, All Tasks, Projects, Work Log, Calendar, Approval Center, HRM, Finance, REXUS Document (before/after in `docs/v2.2.3/evidence`).

### GEN-12 — Full-fill badge palette (CH-223-12)
- Central tokens `--rx-badge-{navy,info,success,warning,danger,neutral}-{bg,fg}` in `rexus-ui.css` (light) and `rexus-dark.css` (dark), exactly as in section 4.1.
- All badge families (`rx-chip`, legacy `wm-badge` priority/status, `wm-status-badge`, counts) use them: light background, darker text, no outline, no dot.
- Tone changes: Low priority → gray (was green), Draft → amber, Medium → amber, Submitted → blue, Overdue → red.
- Every rendered badge measured ≥ 4.5:1 in light and dark mode.

## Testing (executed; details in [03-TEST-REPORT](docs/v2.2.3/03-TEST-REPORT.md))
- Backend integration: 224/224 (unchanged API).
- E2E v2.2.3: **75/75** (GEN-08 20, GEN-09 31, GEN-10 15, GEN-11 3, GEN-12 5, no JS errors).
- Regression: E2E v2.2.2 53/53, E2E v2.2.1 48/48, legacy UI harness 24/24.
- UI audit: **175/175 clean** (25 screens × 7 configurations: dark/light, Black & White/Navy, 1440/768/375 px) — no text under 4.5:1, no overflow, no JS errors.

## Upgrade
Front-end only: deploy as usual; no migration, no environment variables. See [01-DEPLOYMENT](docs/v2.2.3/01-DEPLOYMENT.md).
