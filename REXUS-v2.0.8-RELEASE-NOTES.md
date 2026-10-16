# REXUS v2.0.8 — Collaboration and Liquid Glass polish

**Release status: staging candidate. Not production-certified.**

Base: REXUS v2.0.7. Shared REXUS and REXUS Document frontend; no changes to Project, Task, Subtask, Worklog, Payroll or KPI business logic. This update adds a database migration and new API endpoints.

## Implemented in code

1. **Document passage comments:** Select text in the read view or pageless editor, click Comment selection, post a thread anchored by quote plus neighboring context; replies, resolve/reopen by users with Comment or Edit access. Thread content is stored independently from the document body. Legacy Folder Comments are preserved in the database but removed from the Folder Details interface. On changed/missing text the comment may not be highlightable; its thread is still kept.
2. **Organization sharing:** Space, Folder and Document sharing with organization members, three effective levels (View, Comment, Edit), server-side enforcement for document/folder read/write operations, file download/upload and comments. Share and permission updates create user notifications and Audit Log entries. Revocation supported. Owner/System Admin can manage shares. Direct shares or shares inherited from ancestors may confer access.
3. **Existing data protection:** Migration is additive; **legacy Spaces remain organization-accessible** so deploying does not silently revoke colleagues' existing access. Owners can change an item to **Restricted** to enforce View/Comment/Edit permissions instead of organization-wide access. Newly created Spaces default to Restricted. Documents inherit their parent Space/Folder until overridden. Restricting existing Spaces may intentionally change users' access; evaluate before applying.
4. **Bulk actions:** Checkboxes, Select All, Move, Share, Add labels, Export Word (separate downloads), Copy links, Delete, Clear selection. Sequential per-item API calls; progress and partial failures reported. Files inherit their parent permissions and are not directly shareable. Moving uploaded files requires a target Folder. Links to Task/Subtask are protected against deletion in existing API.
5. **UI font and bars:** REXUS Document UI typography increased, glass-effect Folder/File list header, action/filter/bulk bars, and harmonized REXUS Work Management table headers. Retains navy/ocean/cyan/white Liquid Glass palette and the small app switch next to the title.
6. **Notifications:** Shares create notifications in the existing notifications table. Clicking a new Space/Folder/Page share notification opens REXUS Document.

## Migration (required)

`netlify/database/migrations/029_rexus_document_collaboration/migration.sql`

Back up the PostgreSQL/Netlify Database and Blob store. Stage first. Verify migrations through **028_rexus_document_drive** were applied, then apply **029_rexus_document_collaboration** using the existing Netlify Database migration workflow. Do **not** re-run reset/seed migrations against production data. Deploy the LITE ZIP only after the new schema is available.

Migration adds:
- `rexus_spaces.access_mode`, `rexus_documents.access_mode`
- `rexus_document_shares`
- `rexus_document_threads`
- `rexus_document_thread_replies`

It does not delete old data or edit unrelated module tables.

## Verification performed

- Node `--check` passed for all frontend JavaScript.
- TypeScript `tsc --noEmit` passed for all 40+ Netlify Functions and library TypeScript (using installed project dependencies/types).
- Permission utility unit checks passed: private Space blocking, organization legacy access, direct Comment share, Edit denial, owner access, filtered lists.
- Build archives inspected for presence of functions, assets, package metadata, new migration.

## Not yet independently verified

- **Production/staging database and Netlify Blobs integration.** Live request behavior, notifications, migrations, and permission inheritance must be exercised on a staging site before production.
- **Browser visual/interaction regression:** Chromium is blocked from navigating to local or simulated test URLs in the current environment. No claim of browser end-to-end verification is made.
- **Concurrent editing/comment conflicts**, massive selections, very large document trees, accessibility audit, and mobile scrolling need staging checks.
- Advanced Mermaid rendering and dedicated PDF conversion remain at v2.0.6 level; they were not upgraded in v2.0.8.

## Recommended staging acceptance checks

- Log in as Owner A and two other users B/C. Create private Space, Folder, Document, attach a file. Share space View with B, verify B cannot edit/upload/comment; update Comment, verify reply/resolve/reopen and no edit; update Edit, verify save; revoke and verify subsequent reads blocked.
- Share a single page without sharing the Space, verify direct notification navigation and no access to other pages.
- Verify existing organization-accessible Spaces continue to work; switch one to Restricted only after reviewing intended access and inherited grants.
- Highlight text across formatting elements, comment, refresh, reply, resolve/reopen, edit surrounding text, and verify threads remain in history.
- Select multiple rows and exercise Move, Share, Add labels, Export, Copy links, Delete; verify any per-item failures are reported.
- Test at 390px, tablet, 1440px and ensure draft/autosave survives comment workflow.
- Verify Task/Subtask document links still open with proper permission checks.

## ZIP contents

- **FULL**: source, dependency snapshot, existing release notes, this release note.
- **LITE**: `public/`, `netlify/functions/`, `netlify/database/migrations/`, `netlify.toml`, `package.json`, `package-lock.json` only.
