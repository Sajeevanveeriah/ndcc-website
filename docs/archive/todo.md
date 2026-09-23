# NDCC production repair — PlayHQ activation, sponsor plates, semantic theme, modernisation

Branch: `saj/wizardly-feynman-4sq2ew` (based on `main` @ `77b9cf5`)

## Re-confirmed baseline (2026-07-15, before any change)

- `main` HEAD = `77b9cf5`; production deployment `dpl_5gXUGAm9oUjuLctF6ykEzuAMmjva` builds exactly that SHA — repository and production were in sync (no missing-deploy problem).
- PR #134 merged; theme/sponsors/publications/fantasy-automation migrations present in production Supabase.
- `publications`: one published monthly newsletter (`ndcc-june-newsletter`, has PDF). The live homepage **does** render the publications section and `/publications`, `/newsletters`, `/match-reports` respond 200 — the earlier "module not visible" finding was stale.
- Live `/fixtures` says "No fixture data is shown until the server-only PlayHQ environment variables are set" — root cause found in code: `lib/playhq/config.ts` required `PLAYHQ_TENANT`, which no revision of the setup docs ever told the operator to set, so a valid key+org still reported unconfigured.
- Supabase (read-only):
  - `2025-26`: playhq_season_id NULL, 0 players / 0 stats / 0 grade sources / 0 jobs / 0 runs, auto_sync_enabled=true
  - `2026-27`: playhq_season_id NULL, 134 players (rollover), 0 stats/grades/jobs/runs, auto_sync_enabled=true
  - `legacy-unverified`: archived, non-public, auto_sync_enabled=false
- All 10 active sponsors had `logo_surface_mode='auto'`.
- Broad `:where(.dark)` compatibility layer and alpha-wash `.surface-sky` present in `app/globals.css`.

## Environment constraints of this session (recorded honestly)

- No Vercel env-var read/write path exists here: the Vercel MCP has no env tools, no CLI token is present, and the sandbox network policy blocks `api.vercel.com`, `www.ndcc.com.au` and `api.playhq.com` directly. Env-variable verification/repair therefore happens through the deployed diagnostics route after merge, and the code was repaired so the documented variable set (key + org id) is sufficient.
- Direct PlayHQ API smoke-testing from this sandbox is impossible; the deployed server (which holds the key) verifies the contract via `/api/admin/playhq/diagnostics`, and the client now self-heals between the two documented hosts.

## Delivered in this branch

1. **PlayHQ contract repair** — tenant defaults to `ca`; only key+org required; dual-host fallback with active-host reporting; fantasy sync enabled unless explicitly `false`; docs/tests unified.
2. **Sponsor plates** — pixel audit + four-surface contact sheet (`docs/audit/20260715-sponsor-logo-contact-sheet.png`); verified per-sponsor modes persisted in production; improved neutral/dark plate keylines; pixel-based mode suggestion for future uploads (pure classifier + admin wiring + tests). MBR Cricket and Leopold logo files are missing from the repo (text fallback) — flagged for asset upload.
3. **Semantic theme** — blue surface tokens both themes; `.surface-blue-band`/`.panel-blue*` replace `.surface-sky`; every sky utility call site reviewed; 101 files migrated off the dark compatibility layer; layer removed.
4. **Modernisation** — cinematic hero, transparent→translucent nav, full-screen mobile menu (scroll lock/focus trap/Escape), reordered homepage with alternating publications feature, masked sponsor marquee with visibility pause, accessible accordion on /join, footer CTA band.

## Rollback

- Code: revert the PR (single branch; no destructive migration in this branch).
- Sponsor modes: `UPDATE sponsors SET logo_surface_mode='auto' WHERE active;` restores the pre-repair state.
