# 06 — Project Finance: reconciliation notes

Implementation: `netlify/functions/project-financials.mts`. UI: `REXUS221.financials` (Finance module) and `REXUS221.financeDetail` (the Financials section of the project detail page).
Tables (v2.1.0 plus 033 columns): `rexus_project_transactions`, `rexus_disbursements`, `rexus_disbursement_payments`, and finance events/audit.

## 1. Project identity: why projects were missing
- A project is identified by **(owner user ID, project name)**, which is the real key of `projects`.
- Before this release, Finance read only registered `projects` rows and looked them up **by name alone**. Two problems followed:
  1. projects that exist only as `tasks.project` names were invisible, although the Projects view shows them;
  2. two owners using the same project name collided.
- Now `GET ?list=1` returns registered projects **plus task-only projects** (marked *not registered*, with zero totals) that the caller owns or is a member of. Admins see all of them.
- Every call carries `owner` + `project`. Legacy name-only calls still work when the name is unambiguous for the caller, and return **409** "pass the owner" otherwise.
- **No finance "project" records are created.** Task-only projects can record transactions. Releasing funds requires a registered project with an approved budget, because the budget is the release limit.

## 2. Ledger (income and expense)

| Status | Counts as cash? | Next step |
|---|---|---|
| Draft | No | Confirm → Completed (income; expense if owner/PM/Admin), or Cancel |
| Pending Approval | No (shown as "pending approval") | Decided in the Approval Center (`project_expense`, approver must be PM or Admin) |
| Approved | **No.** An approval is an authorization, not a cash movement. | Confirm → Completed |
| Completed | **Yes** | Reverse (with a reason) |
| Rejected / Cancelled | No | — |

- **Reference** is required and unique per project (409 on duplicates).
- **Confirmation** is conditional on the status still being Draft or Approved, so a double confirmation gets 409.
- **Corrections never edit history.** `reverse_transaction` requires a reason and creates a new Completed entry with `reverses_id` pointing at the original. The original is kept and is excluded from totals from then on. An entry can be reversed only once, and a reversal can't itself be reversed.
- **Members** cannot confirm their own Draft expense directly; they must submit it for approval.

## 3. Totals: how the numbers are computed
Totals are computed **per currency**. Different currencies are never added together.

```
completed      = transactions WHERE status='Completed' AND reverses_id IS NULL AND id NOT reversed
received       = Σ completed Income
expenses       = Σ completed Expense
net_cash       = received − expenses
pending        = Σ transactions WHERE status='Pending Approval'
disbursed      = Σ payments on this currency's disbursements
approved_alloc = Σ approved_amount of disbursements Approved / Partially / Fully Disbursed
remaining_alloc= approved_alloc − disbursed
remaining_budget_to_disburse = budget − disbursed       (budget currency only)
budget_utilization           = expenses ÷ budget × 100  (budget currency only)
```
- The **approved budget** (`projects.budget`, `budget_currency`) is a limit. It is never mixed into cash.
- **Disbursements are not expenses.** A disbursement releases allocated funds. Spending is recorded as an expense entry. This is tested: disbursed 30M did not change expenses.
- **Exchange rate (optional):** when given, `base_amount = amount × exchange_rate` is stored for reporting in the budget currency. Totals still group by the original currency.

Tested reconciliation example (VND): budget 50M; income 30M confirmed; expense 5M approved then confirmed; utilization 10 %; disbursement 30M approved and paid in 3 payments → disbursed 30M, remaining budget 20M.

## 4. Disbursements and payments
1. **Request** (`request_disbursement`): a disbursement row (Pending Approval) and its `project_disbursement` approval request are created in **one transaction**. If routing fails (no eligible PM or Admin approver), nothing is saved.
2. **Approval** (Approval Center): approved_amount defaults to the requested amount, and the status becomes Approved. Changes Requested returns the request to Draft; Rejected → Rejected.
3. **Payment** (`pay_disbursement`), inside one transaction:
   - Lock the project row, then the disbursement row (`FOR UPDATE`). This serializes concurrent releases.
   - The project must be registered with a budget, and the currency must equal the budget currency.
   - The disbursement must be Approved or Partially Disbursed, with an Approved approval request.
   - `paid + amount ≤ approved_amount`.
   - `all payments for this project/currency + amount ≤ budget`.
   - The payment `reference` is unique, so a duplicate or simultaneous identical payment is recorded once. This was tested with two simultaneous identical payments.
   - The status becomes Partially Disbursed or Fully Disbursed.
4. Payments are stored as separate rows and are never merged into the disbursement.

## 5. Audit trail
- `GET ?owner=&project=&history=transaction:<id>` (or `disbursement:<id>`) returns every event: request, submit, approval events, confirm, cancel, reverse and payments, with actor, time and details.
- Every write also goes to the global audit log.

## 6. Manual reconciliation checklist (per project, per currency)
- [ ] Received − Expenses = Net cash, using Completed non-reversed entries only.
- [ ] Every reversed original has exactly one Completed reversal, with a reason in its history.
- [ ] Σ payments per disbursement ≤ its approved amount; Fully Disbursed ⇔ Σ payments = approved amount.
- [ ] Σ payments per project ≤ approved budget.
- [ ] No payment reference appears twice.
- [ ] Pending Approval entries match open `project_expense` requests in the Approval Center.

SQL helpers:
```sql
-- cash per project/currency (Completed, non-reversed)
SELECT project_owner_id, project_name, currency,
       SUM(amount) FILTER (WHERE type='Income')  AS received,
       SUM(amount) FILTER (WHERE type='Expense') AS expenses
FROM rexus_project_transactions t
WHERE status='Completed' AND reverses_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM rexus_project_transactions r WHERE r.reverses_id=t.id AND r.status='Completed')
GROUP BY 1,2,3;
-- over-disbursed requests (must return no rows)
SELECT d.id, d.approved_amount, SUM(p.amount) AS paid
FROM rexus_disbursements d JOIN rexus_disbursement_payments p ON p.request_id=d.id
GROUP BY d.id, d.approved_amount HAVING SUM(p.amount) > d.approved_amount;
```
