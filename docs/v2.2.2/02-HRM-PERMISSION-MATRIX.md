# 02 — HRM permission matrix (HRM-01)

Every rule below is enforced in `netlify/functions/hr.mts` and the shared approval core. The UI hides controls to match, but **hiding a button is never the only check**.

## Roles as HRM sees them
| HRM role | Who it is (derived, not a new account type) |
|---|---|
| **HR Admin** | `users.role = 'System Admin'` |
| **Manager** | Anyone named as another person's `manager_id` or `capacity_approver_id` on their HR profile, or the `head_user_id` of the employee's department. A manager manages only those people. |
| **Employee** | Every other active user (self only) |

A user's **project** role (Project Manager / Member) gives **no** HRM rights. Being a project manager does not let you see anyone's HR data. HRM rights are likewise never applied to Project, Task or Subtask.

## Matrix
✅ allowed · ◑ only for people they manage · 👤 only own record · ❌ refused (HTTP 403 or 401)

| Action | Endpoint | Employee | Manager | HR Admin |
|---|---|---|---|---|
| View employee profile | `GET /api/hr/profile` | 👤 | ◑ + 👤 | ✅ |
| Change employment / schedule / manager / approver / personal minimum | `PUT /api/hr/profile` | ❌ | ❌ | ✅ |
| View holidays | `GET /api/hr/holidays` | ✅ | ✅ | ✅ |
| Add / delete holidays | `POST/DELETE /api/hr/holidays` | ❌ | ❌ | ✅ |
| Create / submit / cancel own leave | `POST /api/hr/leave` | 👤 | 👤 | 👤 |
| View team leave (calendar) | `GET /api/hr/leave?scope=team` | ❌ (own only) | ◑ | ✅ (`scope=all`) |
| View / save / submit own monthly schedule | `GET/POST /api/hr/capacity` | 👤 | 👤 | 👤 |
| View another person's monthly schedule | `GET /api/hr/capacity?user_id=` | ❌ | ◑ | ✅ |
| Team schedules overview (regular, OT, minimum, requests) | `GET /api/hr/team` | empty list | ◑ | ✅ (all, except self) |
| Send schedule requests (All / Selected) | `POST /api/hr/requests` | ❌ | ◑ (active people they manage) | ✅ |
| View company part-time minimum | `GET /api/hr/settings` | ✅ | ✅ | ✅ |
| Change company part-time minimum | `PUT /api/hr/settings` | ❌ | ❌ | ✅ |
| Approve / reject / request changes on leave and schedules | Approval Center `decide` | Only if routed to them, never their own | As routed approver | As routed approver |
| Reassign an HR approval | Approval Center `reassign` | Current approver only (with a reason) | Current approver | ✅ any |
| Resource Planning: see others | `GET /api/resource-planning` | 👤 | ◑ | ✅ (PM role also sees all, read-only planning) |

Approval routing for leave and schedules: explicit approver → active routing rule → profile manager / capacity approver → department head. Self-approval is always refused.

## Backend checks that cover this matrix
From the "v2.2.2 HRM-01 Permissions" section, plus the earlier "M4 HR" and "M3 Approvals" sections:
- An employee cannot read another employee's schedule (403). A manager can read a managed employee's schedule (200).
- A non-manager cannot send schedule requests (403). A manager cannot request from someone they don't manage (403).
- Only the HR admin can change HR settings (403 otherwise). An employee cannot change their own minimum or schedule (403).
- An employee's team view is empty.
- Earlier sections: a member cannot change their own schedule; an unrelated member cannot read a profile; holidays are admin-only; the requester cannot decide their own request; an unrelated user cannot reassign.
