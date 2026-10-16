# REXUS Work Management v2.2.0 — Adaptive Liquid Glass UI refactor

## Scope
- Based on the supplied **v2.1.3 FULL** archive.
- **Presentation and interaction only.** No Netlify Function, database migration, API contract, auth flow, permission check or business rule was changed. Schema requirement is unchanged (migrations through `032_rexus_session_auto_key`).
- Files changed:
  - **New** `public/rexus-ui.css` — central design system (tokens + every component). Loaded as the last stylesheet.
  - **New** `public/rexus-ui.js` — accessibility / interaction layer (progressive enhancement).
  - `public/index.html` — includes the two new files; cache-buster for `rexus-v207.js`.
  - `public/rexus-v207.js` — one-line icon bug fix (see below).
  - `public/rexus-v205.css`, `rexus-v207.css`, `rexus-v210.css`, `rexus-v213.css` — removed conflicting, superseded icon-colour rules (each removal is marked `[v2.2.0] removed`).
  - `package.json` — version 2.2.0.

## Design system (`rexus-ui.css`)
- **Tokens** (CSS custom properties on `:root`): typography scale (12/13/14/16/18/22/28 px with paired line heights), spacing scale 4/8/12/16/24/32/48/64, radius, neutral ink, accent, semantic colours (success/warning/danger/info/neutral pairs ≥ 4.5:1), glass opacity/blur/edges, shadows/elevation, motion durations, component dimensions, and a single **z-index scale**.
- **Legacy variable remap**: `--navy`, `--gold`, `--ink`, `--line`, … are remapped to the neutral system, so the ~500 inline styles in `index.html` follow the new look without markup edits.
- **Adaptive Liquid Glass**: colourless white-alpha glass at three levels — L1 subtle (toolbar, icon buttons, sidebar), L2 standard (buttons, cards, header, nav), L3 elevated (modals, menus, popovers, toasts). Colour only comes from a low-saturation ambient backdrop. Dense content (tables, task rows, calendar) uses near-solid reading surfaces with no per-row blur (performance + legibility).
- **Buttons**: every family (`.wm-btn`, `.rd-button`, `.rx210-btn`, `.wm-new-btn`, period/sub-nav toggles, auth submit, bulk-bar buttons, icon buttons, header chips) shares one geometry (32/38/44 px heights, 10 px radius, rounded-square icon buttons) and one state model: default, hover (subtle lift), focus-visible, active/pressed, selected, disabled, loading, success, error. Primary = smoked achromatic glass; destructive = semantic red.
- **Typography & spacing**: unified heading/label/table-header/helper styles; table headers became quiet uppercase captions; numbers use tabular figures.
- **Badges** are tinted with a status dot and text (never colour-only); Cancelled is also struck through.
- Fallbacks: `@supports not (backdrop-filter)` raises opacity; `prefers-reduced-motion`, `prefers-contrast: more`, `forced-colors`, print styles; 44 px targets on touch (`pointer: coarse`).

