# REXUS v2.3.5: implementation & traceability

**Source:** *REXUS_Requirements_v2.3.4_Detailed_Addendum_Updated*, covering UI-01/02, PRJ-01/02, DSH-01..03, DTL-01..03, ACT-01..03 and LOG-01.

**Related documents:**
- Release notes: [`../../REXUS-v2.3.5-RELEASE-NOTES.md`](../../REXUS-v2.3.5-RELEASE-NOTES.md)
- Test report: [01-TEST-REPORT](01-TEST-REPORT.md)
- Screenshots: [evidence/](evidence)

**Schema:** migration **037_rexus_v235**. It is additive only: new columns, one new table and indexes, with no DROP, no DELETE and no id changes.

## Open decisions (section 10 of the source): what was applied
The document's proposals were applied. The user was told before the work started.

| Decision | Applied |
|---|---|
| Performance score | **Completion** (0–100) and **performance** are separate numbers. Performance = round(0.7 × SPI + 0.3 × EI). Thresholds are strict, as the user asked: < 100 Behind, = 100 On track, > 100 Ahead. |
| Done fraction of a task | A Completed task counts as 100 %. Otherwise the task uses its **Done %**, a new editable field stored in the existing `tasks.progress` column and kept within 0–100. If Done % is not set, it uses the share of its subtasks that are Completed. Logged hours never count as done work. |
| Planned earned hours | Each task's estimate is spread evenly over its start → due days, counting both ends. Tasks without dates are left out of the schedule index. |
| > 100 colour | The message was cut off in the source. **Ahead is green**, Behind red, On track teal and N/A grey, always with a text label. |
| Status colours | Active green · Cancelled blue · Draft / Not Started grey · Planned slate · In Progress teal · Review violet · Blocked / On Hold amber · Urgent orange · Overdue red · Completed navy. Any other status is neutral. |
| Dashboard Gantt | Shows all in-progress tasks the user can see, with an "Assigned to me" filter. It is read-only: no drag and no resize. |
| Clone | **Copied:** content, dates, assignee, reporters, labels, estimate, notes, and optionally the subtasks. Status restarts at Not Started. **Not copied:** work logs, comments, history, attachments and dependencies. |
| Archive | Reversible soft delete (`archived_at`, `archived_by`). Archiving a task also hides its subtasks. Anyone who can edit the item can archive and restore it. |
| Convert | **Task → Project:** its subtasks become tasks of the new project, with the source project's members. **Subtask → Task:** work logs, participants and history follow. **Task → Subtask:** only for a task without subtasks; work logs follow. The old item is archived, and an alias (`rexus_entity_aliases`) sends old links to the new item. Each conversion runs as one transaction. |
| Move | A task moves to another project and keeps its ID. A subtask moves to another task. Dependency links into the old project are removed and recorded in Activity. Closed (approved) project costs block a move across projects. |
| UI-01 exceptions | These stay round: avatars, spinners/loaders, status dots, radio buttons and the Survey on/off switch. |
| UI-02 scope | REXUS, REXUS Document and REXUS Survey controls that use the shared tokens. |

## Traceability

