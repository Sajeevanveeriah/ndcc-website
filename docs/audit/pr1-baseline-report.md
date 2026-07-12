# PR 1 baseline report: audit, diagnostics and tests

Date: 2026-07-11
Scope: read-only repository baseline plus a server-only PlayHQ diagnostics surface. No production database migration, production data mutation, external publication, email send or deployment was performed.

## Direct evidence reviewed

- Root `AGENTS.md` requires `npm ci`, `npm run lint` and `npm run build` before completion, route and behaviour preservation, no invented content, supplied assets only, accessible event details and meaningful image alt text.
- `package.json` confirms Next.js App Router, TypeScript, Tailwind CSS, Supabase, Stripe, Resend, PlayHQ scripts and Fantasy test scripts.
- `vercel.json` schedules `/api/cron/keep-alive` at `0 5 * * *` and `/api/cron/playhq-fantasy-sync` at `30 16 * * *`.
- `.env.example` keeps PlayHQ credentials server-only and documents `CRON_SECRET` protection for the scheduled Fantasy sync endpoint.
- Supabase migrations contain the authoritative Fantasy multi-season, PlayHQ grade source and sync job schema. `supabase/schema.sql` was not treated as authoritative.

## Route inventory from source scan

### Public routes
`/`, `/about`, `/calendar`, `/committee/minutes`, `/committee/minutes/[id]`, `/contact`, `/events`, `/events/[id]`, `/facilities`, `/fantasy`, `/fantasy/account`, `/fantasy/leaderboard`, `/fantasy/leagues`, `/fantasy/login`, `/fantasy/manager-leaderboard`, `/fantasy/players`, `/fantasy/register`, `/fantasy/reset-password`, `/fantasy/rules`, `/fantasy/squad`, `/fantasy/team`, `/fantasy/transfers`, `/fixtures`, `/gallery`, `/join`, `/kitchen`, `/merchandise`, `/news`, `/news/[id]`, `/sponsors`, `/teams`, `/volunteer`.

### Admin routes
`/admin`, `/admin/apparel`, `/admin/calendar`, `/admin/change-password`, `/admin/club-details`, `/admin/club-settings`, `/admin/content`, `/admin/content-blocks`, `/admin/email-diagnostics`, `/admin/enquiries`, `/admin/events`, `/admin/fantasy`, `/admin/fantasy/import`, `/admin/fantasy/imports`, `/admin/fantasy/imports/[id]`, `/admin/fantasy/managers`, `/admin/fantasy/players`, `/admin/fantasy/rounds`, `/admin/fantasy/scores`, `/admin/fantasy/scoring`, `/admin/fantasy/seasons`, `/admin/fantasy/settings`, `/admin/gallery`, `/admin/history`, `/admin/kitchen`, `/admin/login`, `/admin/media-diagnostics`, `/admin/memberships`, `/admin/minutes`, `/admin/news`, `/admin/orders`, `/admin/payments`, `/admin/playhq-diagnostics`, `/admin/season-appointments`, `/admin/site-pages`, `/admin/sponsors`, `/admin/teams`, `/admin/users`, `/admin/volunteers`.

### API, cron and background routes
Admin APIs include dashboard, diagnostics, users, PlayHQ diagnostics and Fantasy import/sync endpoints. Public APIs include content blocks, calendar, committee, events, news, sponsors, season appointments, PlayHQ fixtures and ladder endpoints. Cron routes are `/api/cron/keep-alive` and `/api/cron/playhq-fantasy-sync`. Payment and email-sensitive routes include checkout, orders, kitchen orders, memberships, contacts and Stripe webhook.

## Source-of-truth matrix

| Content or behaviour | Current source of truth | Runtime precedence | Risk |
| --- | --- | --- | --- |
| Fantasy seasons | Supabase `fantasy_seasons` from migrations | Supabase queried by Fantasy APIs and pages | Needs production verification before changes |
| Fantasy PlayHQ grade mappings | Supabase `fantasy_season_grade_sources` | Admin mapping APIs | Empty production state still unverified in this PR |
| Fantasy sync jobs | Supabase `fantasy_sync_jobs` | Cron and admin sync APIs | Operational visibility was incomplete before this PR |
| PlayHQ credentials and tenant | Server-only environment variables | `lib/playhq/config.ts` | Legacy Canada base URL was corrected to AU/NZ default |
| Public fixtures and ladders | PlayHQ Public API, with CMS CTA fallbacks | PlayHQ API first; CMS or constants for links and empty states | Tenant and season ids must be verified before enabling sync |
| Homepage, fixture and join copy | CMS content blocks with fallback constants | Supabase CMS, then `lib/fallback-content.ts` and `lib/constants.ts` | Dated fallback copy can become stale |
| Teams and grades | CMS teams plus constants/fallbacks | Page dependent | Duplicate source of truth remains |
| Committee and appointments | CMS tables plus constants/fallbacks | Page dependent | Current people and dates require production review |
| Merchandise, kitchen and payments | Supabase CMS/order tables plus server env payment config | Supabase and server config | Must not change without payment regression tests |
| Sponsors | Supabase sponsors plus fallback/public assets | Supabase first | Sponsor benefits and dates must not be invented |
| Navigation | Supabase site links plus code admin nav | Public chrome uses CMS where available; admin nav is code | Stage 4 will consolidate task-based admin nav |

## Confirmed defects and gaps

1. The PlayHQ default base URL was `https://api.caprod.playhq.com`, which PlayHQ support currently documents as Canada. Australia and New Zealand, including Cricket Australia examples, use `https://api.playhq.com`.
2. The PlayHQ client did not send the required `x-phq-tenant` header. PlayHQ support describes this as the sport tenant short-name, with Cricket Australia shown as `ca`.
3. Admins had no full diagnostics page for PlayHQ configuration presence, connection, discovery, last sync status, last failure and next cron timing.
4. Mutable seasonal content still exists in `lib/constants.ts`, `lib/fallback-content.ts` and historical seed migrations. This PR documents it only and does not migrate content.
5. Production Supabase, Vercel deployment logs, cron history and live-site screenshots were not verified because this non-interactive environment did not provide production dashboard credentials. This is a stop condition before production mutation or deployment.

## UX baseline status

A source-level UX baseline identified high admin navigation breadth and a flat implementation-oriented admin menu. Screenshot capture of the live public site and authenticated admin CMS was not completed in this PR because authenticated production access and preview deployment evidence are unavailable in the current environment. Required screenshots remain a PR 1 manual verification item before production approval.

## Rollback path

- Revert this PR commit to remove the diagnostics page, restore the previous PlayHQ default base URL, remove tenant header handling and restore the previous Fantasy admin card list.
- No database rollback is required because this PR adds no migration and performs no production data mutation.
