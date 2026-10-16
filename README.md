# Rexus
Work management app — **v2.2.2** (Netlify: static `public/` + Netlify Functions + Netlify Database).

- Release notes: [`REXUS-v2.2.2-RELEASE-NOTES.md`](REXUS-v2.2.2-RELEASE-NOTES.md) (previous: [v2.2.1](REXUS-v2.2.1-RELEASE-NOTES.md))
- Docs: [`docs/v2.2.2/`](docs/v2.2.2/README.md) (requirement traceability, deploy, HRM permission matrix, tests) and [`docs/v2.2.1/`](docs/v2.2.1/README.md) (capacity, approvals, finance, WBS)
- Tests: `tests/v2.2.1/backend` (backend + test server), `tests/v2.2.1/e2e`, `tests/v2.2.2/e2e` (see `docs/v2.2.2/04-TEST-REPORT.md`)

Deploy: connect this repo to Netlify; `netlify.toml` sets `publish = "public"` and `functions = "netlify/functions"`. Migrations in `netlify/database/migrations/` are applied by Netlify Database on deploy. Back up the database before deploying (see `docs/v2.2.1/01-DEPLOYMENT-AND-MIGRATION.md`).
