# One_Shot_Completion_Report_Rev00

Date: 2026-06-19.

## Status

This PR adds code-level closeout hardening and operational runbooks. Production Supabase credentials and temporary passwords were not present in the local environment, so live production provisioning, live sponsor DB upsert, and live fantasy player population were not executed or claimed as fixed.

## Operational commands

- Diagnostics: `npm run admin:provision-users -- --diagnostics`
- Provision Saj only: `NDCC_SAJ_TEMP_PASSWORD=... npm run admin:provision-users -- --only=saj --execute`
- Verify login: `AUTH_TEST_BASE_URL=https://www.ndcc.com.au AUTH_TEST_EMAIL=sajeevanveeriah@gmail.com AUTH_TEST_PASSWORD=... npm run test:admin-login`
- Sponsor dry run: `npm run production:upsert-sponsors`
- Sponsor execute: `npm run production:upsert-sponsors -- --execute`
- Closeout dry run: `npm run production:closeout`

## Rollback path

Revert the commit `feat: close all NDCC production auth sponsor CMS and fantasy gaps`. For production data writes made by scripts, restore from the JSON backup written under `tmp/production-backups` before each write.

## Acceptance table

| Area | Status | Evidence |
| --- | --- | --- |
| Admin error classification | Pass locally | Login route now separates 400/401/429/503 and uses no-store/Vary headers. |
| Targeted admin provisioning | Pass locally | Script supports `--only`, `--all`, dry-run, diagnostics, and env-only passwords. |
| Production Saj provisioning | Not run | Requires production Supabase credentials and `NDCC_SAJ_TEMP_PASSWORD`. |
| Live login/session | Not run | Requires secure test credentials. |
| Sponsor inventory | Partial | Data file contains all 15 required names; several entries are explicitly marked for production verification. |
| Sponsor production upsert | Not run | Requires production Supabase service role key. |
| Fantasy ingestion path | Partial | PlayHQ/CSV modules and guarded admin endpoints exist; no player data was invented or populated. |
| Build/lint | Pending local validation | See final response for commands run in this environment. |