| ID | What was done | Files | Tests |
|---|---|---|---|
| UI-01 | Radius tokens set to 0 (`--rx-radius-*`, `--sv-radius*`). Components that hard-code a radius are matched by a scoped component selector, not a wildcard, and avatars and the other exceptions are excluded. Focus stays visible with a 2 px outline. | `rexus-v235.css` | e2e235 UI-01 × 3; UI audit |
| UI-02 | Shared tokens changed: line height 20 px (1.4), control height 34 px, table cell padding 6 px. Inputs and selects use 6 × 11 px padding, textareas 7 × 11 px. The label-to-input gap is 4 px, form rows are 10 px apart and grid gaps are 8 / 14 px. Buttons stay at least 32 px high. | `rexus-v235.css` | UI-02 × 3; UI audit (375 px) |
| PRJ-01 | `REXUSMetrics.project()` is pure and computes completion, SPI, EI, performance and label, with N/A when data is missing. It appears in the project list and grid (completion bar plus performance chip) and in the project header (status badge, chip, "x% complete", the Completion card and bar). A tooltip on hover or keyboard focus lists estimated, logged, planned earned and earned hours plus SPI and EI. | `rexus-metrics.js`, `index.html`, `tasks.mts` (Done % kept within 0–100) | unit `metrics.test.js` (20); PRJ-01 × 6 |
| PRJ-02 | `RX_STATUS_TONE` is one map for project and task badges, used by lists, cards, the header and every `.status-*` badge. It has light and dark variants with ≥ 4.5:1 text contrast. | `index.html`, `rexus-v235.css` | PRJ-02 × 4 |
| DSH-01 | One task panel with the tabs **Today · Upcoming · In Progress · Overdue · Completed**. Each tab shows a count and has its own empty state. Tabs work with arrow keys, Home and End. The chosen tab is remembered. Dates use the browser's local day. | `index.html` | DSH-01 × 6 |
| DSH-02 | "In progress — timeline" covers all visible in-progress tasks or only the user's own. It has a month and day axis, a today marker and horizontal scrolling. Clicking a bar or name opens the task. Bars cannot be dragged, and tasks without dates are listed below the chart. The chart shows at most 100 rows. | `index.html`, `rexus-v235.css` | DSH-02 × 7 |
| DSH-03 | The Progress section and the Overall Progress card were removed from the Dashboard. Progress data and the project widgets are unchanged. | `index.html` | DSH-03 |
| DTL-01 | Task and subtask details open in **read mode**: plain values, with readable text for empty fields. An edit pencil appears on hover or keyboard focus, and stays visible on touch screens. It edits **one field**, with Save and Cancel for that field. **Edit** (or the E key) unlocks all fields; Save and Cancel work for all of them. Only the changed fields are sent, together with `expected_updated_at`. A 409 response means someone else changed the item: the person is told and can reload. Leaving with unsaved changes asks first. The project field is read-only; use **Move** to change it. | `index.html`, `rexus-v235.css`, `tasks.mts`, `subtasks.mts` | DTL-01 × 15; backend `actions.test.mjs` |
| DTL-02 | The header bar holds **Edit · Assign · Comment · More**. Assign opens the existing people picker. Comment scrolls to the comment box and focuses it. **More** holds Clone, Archive, Move, Convert, Share and Delete. Menus are keyboard operable and stay inside the screen at 375 px. Buttons are disabled while saving, so a click cannot submit twice. | `index.html`, `rexus-v235.css` | DTL-02 × 6 |
| DTL-03 | The Participants panel was removed from task and subtask details. Created by, Created and Last updated now appear in the Activity section at the end. Assignee and Assign are unchanged. Existing members data is kept in the database. | `index.html` | DTL-03 × 2 |
| ACT-01 | `POST /api/work-actions` handles clone, archive and restore, with permission checks on the server. The Clone dialog has an optional "copy subtasks" box and opens the new item. Archive asks for confirmation. **All Tasks → Archived** lists archived tasks and subtasks, each with a Restore button. Archived items cannot be edited until they are restored. | `work-actions.mts`, `tasks.mts`, `subtasks.mts`, `index.html` | ACT-01 × 7; backend |
| ACT-02 | Convert dialogs preview the new type, ID, child handling and links before you confirm. Each conversion runs as one transaction, and the backend test proves the rollback. Old links resolve through `GET /api/work-actions?resolve=<old id>`, and deep links follow them. An archived item that was converted cannot be restored. | `work-actions.mts`, migration 037, `index.html` | ACT-02 × 7; backend (transaction rollback) |
| ACT-03 | Move dialogs list only valid destinations (another project, or another task). The source and the destination are both checked on the server. Dependency links into the old project are removed and recorded. Subtasks and work logs follow the task. | `work-actions.mts`, `index.html` | ACT-03 × 4; backend |
| LOG-01 | Every change is recorded by the server action that made it, with the entity, owner and changed fields (`from → to`). Description and notes record only that they changed. The client can no longer write activity entries. `GET /api/activity?entity=project\|task\|subtask` has access checks and returns 50 entries per page with a cursor; it includes the history of converted items. The timeline shows the event, actor, local time, source item and changes, newest first, with "Load older activity". A project rename keeps its timeline. | `activity.mts`, `lib/activity-log.mts`, `tasks.mts`, `subtasks.mts`, `projects.mts`, `comments.mts`, `worklogs.mts`, `index.html` | LOG-01 × 6; backend × 15 |

## Data and API
- **Migration 037.**
  - `activity_log` gains `owner_id`, `subtask_id`, `entity_type`, `entity_id` and `meta` (JSONB), plus indexes. Existing task events get their owner filled in. Project events get their owner only when the project name has one owner.
  - `tasks` and `subtasks` gain `archived_at` and `archived_by`.
  - New table `rexus_entity_aliases`.
- **Partial edit fix.** A task or subtask PUT that left out `reporter` or `predecessors` used to reset them: reporters went back to the current user and dependencies were cleared. These fields are now kept.
- **`GET /api/tasks`** hides archived tasks. Add `?include_archived=1` to include them; the client uses this so work-log names still resolve. `GET /api/subtasks` also hides archived subtasks and subtasks of archived tasks.
- Migration 036 (the v2.3.2 data import) is still shipped only in the deploy zips, not in git.

## Fixed along the way
- Reloading the page on `#/overview` showed an empty Dashboard.
- Comments on a subtask were logged with the subtask id in the task column.

## Not done
- Clone and archive for **projects**. The source says project coverage is "to be confirmed".
- A tolerance band (95–105) for On track. Strict thresholds were kept, as the user asked.
- Virtual scrolling in the Gantt; it shows at most 100 rows.
