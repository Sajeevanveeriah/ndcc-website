# June 16 CMS Restore Completion Rev00

## Root cause

PR #93 added restore tooling, but no production restore could run because the required June 16 evidence JSON file was missing from the repository.

## Evidence source used

Created `data/recovery/cms-restore-20260616.json` from repository-backed evidence only:

- `supabase/seed.sql`
- `supabase/migrations/20260401_social_memberships.sql`
- `supabase/migrations/20260406_season_appointments.sql`
- `supabase/migrations/20260408_admin_cms_expansion.sql`
- `supabase/migrations/20260510_club_settings.sql`

`NDCC_Website_16062026.zip` or an extracted June 16 CMS export was not present in this working tree. Missing sections are documented in `docs/fixes/June16_CMS_Restore_Missing_Evidence_Rev00.md`.

## Records prepared

- Sponsors: 5 evidence records, all with manual review notes for missing `logo_url` evidence.
- Content blocks: 3 evidence records.
- Page link cards: 1 evidence record.
- Club settings: 1 evidence record.
- Season appointments: 2 evidence records.
- Social membership plans: 1 evidence record.
- Social membership addons: 3 evidence records.

## Diagnostics before/after

Diagnostics could not connect because this environment does not contain production Supabase credentials. Required environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The captured output is in `docs/fixes/June16_CMS_Diagnostics_Output_Rev00.md`.

## Dry-run/apply output

Dry-run could not connect for the same missing Supabase environment variables. Captured output is in `docs/fixes/June16_CMS_Restore_Dry_Run_Output_Rev00.md`.

Apply was not executed and was not faked.

## Production execution command

Run this from the repository root in an environment that has production Supabase access:

```bash
NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
node scripts/restore/june16-cms-restore.mjs \
  --evidence=data/recovery/cms-restore-20260616.json \
  --apply=true
```

## Pages manually checked

Manual route checks were not executed because the production restore could not run in this environment. `npm run build` completed successfully and confirmed routes compile.

Routes to verify after production apply:

- `/`
- `/about`
- `/fixtures`
- `/sponsors`
- `/news`
- `/events`
- `/gallery`
- `/join`
- `/contact`
- `/volunteer`
- `/admin/login`
- `/missing-test-route`

## Build output

`npm run build` completed successfully after the tooling/evidence changes.

## Backup location

The restore script creates `backups/june16-cms-restore-<timestamp>/` before inserting or updating rows. No backup directory was created here because credentials were unavailable and the script stopped before connecting.

## Rollback path

Use the generated `backups/june16-cms-restore-<timestamp>/` JSON files to restore pre-apply rows if production apply is run. If only these repository changes need rollback, revert this commit.

## Explicit confirmations

- No deletes added or executed.
- No truncates added or executed.
- No seed reset added or executed.
- Email/contact code was not touched.
- Fantasy code was not touched.
