# REXUS Work Management v2.3.1 — Release Notes

Release date: 2026-10-19 · Builds on v2.3.0 · Schema: migrations 001–035 (no new migration) · No API or permission changes

Full documentation: [`docs/v2.3.1/`](docs/v2.3.1/README.md) (module responsibility map, moved/removed list) · Test report: [`01-TEST-REPORT`](docs/v2.3.1/01-TEST-REPORT.md).

## Why
The v2.3.0 Survey workspace had **Employee Profiles** and **Profile Fields**. They showed onboarding status, personal information (DOB, education…) and Reset password. These describe people, not surveys. Employee data was also spread over five places: HRM, Configuration → Employees, Configuration → Hourly Rates, Finance → By Personnel, and Survey. Some screens could be reached from two or three entry points.

## What changed

### One employee record in Human Resources Management
- HRM → Employee Search opens one record per employee, with tabs:
  - **Overview**: account details plus linked work (open tasks, projects, hours this month, each linking to its task or project).
  - **Employment & leave**.
  - **Personal information**.
  - **Compensation**: salary history, Edit Salary, hourly-rate history, performance-based pay; System Admin can also set a new hourly rate.
  - **Account**: role, department and status; first sign-in status; Reset password; Delete account.
- Tabs follow the existing server permissions:
  - Personal information: the employee and System Admins.
  - Compensation: Project Managers (managed scope only) and System Admins. Setting hourly rates stays System Admin only.
  - Account: System Admin.
  - A Member looking at a colleague sees Overview only.
- System Admins get the **account list** (create, delete, restore) under the search in HRM. A row opens the record.
- The HRM admin tab is renamed **HR Settings** and now also holds **Personal information fields** (the former Survey → Profile Fields).
- Other modules open the record directly: Finance → By Personnel (opens Compensation), Configuration, and the old Survey links.

### No duplicate entry points
- Survey no longer has Employee Profiles / Profile Fields. Old `#survey/profiles/<id>` and `#survey/fields` links redirect to HRM.
- Configuration keeps company-wide settings only: Company information, Task types, Performance-pay rules. A short note links to HRM for accounts, pay and HR settings.
- Project Detail shows a finance **summary** with *Open in Project Finance*. It no longer has a second copy of the ledger. People without the Finance tab still get the full inline view.
- The hidden duplicate tabs *Resource Planning* and *Project Financials* (and their empty views) were removed. The `#/resource-planning` and `#/project-financials` links still work.

### Stronger links between modules
- Approval Center request → **Open related record**:
  - leave → HRM Leave Management;
  - monthly schedule → HRM Monthly Schedule (team, that month);
  - expense / disbursement → that project's Income & Expenses / Disbursements in Project Finance.
- The record's Overview links to tasks and projects. Project Detail links to Project Finance. Finance By Personnel links to Compensation.

### Clean-up
- Removed `rexus-v210.js` (v2.1.0 screens, not shown since v2.2.1) and every `window.REXUS210` fallback.
- Removed `rexus-v211.js`, which inserted a checkbox "bulk copy" column into read-only tables, empty-state rows included.
- Removed the dead legacy employee-list code in the Organization view.

### Not changed (by decision)
- **Departments and the org chart**: the editor and org-chart code is still unreachable from the menu, as in v2.3.0. It was left untouched because restoring it as an HRM tab was not selected.
- No API, database or permission change. The server still decides who sees salary, rates, personal data and accounts.

## Testing (executed; details in [01-TEST-REPORT](docs/v2.3.1/01-TEST-REPORT.md))
- New E2E for the reorganisation: **44/44** (HRM record and tabs per role, accounts in HRM, HR Settings fields, redirects, Finance → Compensation, Project Detail → Project Finance, Approval → related record, permissions unchanged).
- Regression:
  - Backend **224/224** and Survey **97/97**.
  - E2E v2.3.0 **68/68**, v2.2.3 **75/75**, v2.2.2 **53/53**, v2.2.1 **48/48**.
  - Legacy UI harness **24/24**.
- UI audit of the 8 new or changed screens × 7 theme/width configurations: **56/56 clean**.
- Five older test steps were updated because the UI they tested moved. They are listed in the report.

## Upgrade
Deploy the files. There is no migration and no new environment variable. Browsers pick up the new scripts through the `?v=2.3.1` cache-busting.
