# Newcomb and District Cricket Club (NDCC) Website

Official website for the Newcomb and District Cricket Club — the Dinos. Competing in the Geelong Cricket Association since 1972.

**Production:** [www.ndcc.com.au](https://www.ndcc.com.au)

## Tech Stack

- **Framework:** Next.js 14 (App Router) with TypeScript
- **Styling:** Tailwind CSS (club branding: maroon and blue primary, gold for emphasis only)
- **Database:** Supabase Postgres (managed via `supabase/migrations`)
- **Email:** Resend API for app notifications; Supabase SMTP for auth emails
- **Payments:** bank-transfer orders live today; Stripe-ready (Payment Links / Checkout) but dormant until explicitly enabled
- **Fixtures:** PlayHQ Public API (fixtures come from PlayHQ only — never manually entered)
- **Deployment:** Vercel (region `sin1`, daily keep-alive cron)

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
npm install
```

### Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

Variables split by exposure (full annotated list in `.env.example`):

- **Public (browser-safe, `NEXT_PUBLIC_*`)**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (only used if Stripe modes are enabled).
- **Server-only (never expose)**: `SUPABASE_SERVICE_ROLE_KEY`, `PLAYHQ_*`, `RESEND_*`, `CONTACT_*`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYMENT_PROVIDER`, `PAYMENT_TEST_MODE`, `EMAIL_TEST_MODE`, `NDCC_BANK_*`, `GITHUB_*` media upload vars, `AUTH_COOKIE_DOMAIN` (optional).
- **Optional email vars**: `EMAIL_TEST_MODE` (simulate sends), `CONTACT_TO_EMAIL` / `CONTACT_CC_EMAILS` / `CONTACT_BCC_EMAILS`.
- **Optional payment vars**: `PAYMENT_PROVIDER` (`manual` | `stripe_payment_link` | `stripe_checkout`, default `manual`), `PAYMENT_TEST_MODE` (default `true`), plus the three Stripe keys.

### Database Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Apply SQL migrations from `supabase/migrations` in timestamp order.
3. Treat migrations as the source of truth. `supabase/schema.sql` is a legacy snapshot and not authoritative.
4. Copy your project URL, anon key, and service role key to `.env.local`

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Admin Setup (Custom Committee Auth)

1. Apply `20260401_custom_committee_auth.sql` and later migrations (pgcrypto is required for password hashing; the repair migrations handle it).
2. Bootstrap the first admin using `POST /api/admin/auth/bootstrap`.
3. Log in at `/admin/login` (password field has a show/hide toggle).
4. Manage committee users in `/admin/users` (admin-only). Roles available: `admin`, `president`, `secretary`, `committee`.

Sessions are cookie-based (hashed tokens in `committee_sessions`) with a 14-day absolute TTL **and** a sliding inactivity window: the admin UI warns at 9 minutes of inactivity and signs out at 10; the server independently expires sessions idle for more than 15 minutes (`last_seen_at`). A root `middleware.ts` redirects cookie-less visits to `/admin/*` straight to the login page.

### CMS Modules and Content Freshness

CMS-backed modules (public route ← table): news (`news`), events (`events`), gallery (`gallery_images`), merchandise (`apparel_products` + `merch_order_windows`), sponsors (`sponsors`), committee (`committee_members`, rendered on `/about` and `/contact`), teams (`teams`), facilities (`facility_features`), history, season appointments, kitchen menus, volunteer positions, content blocks and page link cards (footer/nav/page copy) via `/admin/site-pages` and `/admin/content`.

Freshness model: mutable CMS content is read at request time with no store — public CMS pages export `dynamic = 'force-dynamic'` / `revalidate = 0` / `fetchCache = 'force-no-store'`, and the public data helpers (`lib/public-data.ts`, `lib/public-news.ts`, `lib/content-blocks.ts`, `lib/club-settings.ts`, `lib/structured-content.ts`, `lib/site-chrome.ts`) query Supabase uncached on every request. There is no ISR or `unstable_cache` layer underneath public CMS pages or APIs, so build-time output can never resurface as stale seed content. Public JSON APIs (`/api/public/*`, `/api/gallery`, `/api/content-blocks`, `/api/club-settings`, `/api/apparel/*`) are `force-dynamic` with `no-store` headers. Live CMS rows are the single source of truth: static fallback content renders only when Supabase env is missing (local/unconfigured) or when a live query fails — never during the production build, never on top of a successful (even empty) live result, and never merged into live rows. The admin `/api/admin/resources/*` `revalidateTag`/`revalidatePath` calls remain as belt-and-braces for the few remaining cached routes (e.g. fantasy pages). After changing the cache strategy, a production redeploy **without build cache** may be required so previously prerendered/ISR payloads are dropped. Note: Supabase preview branches can report `MIGRATIONS_FAILED` because of historical duplicate migration prefixes — that is a preview-branch artefact and must not be used as evidence that the production CMS is broken.

### PlayHQ (Fixtures)

Fixtures come from the PlayHQ Public API only — the repo contains no manually-entered fixture data and must never gain any. Configuration is centralised in `lib/playhq/config.ts` and driven by server-only env vars:

- `PLAYHQ_API_BASE_URL` (default `https://api.caprod.playhq.com`)
- `PLAYHQ_API_KEY`, `PLAYHQ_ORGANISATION_ID`
- `PLAYHQ_DEFAULT_SEASON_ID` (optional; when unset the current/most recent season is auto-selected)
- `PLAYHQ_DEFAULT_GRADE_IDS` (optional)
- `PLAYHQ_CACHE_REVALIDATE_SECONDS` (default 3600)

Never prefix PlayHQ vars with `NEXT_PUBLIC`. When the API is unconfigured or returns no fixtures, `/fixtures` shows an explanatory card with an external PlayHQ CTA (from the `fixtures.status` content block, club settings `playhq_url`, or the `PLAYHQ_ORG_URL` constant) — no fake fixtures. Per-team PlayHQ links are admin-editable as `fixtures / team_links` page link cards. The club-wide PlayHQ org URL lives in `lib/constants.ts` (`PLAYHQ_ORG_URL`) and in CMS club settings.

### Payments

Three modes, selected by `PAYMENT_PROVIDER` (server-only) plus per-product fields (`payment_mode`, `payment_link_url`, `stripe_price_id`, `checkout_enabled`):

1. **`manual` (live today):** merchandise orders post to `/api/orders`, get an `NDCC-…` payment reference and bank-transfer details (from `NDCC_BANK_*` env), and are reconciled in `/admin/payments`. No card charging anywhere.
2. **`stripe_payment_link` (one admin step):** create a Payment Link in the Stripe dashboard, paste it into a product's `payment_link_url` with `payment_mode = stripe_payment_link` in `/admin/apparel` — the product card shows a safe external "Pay online" button. Recommended first rollout path.
3. **`stripe_checkout` (future):** set `PAYMENT_PROVIDER=stripe_checkout` plus the Stripe keys; `/api/checkout` creates Checkout Sessions with **server-side prices from `apparel_products`** (client prices are never trusted) and the webhook (`/api/stripe/webhook`, signature-verified) marks orders paid only when `payment_status === 'paid'` and amounts match.

**Safety:** live charging is impossible until `PAYMENT_PROVIDER=stripe_checkout` *and* Stripe keys are deliberately configured; keep `PAYMENT_TEST_MODE=true` until go-live.

### Email Setup

The site has two separate email paths. Keep them configured separately:

1. **App transactional email through the Resend API** — contact/enquiry, volunteer, event, membership, order, kitchen, and fantasy manager notification-style emails sent by app API routes through `lib/email.ts`.
2. **Supabase Auth email through Supabase SMTP** — fantasy signup confirmation, resend confirmation, sign-in, and password reset emails controlled by Supabase Auth. These do not go through `lib/email.ts` and should not be implemented as a custom app route.

#### Resend API app email variables

Configure these as **server-only** variables locally and in Vercel:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL` (for example `NDCC Dinos <noreply@ndcc.com.au>`)

`RESEND_FROM` remains supported as a legacy fallback if `RESEND_FROM_EMAIL` is not set. Do not expose either Resend variable to client components. If `RESEND_API_KEY`, a sender address, or required email fields are missing, or if Resend returns an error, form submissions still complete after the database write. The app logs the email skip/failure and does not block the user-facing flow. Do not claim live email delivery is working until a real Resend send has been tested in the target environment.

#### Supabase Auth SMTP

Configure fantasy signup confirmation and password reset email in **Supabase Dashboard → Authentication → SMTP Settings**. Use Resend SMTP credentials there after Resend domain sending is verified. The typical Resend SMTP values are:

- Host: `smtp.resend.com`
- Port: `465`
- Username: `resend`
- Password: the Resend SMTP/API credential supplied for SMTP use
- Sender name/address: the verified NDCC sender

Do not add a custom app route for Supabase Auth confirmation or password reset emails.

#### Namecheap DNS and Resend sending checklist

DNS changes are manual in Namecheap. For BasicDNS, use **Advanced DNS → Mail Settings → Custom MX** for MX records. Do not automate DNS from this repo.

- Resend domain verification checklist:
  - Confirm Resend DKIM is verified.
  - Add/confirm TXT host `resend._domainkey` for DKIM.
  - Add MX host `send` for Resend return-path feedback SMTP.
  - Add TXT host `send` for SPF.
  - Add/confirm a DMARC TXT record at `_dmarc` (start with `v=DMARC1; p=none; rua=mailto:<monitoring inbox>` and tighten to `quarantine`/`reject` after monitoring).
  - Keep Resend receiving disabled unless inbound email webhooks are intentionally implemented.
  - Do not change the root `@` MX records unless the club intentionally changes mailbox provider.
- Vercel environment variable checklist:
  - Set `RESEND_API_KEY` as a server-only environment variable.
  - Set `RESEND_FROM_EMAIL` to a sender on the verified domain.
  - Keep Supabase service role and Resend secrets out of `NEXT_PUBLIC_*` variables.
  - Redeploy after changing Vercel environment variables.
- Supabase SMTP checklist:
  - Configure Supabase Auth SMTP after Resend sending DNS is verified.
  - Send Supabase Auth test confirmation/reset emails from the Supabase dashboard or a controlled signup/password-reset flow.
- Final live email test checklist:
  - Submit a non-destructive contact/enquiry-style app flow and confirm Resend API delivery.
  - Test a Supabase Auth confirmation email.
  - Test a Supabase Auth password reset email.
  - Confirm failed or missing app email configuration does not block the form/database flow.

Local DNS check commands from Windows PowerShell:

```powershell
Resolve-DnsName -Type TXT resend._domainkey.ndcc.com.au
Resolve-DnsName -Type TXT send.ndcc.com.au
Resolve-DnsName -Type MX send.ndcc.com.au
Resolve-DnsName -Type TXT _dmarc.ndcc.com.au
```

#### Email test mode

Set `EMAIL_TEST_MODE=true` locally (or temporarily in a preview environment) to log/simulate every app email instead of sending it — form flows and `/admin/email-diagnostics` still exercise the full path. Leave it unset/false in production. Never run bulk sends while testing; real test sends should go only to a configured admin/test recipient, triggered deliberately.

### GitHub-backed CMS Image Upload Setup

Set these as **server-only** environment variables (for local `.env.local` and Vercel Project Environment Variables):

- `GITHUB_CONTENTS_TOKEN`
- `GITHUB_REPO_OWNER`
- `GITHUB_REPO_NAME`
- `GITHUB_CONTENTS_BRANCH`
- `GITHUB_MEDIA_BASE_PATH` (for example `public/images/cms`)
- `GITHUB_COMMITTER_NAME`
- `GITHUB_COMMITTER_EMAIL`

Image uploads from admin forms commit files to GitHub via the Contents API under `public/images` (or a `public/images` subfolder), then return a browser URL that starts with `/images/` and removes the leading `public` segment (for example `/images/cms/YYYY/MM/file.webp`). If `GITHUB_MEDIA_BASE_PATH` is set to `images/cms`, the upload API interprets it as `public/images/cms`; paths outside `public/images` are rejected so uploaded files are web-accessible after deployment.
Publication relies on Vercel's git auto-deploy: the commit the upload creates on `main` triggers a production deployment automatically. Do **not** configure a Vercel deploy hook for uploads — firing a hook as well creates a second deployment for the same commit, and Vercel cancels both, leaving the image unpublished (`VERCEL_DEPLOY_HOOK_URL` is no longer read by the upload route and can be deleted).
Configure these environment variables in **Vercel Production** for the production project.
When environment variables are added or changed in Vercel, trigger a new deployment for them to take effect.

**GitHub token permissions:** `GITHUB_CONTENTS_TOKEN` must be a fine-grained personal access token (or classic token) with **Contents: Read and write** permission on this repository only. If the token expires or loses access, uploads fail with a clear "GitHub authentication failed" error.

**Expected upload sequence:**

1. Admin picks a file in a CMS image field (JPEG/PNG/WebP/GIF, max 4 MB).
2. The API commits the file to GitHub under `public/images/...` on the configured branch and returns the commit link.
3. Vercel detects the new commit on `main` and automatically starts a production deployment.
4. The image becomes publicly visible only after that deployment finishes (about a minute). The saved `/images/...` URL is correct immediately, but the file is not live until deploy completes.

**Diagnostics:** `/admin/media-diagnostics` shows which media env vars are present (without exposing values), validates the media base path, and can test GitHub token/repo/branch access without committing anything.

**Troubleshooting a broken public image:**

1. Open the image URL directly (e.g. `https://<site>/images/cms/YYYY/MM/file.png`). If it loads, the CMS record is fine — hard-refresh the page.
2. Check the file exists in GitHub on the configured branch under `public/images/...`.
3. Check a Vercel deployment was triggered after the upload (Vercel → Deployments).
4. Check that deployment succeeded; if not, redeploy `main` manually.
5. Only if the saved URL itself is wrong (typo, old path), re-save the CMS item with the correct URL.

### CMS Content Workflow

1. Sign in to `/admin`.
2. Edit singleton page text in **Content Blocks**.
3. For repeatable content, use dedicated admin screens (News, Gallery, Sponsors, Apparel, Kitchen, etc.).
4. Use the **Upload image** button in image fields to store assets in GitHub under `/public/images/cms`.
5. Save changes and verify the public page route.

## Project Structure

```
app/
  ├── page.tsx              # Home (hero, quick links, news, events, sponsors, gallery, join CTA)
  ├── about/                # Club history & committee
  ├── teams/                # Senior Men, Women, Juniors
  ├── facilities/           # Grinter Reserve & training facility
  ├── fixtures/             # PlayHQ fixtures & ladders
  ├── fantasy/              # Fantasy cricket (register/login/squad/transfers/leagues/leaderboards/rules)
  ├── events/               # Events listing & registration
  ├── news/                 # News & announcements
  ├── merchandise/          # Club apparel & orders
  ├── kitchen/              # Kitchen menu & pre-orders
  ├── join/                 # Membership / join the club
  ├── sponsors/             # Sponsor tiers & enquiry form
  ├── gallery/              # Photo gallery
  ├── volunteer/            # Volunteer expressions of interest
  ├── contact/              # Contact form, CMS committee list, map
  ├── committee/            # Committee-only meeting minutes
  ├── admin/                # Protected admin dashboard (custom committee auth)
  └── api/                  # Public content APIs, form submissions, admin resource API
components/
  ├── ui/                   # Reusable UI primitives (Input incl. PasswordInput, Card, Button…)
  ├── common/               # SafeImage, ScrollReveal, LogoChip, theme toggle…
  ├── home/                 # Home page sections
  ├── fantasy/              # Fantasy UI components
  ├── layout/               # Navbar & Footer
  └── admin/                # Admin components (InactivityGuard, batch actions…)
lib/
  ├── supabase.ts / supabase-server.ts   # Supabase clients
  ├── auth/                 # Committee session auth (config, session, guard)
  ├── playhq/               # PlayHQ config, client, normalisers
  ├── payments/             # Payment config & reconciliation matching
  ├── public-data.ts / public-news.ts / structured-content.ts / content-blocks.ts  # uncached request-time public reads
  ├── fallback-content.ts   # fallbacks for unconfigured/error states only (never replace live data)
  ├── email.ts              # Resend app email (server-only, non-blocking, test mode)
  └── constants.ts / types.ts / utils.ts
middleware.ts               # Redirects cookie-less /admin visits to /admin/login
supabase/
  ├── migrations/           # Source of truth — apply in timestamp order
  └── schema.sql            # Legacy snapshot (not authoritative)
scripts/                    # Smoke tests & operational scripts (see package.json)
```

## Fantasy League

- **Public routes:** `/fantasy` (hub), `/fantasy/register`, `/fantasy/login`, `/fantasy/account`, `/fantasy/squad`, `/fantasy/team`, `/fantasy/transfers`, `/fantasy/leagues`, `/fantasy/players`, `/fantasy/leaderboard`, `/fantasy/manager-leaderboard`, `/fantasy/rules`.
- **Flow:** Supabase Auth signup → email confirmation (requires Supabase SMTP configured) → fantasy manager profile auto-created/upserted on first authenticated visit (no duplicates) → squad building within budget/role limits → transfers and chips → leaderboards.
- **Squads:** managers can **save a draft** (incomplete squad allowed; players/budget/role caps still validated) or **submit** (full validation: 11 starters + 4 bench, exact role counts, captain/vice-captain, bench order). Both are blocked once the round deadline passes.
- **Leagues:** create a private league, join by code, and **leave a league** (confirm-first) from `/fantasy/leagues`.
- **Player list:** `/fantasy/players` has search, role/team filters, and sorting by name, price, total points, and points-per-match (points appear once stat batches are published).
- **Admin controls** (`/admin/fantasy/*`): registration open/closed, team selection open/closed, season label, budget/role limits, rounds with lock deadlines (enforced server-side), scoring rules, player imports, round score calculation, and a read-only **Manager Review** page (`/admin/fantasy/managers`) showing each manager's latest squad status, budget, and captaincy. Rules text is editable via the `fantasy.rules` content block in `/admin/content`.
- **Multi-season:** Fantasy is season-scoped end to end (`fantasy_seasons` + `fantasy_season_players` + `season_id` on settings, rounds, prices, stats, imports, squads, transfers, chips, leagues, and manager scores). A shared season dropdown appears on every public fantasy page and the selection travels in the `?season=` query param (shareable links; default is the current season). Admins manage seasons in `/admin/fantasy/seasons`: create seasons (manually or from live PlayHQ discovery), set the single current season, control visibility/registration/team-selection/historical team-building flags, and map the PlayHQ grades each season imports from (`fantasy_season_grade_sources`). Legacy pre-season data lives in a non-public **Legacy / Unverified** season and is never relabelled as a real season.
- **PlayHQ import (official API only):** `/admin/fantasy/seasons` runs a resumable, idempotent sync (`fantasy_sync_jobs`): enabled grades → completed NDCC fixtures → per-game summaries → per-player stats (runs, wickets, maidens, catches, runouts, stumpings, duck, not-out, player of match — nothing inferred). Players match primarily by PlayHQ player id; name-only matches and ambiguous rounds are parked as review items, never guessed. New players arrive `UNASSIGNED` and unselectable until an admin assigns a role. Stats land in a draft import batch with full provenance (`playhq_game_id`, round metadata, `source_hash`, fetch time) and only affect public scores after admin publish; re-running a sync creates zero duplicates, and changed published summaries surface as reconciliation review items. A daily cron (`/api/cron/playhq-fantasy-sync`, `CRON_SECRET`-guarded, enabled via `PLAYHQ_FANTASY_SYNC_ENABLED=true`) resumes one bounded batch (default `PLAYHQ_FANTASY_SYNC_BATCH_SIZE=10` games).
- **Season rollover:** managers can **carry a squad to a new season** from `/fantasy/squad` — preview shows carried/unavailable players, role changes, price changes and remaining budget; applying writes only a target-season *draft* (audit-linked via `fantasy_squads.carried_from_squad_id`, idempotent, source squad untouched) which the manager reviews and submits.
- **Import provenance:** CSV import batches record an optional **source URL** (e.g. the public PlayHQ scorecard the stats were read from) and a **fetched-at** timestamp (`fantasy_import_batches.source_url` / `fetched_at`), shown on the batch review page. Stats only affect public scores after an admin publishes the batch. The validated CSV importer remains the documented fallback when the official API lacks a field. There is no PlayHQ scraping.
- **Roles:** a restricted `fantasy_manager` committee role can manage Fantasy CMS modules only (seasons, players, prices, rounds, imports, scoring, sync); it gets no other admin modules.
- **Tests:** `npm run test:fantasy-logic` (deterministic unit tests for scoring, CSV normalisation, duplicate detection, squad/draft validation, deadline locks, leaderboard aggregation), `npm run test:fantasy-seasons` (season selection, PlayHQ summary normalisation, exact round mapping, source hashing, carryover planning, cron auth, migration structure), `npm run test:footer-link`, plus `npm run smoke:fantasy` and `npm run test:fantasy`; full live acceptance steps are in the operator checklist below. Operations runbook: `docs/operations/20260710-NDCC-Fantasy-Seasons-PlayHQ-Run-Rev00.md`.

## Club Calendar

A CMS-managed club calendar backed by the `calendar_events` Supabase table (separate from the ticketed **Events** CMS, which is unchanged — a calendar entry can link to an event registration page via its CTA URL, e.g. `/events/<id>`).

- **Public routes:** `/calendar` (full FullCalendar month/week/list views, type filters, search, legend, event detail modal, ICS download), a "What's On at the Club" preview on the home page (next 4 entries flagged *Show on home*), and an "Upcoming at the Club" card on `/contact` (next 3 entries flagged *Show on contact*). Sections hide entirely when nothing is published — no placeholder content.
- **Public APIs:** `GET /api/public/calendar` (params: `from`, `to`, `limit`, `type` (comma list), `featured`, `home`, `contact`; returns FullCalendar-shaped events with NDCC `extendedProps`), `GET /api/public/calendar/upcoming`, `GET /api/public/calendar/ics` (RFC 5545 feed of published public entries; stable `<id>@ndcc.com.au` UIDs). All responses are `no-store`.
- **Admin:** `/admin/calendar` (committee login required) — list view with status/type/visibility filters and search, month view with click-a-day quick add, create/edit modal (all fields, Australia/Melbourne datetime inputs), duplicate, publish/unpublish, archive-instead-of-delete option, and batch publish/unpublish/archive/restore/delete. CRUD goes through the existing generic resource API (`/api/admin/resources/calendarEvents`) with server-side validation (allowlisted status/type/visibility, end-after-start, URL/price/capacity checks).
- **Data model:** `supabase/migrations/20260708090000_calendar_events.sql` — additive only. Statuses: `draft/published/cancelled/postponed/archived`; visibility: `public/members/committee/draft`; per-surface flags `show_on_home/show_on_contact/show_on_calendar`; `recurrence_rule`/`recurrence_until` columns exist but recurring-event UI is deliberately not enabled yet. RLS is enabled with an anon policy limited to published+public+calendar-visible rows (the app itself uses the service-role key server-side, same as every other resource).
- **Freshness:** all calendar pages/APIs are `force-dynamic` + `no-store`; the public query serves live data only — on failure it returns an explicit unavailable state, never stale fallback events. Admin writes also fire belt-and-braces revalidation of `/`, `/calendar`, `/contact`.
- **Timezone:** timestamps are stored UTC; all display is Australia/Melbourne (admin inputs are Melbourne wall-clock; the public calendar renders floating Melbourne times so every visitor sees club time).
- **Tests:** `npm run test:calendar` (validation, feed mapping, AEST/AEDT conversion); `/calendar` is covered by `npm run smoke:content`.
- **Post-deploy check:** publish a test entry in `/admin/calendar`, confirm it appears on `/calendar` (and home/contact when flagged), then unpublish and confirm it disappears; delete the test entry.
- **Future options (not implemented):** Google Calendar sync, iCal subscription feed URL promotion, PlayHQ fixture overlay, reminder emails, recurring-event UI.

## Sponsor Logos

Sponsor cards render whatever `sponsors.logo_url` points at, with a branded name-text fallback card (never a fake logo) when the file is missing or fails to load. All current logo URLs are repo-local paths under `public/`, so **a logo can be replaced with no database change by committing a new file at the exact same path/filename**. The staging folder for final recreated logos is `public/images/sponsors/recreated/` — see the README inside it for the current live paths (including the two known-missing files for MBR Cricket and Leopold Sportsmans Club) and the naming convention for new assets. Logos are letterboxed with `object-contain` inside a fixed plate, so any aspect ratio is safe.

## Verification Checklist

Run before claiming any change is release-ready:

1. `npm run lint`
2. `npx tsc --noEmit`
3. `npm run build`
4. Public route smoke test: `npm run smoke` (or manually `/`, `/news`, `/events`, `/gallery`, `/merchandise`, `/contact`, `/fixtures`, `/fantasy`, `/admin/login`)
5. Data checks: public news/events/gallery/committee/sponsors match live published/active Supabase rows exactly (no seed content when Supabase is up); merchandise lists all active products.
6. Admin CRUD smoke: login (incl. show-password), create/edit/unpublish/delete a draft news item, edit a committee member and confirm `/contact` updates, batch publish/unpublish on safe records, product edit.
7. Email: with `EMAIL_TEST_MODE=true`, submit contact/volunteer forms and confirm simulated sends in logs and `/admin/email-diagnostics`.
8. PlayHQ: `/fixtures` renders live data or the PlayHQ CTA card; `npm run test:playhq-config`.
9. Fantasy logic: `npm run test:fantasy-logic` passes.
10. Payments: manual order flow issues a payment reference; no checkout path is live unless `PAYMENT_PROVIDER=stripe_checkout` is deliberately set.
11. Admin inactivity: idle 9 minutes → warning; extend works; 10 minutes → signed out.

## Known Limitations

- **Stripe checkout is dormant by design** — the club has not finalised a payment provider. Payment Links per product are the recommended first step.
- **Supabase Auth emails depend on Supabase SMTP** being configured in the dashboard; until then fantasy signup confirmations do not send.
- **Migration bookkeeping drift:** some early tables exist in production but their base `CREATE TABLE` statements predate the migrations folder; a brand-new environment needs `supabase/schema.sql` as a starting reference plus the migrations. Production is unaffected.
- **Supabase preview branching fails on historical migration filenames.** The Supabase CLI treats the filename prefix before the first underscore as the migration version, and several historical files share a date-only version (two `20260401_*`, seven `20260402_*`, …), so the PR "Supabase Preview" check errors with a duplicate `schema_migrations` key. Production schema is managed with idempotent migrations applied directly. Fix path: a dedicated PR renaming historical migrations to unique full timestamps and reconciling `supabase_migrations.schema_migrations`, or disable branching for this repo. New migrations use full `YYYYMMDDHHMMSS` prefixes.
- **CMS image uploads deploy via git commits** to `main`, so an uploaded image becomes visible only after the auto-deployment finishes (~1 minute).
- **PlayHQ-to-fantasy import is wired** through `/admin/fantasy/seasons` (resumable `fantasy_sync_jobs`, draft batches, admin publish). The legacy `sync`/`import-public-page` placeholder endpoints remain guarded; validated CSV import stays as the fallback path.
- **Manager leaderboard has no per-round filter** (the player leaderboard does).
- **Supabase dashboard settings** (leaked-password protection, Auth SMTP, redirect URLs) cannot be managed from this repo and must be maintained in the dashboard.

## Club Details

- **Ground:** Grinter Reserve, 141 Coppards Road, Moolap VIC 3224
- **Association:** Geelong Cricket Association (GCA)
- **Teams:** Senior Men (Grade 4), Senior Women (E Grade East), Junior Boys
- **Training:** Peter 'Skinny' Harrison Training Facility
- **Accreditation:** Good Sports Level 3
- **Partner:** Newcomb Power Football Club

## Licence

All rights reserved. Newcomb and District Cricket Club.

## Final Production Operator Checklist

Use this checklist after deploying this PR. Do not mark live acceptance complete until these dashboard and live-service checks have been completed in the target Vercel/Supabase/Resend projects.

### Vercel environment variables

Configure production values and redeploy after every change:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `RESEND_API_KEY`
- `RESEND_FROM`
- `RESEND_FROM_EMAIL`
- GitHub media upload variables already used by this repo: `GITHUB_CONTENTS_TOKEN`, `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`, `GITHUB_CONTENTS_BRANCH`, `GITHUB_MEDIA_BASE_PATH`, `GITHUB_COMMITTER_NAME`, `GITHUB_COMMITTER_EMAIL` (`VERCEL_DEPLOY_HOOK_URL` is no longer used — uploads publish via Vercel's git auto-deploy)
- Stripe variables already used by this repo: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (leave unset until a Stripe mode is enabled)
- Payment mode switches: `PAYMENT_PROVIDER` (`manual` unless going live with Stripe), `PAYMENT_TEST_MODE`
- PlayHQ (server-only): `PLAYHQ_API_BASE_URL`, `PLAYHQ_API_KEY`, `PLAYHQ_ORGANISATION_ID`, `PLAYHQ_DEFAULT_SEASON_ID`, `PLAYHQ_DEFAULT_GRADE_IDS`, `PLAYHQ_CACHE_REVALIDATE_SECONDS`
- Fantasy PlayHQ sync (server-only): `CRON_SECRET`, `PLAYHQ_FANTASY_SYNC_ENABLED`, `PLAYHQ_FANTASY_SYNC_BATCH_SIZE`
- Contact recipients (optional): `CONTACT_TO_EMAIL`, `CONTACT_CC_EMAILS`, `CONTACT_BCC_EMAILS`; keep `EMAIL_TEST_MODE` unset/false in production
- Bank transfer email variables already used by this repo: `NDCC_BANK_ACCOUNT_NAME`, `NDCC_BANK_BSB`, `NDCC_BANK_ACCOUNT_NUMBER`

### Namecheap DNS for Resend sending

- Add/verify `TXT resend._domainkey` exactly as Resend provides it.
- Add/verify the Resend `TXT send` record exactly as Resend provides it.
- Add/verify the Resend `MX send` record exactly as Resend provides it.
- Do not change the root `@` MX records unless the club is deliberately changing mailbox provider.

### Resend

- Domain is verified.
- Sending is enabled.
- Receiving is disabled unless inbound webhook routes are intentionally built later.
- Check Resend logs after using `/admin/email-diagnostics`.

### Supabase Auth email

Supabase Auth confirmation and password reset emails are sent by Supabase SMTP, not by `lib/email.ts`.

- Enable custom SMTP in Supabase Dashboard → Authentication → SMTP Settings.
- Use Resend SMTP values: host `smtp.resend.com`, port `465`, username `resend`, password set to the Resend API/SMTP key, sender set to the verified NDCC sender such as `noreply@ndcc.com.au`.
- Set Supabase Site URL to the production site URL.
- Add redirect URLs for `/fantasy/account` and `/api/auth/callback` on the production domain.
- Confirm email provider and confirmation settings are enabled as intended.

### Fantasy live acceptance test

- Use a fresh email alias that has not previously registered.
- Register at `/fantasy/register` with display name, fantasy team name, email, and password.
- Watch Resend/Supabase Auth logs for the confirmation email.
- Click the confirmation email link and confirm it lands on `/fantasy/account`.
- Confirm the fantasy manager profile is auto-created once and shows as active.
- Log out and log back in to confirm the same profile is preserved.
- If app email is configured, confirm the welcome email result in Resend logs.
