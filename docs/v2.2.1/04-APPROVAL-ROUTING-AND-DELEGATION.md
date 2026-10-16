# 04 — Approval Center: routing, delegation & reassignment

Implementation: `netlify/functions/lib/approvals.mts` (shared core) and `netlify/functions/approval-center.mts` (API). Data lives in the existing v2.1.0 tables: `rexus_approval_requests`, `rexus_approval_steps` and `rexus_approval_events`, plus `rexus_approval_delegations` and `rexus_approval_routing_rules` from migration 033.

## 1. Categories and types

| Category | Types | Created from |
|---|---|---|
| Human Resources | `leave_request`, `capacity_declaration` | HR module only |
| Project Management | `project_change_review`, `project_budget_review` | Approval Center → New request |
| Project Finance *(sensitive)* | `project_disbursement`, `project_expense` | Project Finance only |
| Documents | `document_review` | Approval Center → New request |

- Source-backed types (HR and Finance) **cannot be created directly** through the Approval Center API.
- Their approval request is created in the **same DB transaction** as the source record, so there are never orphans. This is tested: a failed routing leaves no disbursement behind.

## 2. Approver eligibility
An approver must:
- be an **Active** REXUS user;
- **not be the requester** (self-approval is refused both at creation and at decision time);
- for **Project Finance**, have the role **Project Manager** or **System Admin**.

## 3. Routing order
`resolveApprovers()` takes the first eligible result from this list, in order. It never silently picks an ineligible user.

1. **Explicit approver(s)** chosen by the requester. Each one is validated; if any is invalid, the request fails with the reason.
2. **Active routing rules.** Rules are sorted by `priority` ascending, then by specificity (number of matching non-empty fields among category, request_type, department and project_key). A rule matches when each non-empty field equals the request's value. The first eligible approver wins.
3. **HR profile** (Human Resources only):
   - `capacity_declaration`: capacity approver → manager → capacity approver;
   - `leave_request`: manager → capacity approver.
4. **Department head** (`departments.head_user_id` for the request's department).
5. Otherwise: **HTTP 422** "No eligible approver could be routed. Choose an approver, or ask an administrator to add a routing rule / set your manager."

Routing rules are managed by **System Admins only** (Approval Center → Routing). Deleting a rule deactivates it (`active = FALSE`), so history is kept.

## 4. Steps and decisions
- **Modes:**
  - *Sequential:* stage *n+1* is active and notified only after every step of stage *n* is approved.
  - *Parallel:* every step must approve.
- **Decisions:**
  - **Approve**, **Reject** or **Request Changes**. Reject and Request Changes require a reason, checked on both the client and the server.
  - A Reject or Changes Requested decision ends the request. Approved means every step has approved.
- **Idempotency and concurrency:**
  - The request and step rows are locked (`FOR UPDATE`), and the step is updated with `… WHERE decision='Pending'`.
  - A second or simultaneous decision gets 409 "already decided". This was tested with two simultaneous decisions: exactly one succeeds.
- **Source update:** `applySource()` updates the business record inside the same transaction.
  - Leave → Approved / Rejected / Changes Requested.
  - Declaration → Approved, which supersedes the previous approved version.
  - Disbursement → Approved, with approved_amount set; on Changes Requested it returns to Draft.
  - Expense → Approved, which is **not** a cash movement.
  - If the source is no longer pending, the whole decision is rolled back (409).
- **Audit:** every action writes an approval event (actor, action, reason, previous and new status, details such as `on_behalf_of`) and an audit-log entry. The requester is notified of the final outcome.

## 5. Delegation
- A delegation is: delegator → delegate, `start_date`–`end_date` (inclusive), and **categories** (an empty list means all categories).
- It applies only while it is **Active** and today falls within its dates. Expired or revoked delegations have no effect (tested).
- The delegate sees the delegator's requests under the **Delegated** tab and in **Pending**, and can decide them. The step keeps the original `approver_id`, and `acted_by` records the delegate. The event records `on_behalf_of`.
- **Finance safety:** a delegation covering Project Finance (explicitly, or via "all categories") can only go to a PM or System Admin. Otherwise the user must limit the categories.
- A user can create delegations for themselves. An Admin can create one on behalf of any delegator.
- **Revoking:** the delegator or an Admin can revoke. The delegate cannot revoke (tested).
- The delegate is notified when a delegation is granted.

## 6. Assign and reassign
- Only **Pending** requests and **pending** steps can be (re)assigned. Completed decisions are never removed.
- **Reassign requires a reason.**
- Who may reassign:
  - **System Admin:** any request.
  - **Current step approver:** their own step, for non-finance categories only. Finance reassignment is admin-only.
- The new approver must be eligible (§2), must not be the requester, and must not already be an approver at that stage.
- An event records `{previous_approver, new_approver}`. The previous approver is notified and **can no longer decide**. The new approver is notified.

## 7. Approval Center UI
- **Tabs:** Pending (my active steps plus delegated), Assigned (all requests where I am an approver), My Requests, Delegated, Approved, Rejected, All (admin).
- **Filters:** category, type, status, priority, search. Sorting and pagination are available.
- **Detail view:** the related record, steps (approver, acted by, decision, reason), and the full history.
- Approve, reject and request-changes dialogs, with a reason field where required.
- The New Request dialog offers direct types only.
- Delegations tab: list, create, revoke.
- Routing tab (admin only).
- Filtering is done in memory over the most recent 2,000 visible requests. See [08](08-KNOWN-LIMITATIONS.md).
