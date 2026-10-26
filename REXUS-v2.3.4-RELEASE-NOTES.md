# REXUS Work Management v2.3.4 — Release Notes

Release date: 2026-10-26 · Source: **REXUS_Requirements_v2.3.4** (PRD/SRS, Draft for Review) · Builds on v2.3.2 · Schema: migrations 001–035 (+ 036 data import in the deploy zips only) · No new migration, no permission change

Documentation: [`docs/v2.3.4/`](docs/v2.3.4/README.md) (traceability, decisions applied) · Tests: [`01-TEST-REPORT`](docs/v2.3.4/01-TEST-REPORT.md) · Screenshots: [`docs/v2.3.4/evidence/`](docs/v2.3.4/evidence)

> Version numbering follows the requirement document (2.3.4). There is no separate 2.3.3.

## Decisions applied (section 8 "open decisions")
The document's own proposals were used:
- **SUR-02:** hide only the technical labels; progress stays.
- **SUR-05:** branching on single-choice questions only; respondents can go back and change answers.
- **SUR-06:** kept as delivered in v2.3.0 (target groups, once per person, released automatically when the survey closes).
- **GEN-03:** job title = HR position, "No job title" when empty.
- **WM-06:** week starts Monday, local browser time, view only (no drag).

## What's new

### All three modules
- **GEN-01 — Sign-in:**
  - New minimal two-column screen with the tagline **"all in one with Rexus"** and no illustration.
  - It stacks on phones. Errors, Enter and Tab work as before.
- **GEN-02 — Field widths:**
  - Short fields (numbers, dates, scores) no longer take half or all of a row next to empty space.
  - *Log Work* puts date, start, end and hours on one row.
  - *Compensation*:
    - the manual rating is compact;
    - the hourly-rate history uses the full card;
    - new rate, date and Save sit on one row.
- **GEN-03 — People pickers:**
  - Every people picker shows **Name — Job title · Email**: HR manager/approver, approvers, members, Document sharing, Survey target employees and Assign Task.
  - Pickers are always searchable, so people with the same name can be told apart by email.

### REXUS Survey
- **SUR-01:** buttons, icons and accent colour now follow the REXUS / Document design system.
- **SUR-02 / SUR-03:** respondents no longer see "QUESTION 01 · RATING", type names or decorative dots.
- **SUR-04 — Sections:**
  - Add, rename, move, duplicate and delete sections in the builder.
  - Respondents answer one section per page and can go Back without losing answers.
  - Forms without sections still work one question per page, with the navigator.
- **SUR-05 — Branching:**
  - For single-choice questions, each answer can *Continue*, *Go to a later section* or *Submit form*.
  - Backward or deleted targets are refused by the server, and the builder warns.
  - Deleting a section resets the answers that pointed to it.
  - Only the questions on the respondent's path are required and stored.
- **SUR-06:** the mandatory survey on login (v2.3.0) works with sections and branching. Re-checked.

### REXUS Work Management
- **WM-01:** the worklog grid uses one thin neutral line per cell (the double lines are gone).
- **WM-02:** notifications are a pastel blue card when unread and a white card when read, with no left stripe.
- **WM-03:** an **Important** tab in the notification panel. Star or unstar a notification, per account; this does not change read/unread.
- **WM-04:** calendar month items are light tags without the dark left bar. "+n more" opens that day.
- **WM-05:** click the calendar title to pick a month and year; in Week/Day you can also pick the day. There is a new **Today** button.
- **WM-06 — Week and Day timeline:**
  - An all-day lane, plus timed blocks placed by start/end time, side by side when they overlap.
  - A current-time line.
  - Switching views keeps the date.

### REXUS Document
- **DOC-01:** one consistent chevron for the space switcher, section toggles and the folder tree, keyboard operable.

### Fixed along the way
- Calendar week/day used UTC dates, which could show the wrong day in UTC+7. It now uses local dates.

## Testing (executed; details in [01-TEST-REPORT](docs/v2.3.4/01-TEST-REPORT.md))
- New E2E for every requirement ID: **69/69**. New unit checks for sections and branching: **11/11**.
- Regression:
  - Backend **224/224**, Survey **97/97**.
  - E2E v2.3.1 **44/44**, v2.3.0 **68/68**, v2.2.3 **75/75**, v2.2.2 **53/53**, v2.2.1 **48/48**.
  - Legacy UI harness **24/24**.
- UI audit, 49 screens × 7 theme/width configurations: **341/343** clean on the full run. The 2 findings were fixed and re-checked.
- No older test was edited.

## Upgrade
Deploy the LITE zip.
- **New database** (new site, or the old database deleted): the zip contains migration 036, which imports the previous REXUS data as in v2.3.2.
- **Database already running v2.3.2:** 036 has already run, so nothing else happens.
