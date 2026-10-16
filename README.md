# Rexus
Work management app — **v2.2.1** (Netlify: static `public/` + Netlify Functions + Netlify Database).

- Release notes: [`REXUS-v2.2.1-RELEASE-NOTES.md`](REXUS-v2.2.1-RELEASE-NOTES.md)
- Docs (deploy, migration, capacity, approvals, finance, tests): [`docs/v2.2.1/`](docs/v2.2.1/README.md)
- Tests: `tests/v2.2.1/` (see `docs/v2.2.1/07-TEST-REPORT.md`)

Deploy: connect this repo to Netlify; `netlify.toml` sets `publish = "public"` and `functions = "netlify/functions"`. Migrations in `netlify/database/migrations/` are applied by Netlify Database on deploy. Back up the database before deploying (see `docs/v2.2.1/01-DEPLOYMENT-AND-MIGRATION.md`).
