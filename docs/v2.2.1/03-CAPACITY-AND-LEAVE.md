# 03 — Capacity calculation, leave & capacity approval

Implementation: `netlify/functions/lib/capacity.mts` (pure functions plus a read-only loader), `netlify/functions/hr.mts` and `netlify/functions/resource-planning.mts`.

Three independent quantities are computed per employee and period. **None of them is derived from another.**

| Quantity | Meaning | Source |
|---|---|---|
| **Capacity** | Confirmed hours available | Employment profile (schedule) or approved monthly declaration |
| **Planned** | Estimated effort allocated to the period | Task and subtask estimates, explicit allocations |
| **Actual** | Hours recorded | Work logs (`worklogs`, status ≠ rejected) |

## 1. Capacity calculation

### 1.1 Employment profile
`rexus_resource_settings` (one row per user) stores employment_type, capacity_method (`schedule` | `declaration`), hours_per_day, workdays (JSON array of weekday numbers, 0 = Sunday), manager_id, capacity_approver_id and effective_from.

- With no row, the default is Full-time, schedule-based, 8 h/day, Mon–Fri.
- Declaration-based employment types: Part-time, Freelancer, Contractor, Collaborator. These are suggested; an admin sets the method explicitly.
- Only a **System Admin (HR)** can change the profile (`PUT /api/hr/profile`).
- **Effective dating:** every change writes a row to `rexus_resource_settings_history` with its `effective_from`. On the *first* change, the previous schedule is also recorded with `effective_from = 1900-01-01`. For each day, the engine uses the newest history row whose `effective_from` ≤ that day, so **a schedule change never rewrites past months**. This is tested: November keeps 8 h while December uses the new 6 h schedule.

### 1.2 Schedule method (per day)
```
base      = hours_per_day if weekday ∈ workdays else 0
holiday   : company-wide full-day holiday → base = 0;  partial holiday (hours set) → base −= hours
day off   : personal full day off → base = 0;  partial (hours set) → base −= hours
leave     = MAX over approved leaves covering the day of
              full → hours_per_day,  half → hours_per_day/2,  hourly → min(hours_per_day, hours)
leave     = min(leave, base)                  -- never deduct more than the day has
capacity  = base − leave
```
- Overlapping approved leaves use the **largest** deduction, not the sum, so there is no double deduction.
- Leave on a holiday or rest day deducts nothing, because `base` is already 0.
- Example (tested): November 2026, Mon–Fri at 8 h = 21 workdays = 168 h, minus a 1-day holiday (8 h) and 2 days of approved leave (16 h) = **144 h**.

### 1.3 Declaration method (per day)
- Capacity comes only from the **Approved** declaration for that month (`rexus_capacity_entries`: day, hours 0–24, available/unavailable, optional start/end time and note).
- If a month has no approved declaration, capacity is **`null`, not 0**. The status is shown as *Missing Declaration*, *Pending Approval*, *Draft* or *Rejected Declaration*, and utilization is not computed. Pending hours are reported separately as "pending", never as confirmed capacity.
- Company-wide holidays force 0. Approved leave is deducted the same way, using the declared hours for the day.

### 1.4 Planned effort
For each task (cancelled tasks and subtasks are excluded):
1. Each **subtask estimate** counts for the subtask assignee, falling back to the task assignee.
2. **Parent task estimate:**
   - If it is ≤ the sum of the subtask estimates, it is a **roll-up** and is not counted again (shown as Σ in the WBS).
   - If it is greater than that sum, only the **remainder** counts, for the task assignee.
3. **Explicit allocations** (`rexus_resource_allocations`) for a task *replace* the task's own portion. This is how one task is split across several people, and the total is never multiplied.
4. Items with no estimate are listed as **Unestimated**. They are not treated as zero effort.
5. Hours are **spread evenly over the assignee's working days** between start and due date. If the window contains no working day, the hours land on the end date. Items with no dates at all are reported as **Unscheduled** and are never pushed into the current month.

