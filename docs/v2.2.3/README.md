# REXUS v2.2.3 — documentation & requirement traceability

Source: *Requirement V2.1.3 (Updated)*. All V2.1.2 requirements stay in force. Release notes: [`../../REXUS-v2.2.3-RELEASE-NOTES.md`](../../REXUS-v2.2.3-RELEASE-NOTES.md).

| Doc | Content |
|---|---|
| [01-DEPLOYMENT](01-DEPLOYMENT.md) | Deploy and rollback (no migration), smoke checklist |
| [02-UI-GUIDELINE](02-UI-GUIDELINE.md) | Badge palette and when to use a page, a modal or a notification; searchable lists |
| [03-TEST-REPORT](03-TEST-REPORT.md) | What was run, with results |
| [04-DECISIONS-AND-LIMITATIONS](04-DECISIONS-AND-LIMITATIONS.md) | Q12 and the other choices, known limitations |
| [evidence/](evidence) | Before / after screenshots (`*-before.jpg` = v2.2.2, `*-after.jpg` = v2.2.3) |

The v2.2.2 docs in [`../v2.2.2/`](../v2.2.2/README.md) still apply. v2.2.3 changes only the interface: no API, database or permission changes.

## Traceability (issue → change → evidence)

| Req | Change code | Main change | Files | Test evidence |
|---|---|---|---|---|
| GEN-08 | CH-223-08 | Shared searchable list: every `<select>` with more than 7 options becomes a searchable combobox (multi-selects get checkboxes, count, Select all for the filtered results, Clear); checkbox lists marked `data-rx-searchlist` get the same toolbar. Case- and diacritic-insensitive, matches name + username + email | `rexus-ui.js` §6, `rexus-ui.css`, `rexus-v221.js` (`userOptions` data-search, recipients list) | E2E GEN-08 (20); `evidence/gen08-*.jpg` |
| GEN-09 | CH-223-09 | Forms with more than 4 fields open as their own page: URL `#/f/<form>`, breadcrumb, Back that keeps the previous screen and its filters, sticky actions, unsaved-changes warning (in-app, browser Back, refresh/close) | `rexus-pages.js` (new), `rexus-v221.js` (`dialog({page})` + routes), `index.html` (task / subtask / project / work-log forms), `rexus-ui.css` | E2E GEN-09 (31); `evidence/gen09-*.jpg` |
| GEN-10 | CH-223-10 | One centred result notification (Success / Error / Warning / Info); success closes after ~2.5 s, error and warning wait for OK; replaces the old popup, `toast()` and `showAlert()`; `#wmSync` stays for progress only | `rexus-notify.js` (new), `index.html`, `rexus-v221.js`, `rexus-document.js`, `rexus-ui.css`, `rexus-dark.css` | E2E GEN-10 (15); `evidence/gen10-*.jpg` |
| GEN-11 | CH-223-11 | Badges only for status, priority and counts (finance transaction type and Document labels are now plain text); flat cards: no drop shadows or glass highlights, thin lines; metric cards lose the coloured side bar | `rexus-ui.css`, `rexus-v221.js` | E2E GEN-11 (3); `evidence/*-before.jpg` vs `*-after.jpg` |
| GEN-12 | CH-223-12 | Central badge tokens `--rx-badge-<tone>-bg/fg` from palette 4.1, full fill, no outline or dot, light + dark | `rexus-ui.css`, `rexus-dark.css`, `rexus-v221.js` (tone map) | E2E GEN-12 (5: AA contrast light/dark, full fill light/dark, tokens); UI audit |
