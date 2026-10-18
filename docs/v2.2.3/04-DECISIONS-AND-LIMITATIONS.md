# 04 — Decisions and known limitations

"**Owner**" = answered by the product owner on 2026-10-18. "**Default**" = the requirement document's own proposal or the existing behaviour; each can be changed once confirmed.

## Decisions

| Topic | Decision | |
|---|---|---|
| GEN-09 scope | **All forms with more than 4 fields** become pages. | Owner |
| GEN-10 behaviour | Document defaults: centred, Success auto-closes ~2.5 s (click/Esc closes earlier), Error/Warning wait for OK, a new notification replaces the old one, one shared component, corner indicator only for background progress, validation stays inline. | Owner |
| GEN-11 / GEN-12 palette | Palette from section 4.1 of the requirement, light and dark values as listed. | Owner |
| Q12 search scope | Every dropdown, multi-select and checkbox list with **more than 7 items**; no department/role filter. | Default |
| Info notifications | Close by themselves like Success (the requirement only fixes Success, Error and Warning). | Default |
| Esc on Error/Warning | Acts as OK (keyboard users are never trapped). | Default |
| Legacy `showAlert()` notices | Routed to the shared notification and wait for OK, as the old modal did. Messages starting "Could not…" show as Error, "Account created…" as Success (sticky, because it shows a temporary password), the rest as Warning. | Default |
| Document toasts | Mapped by wording: failures → Error, guidance ("Select text first", "Save your changes first", "…unavailable") → Warning, progress ending in "…" → Info, everything else → Success. | Default |
| Forms that stay modal | ≤ 4 fields or read-only: confirmations, reasons, Add holiday (2), Set estimate (1), Reassign (2), Apply weekly availability (7 numeric inputs, but it edits the unsaved calendar on the screen behind it), Workflow notifications (3), Workflow templates (2 + 2 in a collapsed section), Salary (4), Employee account (4), Department (4), Share, every REXUS Document dialog (New page/folder has 3 fields), approval detail, workload, audit history, dependencies. | Default (rule from GEN-09) |
| Low priority colour | Neutral gray (palette 4.1); was green in v2.2.2. Draft is now amber. | Owner (palette) |
| Finance transaction "Type" and Document labels | Plain text instead of badges (GEN-11: not a status, priority or count). | Default |

## Known limitations
1. **Request schedules from a link** opens with no one pre-selected; the in-app button still carries the people ticked in the table (their IDs are not put in the URL to keep links short and free of personal data).
2. A form page opened from a link loads its parent screen underneath (e.g. HRM for a leave form). A form that was opened from a different screen in the app (e.g. "Add expense" from a project's WBS tab) returns there when opened in-app, but to Project Finance when opened from a link.
3. The browser's own "Leave site?" prompt (refresh / close tab) cannot show custom text; that is a browser restriction.
4. Order of approvers in a multi-select still follows the list order, not click order (unchanged from v2.2.2).
5. Not run: real Netlify deploy, browsers other than Chromium, real mobile devices, real screen readers (ARIA roles and keyboard behaviour were tested in Chromium only).
6. Carried over from v2.2.2: see [../v2.2.2/05-DECISIONS-AND-LIMITATIONS.md](../v2.2.2/05-DECISIONS-AND-LIMITATIONS.md).