Tested example: 16 h + 12 h (with the roll-up not double-counted) + 20 h + 10 h (allocation) = 58 h planned.

### 1.5 Derived figures and status

| Figure | Formula |
|---|---|
| Remaining | capacity − planned (null if capacity is unconfirmed) |
| Overload | max(0, planned − capacity) |
| Variance | actual − planned |
| Utilization | planned ÷ capacity × 100 |

Status:
- **Available:** utilization < 85 %
- **Near Capacity:** 85–100 %
- **Overloaded:** above 100 %, or planned hours with 0 capacity
- **Unavailable:** 0 capacity and nothing planned
- **Missing Declaration / Pending Approval:** capacity is not confirmed

The thresholds are the constants `NEAR_CAPACITY_THRESHOLD = 85` and `OVERLOAD_THRESHOLD = 100`.

### 1.6 Visibility
- PMs and System Admins see every active employee.
- Other users see themselves and the people they manage (`manager_id` / `capacity_approver_id`).
- Only the task owner, PM or Admin can set missing estimates (`POST /api/resource-planning {action:'estimate'}`). Doing so never changes status, assignee or dates.
- The allocation preview (`GET …?preview=1`) shows the overload impact before you save.

## 2. Holidays and days off
- `GET/POST/DELETE /api/hr/holidays` (admin only for changes). Kinds: company holiday, public holiday, and others. Global days have `user_id = NULL`.
- A partial unique index prevents two company-wide entries on the same date (409).
- Personal days off use the same table with a `user_id`.

## 3. Leave requests
- Types: Annual, Sick, Unpaid, Personal, Other. Units: **full** day(s), **half** day (AM/PM, single day only), **hourly** (single day, 0–24 h).
- **Duration** is computed on the server from the employee's schedule. Non-working days and company holidays are skipped.
- **Overlap rule:** a *full-day* request that overlaps another Pending or Approved request is refused (409). Half-day and hourly requests on a day that already has leave are accepted, but the capacity engine still deducts only the largest one (§1.2).
- Lifecycle:
  ```
  Draft ──submit──► Pending Approval ──approve──► Approved
    ▲                     │  └─reject──► Rejected
    └──(edit)── Changes Requested ◄──request changes
  Draft / Changes Requested / Pending / Approved ──cancel (by requester)──► Cancelled
  ```
  - Cancelling a pending request also cancels its approval request.
  - Only Approved leave affects capacity.
- On submit, an approval request of type `leave_request` (category Human Resources) is created **in the same transaction**. Routing is explained in [04](04-APPROVAL-ROUTING-AND-DELEGATION.md). For HR requests the order is: explicit approver → routing rule → profile manager → profile capacity approver → department head.
- When the approval decides, the leave record is updated inside the decision transaction (`applySource`), and the requester is notified.

## 4. Capacity declarations (part-time and other declaration-based staff)
- One declaration per employee per month, **versioned**. Statuses: Draft → Pending Approval → Approved / Rejected / Changes Requested; Superseded.
- A partial unique index allows only one *open* declaration (Draft, Changes Requested or Pending) and one *Approved* declaration per user and month. This was tested under concurrent saves.
- UI tools: calendar entry, **apply weekly pattern** (fills every matching weekday), **copy previous month** (copies hours from the same weekday in the previous approved month), an accessible list view, and version history.
- A month that is **Pending Approval is locked** (409 on edit).
- **Revision:** after approval, editing creates version *n+1* as a Draft. Version *n* remains the effective capacity until version *n+1* is approved. At that point *n* becomes **Superseded**, and both are kept for history.
- Approval routing: explicit approver → routing rule → **profile capacity approver** → manager → department head.
- Team view (`GET /api/hr/team?month=`): each managed employee's declaration status (Schedule-based / Approved / Pending / Rejected / Missing), with approved and pending hours.