## Defects fixed
| Problem (found by running v2.1.3) | Fix |
|---|---|
| `rexus-v207.js` replaced **every** icon drawn by v2.0.5 (Edit, Delete, Close, Back, bell, nav) with the same generic "layers" glyph — Edit and Delete looked identical | Skip chips that already contain a purpose-specific SVG |
| Sidebar / document icons were white strokes on near-white frosted tiles (practically invisible) | Neutral tiles, stroke follows text colour; active item uses accent |
| 375 px: status badges in task rows clipped; Progress stat cards clipped ("67°", "Overal Progre") | Task rows wrap badges to a second line; stat grids use `auto-fit` overriding inline `repeat(4/5/6,1fr)` |
| 375 px: notification panel and app launcher overflowed the viewport | Viewport-anchored on small screens |
| Bare tables (Finance, Org, Configuration) split numbers mid-digit (`15,00 / 0,0 / 00`) because v2.1.3 set `overflow-wrap:anywhere` on all cells | Normal wrapping; bare tables get shared styling and a horizontal-scroll wrapper |
| `<td class="wm-row-actions">` had `display:flex`, detaching the cell from the row (misaligned borders) | Kept as a table cell; actions column is sticky-right when the table scrolls |
| **Duplicate records**: clicking Save again while "Create this project?" was open stacked a second confirm; one OK sent **two** create requests (reproduced in test) | Trigger is held while its confirmation is open; mutating requests show a loading state and block repeat clicks |
| Success/error popup sat dead-centre for 5 s, covering the control just used | Compact toast at the bottom, polite live region |
| Modals: no Escape, no focus management, background scrolled | `role=dialog/alertdialog`, `aria-modal`, labelled; initial focus (Cancel on confirmations); Tab trap; Escape uses the dialog's own close/cancel handler; focus restored; scroll lock |
| z-index values from 1 to 100 100 scattered across 9 files | Central scale: header 200 → dropdown 1000 → popover 1100 → modal 1300 → nested modal 1400 → confirm 1500 → toast 1600 → loader 1700 → auth 1800 |
| Selects lost their arrow; unclassed inputs (e.g. "New task type", table search) were unstyled | Consistent field styling with custom chevron |
| Sidebar tabs, bell, account menu, menu items, task checkboxes were `<div>`s unreachable by keyboard; icon-only buttons had no names | `role`, `tabindex`, Enter/Space activation, `aria-current`, `aria-pressed`, generated `aria-label`s |
| Extra band below the footer | Removed stray `.wm-app` bottom padding |

## Tests actually executed
Environment: Chromium (Playwright) with an **offline mocked API** (sample tasks, projects, users, documents). No real Netlify functions, database, Google OAuth or production data were used.

- **Syntax**: `node --check` on every `public/*.js` and on all inline `<script>` code in `index.html` — PASS.
- **Visual/layout sweep**: 20 screens & states (Overview, All Tasks, Projects, Project detail, Task detail, Work Log, Calendar, Organization, Approval Center, Finance, My Account, Configuration, notification panel, account menu, Project/Log/Confirm modals, toast, app launcher, REXUS Document) at **320, 375, 768, 1024, 1440, 1920 px** = 120 measurements, plus the sign-in screen at 1280 px:
  - page-level horizontal overflow: **0 / 120**
  - elements escaping the viewport: **0**
  - clipped button/badge/label/header text: **0**
  - visible buttons without an accessible name: **0**
  - JavaScript page errors: **0**
  - hit targets < 24 px: **0**, except calendar event chips at 320 px (cells are narrower than 24 px).
- **Interaction checks — 24 / 24 PASS** (the same script on v2.1.3 passes 10 / 24): keyboard tab navigation; distinct row icons; accessible names; confirm dialog role/focus/Tab trap/Escape=cancel (no DELETE sent)/scroll lock & unlock/focus restore; confirm above parent modal (z-index + hit test); modal above header; Save loading state; single create request on repeated clicks; toast position and live region; glass surfaces free of fixed hue; Document mode renders; no page errors.

## Known limitations
- Dark mode is not implemented: hundreds of inline styles hard-code light colours, so a dark theme needs those templates converted first.
- Legacy patch stylesheets (v2.0.3–v2.1.3) are still loaded for layout rules; `rexus-ui.css` overrides their visual rules, often with `!important` to beat earlier `!important`s. Folding all layers into one file is the next refactor step.
- ~500 inline `style="…"` attributes in JS templates remain; they are steered through the remapped variables, but individual font sizes/margins set inline may still deviate slightly from the scale.
- Calendar event chips at 320 px are smaller than 24 px.
- Mocked data cannot cover every backend state (very long data, empty/error states for every module, real permissions). Run the staging checklist with real accounts before production.

## Deployment
1. Back up the production database, Netlify Blobs and the current deploy.
2. Deploy to **staging** (no migration needed).
3. Check: sign-in, every sidebar section on desktop and phone, create/edit/delete task & project (confirm dialogs, Escape, one record per save), Log Work, Finance tables on phone, REXUS Document editor and Space picker, notifications, audit panel.
4. Promote to production after Administrator and Member accounts are verified.
