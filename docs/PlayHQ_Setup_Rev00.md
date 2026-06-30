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
