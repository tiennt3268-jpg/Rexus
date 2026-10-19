# 02 — REXUS Survey v1.0.0 and First Login: how it works

## Who can do what

| Action | Employee (Member) | Project Manager | System Admin |
|---|---|---|---|
| Answer surveys assigned to them (Survey → Overview → *Surveys for you*) | ✓ | ✓ | ✓ |
| Create, edit, publish, close, archive, duplicate surveys | — | Own surveys | All surveys |
| Mandatory on Login, priority | — | — | ✓ |
| Analytics, responses with respondent names, CSV / Excel export | — | Own surveys | All surveys |
| Exclude a response (with a reason) | — | Own surveys | All surveys |
| Employee Profiles (onboarding status, personal information of others), reset password | — | — | ✓ |
| Profile Fields configuration, apply required fields to existing accounts | — | — | ✓ |
| Own personal information (My Account) | ✓ | ✓ | ✓ |

The server enforces every row; the screens only hide what a person cannot use.

## First Login (F07)
Order for every request after sign-in, enforced by the server:

1. **Change temporary password** — when `must_change_password` is set (new accounts and admin password resets).
   - Rules: the temporary password must be correct; new password ≥ 8 characters with a letter and a digit; confirmation must match; it cannot equal the temporary one.
   - After 5 wrong attempts in 15 minutes the step is locked for 15 minutes.
   - Only the hash is stored; passwords are never written to logs.
2. **Complete personal profile** — when the account has `profile_gate` (new accounts) and a visible required field is empty. Defaults: Date of Birth and Education Level are required (D1).
3. **Mandatory survey(s)** — every open mandatory survey whose target includes the person and that they have not answered, highest priority first.
4. **Workspace.**

While a step is pending, every business API answers as signed-out (401) and the app shows the step instead. Refresh, a new tab, typing a module URL, or signing in on another device all land on the same missing step. There is no Skip, Later, Close or Dashboard button; **Sign out** is available.

**Existing accounts** are not affected by steps 1–2 after the upgrade. An admin can (a) reset a password from Employee Profiles, which sets step 1, and (b) use Profile Fields → *Apply required fields to existing accounts*, which enforces step 2 for every active account that is missing a required field.

## Building a survey
- **Create**: name, description, template (blank, employee engagement, training feedback), respondents (REXUS accounts or anyone with the link).
- **Question types**: Short answer, Long answer, Single choice, Multiple choice, Dropdown, Rating (3–10 stars), Linear scale (0/1 to 3–10, with end labels), Date, Number (optional min/max).
- **Per question**: text, helper text, required/optional, answer options (single/multiple/dropdown: 2–50 different options), limits (max characters; number range).
- **Operations**: add after the selected question, reorder (↑/↓), duplicate, delete (with confirmation), autosave (and Save draft), preview on desktop / mobile width.
- **Publish**: freezes the current questions as **version 1**. After publishing you can keep editing the draft; *Publish changes* creates **version 2** only if the questions changed. Every response stays linked to the version it answered. A respondent whose form is from an older version is asked to reload before submitting.
- The respondent mode cannot change after responses were received.

## Mandatory on Login and targets (F02)
- Settings → *Mandatory survey on login* (System Admin), *Priority* (lower first).
- Targets: **All employees**, **Departments**, **Job positions**, **Specific employees** (by User ID). Groups are combined with **OR**; the estimate shows the number of unique active accounts that currently match.
- Only authenticated surveys can be mandatory. A mandatory survey needs at least one target group.
- Targets are evaluated at each request against current HR data: someone who moves into a targeted department is asked from their next request.
- Non-mandatory authenticated surveys: with targets, only those people can answer (they also get an in-app notification when it is first published); without targets, anyone signed in can answer with the link.

## Availability (F05)
- *Opens at* / *Closes at* (Asia/Ho_Chi_Minh, UTC+7), *Maximum valid responses*, and *Close now* / *Reopen*.
- The survey stops at the first of: closing time, response limit, manual close. **Scheduled** = published with an opening time in the future.
- When a mandatory survey stops for any reason, people who did not answer are no longer blocked (D3). Reopening it asks them again.
- The response limit is checked inside the same database transaction as the insert, so two people answering at the same time cannot exceed it.

## Answering
- One question per screen, progress bar, question navigator, Previous / Next, *Submit survey* on the last question; required answers are checked at the question and again by the server.
- Answers are kept as a draft on the device until the server confirms the submission; a lost connection keeps them and offers **Retry**. Re-sending the same submission is counted once.
- Authenticated surveys record the signed-in User ID (never a name typed by the person), plus their department and job position at that moment. Demographic fields are **not** copied into responses.
- Public surveys (`/survey.html?id=…`) store no user id, even when the person happens to be signed in.

## Analytics and export
- Summary per question: counts and percentages for choices, average and distribution for rating / scale, average-min-max for numbers, latest answers for text and dates; responses per day.
- Filters: date range; department and job position (authenticated surveys only).
- Responses list with *View answers* and *Exclude* (reason required, audit-logged; the original answers are never edited and no longer count).
- Export CSV (formula-safe) or Excel with all valid responses. Respondent columns (User ID, name, department, position) are included only for authenticated surveys; exports are audit-logged.

## Personal information (F06)
- Profile Fields (System Admin): label, shown/hidden, required, order, dropdown options. A hidden field can never be required. Fields: Date of Birth, Education Level, Gender (incl. *Prefer not to say*), Field of Study, Graduation Year, Current Province/City, Employment Start Date (HR-managed).
- Employees edit their own self-service fields in **My Account → Personal information**. Name, department and job position stay managed by HR.
- Personal information is visible only to the person and System Admins. Changes are audit-logged with the field names, never the values.
