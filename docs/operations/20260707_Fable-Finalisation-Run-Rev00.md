# NDCC Website — Finalisation Run, 7 July 2026 (Rev00)

Branch: `claude/ndcc-production-readiness-i7rzwe`
Scope: verify the stale-content fix, close audited gaps in design/fantasy/admin/SEO, prepare docs and deployment.

## Stale content: root cause and current state

**Root cause (proven, fixed in PR #128, deployed to production before this run):**
every public CMS helper short-circuited to static seed content during the
Vercel production build (`NEXT_PHASE === 'phase-production-build'`); that
fallback output was frozen into ISR page prerenders (`revalidate = 300`) and
`unstable_cache` Data Cache entries, then served interleaved with live reads —
so the site alternated between stale seed content and live Supabase content.
The stale titles never existed in the database.

**Verification performed this run (2026-07-07):**

- Code audit: no `NEXT_PHASE`/`isProductionStaticBuild` fallback gates remain;
  the only `unstable_cache` left is the PlayHQ client (external API, deliberate
  TTL). All CMS pages export `force-dynamic`/`revalidate 0`/`force-no-store`
  (client-only pages via their segment layouts). All public CMS APIs send
  `no-store` headers.
- Build proof: after `npm run build`, none of the six known stale strings
  (Dino Lotto 2026 is Open, Pre-Season Training Begins, premiership-success
  gallery title, AGM 20 May 2026 card, Under 13 Juniors, Club Championship
  Winners) appear in any prerendered `.html`/`.rsc`/`.body` payload under
  `.next/server/app`. They exist only inside JS chunks as the fallback module's
  source, which is correct (fallback renders only on missing-env or
  failed-query paths).
- Runtime proof (local production server): every public page and CMS API
  fetched 10× with cache-busting params returned byte-identical content after
  normalising the echoed cache-buster (the one `/fixtures` variation was the
  live PlayHQ "last checked" clock ticking over — correct behaviour).
- Production proof (www.ndcc.com.au, deployment `7aee50f` = PR #128 merge):
  `/`, `/news`, and the public news/events/committee APIs return live Supabase
  rows with `x-vercel-cache: MISS` and `no-store` cache headers; none of the
  stale strings appear; footer acknowledgement renders consistently.
- Supabase read-only checks: stale titles absent from `news`, `events`,
  `gallery_images`; all CMS tables populated and active (news 2/2 published,
  events 3/3, gallery 5/5, sponsors 9/9 active in 4 tiers, committee 6/6,
  facility features 6/6, content blocks 26 incl. `footer.acknowledgement`,
  page link cards 54 with no duplicate hrefs). **No database mutation was
  needed for content; the issue was code/cache.**

## What changed this run

Design / public pages:
- Homepage: new **Fantasy Cricket League teaser** section (static copy, no
  invented stats) between season appointments and the sponsor wall; canonical
  metadata for `/`.
- `app/sitemap.ts`: now async; adds `/committee/minutes` and dynamic
  `/news/[id]` + `/events/[id]` entries for published rows (guarded — static
  sitemap still serves if Supabase is unavailable).

Sponsors (no logo generation, per instruction):
- Created `public/images/sponsors/recreated/` with an in-folder README listing
  every live sponsor logo path and the drop-in replacement convention (replace
  file at same path = no DB change). README gained a "Sponsor Logos" section.
- Layout/tiers/fallback cards were audited and already compliant (tier
  grouping, object-contain plates, branded name-text fallback, website CTA,
  alt text, mobile grid) — no changes needed.

Fantasy:
- **Unit tests**: new `scripts/test-fantasy-logic.mjs`
  (`npm run test:fantasy-logic`) — 38 deterministic checks covering scoring
  rules, CSV import normalisation, duplicate detection, squad validation,
  draft validation, deadline locks, leaderboard aggregation.
- **Save draft squads**: `POST /api/fantasy/squad` accepts `mode: 'draft'`
  (relaxed validation via new `validateDraftSquadSelection`); SquadBuilder now
  has Submit squad / Save draft buttons and shows current squad status.
- **Leave league**: `POST /api/fantasy/leagues` action `leave`; confirm-first
  button per league card.
- **Player list**: `/fantasy/players` gained search, role/team filters, and
  sorting by name/price/points/form (points from published leaderboard totals).
- **Import provenance**: `fantasy_import_batches.source_url` + `fetched_at`
  (new migration `20260707093000_fantasy_import_provenance.sql`, **already
  applied to the production Supabase project** — additive, idempotent, no data
  touched); optional Source URL field on the admin CSV import form; provenance
  shown on batch review.
- **Manager review**: new read-only `/admin/fantasy/managers` page + endpoint
  showing each manager's latest squad status, budget, players, captaincy.
- Refactors for testability (behaviour-preserving): `evaluateRoundLock`
  extracted from `getRoundLockState`; `aggregateLeaderboardRows` extracted
  from `getPublishedFantasyLeaderboard`.

Admin:
- Dashboard gained a **CMS health strip**: draft news, unpublished events,
  unpublished gallery, published gallery images missing alt text, fantasy
  imports awaiting publish, PlayHQ API configured/not-configured. Each count
  degrades to `?` independently on query failure.

## Intentionally NOT changed

- Sponsor logo files (Saj will supply recreated logos later; convention ready).
- PlayHQ fixtures pipeline (already compliant: PlayHQ API only, source labels,
  last-checked timestamp, admin-editable team link cards, honest CTA card when
  unconfigured). The `sync`/`import-public-page` admin endpoints remain guarded
  placeholders — no scraping was added.
- Auth flows, payment gating (`manual` mode live; Stripe dormant), Resend email
  paths, EMAIL_TEST_MODE behaviour — all verified as already correct.
- No broad componentisation refactor (SectionShell/NewsCard/etc. remain
  page-local); the visual system from PR #126 is consistent and accessible, and
  a sweeping refactor was judged higher-risk than value in this run.
- Toast library, idle-timeout rework, batch actions beyond the existing five
  admin tables.

## Validation results (this run)

- `npm run lint` — no warnings or errors
- `npx tsc --noEmit` — clean
- `npm run build` — success; all CMS routes dynamic (ƒ), no stale strings in
  prerendered payloads
- `npm run smoke` — 48/48 routes pass (against local prod server)
- `npm run smoke:content` — 9/9 pass (against local prod server)
- `npm run smoke:fantasy`, `test:fantasy`, `test:fantasy-logic` (38/38),
  `test:playhq-normalise`, `test:playhq-config`, `test:sponsors`,
  `test:core-schema`, `test:committee-auth-schema` — all pass
- 10× cache-busted refreshes of `/`, `/news`, `/events`, `/gallery`,
  `/contact`, `/facilities`, `/sponsors`, `/fantasy`, `/fantasy/players`,
  `/fixtures` — stable, no content switching
- Visual QA via Playwright screenshots (desktop 1440px + mobile 390px), all
  public pages + new teaser section

## Supabase changes

- Applied migration `fantasy_import_provenance` (adds nullable
  `source_url TEXT`, `fetched_at TIMESTAMPTZ` to `fantasy_import_batches`).
  Additive and idempotent; also committed to `supabase/migrations/`.
- Everything else read-only. No rows created, modified, or deleted.

## Deployment notes

1. Merge the PR for `claude/ndcc-production-readiness-i7rzwe` after review.
2. Vercel auto-deploys `main`. A cache-less redeploy is **not** required for
   this run (the cache root-cause fix already shipped in PR #128 and its
   production deployment is verified live), but if any stale content is ever
   suspected again: Vercel → Deployments → Redeploy → untick "Use existing
   build cache".
3. Post-deploy verification: fetch `/`, `/news`, `/events`, `/gallery`,
   `/api/public/news?limit=5&t=<ts>` with cache-busting params several times;
   confirm `x-vercel-cache: MISS`/no-store headers and stable live content;
   spot-check `/fantasy/players` filters and `/admin/fantasy/managers`.

## Rollback path

- Code: revert the merge commit of this PR (`git revert -m 1 <merge-sha>`) or
  redeploy the previous production deployment from the Vercel dashboard
  (previous good: the PR #128 merge deployment).
- DB: the provenance migration is additive; code from the previous release
  ignores the two new columns, so no down-migration is needed. If strictly
  required: `ALTER TABLE fantasy_import_batches DROP COLUMN source_url,
  DROP COLUMN fetched_at;` (loses recorded provenance).

## Remaining tasks / known gaps

- Replace MBR Cricket and Leopold Sportsmans Club logo files (paths in
  `public/images/sponsors/recreated/README.md`); drop in final recreated logos
  for all sponsors when ready.
- Manager leaderboard per-round filter (player leaderboard already has one).
- Optional future: wire a compliant PlayHQ stat import (official API) behind
  the existing guarded admin endpoints; public league browsing
  (`fantasy_leagues.is_public` is schema-ready but unused).
- Supabase preview-branch migration renaming (pre-existing, documented in
  README Known Limitations).
- Supabase dashboard-only settings (Auth SMTP, redirect URLs) remain manual.
