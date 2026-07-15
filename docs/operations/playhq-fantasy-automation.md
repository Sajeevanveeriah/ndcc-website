# PlayHQ fantasy automation — operations runbook

## What runs

`/api/cron/playhq-fantasy-sync` (daily, 16:30 UTC, `CRON_SECRET`-guarded) calls
`runFantasyOrchestrator()` in `lib/playhq/fantasy-orchestrator.ts`. Each run,
for every eligible fantasy season (`is_public`, not archived,
`auto_sync_enabled = true`; `legacy-unverified` is permanently excluded):

1. **Discover season** — matches PlayHQ organisation seasons to the local
   season by normalised season years (`2025/26`, `2025-26`, `2025 2026`…),
   with start-date validation. Ambiguity or a conflicting stored id becomes a
   blocking exception (`fantasy_seasons.sync_exception`) — never a guess.
2. **Link season** — persists `playhq_season_id`, `playhq_linked_at` and the
   discovery evidence in `playhq_discovery`.
3. **Discover + map grades** — finds grades containing NDCC teams (aliases in
   `lib/playhq/season-match.ts`) and inserts missing
   `fantasy_season_grade_sources` rows. Admin-disabled rows are never
   re-enabled; existing mappings are never modified.
4. **Create or resume the job** — bounded, resumable `fantasy_sync_jobs`
   batches (existing machinery), run under a database lease
   (`acquire_fantasy_sync_lock`) so concurrent invocations cannot overlap.
   Abandoned `running` jobs (>15 min stale) are recovered. Current seasons
   re-sync at most every 12 h; completed seasons stop once they have a
   published PlayHQ batch (this is what backfills 2025/26 automatically).
5. **Validate + auto-publish** — a finished job publishes its draft batch only
   when: zero failed games, zero review items, all discovered games processed,
   all stat fields valid, and the batch is not empty on a non-empty discovery
   (empty-fetch protection). Anything else keeps the last known good public
   data and records a blocking exception.
6. **Health + alerts** — every stage is recorded in `fantasy_sync_runs`;
   after 3 consecutive failures for a season an email goes to the contact
   recipients (24 h dedupe).

## Admin controls

`/admin/fantasy/seasons` → “Automatic PlayHQ sync” panel: per-season link
state, grade mappings, latest job progress/counters, blocking exceptions,
recent automation activity, **Refresh health** and **Run automatic sync now**
(same code path as the cron). The pre-existing manual Start/Continue/Retry
controls remain for exceptional intervention.

## Activation (Vercel dashboard)

Required server-only env vars (values never exposed to the browser):
`PLAYHQ_API_KEY`, `PLAYHQ_ORGANISATION_ID`, `PLAYHQ_TENANT`, `CRON_SECRET`,
and `PLAYHQ_FANTASY_SYNC_ENABLED=true` (the safety switch — leave `false` to
keep automation dormant). Optional: `PLAYHQ_FANTASY_SYNC_BATCH_SIZE`.

## Rollback

- Code: revert the PR; the cron falls back to the previous resume-only route.
- To pause automation without a deploy: set
  `PLAYHQ_FANTASY_SYNC_ENABLED=false` (cron) — the CMS button remains
  available; or set `fantasy_seasons.auto_sync_enabled = false` per season.
- DB rollback SQL is documented at the top of
  `supabase/migrations/20260714104000_fantasy_sync_automation.sql`. No
  existing data is modified by the migration (only additive columns/tables
  and one flag update on `legacy-unverified`).
