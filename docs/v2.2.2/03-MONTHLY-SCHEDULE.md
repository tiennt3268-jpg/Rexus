# 03 — Monthly schedule, overtime, minimum and requests (HRM-02…05)

This extends the v2.2.1 capacity declaration ([../v2.2.1/03-CAPACITY-AND-LEAVE.md](../v2.2.1/03-CAPACITY-AND-LEAVE.md)). Same tables, same versioning (v1 stays effective while v2 is a draft, then becomes Superseded), and the same Approval Center flow.

## Who registers what
| Capacity method | Who | Regular hours | Overtime |
|---|---|---|---|
| `schedule` | Full-time (default) | **From the working schedule**: `hours_per_day` on workdays; holidays and personal days off are 0. Read-only in the form. Never auto-filled on rest days. | Declared per day |
| `declaration` | Part-time, freelancer, contractor, collaborator | Declared per day (or with "Apply weekly availability" / "Copy previous month"). Days can be marked Unavailable. | Declared per day |

- Each day can also carry a **note** (up to 300 characters), editable in the List view.
- One row per day: the server de-duplicates the payload, and the primary key is (declaration, day). A day therefore can never be counted twice.
- Validation: 0–24 h each, and regular + OT ≤ 24 h per day.
- Status flow: Draft → Pending Approval → Approved / Changes Requested / Rejected. A month that is pending approval is locked.

## How the numbers are used
| Figure | Source | Used for |
|---|---|---|
| Regular capacity | Schedule-based: working schedule − holidays − approved leave. Declaration-based: approved declared hours − approved leave. | Planning, utilization and remaining hours (unchanged from v2.2.1) |
| Approved OT | `ot_hours` of the **approved** version, per day | Reported separately ("Approved OT", "OT" column in Resource Planning, Team Schedules). **Never added** to regular capacity or utilization. |
| Declared / pending | Open (draft or pending) version | Shown as "pending"; not used for planning |

## Part-time minimum (HRM-04)
- Effective minimum = the personal `rexus_resource_settings.min_monthly_hours` if set, otherwise the company default `rexus_hr_settings.part_time_min_monthly_hours`. 0 means no minimum.
- The minimum applies to **declaration-based** staff only. It is expressed in **regular hours per month**; OT never counts toward it.
- When a draft is below the minimum, the employee sees a warning banner and a "below minimum" note in the submit dialog. **Submitting is still allowed.** The approver sees the shortfall in the request payload, and the manager sees it in Team Schedules.
- On submit, the minimum in force is stored in `min_hours_snapshot`. Approved months always display their snapshot, so later settings changes never alter history that has been locked.

## Schedule requests (HRM-05)
- In HR → Monthly Schedule → Team Schedules, use **Request schedules**. Choose the month (from the page), the recipients (All people I manage, or Selected), an optional due date and an optional message.
- Server rules: recipients must be **active people the sender manages**. Admins can request from anyone except themselves.
- `rexus_schedule_requests` has one row per (month, employee). Sending again updates that row (`send_count`, `last_sent_at`, and the note and due date if new ones are given) and sends a fresh notification. Uncontrolled duplicates are impossible.
- The employee receives an in-app notification, "Please register your work schedule for <Month Year>". Clicking it opens HR → Monthly Schedule on that month. The form shows a banner with who asked, the due date and the message, and links to other requested months.
- The manager sees, per person: status (Not registered / Draft / Pending Approval / Changes Requested / Approved / Schedule-based), regular capacity, OT, registered vs minimum, and request info (sent ×N, last sent, due date).
- There are no email reminders or automatic deadline enforcement yet (see limitations).
