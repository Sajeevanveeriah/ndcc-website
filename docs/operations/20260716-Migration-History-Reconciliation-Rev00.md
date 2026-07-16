# Supabase Migration History Reconciliation — Rev00 (2026-07-16)

Project: NDCC Website — Supabase ref `alduwuipmmnzorcgkcli` (ap-southeast-1).

## The failure being resolved

`supabase migration list` / `supabase db push` report:

> Remote migration versions not found in local migrations directory.

The remote history table (`supabase_migrations.schema_migrations`) holds 29
versions. Before this change, only one of them (`20260401`) had a matching
filename in `supabase/migrations/`. The drift has three distinct causes, all
explained below. **No remote history rows were modified, deleted or
"repaired" as part of this reconciliation** — the resolution is additive
files plus documentation plus a CI check.

## Class 1 — remote-only versions (11): applied directly to production

These were applied through the Supabase MCP/dashboard during incident
recovery sessions (June 19, June 29) and one linter-hygiene fix (July 15)
without a local file ever being committed. The applied SQL is stored in
`schema_migrations.statements`, so each version now has a **history-alignment
copy** in `supabase/migrations/` containing that exact SQL with a header
explaining its origin:

| Remote version | Recorded name | New local file |
| --- | --- | --- |
| 20260619024827 | fix_profiles_rls_recursion | `20260619024827_fix_profiles_rls_recursion.sql` |
| 20260619030204 | sponsor_schema_and_duplicate_guard | `20260619030204_sponsor_schema_and_duplicate_guard.sql` |
| 20260619033824 | reload_postgrest_after_sponsor_schema | `20260619033824_reload_postgrest_after_sponsor_schema.sql` |
| 20260629045334 | lockdown_committee_auth_rpc | `20260629045334_lockdown_committee_auth_rpc.sql` |
| 20260629045440 | public_content_read_policies | `20260629045440_public_content_read_policies.sql` |
| 20260629045545 | fix_sponsor_logo_paths | `20260629045545_fix_sponsor_logo_paths.sql` |
| 20260629050027 | retire_bootstrap_first_admin_rpc | `20260629050027_retire_bootstrap_first_admin_rpc.sql` |
| 20260629050200 | 20260629_lockdown_committee_auth_rpc | `20260629050200_lockdown_committee_auth_rpc_v2.sql` |
| 20260629050508 | 20260629_public_content_read_policies_v2 | `20260629050508_public_content_read_policies_v2.sql` |
| 20260629050722 | 20260629_lockdown_rls_auto_enable_rpc | `20260629050722_lockdown_rls_auto_enable_rpc.sql` |
| 20260715000825 | publications_updated_at_search_path | `20260715000825_publications_updated_at_search_path.sql` |

Notes:
- 20260629050200 and 20260629050508 substantially duplicate 20260629045334
  and 20260629045440 (same recovery session, run twice under different
  names). They are recorded as applied, so both keep their own alignment
  files; the duplicate public-read policies they created were later removed
  by `20260630_cleanup_duplicate_public_read_policies.sql`.
- The Supabase CLI matches on the numeric version prefix, so the alignment
  filenames satisfy `supabase migration list` even where the recorded name
  contained a second date prefix.

## Class 2 — same migration, different version number (17)

These local files were applied to production through the Supabase MCP
`apply_migration` tool, which stamps its own execution timestamp as the
version instead of the filename's version. The content is applied; only the
version identifiers differ. The mapping is recorded in
`supabase/remote-migration-history.json` (`localFile` fields):

| Remote version | Local file (as committed) |
| --- | --- |
| 20260704102737 | 20260629_reduce_runtime_io_indexes.sql |
| 20260704102811 | 20260630_reduce_public_query_io.sql |
| 20260704102836 | 20260704_consolidate_committee_auth_canonical.sql |
| 20260706120554 | 20260706100100_footer_nav_link_hygiene.sql |
| 20260706120559 | 20260706100200_admin_session_activity.sql |
| 20260706205638 | 20260706100300_apparel_payment_readiness.sql |
| 20260706205650 | 20260706100400_cms_admin_expansion.sql |
| 20260706205654 | 20260706100500_fantasy_hardening.sql |
| 20260707073746 | 20260707093000_fantasy_import_provenance.sql |
| 20260708075204 | 20260708090000_calendar_events.sql |
| 20260710042257 | 20260710090000_fantasy_multi_season.sql |
| 20260710043144 | 20260710091000_fantasy_round_season_default.sql |
| 20260710043546 | 20260710092000_fantasy_squads_upsert_index.sql |
| 20260715000704 | 20260714100000_sponsor_logo_presentation.sql |
| 20260715000733 | 20260714102000_publications.sql |
| 20260715000755 | 20260714104000_fantasy_sync_automation.sql |
| 20260715101111 | 20260715110000_grade_sources_playhq_season.sql |

The already-applied local files are **not renamed and not edited** (editing
applied migrations is prohibited). The JSON manifest carries the mapping so
tooling can verify both sides.

## Class 3 — local-only files, applied before history tracking (34)

The remaining local files (the April–June CMS/schema foundation plus the
June 30 repair set, July 12 fantasy-reconciliation and club-season files)
were executed against production via the SQL editor/service role before any
history recording was in place. Their objects verifiably exist in production
(e.g. `orders`, `apparel_products`, `merch_order_windows`,
`fantasy_historical_reconciliation_*`, `club_seasons` are all live tables),
but `schema_migrations` has no rows for them. They are enumerated under
`localOnlyApplied` in `supabase/remote-migration-history.json`.

## Going-forward rules (enforced by `npm run check:migrations`)

1. New migrations use a **full 14-digit timestamp** version strictly newer
   than the latest recorded remote version, and are applied in a way that
   records exactly that version (Supabase CLI `db push`, or MCP
   `apply_migration` with the file's own version stamped in the name).
2. When a migration is applied to production, its version is added to
   `supabase/remote-migration-history.json` in the same PR.
3. Never edit an applied migration; corrections ship as new migrations.
4. `scripts/check-migration-history.mjs` runs in CI and fails on any file
   that is neither recorded remote history, documented pre-history, nor
   correctly-versioned new work.

## Optional operator step (NOT executed — requires explicit approval)

To make the Supabase CLI fully quiet for `db push` workflows, the Class 2/3
versions can be recorded as applied without touching the schema:

```
supabase migration repair --status applied <version> [...]
```

for each filename version in Class 2 (the file-side versions, e.g.
`20260629`, `20260630`, `20260704`, `20260706100100`, …) and each Class 3
file version. This only inserts rows into
`supabase_migrations.schema_migrations`; it runs no DDL. It is deliberately
left as a documented manual step because it writes to production
bookkeeping. The application deploy pipeline does not run `db push`, so
nothing breaks while this step remains pending.

## Rollback

- Alignment files and the manifest are plain repo files: `git revert` the
  reconciliation commit restores the previous state.
- No database change was made by this reconciliation, so there is nothing to
  roll back on the Supabase side.
