# NDCC production update — theme, sponsors, publications, modernisation, PlayHQ automation

Branch: `claude/ndcc-website-production-hz3guo`

## Baseline findings (recorded before any change)

- Working tree clean at `07a0c3a` (merge of PR #133).
- Supabase project `alduwuipmmnzorcgkcli` (NDCC Website, ACTIVE_HEALTHY) verified read-only:
  - `fantasy_seasons` — `legacy-unverified` (archived, non-public): 134 season players, 134 match stats, 0 grade sources, 0 sync jobs.
  - `2025-26` (public, completed): `playhq_season_id` NULL, 0 players / 0 stats / 0 grades / 0 jobs.
  - `2026-27` (public, upcoming, current): `playhq_season_id` NULL, 134 players, 0 stats / 0 grades / 0 jobs.
- Dark mode = `next-themes` class strategy + broad compatibility layer in `app/globals.css` (`:where(.dark) .bg-white { … }` etc.).
- Crons: `/api/cron/keep-alive` daily 05:00 UTC, `/api/cron/playhq-fantasy-sync` daily 16:30 UTC.
- Sponsors table has no presentation metadata columns yet.
- `news` table exists; no publications table.

## Status

All plan items implemented; migrations applied to production (additive); full static test suite green; screenshots captured for both themes at 375/768/1440. Live PlayHQ import awaits `PLAYHQ_FANTASY_SYNC_ENABLED=true` in Vercel (credentials are server-side only and not readable from this environment).

## Plan

1. **Theme (Phase 2)** — add semantic CSS-variable tokens (surface/text/border/action ramps) to `globals.css` + Tailwind mapping; retune the dark compatibility layer to a coherent charcoal/deep-navy/maroon palette; fix component classes (`.card`, `.btn-*`, `.form-input`, heroes, bands) in both themes; keep toggle + system default.
2. **Sponsors (Phase 3)** — additive migration `sponsors.logo_surface_mode/logo_padding/logo_object_position` (default `auto`); rework shared LogoChip into a themed outer card + deterministic inner logo plate; preserve Bennett Racing / MBR handling; regression tests.
3. **Publications (Phase 4)** — additive migration `public.publications` (monthly_newsletter | weekly_newsletter | weekly_match_report) with RLS (public read published only); admin CRUD at `/admin/publications` following news/admin conventions; public `/publications`, `/publications/[slug]`, `/newsletters`, `/match-reports`; homepage latest-publications section (hidden when empty, force-dynamic); sitemap + smoke tests; PDF attachment via GitHub-backed upload with MIME/size/path validation.
4. **Modernisation (Phase 5)** — refine shared primitives only (nav, hero, cards, buttons, footer, reveal), restrained and accessible, no new stock imagery.
5. **PlayHQ automation (Phase 6)** — server-only orchestrator: season discovery (org seasons endpoint, normalised name + date validation) → persist `playhq_season_id` → grade discovery via NDCC team matching → persist `fantasy_season_grade_sources` → create/resume bounded sync jobs under an advisory lock → validate → auto-publish safe batches → recalc totals → heartbeat/health; 2025/26 historical bootstrap on first run; admin sync-health panel + safe retry; alert email on repeated failure.
6. **Tests (Phase 9)** — run full existing suite; add tests for tokens, sponsor surface modes, publications schema/permissions/routes, orchestrator states (discovery, matching, locking, idempotency, empty-fetch protection, auto-publish gates).
7. **Release (Phase 10)** — small commits, PR with verification evidence and rollback SQL.

## Rollback

- Code: revert the PR (all changes are in one branch; no destructive migration).
- DB: each migration documents rollback SQL (drop new table/columns only — no existing data touched).
