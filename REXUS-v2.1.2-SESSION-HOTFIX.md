# REXUS v2.1.2 – Session login hotfix

## What changed
- Removed the mandatory `SESSION_SECRET` Netlify environment-variable requirement.
- Session and password-reset tokens remain HMAC-SHA256 signed.
- REXUS generates a cryptographically random 256-bit key once in its existing database and reuses it across serverless instances/deployments.
- The key is never sent to browsers, logged or stored in source code.
- Adds an additive migration `032_rexus_session_auto_key`. The auth module can also create its table lazily for urgent login recovery (requires DB role permission to create tables).
- Password authentication, Google account linking rules and User IDs are unchanged.
- Existing sessions signed with the previous `SESSION_SECRET` are invalidated; sign in again.

## Deployment
1. Back up database and Netlify Blobs.
2. Prefer applying migration `032_rexus_session_auto_key` on staging first. If database permissions permit table creation, login can initialize the table automatically; otherwise migration is required.
3. Deploy the **LITE** ZIP contents to the existing Netlify site. No `SESSION_SECRET` variable is needed.
4. Test password login and reload as Admin, then test a second user.
5. Check Netlify Functions logs if DB connectivity or table creation fails.
6. Google login is **separate** and still needs `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, the prior `030_rexus_v210` migration, and explicit Account Settings linking. This hotfix does not replace OAuth configuration. It does not enable Google sign-in for users who are not explicitly linked.

## Validation limits
Static syntax/type validation can be done locally. Database and Google OAuth end-to-end behavior require the user's Netlify environment.

## Security
Do not remove the HMAC signature itself. If the database is unavailable, fail closed; never use a hard-coded or public fallback key.
