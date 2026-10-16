# 05 — WBS + Gantt and notification-only workflow: implementation notes

## 1. Where it lives
- UI: `public/rexus-v221.js` → `REXUS221.wbs(node, ctx)`, rendered into `<section id="pdWbs">` on the project detail page (`public/index.html`). Styles are in `public/rexus-ui.css` §18 (`.rx-wbs-*`, `.rx-gt-*`).
- API: `netlify/functions/task-dependencies.mts`, `netlify/functions/workflow-templates.mts`, and `netlify/functions/lib/task-ready.mts` (ready notifications).
- The **legacy** frappe-gantt drag-to-reschedule chart is still on the page, labelled "Interactive Gantt (drag to reschedule)". It remains the way to reschedule by dragging. The legacy flat task list stays as a hidden fallback if the v2.2.1 script fails to load.

## 2. WBS model
- Tasks are sorted by start date (falling back to due date, then creation order). Each task gets number *n*; its subtasks get *n.1*, *n.2*, …
- Columns: WBS no., Task / Subtask, Assignee, Status, Priority, Start, Due, Est. h, Actual h, Progress, and actions.
- **Estimate roll-up:** when a task estimate is ≤ the sum of its subtask estimates and that sum is > 0, the cell shows **Σ sum** (roll-up). This matches the capacity engine, so the estimate isn't double-counted ([03](03-CAPACITY-AND-LEAVE.md#14-planned-effort)).
- Actual hours = sum of work logs for the task or subtask.
- **Expand/collapse** is per task, with Expand all / Collapse all. It applies to the WBS and the Gantt together, because both render from the same `rows` array.
- **Filters:** search (name or WBS number prefix) and status. When filtering, a parent task stays visible if any of its subtasks match.
- **Modes:** WBS · Gantt · WBS + Gantt. Gantt-only mode keeps a narrow numbered column, so rows remain identifiable.
- Accessibility: `role="treegrid"` with `aria-level` and `aria-expanded`; the toggles and bars are real `<button>`s; the Gantt scroller is focusable.

## 3. Gantt timeline
- **Range:** from 3 days before the earliest date to 7 days after the latest date. Month scale snaps to whole months. With no dates, the range is today −7 to today +30.
- **Scale:** day = 30 px/day (weekends shaded, day numbers shown), week = 12 px/day (Monday ticks), month = 4 px/day (1st-of-month ticks). A *Today* marker is drawn when today is in range.
- **Bars:** start → due (if only one date exists, a single-day bar). Tone: done, late (past due and not Completed or Cancelled), subtask, or task. Items with no dates show "No dates".
- **Row alignment:** every WBS row has exactly one Gantt row with the same fixed height (36 px). This is tested: row counts are equal before and after collapse.
- **Selection sync:** clicking a bar highlights the matching WBS row and scrolls it into view, and the reverse also works.
- **Dependency links:** finish-to-start SVG paths go from the predecessor's end to the successor's start, drawn only when both rows are visible.
- The task list no longer has a nested vertical scrollbar; the page scrolls (tested). The timeline scrolls horizontally inside its own container.

## 4. Dependencies: notification-only workflow
- `GET /api/task-dependencies?project=&owner=` returns the dependencies, a per-task state (Waiting / Ready / …) and the project's workflow settings.
- `POST /api/task-dependencies {predecessor_id, successor_id}` rules:
  - Both tasks must belong to the same project.
  - **Duplicates** are refused (409), as are **self** dependencies and **circular** dependencies (graph walk).
  - Multiple predecessors are allowed.
- `DELETE` removes a dependency.
- The legacy `tasks.predecessors` JSON column is kept in sync, so v2.1.x views and the frappe Gantt still show dependencies.
- **Never blocking:** a successor can be started or completed at any time. Dependency state is independent of task status, and the workflow never changes status, assignee or dates (all tested).
- **Ready notification** (`lib/task-ready.mts`):
  - Fires when the *last* incomplete predecessor of a successor becomes Completed.
  - Recipients: the successor's assignee (if `notify_assignee`) and/or the project manager, i.e. the project owner (if `notify_project_manager`). Each person is notified once.
  - Deduplication uses a signature of the predecessor completion timestamps (`toISOString()`, millisecond precision). Repeated saves don't notify again. A reopen followed by a re-completion is a genuine new transition and does notify again.
  - Bug fixed in v2.2.1: the old signature used second precision, so a reopen and re-completion within the same second was missed.
- **Per-project settings** (`POST {action:'settings'}`; owner, PM or Admin): `dependencies_enabled`, `notify_assignee`, `notify_project_manager`, and the existing `workflow_notifications_enabled`. Turning notifications off keeps the dependencies.

## 5. Workflow templates
- `GET /api/workflow-templates` returns the list.
- `POST {action:'save'}` takes a name plus steps (name, offset and duration in days, estimate, and predecessor indexes). The step graph is validated, and cyclic templates are refused.
- `POST {action:'apply', template_id, project, start_date}` creates **new** tasks (new IDs, status Not Started, dates from the offsets) and their dependencies in **one transaction**. It is limited to the project owner, PM or Admin; Members are refused (tested).
- `POST {action:'delete'}`.

## 6. Not included
Inline editing in WBS cells, drag-and-drop in the new timeline (use the legacy interactive Gantt), critical path, baselines, and dependency types other than finish-to-start.
