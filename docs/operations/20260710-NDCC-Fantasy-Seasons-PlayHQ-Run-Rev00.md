# NDCC Fantasy Multi-Season + PlayHQ Import — Operations Runbook (Rev00, 2026-07-10)

This runbook covers the multi-season Fantasy architecture, the PlayHQ importer,
the 2025/2026 historical import, season rollover, sync scheduling, and rollback.

## 1. Season architecture

- `fantasy_seasons` — one row per season (`slug`, `status` draft/upcoming/active/completed/archived, `is_current` [at most one, partial unique index], `is_public`, `allow_team_building`, `registration_open`, `team_selection_open`, `playhq_season_id`, `last_playhq_sync_at`).
- `fantasy_players` — durable person identity (PlayHQ player id primary). Role check now includes `UNASSIGNED`.
- `fantasy_season_players` — per-season membership: role, team/grade label, `active`, `selectable`, provenance (`source`, `first/last_seen_at`), `carried_from_season_player_id`. New imported players are `UNASSIGNED` + not selectable until reviewed in `/admin/fantasy/players`.
- `season_id` (NOT NULL, backfilled) on: `fantasy_settings` (one row per season), `fantasy_rounds` (`unique(season_id, round_number)`; inserts default to the current season via trigger), `fantasy_player_prices` (one base price per player/season + per-round prices), `fantasy_import_batches`, `fantasy_match_stats` (`unique(season_id, playhq_game_id, player_id)`), `fantasy_squads` (`unique(manager_id, season_id, round_id)` + single NULL-round squad per manager/season), `fantasy_transfers`, `fantasy_chips` (`unique(manager_id, season_id, chip_type)`), `fantasy_leagues` (`unique(season_id, code)`), `fantasy_manager_round_scores` (`unique(manager_id, season_id, round_id)`).
- Cross-season integrity: `fantasy_check_round_season()` trigger rejects new/edited rows whose `round_id` belongs to another season.
- `fantasy_season_grade_sources` — PlayHQ grades enabled for import per season (`unique(season_id, playhq_grade_id)`, optional `team_filter` regex).
- `fantasy_sync_jobs` — resumable import jobs (queue, cursor, counts, review items, error summary).

### Seeded seasons (production, 2026-07-10)

