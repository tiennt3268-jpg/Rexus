# REXUS Work Management v2.3.5: Release Notes

| | |
|---|---|
| **Release date** | 2026-10-28 |
| **Source** | REXUS_Requirements_v2.3.4 Detailed Addendum |
| **Builds on** | v2.3.4 |
| **Schema** | Migrations 001–035 and **037** (new, additive). 036, the data import, is in the deploy zips only. |

Documentation: [`docs/v2.3.5/`](docs/v2.3.5/README.md) (traceability and decisions applied) · Tests: [`01-TEST-REPORT`](docs/v2.3.5/01-TEST-REPORT.md) · Screenshots: [`docs/v2.3.5/evidence/`](docs/v2.3.5/evidence)

## Decisions applied (open decisions of the document)
- **Project performance:**
  - Completion (0–100 %) and performance are separate numbers.
  - Performance = 0.7 × schedule index + 0.3 × effort index.
  - Below 100 is **Behind**, exactly 100 is **On track**, above 100 is **Ahead** (green), always with a text label.
- **Done fraction of a task:**
  - Completed counts as 100 %.
  - Otherwise the task uses its new **Done (%)** field.
  - Without a Done %, it uses the share of its completed subtasks.
- **Status colours:** Active green, Cancelled blue. The rest use one fixed palette; any unknown status is neutral.
- **Clone / Archive / Convert / Move:** applied as proposed in the document. The [traceability page](docs/v2.3.5/README.md) has the details.

## What's new

### Look and feel
- **UI-01:** buttons, fields, cards, menus and dialogs have square corners. Avatars, spinners, status dots, radio buttons and on/off switches stay round.
- **UI-02:** tighter line spacing and smaller padding in fields, tables and forms across REXUS, Document and Survey.

### Projects
- **PRJ-01:** the project list and project header show:
  - **completion**, from the work actually done;
  - a **performance chip**, such as "120 · Ahead".
  - Hover over the chip or focus it with the keyboard to see estimated, logged, planned and earned hours and both indexes.
  - Missing data shows N/A, never NaN.
- **PRJ-02:** status badges for projects and tasks share one colour map, in light and dark mode.

### Dashboard
- **DSH-01:** one task panel with the tabs Today, Upcoming, In Progress, Overdue and Completed. Each tab has a count, keyboard navigation and a remembered selection.
- **DSH-02:** a read-only **timeline of in-progress tasks** with:
  - a today marker and horizontal scrolling;
  - an "Assigned to me" filter;
  - a list of tasks without dates below the chart.
- **DSH-03:** the Progress section was removed.

### Task and subtask details
- **DTL-01:**
  - Details open in **read mode**.
  - A pencil next to a field edits just that field.
  - **Edit** (or the E key) edits all fields.
  - Only changed fields are saved.
  - If someone else saved in the meantime, you are told instead of overwriting their changes.
  - Leaving with unsaved changes asks first.
- **DTL-02:** a header bar with **Edit · Assign · Comment · More**. More contains Clone, Archive, Move, Convert, Share and Delete.
- **DTL-03:** the Participants panel was removed. Created by, Created and Last updated now appear in Activity.
- **ACT-01:**
  - **Clone** copies the item, optionally with its subtasks, and opens the copy.
  - **Archive** hides an item without deleting it.
  - **All Tasks → Archived** restores it.
- **ACT-02 — Convert:**
  - A task can become a project; its subtasks become the project's tasks.
  - A subtask can become a task.
  - A task without subtasks can become a subtask.
  - A preview is shown before anything changes.
  - Old links open the new item.
- **ACT-03 — Move:**
  - A task can move to another project and keeps its ID.
  - A subtask can move to another task.
  - Dependency links that would cross projects are removed and recorded.
- **LOG-01:** every project, task and subtask has an **Activity timeline**:
  - It is recorded by the server, with who, when, which item and which fields changed (from → to).
  - It shows the newest entries first and has "Load older activity".
  - Clone, move, convert, archive and restore are included.

### Fixed along the way
- Saving only some fields of a task used to reset its reporters and dependencies. They are now kept.
- Reloading on the Dashboard URL showed an empty page.
- Activity entries were duplicated, because the browser also wrote them. Only the server writes them now.

## Testing
All results below were executed. Details are in [01-TEST-REPORT](docs/v2.3.5/01-TEST-REPORT.md).

- **New tests:**
  - E2E for every requirement ID: **84/84**.
  - Backend for timeline, edits, clone, archive, move, convert and rollback: **78/78**.
  - Unit tests for the metrics: **20/20**.
- **Regression:**
  - Backend **224/224**, Survey **97/97**, sections **11/11**.
  - E2E v2.3.4 **69/69**, v2.3.1 **44/44**, v2.3.0 **68/68**, v2.2.3 **75/75**, v2.2.2 **53/53**, v2.2.1 **48/48**.
  - Legacy harness **24/24**.
- **UI audit** (60 screens × 7 theme / width configurations): the 27 findings were 2 dark-mode contrast issues. Both were fixed and re-checked clean.

## Upgrade
Deploy the LITE zip. Migration **037** runs once, adds columns and a table, and changes no existing data apart from filling the new owner column of old activity entries. Migration 036 (the v2.3.2 import) behaves exactly as before.
