# PlayHQ setup Rev00

## Vercel environment variables
Add these as server-side Vercel environment variables only:

```text
PLAYHQ_API_BASE_URL=https://api.caprod.playhq.com
PLAYHQ_API_KEY=replace_with_playhq_public_api_key
PLAYHQ_ORGANISATION_ID=replace_with_playhq_organisation_id
PLAYHQ_DEFAULT_SEASON_ID=
PLAYHQ_DEFAULT_GRADE_IDS=
PLAYHQ_CACHE_REVALIDATE_SECONDS=3600
```

Do not use `NEXT_PUBLIC_` for the PlayHQ key. Do not paste the key into source, logs, PRs, issues or screenshots.

## Expected PlayHQ flow
Organisation -> Seasons -> Teams/Grades -> Fixtures/Ladders -> Game summary.

Use only PlayHQ Public API `GET` endpoints that do not require an authorisation token. Cricket Player Stats by Grade V1 is not available for cricket and must not be used for NDCC cricket stats.

## Supabase migration note
Apply the Supabase repair/index migrations only after the SQL Editor can run `select now();`. If `select now();` times out, wait for Disk I/O budget recovery or pause/resume/upgrade compute before applying more SQL.

## Diagnostics
Use `/api/admin/playhq/diagnostics` while signed in as a committee admin user. The route returns configuration booleans, safe base URL, organisation ID last four characters, counts and errors. It never returns the PlayHQ API key.


## Deployment note
Redeploy Vercel after changing PlayHQ environment variables. Do not use `NEXT_PUBLIC_` for any PlayHQ secret.

## Fantasy season imports (2026-07-10 update)

Fantasy Cricket now imports player match statistics from the official PlayHQ
Public API per fantasy season:

- Season/grade sources are managed in `/admin/fantasy/seasons` and stored in
  Supabase (`fantasy_seasons.playhq_season_id`, `fantasy_season_grade_sources`).
  `PLAYHQ_DEFAULT_SEASON_ID` / `PLAYHQ_DEFAULT_GRADE_IDS` remain fixtures-only
  defaults and are not used as the fantasy mapping.
- Import flow: enabled grades -> `GET /v2/cricket/grades/{id}/fixture` (raw,
  for exact round metadata) -> completed NDCC games -> `GET
  /v2/cricket/games/{id}/summary` -> per-player stats staged into a draft
  import batch for admin review and publish. Resumable jobs live in
  `fantasy_sync_jobs`; reruns are idempotent.
- Scheduled sync: `GET /api/cron/playhq-fantasy-sync` guarded by
  `Authorization: Bearer ${CRON_SECRET}`; enabled with
  `PLAYHQ_FANTASY_SYNC_ENABLED=true` (batch size
  `PLAYHQ_FANTASY_SYNC_BATCH_SIZE`, default 10).
- If a required player-level field is not exposed by the official API, the
  validated CSV importer remains the documented fallback — no scraping.

Runbook: `docs/operations/20260710-NDCC-Fantasy-Seasons-PlayHQ-Run-Rev00.md`.