| Slug | Status | Public | Contents |
| --- | --- | --- | --- |
| `legacy-unverified` | archived | no | The pre-existing 134-player CSV dataset (players' memberships, published CSV match stats, both import batches). Provenance is manual CSV, so it was **not** relabelled as 2025/26. |
| `2025-26` | completed | yes | Empty; populated by the PlayHQ import below. |
| `2026-27` | upcoming, **current** | yes | The 134 active players (selectable), their prices, Rounds 1–2 (Oct 2026 deadlines), settings. Live squad building continues unchanged. |

## 2. PlayHQ discovery and grade mapping (CMS)

`/admin/fantasy/seasons` (admin or `fantasy_manager` role):

1. **Discover PlayHQ seasons** → pick the returned season (e.g. "2025/26") to prefill the add-season form, or enter details manually.
2. Create the season (slug, dates, status, visibility). A per-season settings row is created automatically.
3. On an existing season: **Map PlayHQ grades** — lists live grades for the linked `playhq_season_id`; tick the NDCC grades to import. Mappings are stored in `fantasy_season_grade_sources` (not in `PLAYHQ_DEFAULT_GRADE_IDS`, which stays fixtures-only).
4. **Set as current** switches the single current season. Toggles: Public, Team building (historical seasons), Registration open, Team selection open.

## 3. 2025/2026 import workflow

Prerequisite: the deployed environment has `PLAYHQ_API_KEY` etc. (the importer only runs where the key exists — never exposed client-side).

1. In `/admin/fantasy/seasons`, link season `2025-26` to the discovered PlayHQ 2025/26 season id (PATCH via the UI) and enable its NDCC grades.
2. **Start PlayHQ import** — creates a draft import batch + sync job: enabled grades → raw fixtures → completed games involving Newcomb (per-grade `team_filter` overrides the default `/newcomb/i`) → exact round mapping from PlayHQ round metadata (games without exact metadata become `ambiguous_round` review items; no guessed rounds).
3. **Continue import** until the job completes — each click processes a bounded batch (default 10 games) with 429/5xx retry + backoff; progress persists in `fantasy_sync_jobs` (safe across Vercel timeouts). **Retry failures** requeues failed games.
4. Review the job panel: created / matched / updated / skipped / warnings / failed counts, review items (`duplicate_name`, `name_match_review`, `ambiguous_round`, `reconciliation`), errors. Resolve player links in `/admin/fantasy/players` (assign roles to `UNASSIGNED` players to make them selectable), then re-run sync — reruns are idempotent (`source_hash` short-circuits unchanged rows; unique `(season_id, playhq_game_id, player_id)` blocks duplicates).
5. Publish the batch in `/admin/fantasy/imports` (existing review → publish flow). Published stats drive `/fantasy/leaderboard?season=2025-26` and player totals. Changed PlayHQ summaries for published rows are never updated silently — they appear as `reconciliation` review items; re-publish through the batch review flow after checking.
6. Manager competition points for 2025/26 are **not** retro-awarded; `allow_team_building` on 2025/26 stays off unless deliberately enabled.

## 4. Current-season selection & public UX

- Every public fantasy page (`/fantasy`, players, squad/team, transfers, leagues, leaderboard, manager-leaderboard, rules) shares a season dropdown; the choice is carried in `?season=<slug>` (shareable). Default = current season. Status chip shows Draft/Upcoming/Active/Historical/Archived.
- All public APIs are season-scoped (`?season=` or `season` in POST bodies). No cross-season mixing: players, prices, rounds, stats, squads, transfers, chips, leagues, and leaderboards are filtered by the resolved season. Non-public seasons never resolve for public requests.
- Mutable fantasy routes remain `force-dynamic`/no-store.

## 5. Role and price review

- Imported players: role `UNASSIGNED`, `selectable=false`. Assign roles in `/admin/fantasy/players` (role save also updates the current season's membership and selectability; prices upsert one base price per player/season).
- Verified prior-season roles/prices are preserved on PlayHQ-id matches. No pricing formula was invented; bulk price generation remains a manual/CSV admin task.

## 6. Season rollover (carry squad)

- Manager: `/fantasy/squad` → "Carry squad to a new season" → choose source season → **Preview** (carried, unavailable, role changes, price changes, remaining budget, warnings) → **Create draft**. Writes only a target-season draft (`carried_from_squad_id` audit link); the source squad is never modified; re-running overwrites the same draft (idempotent). Submitted target squads are never overwritten (409).
- Target roles/prices/budget come from the target season. Missing/inactive/unassigned/non-selectable players are excluded with warnings; bench order is resequenced; missing captain/vice-captain is flagged.
- Admins never submit squads on behalf of managers.

## 7. Cron and manual sync

- Manual: **Start / Continue / Retry failures** buttons in `/admin/fantasy/seasons` (always available).
- Cron: `vercel.json` schedules `GET /api/cron/playhq-fantasy-sync` daily at **16:30 UTC** (02:30 AEST / 03:30 AEDT — Australia/Melbourne shifts with daylight saving). The route requires `Authorization: Bearer ${CRON_SECRET}` (Vercel adds it automatically when `CRON_SECRET` is set) and exits early unless `PLAYHQ_FANTASY_SYNC_ENABLED=true`. It resumes one bounded batch (`PLAYHQ_FANTASY_SYNC_BATCH_SIZE`, default 10) of the newest unfinished job for the current season. Vercel Hobby plans allow daily crons; verify the plan before relying on it.

## 8. Environment variables

Existing (unchanged, server-only): `PLAYHQ_API_BASE_URL`, `PLAYHQ_API_KEY`, `PLAYHQ_ORGANISATION_ID`, `PLAYHQ_DEFAULT_SEASON_ID`, `PLAYHQ_DEFAULT_GRADE_IDS` (fixtures defaults — still used by `/fixtures`), `PLAYHQ_CACHE_REVALIDATE_SECONDS`, Supabase keys.

New (server-only; set in Vercel → Project → Settings → Environment Variables for Preview + Production):

- `CRON_SECRET` — long random string (e.g. `openssl rand -hex 32`); do not print or commit it.
- `PLAYHQ_FANTASY_SYNC_ENABLED` — `true` to arm the cron (leave `false` until the first manual import is verified).
- `PLAYHQ_FANTASY_SYNC_BATCH_SIZE` — optional, default `10`.

Redeploy after changing env vars. Never use `NEXT_PUBLIC_` for any of these.

## 9. Supabase migrations and RLS

Applied to production (also in `supabase/migrations/`):

- `20260710090000_fantasy_multi_season.sql` — seasons, season players, season_id backfill, season-aware uniqueness, provenance columns, grade sources, sync jobs, FK/season indexes, `fantasy_manager` committee role, RLS policies, `set_fantasy_updated_at` search_path pin.
- `20260710091000_fantasy_round_season_default.sql` — default new rounds to the current season.
- `20260710092000_fantasy_squads_upsert_index.sql` — full unique index for squad upserts.

RLS model: server routes use the service role (bypass); anon/authenticated clients can only read public-season data (seasons, season players, players, rounds, prices, enabled scoring rules) and published stats in public seasons. Admin/import tables (`fantasy_import_batches`, `fantasy_season_grade_sources`, `fantasy_sync_jobs`) have explicit deny policies. Manager-owned rows keep their original owner policies (note: legacy owner policies on squads/transfers/chips predate season columns and remain valid).

## 10. Import recovery

- Job stuck `running` (e.g. function timeout mid-batch): press **Continue import** — the cursor persists after each batch, so at most one batch repeats, and `source_hash`/unique indexes make repeats no-ops.
- Failed games: **Retry failures** requeues them; persistent failures stay in `error_summary` with messages.
- Bad batch: reject it in `/admin/fantasy/imports` (draft batches never affect public data). Start a fresh sync for a clean run — unchanged rows are skipped, so a re-import converges.

## 11. Deployment

1. Merge PR → Vercel builds preview; verify preview (footer link, season dropdowns, `/fantasy` flows, admin seasons page).
2. Set the new env vars (section 8) on Preview + Production; redeploy.
3. Run the 2025/26 import from the deployed CMS (section 3) and verify counts against PlayHQ before publishing.
4. Re-run Supabase advisors after any further DDL.

## 12. Rollback

Application: revert the merge commit (footer + UI + APIs return to previous behaviour; the schema is backward-compatible with the old code paths except that new rounds default their season via trigger).

Database (only if fantasy multi-season must be fully unwound; all changes were additive — no data was deleted or overwritten):

```sql
-- 1. Drop triggers/functions
DROP TRIGGER IF EXISTS trg_fantasy_rounds_default_season ON fantasy_rounds;
DROP FUNCTION IF EXISTS fantasy_default_round_season();
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['fantasy_squads','fantasy_transfers','fantasy_chips','fantasy_manager_round_scores','fantasy_match_stats'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_round_season ON %I', t, t);
  END LOOP; END $$;
DROP FUNCTION IF EXISTS fantasy_check_round_season();
-- 2. Restore original uniqueness
ALTER TABLE fantasy_rounds ADD CONSTRAINT fantasy_rounds_round_number_key UNIQUE (round_number);
ALTER TABLE fantasy_chips ADD CONSTRAINT fantasy_chips_manager_id_chip_type_key UNIQUE (manager_id, chip_type);
ALTER TABLE fantasy_leagues ADD CONSTRAINT fantasy_leagues_code_key UNIQUE (code);
ALTER TABLE fantasy_manager_round_scores ADD CONSTRAINT fantasy_manager_round_scores_manager_id_round_id_key UNIQUE (manager_id, round_id);
ALTER TABLE fantasy_squads ADD CONSTRAINT fantasy_squads_manager_id_round_id_key UNIQUE (manager_id, round_id);
CREATE UNIQUE INDEX IF NOT EXISTS fantasy_squads_manager_null_round_uniq ON fantasy_squads (manager_id) WHERE round_id IS NULL;
-- 3. Drop new tables and columns (removes season data only)
DROP TABLE IF EXISTS fantasy_sync_jobs, fantasy_season_grade_sources, fantasy_season_players;
ALTER TABLE fantasy_settings DROP COLUMN IF EXISTS season_id;
ALTER TABLE fantasy_rounds DROP COLUMN IF EXISTS season_id;
ALTER TABLE fantasy_player_prices DROP COLUMN IF EXISTS season_id;
ALTER TABLE fantasy_import_batches DROP COLUMN IF EXISTS season_id, DROP COLUMN IF EXISTS summary, DROP COLUMN IF EXISTS source_hash;
ALTER TABLE fantasy_match_stats DROP COLUMN IF EXISTS season_id, DROP COLUMN IF EXISTS playhq_game_id, DROP COLUMN IF EXISTS playhq_fixture_id, DROP COLUMN IF EXISTS playhq_round_number, DROP COLUMN IF EXISTS playhq_round_name, DROP COLUMN IF EXISTS source_hash, DROP COLUMN IF EXISTS source_updated_at;
ALTER TABLE fantasy_squads DROP COLUMN IF EXISTS season_id, DROP COLUMN IF EXISTS carried_from_squad_id;
ALTER TABLE fantasy_transfers DROP COLUMN IF EXISTS season_id;
ALTER TABLE fantasy_chips DROP COLUMN IF EXISTS season_id;
ALTER TABLE fantasy_leagues DROP COLUMN IF EXISTS season_id;
ALTER TABLE fantasy_manager_round_scores DROP COLUMN IF EXISTS season_id;
DROP TABLE IF EXISTS fantasy_seasons;
-- 4. Restore original role checks
ALTER TABLE fantasy_players DROP CONSTRAINT IF EXISTS fantasy_players_role_check;
ALTER TABLE fantasy_players ADD CONSTRAINT fantasy_players_role_check CHECK (role IN ('WK','BAT','AR','BOWL'));
ALTER TABLE committee_users DROP CONSTRAINT IF EXISTS committee_users_role_check;
ALTER TABLE committee_users ADD CONSTRAINT committee_users_role_check CHECK (role IN ('admin','president','secretary','committee'));
```

(Only step 3 loses data — the season scaffolding itself. Original fantasy rows are preserved throughout. If `UNASSIGNED` players or `fantasy_manager` users were created, reassign them before restoring the original checks.)

## 13. Known limitations

- The live 2025/26 PlayHQ import must be executed from a deployed environment holding `PLAYHQ_API_KEY` (this change ships the tooling; the import run itself is an operator action — see section 3).
- Game-summary parsing is defensive against PlayHQ shape variants but should be verified against one real game on first run (review counts before publishing).
- Manager competition scoring for historical seasons stays off by design (no retrospective points without an explicit admin decision).
- Vercel env vars and cron activation are dashboard actions; the repo carries the config and this runbook.
