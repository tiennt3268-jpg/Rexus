# REXUS Work Management v2.1.3 — UI Navigation & Layout Release Candidate

## Source and scope
- Based on the supplied REXUS Work Management **v2.1.2** FULL archive.
- UI language remains English; no unrelated domain/business rules changed.
- This revision changes `public/index.html`, `public/rexus-document.js`, `public/rexus-v210.js`, `public/rexus-v207.js`, plus the new `public/rexus-v213.css`; package metadata is updated.
- No Netlify Function and no database migration was changed in this release; the version requires the same schema as v2.1.2 (through migration `032_rexus_session_auto_key`).

## Changes

### Navigation integration
- Resource Planning is now accessible as **Organization → Resource Planning** alongside **Employee Search**.
- Project Financials is now accessible as **Finance → Project Financials** alongside **By Personnel** and **By Project**.
- Old standalone navigation entries are hidden. Old internal `switchView('resource-planning')` / `switchView('project-financials')` navigations are redirected to the new parent section.
- Server endpoints remain unchanged. Finance visibility still follows existing manager/admin checks.

### Organization search obstruction
- After selecting an employee, the search result list is hidden and employee details are shown.
- Escape and outside click close the results. Searching again shows fresh results and hides the old profile while updating.
- CSS explicitly hides inactive work views to prevent stale Project/other panels remaining visible.

### Document navigation
- Space picker is portaled outside the sticky scrollable sidebar and positioned within the viewport, above or below the control depending on available space.
- A max-height and inner scrolling prevent long Space lists from escaping the viewport.
- Each folder in the left document sidebar has a dedicated expand/collapse toggle; the page/folder name remains a separate clickable navigation action.
- Fixed unintended vertically centered document main content by eliminating auto margins and setting top grid alignment.

### Icon and action consistency
- The existing handwritten SVG white-stroke icons continue, with fixes for folder vs document meanings in the document tree and removal of redundant pictograms on labeled document buttons.
- Clear / neutral **smoked frosted glass** replaces saturated backgrounds in many icon holders; the exception is the official Google brand logo.
- Document individual-item menus include sharing, copying links, and other actions supported by existing API capabilities. Unsupported operations are not claimed to work (e.g., arbitrary metadata editing on uploaded files).
- Document bulk toolbar is displayed only when **two or more** items are selected; checkbox selection still works with a single item.
- Table headers, controls, responsive sizes, modal containment and text wrapping have been adjusted to reduce overlap and excess whitespace.

## Tests actually executed
- Static syntax check: all frontend JavaScript files and inline JavaScript from index.html — **PASS**.
- Chromium **offline DOM test**, mocked API: Organization searches and employee-selection dismissal — **PASS**.
- Chromium **offline DOM test**, mocked API: Resource Planning result content and planned/actual columns — **PASS**.
- Chromium **offline DOM test**, mocked API: Document Space picker opens and fits 900px viewport — **PASS**.
- Chromium **offline DOM test**, mocked API: Document folder tree expand/collapse — **PASS**.
- Chromium **offline DOM test**, mocked API: Space picker fits 390px and 768px viewports; no page-level horizontal overflow in these harnesses — **PASS**.
- Document and Resource test harnesses reported no JavaScript page errors for their exercised flows.
- No real Netlify/production database or user sessions were available during this work.

## Open limitations / regression risks
- Full audit of **every** REXUS screen, list, bulk-action variant and all icon semantics is **not complete**. Backend data may expose additional collisions not covered by the DOM test fixtures.
- In particular, universal row selection and batch actions across every legacy table have NOT been implemented; existing supported bulk operations remain.
- Some existing SVG icons from legacy screens may still need bespoke redraws; this release standardizes important shared treatments and Document controls rather than certifying every icon.
- Existing incomplete features from v2.1.2, including Google OAuth requiring proper Google Cloud configuration, and any incomplete v2.1.0 financial/approval flows, are unchanged.
- End-to-end tests with Netlify functions, real database, Google OAuth, organization roles and sensitive financial data **have not been executed**.

## Deployment
1. Back up the production database and Netlify Blobs, plus current deploy/source archive.
2. Use a **staging** site and verify that migrations through 032 have already run (this release adds no migration).
3. Deploy `REXUS-Work-Management-v2.1.3-LITE-Netlify.zip` to staging.
4. Verify Organization → Employee Search and Resource Planning; Finance → Project Financials; Space picker near screen edges; Document folder tree and document editing; and single/multi-file action menus.
5. Check permissions with separate Administrator and ordinary member accounts. Re-run all regression tests before production promotion.

This is a **release candidate**, not a claim of full production readiness.
