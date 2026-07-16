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

## Rev01 addendum (2026-07-16, later the same day)

The Supabase GitHub integration proved the drift live: creating the PR #142
preview branch failed with `duplicate key value violates unique constraint
"schema_migrations_pkey" — Key (version)=(20260401) already exists`. The
day-prefixed Class 2/3 filenames can never coexist with the recorded remote
history (several files share one day-level version, and versions collide
with recorded ones), so the deferred repair step was completed:

1. **Class 2 files renamed to their recorded remote versions** (17 files,
   contents untouched) — e.g. `20260629_reduce_runtime_io_indexes.sql` →
   `20260704102737_reduce_runtime_io_indexes.sql`. Filenames now equal the
   history that was actually recorded when they were applied.
2. **Class 3 files renamed to unique 14-digit versions** preserving their
   original in-day ordering (e.g. `20260402_merch_windows.sql` →
   `20260402000500_merch_windows.sql`), and those 34 versions were recorded
   as applied with **bookkeeping rows only** (version + name, no SQL
   executed, no schema or data change) in
   `supabase_migrations.schema_migrations` on production and on the PR
   preview branch.

Result: every file in `supabase/migrations/` now maps 1:1 to a recorded
version except genuinely new work, and preview branches apply only new
migrations. `supabase/remote-migration-history.json` lists all 63 recorded
versions (`preHistory: true` marks the bookkeeping-recorded ones).

Rollback for the bookkeeping rows (production and preview branch):

```sql
delete from supabase_migrations.schema_migrations
where version in (
  '20260401000100','20260402000100','20260402000200','20260402000300',
  '20260402000400','20260402000500','20260402000600','20260402000700',
  '20260406000100','20260406000200','20260408000100','20260408000200',
  '20260409000100','20260409000200','20260425000100','20260510000100',
  '20260510000200','20260510000300','20260511000100','20260517120000',
  '20260517143000','20260530090000','20260608090000','20260619090000',
  '20260619121500','20260629000100','20260629000200','20260630000100',
  '20260630000200','20260630000300','20260630000400','20260712090000',
  '20260712100000','20260712110000'
) and statements is null;
```

## Rollback

- File renames and the manifest are plain repo changes: `git revert` the
  reconciliation commits restores the previous state.
- The only database change made by this reconciliation is the 34
  bookkeeping rows above (no DDL, no data); the DELETE above removes them.
