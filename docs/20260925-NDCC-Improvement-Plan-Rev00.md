# NDCC Website - Improvement Plan for Implementation (Rev00)

Prepared: 25 September 2026 (Australia/Melbourne), against `main` at commit `2624dd7` ("Use submitted credentials for club account authentication (#259)").

Audience: an AI coding assistant (ChatGPT/Codex) or a developer who will carry out the work. Each work package can be copied as a standalone task.

---

## 0. How to use this document

Paste the block below into ChatGPT first, then give it one work package (WP) at a time. Do not paste the whole plan as one task. The repository prefers small, reviewable PRs (see `AGENTS.md`).

```text
You are working on the Newcomb and District Cricket Club website repository
(Next.js 15 App Router, React 19, Tailwind 3, Supabase, Stripe Checkout, Resend,
deployed on Vercel). Before changing anything, read AGENTS.md and README.md.

Rules you must follow:
- One work package per branch and PR. Keep the diff small and focused.
- Preserve every public, admin and API route, Supabase schema behaviour, CMS
  behaviour, media upload behaviour and payment/order behaviour unless the work
  package explicitly changes it.
- Never invent names, dates, prices, sponsor benefits, PlayHQ links, committee
  details, phone numbers, emails, URLs or payment behaviour. Never publish
  visible placeholders.
- Database changes go in a new file in supabase/migrations/ with a 14-digit
  timestamp newer than every existing file. Never edit an applied migration.
- Before claiming completion run: npm ci, npm test, npm run lint,
  npx tsc --noEmit, npm run build. Report the exact commands and results.
- State a rollback path for every change.
- UK English in all visible copy.
- If a work package needs a decision from the club (marked OWNER DECISION),
  stop and ask instead of guessing.
```

Priority key: **P0** = fix now (reliability/money), **P1** = next, **P2** = improvement, **P3** = tidy-up.

---

## 1. What was checked and how

| Source | What was inspected | Access |
|---|---|---|
| Repository | Whole tree: `app/`, `components/`, `lib/`, `supabase/`, `scripts/`, `.github/`, docs | Full read |
| Local validation | `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, `check:migration-history`, knip, a full migration replay into a scratch PostgreSQL | Run locally, results in section 9 |
| Local browser | `next start` with Supabase deliberately unreachable (fallback states), Playwright screenshots, desktop and mobile | Run locally |
| Vercel | Project `ndcc-website`, domains, deployments, runtime error clusters (last 7 days) | Read. Environment variables could **not** be listed (403, token lacks permission) |
| Supabase | Project "NDCC Website" (ap-southeast-1): security and performance advisors, applied migrations, DB size, connections, logs | Read |
| Stripe | Live account "Newcomb & District Cricket Club": webhook endpoints, the 20 most recent Checkout Sessions | Read (live mode) |
| Resend | Domain, webhook, the 50 most recent emails | Read |
| GitHub | CI runs on `main`, open PRs and issues | Read |
| Namecheap | **Not checked.** No Namecheap connector is available in this session. DNS observations below come from Vercel and Resend only. | None |

Nothing was changed in any connected service.

---

## 2. Live platform snapshot (25 Sep 2026)

### 2.1 Vercel
- Production is `www.ndcc.com.au`, and the apex `ndcc.com.au` redirects to www. Both domains are verified. The function region is `sin1`, which matches the Supabase region `ap-southeast-1`.
- The latest production deployment is READY and matches `2624dd7`.
- Deployment protection: Vercel Authentication covers all deployments except custom domains. Password protection is off.
- Node version on the project: 24.x.
- **Runtime errors (7 days):** 43 error groups. Almost all are Supabase reads that time out (`AbortError: This operation was aborted`) or fail (`fetch failed` / `Gateway Timeout`):

| Error | Count | Routes |
|---|---|---|
| `[public-publications] list query threw: Publications temporarily unavailable` | 246 | `/`, `/publications`, news/events pages |
| `[public-publications] list query failed: AbortError` | 236 | same |
| `[public-data] Live query failed; serving static fallback content: AbortError` | 231 | sponsors, events, news, home |
| `Publications temporarily unavailable` | 161 | `/`, `/publications` |
| `DegradedSnapshotError: Site chrome snapshot is degraded; not caching` | 138 | almost every page |
| `[calendar] Public calendar query failed: AbortError` | 83 | `/calendar`, home, ICS feed |
| `[home] Failed to load season appointments ... AbortError` | 77 | home |
| `[teams] Failed to load teams ... AbortError` | 70 | `/teams`, `/fixtures` |
| `permission denied for table news/teams/events/sponsors/...` | about 60 | burst on 24 Sep 10:36-10:42 UTC only |
| `rate_limit_unavailable` (admin login, CMS media) | about 15 | `/api/admin/auth/login`, `/api/admin/media/upload` |

- The "permission denied" burst lasted about 6 minutes during a deployment on 24 Sep and has not recurred. It is consistent with a grants migration being applied before the matching code or policy was live.
- When the rate limiter itself times out, admin login and media upload fail closed. This is safe, but it means that when the database is slow, committee members are locked out.

### 2.2 Supabase
- Database size is 27 MB with 23 of 60 connections in use, so volume is small. The timeouts are not caused by data size.
- **Security advisor:**
  - WARN: *Leaked password protection disabled*. The club-services release note says this needs a paid Supabase plan.
  - INFO: 58 tables have RLS enabled with no policies. This is intentional deny-all (service-role only access), but it includes two leftover tables that should be removed: `public.asset_repoint_backup_20260923` (which also has no primary key) and `public.committee_users_test`.
- **Performance advisor:**
  - 54 foreign keys have no covering index.
  - 75 indexes have never been used. Do **not** drop unused indexes blindly: traffic is low and seasonal, so many simply have not been hit yet.
- **Migration history:** 156 migrations are applied and there are 156 files locally, but one version differs:
  - Local file: `supabase/migrations/20260923103500_remove_dino_initial_expiry.sql`
  - Production row: `20260923103604 remove_dino_initial_expiry`
  - `supabase/remote-migration-history.json` stops at `20260922105520`, so the eleven newest migrations are unrecorded.
- Migrations are being applied straight to production through the Supabase dashboard or MCP. The postgres log shows `apply sql from post body` and a timestamp-generated version. This is why local and remote versions drift.
- One postgres log error in 24 hours: `function public.allocate_payment_reference(text) does not exist`. The caller is not identified. Unverified whether this is a retired code path or a live bug.

### 2.3 Stripe (live)
- Two webhook endpoints are enabled:
  1. `https://www.ndcc.com.au/api/stripe/webhook`, which subscribes to the checkout session events (completed, async succeeded, async failed, expired) plus `charge.refunded` and five `charge.dispute.*` events. This matches the code.
  2. **"Grok automations"**, pointing at a third-party URL (`grok.com/...`) for `customer.subscription.created` and `customer.subscription.deleted`. It is not used by the website. **OWNER DECISION:** confirm that this was set up deliberately, or disable it.
- Recent sessions: 19 of the last 20 were `complete`/`paid` in AUD. One apparel balance session expired unpaid.
- Payment methods offered on most sessions: card, Link, **Klarna and Zip** (buy-now-pay-later). The code sets no `payment_method_types`, so the Stripe dashboard defaults apply. **OWNER DECISION:** confirm that the club wants buy-now-pay-later offered on raffle tickets, Dino Coach entries and donations. Klarna and Zip also add payment-status paths that the raffle webhook does not fully handle (see WP-02).

### 2.4 Resend
- Domain `ndcc.com.au` is verified, sending enabled, region ap-northeast-1. Open and click tracking are off, which is good for privacy.
- Webhook `https://www.ndcc.com.au/api/resend/webhook` is enabled for sent, delivered, delayed, bounced, complained, failed and suppressed events.
- Of the last 50 emails, 49 were delivered and 1 bounced. The bounce was a sign-up to a mistyped address (`.con` instead of `.com`), which justifies the email typo hint in WP-14.
- Supabase Auth emails ("Confirm Your Signup", "Reset Your Password") are also going through Resend SMTP successfully.

### 2.5 GitHub
- The `PR validation` workflow is green on the last four `main` commits.
- **A "pages build and deployment" workflow runs on every push to `main`**, which means GitHub Pages is enabled for this repository. **OWNER DECISION:** if nobody intends to publish the repository through GitHub Pages, turn it off (Settings -> Pages) so repository contents are not served publicly.
- Open PR #196 "Install Vercel Web Analytics" dates from 12 Sep. `@vercel/analytics` is already a dependency on `main`, so this PR looks superseded. Confirm and close it.
- There are no open issues.

---

## 3. Guardrails the implementer must preserve

These were verified as working well. Do not weaken them while making changes.

**Payments**
- Only the Stripe webhook marks anything as paid. The browser redirect never does.
- Amounts are always recomputed on the server.
- Settlement is idempotent through RPCs.
- Refunds and disputes that arrive early are stored and replayed.
- Ledger rows are reserved before Stripe is called.
- Idempotency keys come from canonical references.
- Card checkout needs all of these server settings: `PAYMENT_PROVIDER=stripe_checkout`, a key whose mode matches `PAYMENT_TEST_MODE`, and a webhook secret (`isCheckoutEnabled()` in `lib/payments/payment-config.ts`).
  - The CMS card switch (`card_checkout_enabled`) is checked only for orders, memberships, events and kitchen payments (`lib/payments/capabilities.ts`).
  - **It is not checked for raffle checkout** (`app/api/raffle/checkout/route.ts:42`) **or Dino Coach checkout** (`app/api/fantasy/checkout/route.ts:19`). Those routes call only `isCheckoutEnabled()`, so turning the CMS switch off does not stop them.
  - OWNER DECISION: should the CMS switch also control raffle and Dino Coach payments? If yes, add a strict check of the switch to both routes as part of WP-03. Do not describe the switch as covering every checkout until that change is made.

**Receipt outbox**
- Leased jobs, dead-lettering, Resend idempotency keys.
- Simulated sends are refused in production.

**Committee authentication**
- Random 32-byte tokens are stored only as SHA-256 hashes.
- 15-minute idle timeout.
- Role and active status are re-read on every request.
- An outage returns 503; it is not treated as "logged out".
- There is a last-admin guard.

**Request security**
- CSRF: an Origin allow-list plus `Sec-Fetch-Site` checks in `middleware.ts`. Production fails closed.
- A shared Postgres rate limiter that stores only hashed keys.
- Cron authentication uses a timing-safe bearer check and requires a secret of at least 16 characters.
- The Content-Security-Policy header is enforced (`next.config.mjs`).

**Database**
- All 57 SECURITY DEFINER functions have a `search_path` set, and none of them can be executed by `anon` or `authenticated`.

**UI**
- The skip link, visible focus styles, and the focus traps in the mobile menu and modals.
- Reduced-motion support and the marquee pause controls.
- The Acknowledgement of Country and its CMS override.
- Feature-visibility gating for raffles, Dino Coach and Cookie Dough.

**CMS**
- Draft autosave with a restore prompt, the unsaved-changes guard, the inactivity guard, and the alt-text requirement for news gallery images.

**Content**
- Sponsor names, logos, prices and contact details must stay exactly as they are.

---

## 4. Work packages: reliability, payments and security

### WP-01 (P0) Stop public pages degrading when Supabase is slow

**Problem**
- Hundreds of public page renders per week fall back to static content or show "temporarily unavailable" (section 2.1).
- The database is small and healthy, so the cause is latency between the Vercel functions and Supabase, or the app's own timeout budget.
- The root cause is **unverified**.

**Evidence**
- `lib/supabase-server.ts:9` sets `SUPABASE_FETCH_TIMEOUT_MS` to 1000 ms during build and 15000 ms at runtime.
- Public reads use `createPublicReadTimeoutFetch` together with `withPublicReadCache` (`lib/supabase-server.ts:47-101`), and `lib/server/timeout-fetch.ts` handles retry and abort.
- The error clusters named in section 2.1.

**Tasks**
1. Add structured timing logs for each public read: scope, table, elapsed ms, attempt number and outcome. Use one stable prefix such as `[public-read-timing]` so they can be counted in Vercel logs.
2. Make the site chrome snapshot (the `DegradedSnapshotError` in `unstable_cache`) and the publications list serve the last good cached value when the live read fails ("stale-while-error"). The current behaviour refuses to cache and throws.
3. Treat the list page and the detail pages differently:
   - **`/publications`** is `force-dynamic` (`app/publications/page.tsx:17-18`). Make it return its fallback UI instead of throwing `Publications temporarily unavailable` to the error boundary.
   - **`/publications/[slug]` and `/events/[id]`** are `force-static` ISR pages with `revalidate = 60`. **Keep them throwing on a failed read.** When a background regeneration throws, Next.js keeps serving the last good page. If they returned fallback UI instead, that regeneration would count as successful and a complete event or publication page would be replaced by the fallback.
   - For those two routes, only make sure a *first* render (nothing cached yet) shows a friendly error page instead of a raw error, using the route's `error.tsx`. Confirm the behaviour with a production build (`next build && next start`) and a simulated Supabase failure.
4. Deduplicate the reads on the home page: several sections query the same tables in one render. Fetch once per request with React `cache()`.
5. Check whether ISR pages trigger live reads during `next build` (the 1000 ms build timeout). If they do, make the build use the static fallback without logging errors.
6. **OWNER CHECK (Supabase dashboard):** record the compute size of the NDCC project. If it is the smallest tier, compare the timing logs before and after a one-step upgrade.

**Acceptance**
- Over 7 days, the Vercel runtime error clusters for AbortError on public routes fall by at least 80%.
- No public page renders an error boundary because of a Supabase read.
- `npm test` passes, including `test:public-read-cache` and `test:cms-reliability`.

**Rollback:** revert the PR. No schema change.

---

### WP-02 (P0) Release reverse-raffle number holds that can stay locked

**Problem**
- In `lib/payments/webhook/raffle.ts` (lines 27-42), a raffle order is cancelled only on `checkout.session.expired` with `payment_status === 'unpaid'`.
- Every other event type, including `checkout.session.async_payment_failed`, returns `{ pending: true }` and does nothing.
- No job sweeps stale `pending_payment` rows.
- If the expiry webhook fails or an async/buy-now-pay-later payment fails, the chosen numbers stay held forever and cannot be sold.

**Tasks**
1. Handle `checkout.session.async_payment_failed` for raffle orders with the same guarded update used for expiry (`status: 'cancelled'` only while the order is still `pending_payment`).
2. Add a sweep that runs well within an hour, not in a daily cron. Checkout creates a 35-minute Stripe session (`app/api/raffle/checkout/route.ts` around line 120) and tells buyers a hold clears in about 35 minutes, so a daily sweep would leave numbers blocked for up to 24 hours. Trigger it in three ways:
   - From `/api/raffle/checkout`.
   - From `/api/raffle/numbers`, but only after the response has been sent (use `after()` from `next/server`) so visitors never wait on Stripe. `app/reverse-raffle/ReverseRaffleClient.tsx:37` polls this route every 30 seconds for every open page.
   - From a 15-minute cron if the Vercel plan allows.

   Make the sweep claim its rows in the database so it never re-checks the same rows on every poll:
   - Add a nullable `sweep_checked_at` column to `raffle_orders` (additive migration).
   - Pick rows ordered by `sweep_checked_at NULLS FIRST`, skip any checked in the last 5 minutes, and use `FOR UPDATE SKIP LOCKED` (via an RPC) so concurrent runs don't collide.
   - Set `sweep_checked_at` on every row inspected, so older rows are always reached eventually.
   - Keep a per-run limit (for example 10 rows). The sweep finds `raffle_orders` rows in `pending_payment` for more than 40 minutes, retrieves each Stripe session, and cancels the order if the session is `expired` or its payment failed. Log a summary.
3. OWNER DECISION (see 2.3): set `payment_method_types: ['card']` for raffle checkout in `app/api/raffle/checkout/route.ts` if buy-now-pay-later is not wanted for raffles.
4. Add a test in the style of `scripts/test-reverse-raffle*.mjs` covering the async-failed and sweep paths.

**Acceptance:** tests prove that a held number is released on async failure and by the sweep, and that a paid order is never cancelled.

**Rollback:** revert the PR. No schema change is expected. If one is added, it must be additive only.

---

### WP-03 (P0) Enforce payment-method switches and bank-detail configuration on the server

**Problem**

The CMS setting `bank_transfer_enabled` is only exposed to the browser (`lib/payments/capabilities.ts`). The server does not enforce it:
- `app/api/orders/route.ts` (around line 43) accepts `payment_method === 'bank_transfer'` or `'stripe'` without checking the switches. `app/api/memberships/route.ts`, `app/api/events/route.ts` and `app/api/kitchen/orders/route.ts` behave the same way.
- A direct POST can still create bank-transfer orders after the committee turns bank transfer off.
- A `'stripe'` order created while card is off becomes an orphaned `pending_bank_transfer` order with no email.

Bank details also fall back to blanks:
- `lib/email.ts:281-283` renders `NDCC_BANK_ACCOUNT_NAME || 'NDCC'`, `NDCC_BANK_BSB || ''` and `NDCC_BANK_ACCOUNT_NUMBER || ''`.
- The JSON responses of the same four routes do the same.
- If the environment variables are missing, customers see a bank-details block with blank values. That is a visible placeholder, which AGENTS.md forbids.

**Tasks**
1. Add `isBankTransferConfigured()`, which returns true only when all three `NDCC_BANK_*` variables are non-empty.
2. Load the payment switches with a **strict** loader in each of the four routes.
   - The existing `loadMerchPaymentSettings` (`lib/payments/capabilities.ts:34-57`) is meant for public display. If the query fails or finds no row, it silently returns `DEFAULT_SETTINGS`, and that default has `bank_transfer_enabled: true`. A timeout could therefore re-enable a method the committee turned off.
   - Add `loadMerchPaymentSettingsStrict()`. It should throw or return an error on a query failure or a missing row.
   - In these mutation routes, answer 503 ("payments temporarily unavailable") when the strict load fails. Never fall back to the defaults.
   - Then apply `deriveCapabilities(...)` to the loaded row.
   - **`/api/orders`** is the only route that receives a `payment_method`. Reject `bank_transfer` with 400 when it is disabled or not configured, and reject `stripe` with 400 when card is not armed.
   - **Memberships, events and kitchen** (`app/api/memberships/route.ts`, `app/api/events/route.ts`, `app/api/kitchen/orders/route.ts`) receive no payment method. They create a pending order first; card checkout is then offered afterwards through `OrderPaymentOptions` and `/api/payments/checkout-session`.
     - Do **not** treat their `pending_bank_transfer` status as a bank-transfer choice. Doing so would reject every card-only order whenever bank transfer is switched off.
     - Allow order creation whenever at least one payment path is available (card armed, or bank transfer enabled and configured). Return 503 only when neither is available.
     - Include bank details in the response or email only when bank transfer is enabled and configured.
     - **Make the surrounding email copy match what is actually available, not just the details block.** For example, the kitchen confirmation email (`app/api/kitchen/orders/route.ts:139`) always says "pay securely by Stripe, or use the bank transfer details below".
       - Card only: mention only card payment.
       - Bank transfer only: mention only bank transfer.
       - Both: keep the current wording.
       - Check the membership and event emails for the same problem, and add a test for each case.
     - **Free events are exempt.** `app/api/events/route.ts` sets `isPaid = ticketPriceCents > 0` (around line 152). A zero-price event creates a `not_required` registration with no order. Run the settings load and capability check only when `isPaid` is true, so free registrations still work when payments are unavailable or the strict load fails.
3. Never render the bank-details block, in email or JSON, unless it is configured. Remove the `'NDCC'` default.
4. Tests for each rejection path.

**Acceptance:** with bank transfer disabled in the CMS, a direct POST returns 400 and creates no row. With the variables unset, no email contains an empty BSB or account number.

**Rollback:** revert the PR.

---

### WP-04 (P1) Make "admin-only" writes actually admin-only

**Problem**
- In `app/api/admin/resources/[resource]/route.ts`, `canWrite = isFullAccessRole(role) || config.writeRoles.includes(role)`.
- Configurations marked `writeRoles: ['admin']` can therefore also be written by every full-access role (`FULL_ACCESS_ROLES` in `lib/auth/config.ts`). These include `merchPaymentSettings` (the card checkout switch), `orders`, `eventRegistrations` (`payment_status`), `raffleOrders` (`status`), `kitchenOrders` (`payment_status`), `raffleCampaigns` (price) and `pageLinkCards`.
- Deletes and restores do enforce admin strictly, so the rules are inconsistent.

**OWNER DECISION:** which roles should be able to change payment switches and payment status?

**Tasks** (once decided)
1. Add an `adminOnlyWrite` flag that is checked before the full-access shortcut, or derive the resource roles from `lib/auth/permissions.ts` so there is one source of truth.
2. Move payment-state writes off the generic endpoint, **but only after a replacement exists**:
   - Event registrations have no dedicated payment route today. The "Mark Paid / Mark Unpaid" button in `app/admin/events/page.tsx` (around lines 221 and 381) PATCHes `payment_status` through `/api/admin/resources/eventRegistrations`.
   - First add a dedicated admin route for event-registration payments that records through the payment ledger, and point the button at it.
   - Only then remove `payment_status` (events and kitchen) and raffle `status` from the generic `allowedFields`.
   - Check every admin page that PATCHes these fields before removing them (`grep -rn "payment_status\|resources/raffleOrders" app/admin`).
3. Extend `test:admin-permissions` to cover these cases.

**Rollback:** revert the PR.

---

### WP-05 (P1) Record unmatched Stripe settlements instead of retrying forever

**Problem**
- The webhook handlers return 4xx/5xx for deterministic mismatches: amount, metadata contract or ledger. See `lib/payments/webhook/orders.ts`, `raffle.ts` and `dino.ts`.
- Stripe retries for about 3 days and then gives up. The money has been captured, but there is no ledger row and at most a `console.error`.

**Tasks**
1. Add a migration creating `stripe_unmatched_settlements` with these columns: event id (unique), session id, payment intent, amount, reason, `created_at` and `resolved_at`. Enable RLS with no policies (service-role only).
2. On a deterministic mismatch, insert a row and log `[stripe_settlement_unmatched]`. Keep the current non-2xx response until the resolution path in item 4 has shipped; only then switch to returning 200. Keep retryable failures (a database outage) on 5xx.
3. Show unresolved rows in the existing `/api/admin/payments/ambiguous` view. **This alone is not enough:** that route's POST only settles `imported_transactions` through `confirm_imported_order_payment`, so it cannot settle a Stripe row.
4. Build a resolution path **before** switching the webhook to return 200. Once the webhook answers 200, Stripe stops retrying, so without this path a captured payment would stay unapplied forever.
   - Add an admin-only "Reprocess" action, for staff to use after they have repaired the ledger row or the metadata.
     - **Do not replay the stored event.** The Stripe event's `data.object` is a frozen snapshot of the session, so replaying it would repeat the same mismatch even after staff fix the metadata.
     - Instead, retrieve the **current** Checkout Session from Stripe using the stored session id, re-verify that it is paid, its currency and its amount, and pass that live session to the same idempotent settlement function the webhook uses. Refactor the handlers so that function accepts a session, not only an event.
     - Set `resolved_at` when it succeeds.
   - Add a "Resolve as refunded or handled manually" action that records who resolved the row and why.
   - Test both actions, and test that reprocessing twice never settles a payment twice.
4. Wrap the dispatcher in `app/api/stripe/webhook/route.ts` in a top-level try/catch that logs `[stripe_webhook_error] {event.id, type}` and returns 500.

**Rollback:** revert the PR. The new table can stay because it is additive.

---

### WP-06 (P1) Receipt outbox: faster retries and staff alerts

**Problem**
- `/api/cron/payment-receipts` runs once a day (05:10 UTC). A Resend outage during the webhook's first attempt can delay raffle tickets and receipts by up to 24 hours.
- Dead letters are only logged (`app/api/cron/payment-receipts/route.ts:69-76`).

**Tasks**
1. OWNER CHECK: confirm the Vercel plan's cron limits. If allowed, change the schedule to every 15 minutes. If not, use a separately scheduled trigger, for example a free external scheduler or a GitHub Actions `schedule` workflow calling the cron URL with `CRON_SECRET`. Do **not** rely on running a batch at the end of the webhook handler: a job that has just failed is given a future retry time, so that batch cannot pick it up, and if no later webhook arrives the receipt still waits for the daily cron. (Unverified: the exact retry delay used by the receipt outbox; check it in `lib/payments/` before choosing an interval.)
2. When the dead-letter count increases, email the configured contact recipient using the existing `lib/email.ts` helpers, with a count and a link to the admin page. Do not include customer details.
3. Tests.

**Rollback:** revert `vercel.json` and the route change.

---

### WP-07 (P1) Migration history hygiene

**Problem**
- Production has `20260923103604_remove_dino_initial_expiry`, but the repo has `20260923103500_remove_dino_initial_expiry.sql`.
- `supabase/remote-migration-history.json` is three days and eleven migrations behind production.
- `scripts/check-migration-history.mjs` only requires new files to be newer than the newest *recorded* version, so an out-of-order migration can pass CI.

**Tasks**
1. Confirm the SQL in the local file matches what production applied. The production statements can be read from `supabase_migrations.schema_migrations.statements` for version `20260923103604`. If it matches, rename the local file to `20260923103604_remove_dino_initial_expiry.sql`.
   - **Repair the version history at the same time.** The migration is not safe to run twice: its `DO` block raises `Expected expiry gate missing` on a second application (line 16). Any local, preview or branch database that already recorded `20260923103500` would see `20260923103604` as unapplied, try to run it again, and fail.
   - Ship a short repair note, or `supabase migration repair` commands, that mark `20260923103500` as reverted and `20260923103604` as applied in those environments. Production already has the correct version and needs nothing.
   - Alternatively, make the `DO` block a no-op when the gate is already absent, so a re-run is harmless. That is an edit to an applied migration, so it is an OWNER DECISION; prefer the repair.
2. Regenerate `supabase/remote-migration-history.json` from production, with all 156 versions.
3. Make the check fail when:
   - a new local migration is older than the newest local migration already on `main`, or
   - production has migrations that the manifest does not record.

   `capturedAt` is normally later than the newest migration it records, so comparing the two can never catch a stale manifest. Detect it one of these ways instead:
   - **(a) Preferred:** a scheduled or manual GitHub Actions job, using a read-only database credential stored as a repository secret, that compares `supabase_migrations.schema_migrations` with the repository and fails on any difference.
   - **(b)** In the credential-free PR check, print a warning (not a failure) when the current date is more than 7 days after `capturedAt`. Do not make it fail, because the result would then depend on the calendar date and old branches would break.
4. Document the rule in AGENTS.md: "After applying a migration in production, update `remote-migration-history.json` in the same PR."
5. Wire `scripts/test-event-calendar-sync.sql`, which is currently never run, into `scripts/test-migration-replay.mjs`. Extend the unreferenced-test safety net in `scripts/run-all-tests.mjs` to cover `test-*.sql`.
6. Remove `continue-on-error: true` from `test:gallery-albums` in `.github/workflows/pr-validation.yml` once it passes on `main`.

**Rollback:** revert the PR. No production database change.

---

### WP-08 (P1) Database tidy-up (split into separate PRs)

This package is **not** one additive migration. Give ChatGPT each PR below as its own task:
- **PR A (low risk):** items 2 and 3, the revoke and the payment-table indexes, in one migration.
- **PR B (destructive):** item 1, dropping the leftover tables, in its own migration, after the export.
- **PR C (behaviour-sensitive):** item 4, the function `search_path` change.
- **PR D:** item 5, the expired-session purge.
- **PR E (repository only):** item 6, `schema.sql` and `seed.sql`.

**Tasks**
1. Drop the leftover tables `public.asset_repoint_backup_20260923` and `public.committee_users_test`.
   - OWNER CHECK: export them first if the backup is still wanted.
2. `REVOKE EXECUTE ON FUNCTION public.activate_club_season(...) FROM PUBLIC, anon, authenticated; GRANT ... TO service_role;`.
3. Add indexes for the unindexed foreign keys on the payment tables first:
   - `stripe_payment_events` (3 foreign keys)
   - `stripe_disputes` (3)
   - `stripe_dispute_balance_movements` (4)
   - `stripe_charge_refund_snapshots` (3)
   - `kitchen_orders.linked_order_id` and `kitchen_orders.user_id`

   Use `CREATE INDEX IF NOT EXISTS`.
4. Change the 11 older SECURITY DEFINER functions that use `search_path = public` to `search_path = ''` with fully qualified names. Examples: `acquire_fantasy_sync_lock`, `claim_apparel_balance_reminder` and the `ndcc_*committee*` functions.
   - This is a behaviour-sensitive change. Do it in its own PR and run the auth and fantasy tests.
5. Add a scheduled purge of expired `committee_sessions` (older than 1 day) to the keep-alive cron.
6. Regenerate or retire `supabase/schema.sql` and `supabase/seed.sql`. They describe 9 tables with obsolete insecure policies (`WITH CHECK (TRUE)`, `profiles.role`). Either regenerate with `npm run db:dump-schema` or move them to `docs/archive/`.

**Acceptance**
- The Supabase advisors no longer list the two leftover tables or the payment-table foreign keys.
- `test:migration-replay` passes.

**Rollback:** this package is **not** purely additive. Reverting the PR does not undo a migration that has already run, so every destructive item needs its own recovery path, written out before handover:
- **Item 1 (drop tables):** before the drop, export both tables, schema and data (for example `pg_dump -t public.asset_repoint_backup_20260923 -t public.committee_users_test`), and store the file outside the repository. To restore, re-import that file. Put this item in its own migration.
- **Item 2 (revoke):** the recovery migration re-grants the privileges that existed before. Record them first with `\dp` or `information_schema.routine_privileges`.
- **Item 3 (indexes):** additive. The recovery migration is `DROP INDEX IF EXISTS ...`.
- **Item 4 (function search_path):** before changing anything, save each current definition with `pg_get_functiondef()` in a companion rollback SQL file (for example `supabase/rollback/<version>_restore_function_search_path.sql`). The recovery migration re-creates the saved definitions.
- **Item 5 (session purge):** only expired sessions are deleted, so they can't be used again and nothing needs restoring. The recovery step is to remove the purge statement from the cron.
- **Item 6 (schema.sql/seed.sql):** these are repository files only, so reverting the PR restores them.

---

### WP-09 (P2) Smaller security hardening items

Each item is small. They can be grouped into one PR.

1. **Login throttling:** add a per-email ceiling (for example 30 attempts per hour) that delays rather than locks (`app/api/admin/auth/login/route.ts`).
2. **Password change:** check the error from the session delete after a password change or reset (`app/api/admin/auth/change-password/route.ts:66`, `app/api/admin/users/route.ts` around line 267). Return 503 if it fails.
3. **Auth outages:** tell Supabase Auth outages apart from invalid tokens. In `lib/fantasy-manager-auth.ts:54-56`, return 503 rather than 401 for network or 5xx errors.
4. **Club-account renames:** if an active member changes their `full_name`, send the record back to `pending` review (`app/api/club-account/route.ts`). Cash-sale permission depends on active status. OWNER DECISION.
5. **Resend webhook:** require `RESEND_WEBHOOK_SECRET` in production instead of reading it from the database on every request (`app/api/resend/webhook/route.ts:16-21`).
6. **Media upload tickets:** sign them with a new `MEDIA_UPLOAD_TICKET_SECRET` instead of `SUPABASE_SERVICE_ROLE_KEY` (`app/api/admin/media/upload/route.ts:25`). Add the variable to `.env.example`.
7. **Input guards:** use `readLimitedJsonObject` in the generic resource PATCH, and validate the UUID in `app/api/admin/memberships/directory/route.ts`.
8. **Client IP:** prefer `x-vercel-forwarded-for` or `x-real-ip` in `lib/server/request-guards.ts`.
9. **CSP:** remove the wildcard `https://*.supabase.co wss://*.supabase.co` from `connect-src` in `next.config.mjs` if only the project host is needed. Test uploads and auth afterwards.
10. **Lint coverage:** extend `eslint.config.mjs` to lint `middleware.ts`.
11. **Dead code:** the membership bank-transfer email is unreachable (`app/api/memberships/route.ts` around line 205: the branch runs only when `totalAmount === 0`, which is rejected earlier). Decide the intended behaviour. OWNER DECISION.
12. **Turnstile:** it is wired on the server but no form renders the widget. Either build the widget and verify `hostname`, or remove the unused `NEXT_PUBLIC_TURNSTILE_SITE_KEY` from `.env.example`. OWNER DECISION.
13. **Tooling pins:**
    - Add `"engines": { "node": "22.x || 24.x" }` to `package.json`. CI and Vercel use Node 24, and the local runtime here was Node 22.
    - Bump `@types/node`.
    - Pin `stripe` exactly, because `lib/stripe.ts:13` casts the API version.

**Rollback:** revert the PR.

---

## 5. Owner-only actions (dashboard settings, not code)

| # | Where | Action |
|---|---|---|
| O-1 | Stripe -> Developers -> Webhooks | Confirm or disable the "Grok automations" endpoint. |
| O-2 | Stripe -> Settings -> Payment methods | Decide whether Klarna and Zip should be offered for raffles, Dino Coach entries and donations. |
| O-3 | GitHub -> Settings -> Pages | Turn off GitHub Pages unless intentionally used. |
| O-4 | GitHub PR #196 | Close it if superseded by the analytics already on `main`. |
| O-5 | Supabase -> Authentication -> Password security | Enable leaked-password protection if the plan allows it. |
| O-6 | Supabase -> Settings -> Compute | Record the compute size for WP-01. |
| O-7 | Vercel -> Settings -> Environment Variables | Confirm `NDCC_BANK_*`, `RESEND_WEBHOOK_SECRET`, `CRON_SECRET`, `STRIPE_*`, `PAYMENT_PROVIDER` and `PAYMENT_TEST_MODE` are set for Production. They could not be listed here. |
| O-8 | Namecheap DNS | Not audited. Check that SPF, DKIM and DMARC records exist for `ndcc.com.au`. Resend reports the domain as verified, so SPF and DKIM are present. A DMARC policy (start with `p=none` plus reporting) is recommended if one is missing. Also confirm there are no stale records pointing at old hosts. |
| O-9 | Vercel / Supabase | Keep migration applies and code deploys in the same order every time: migration first, then code. The 24 Sep "permission denied" burst came from the reverse order. |

---

## 6. UI/UX programme

The owner's design direction:
- restrained, bespoke, Apple-inspired minimalism
- keep the club's real logo and approved colours (maroon `#800000`, sky `#ADD8E6`, gold `#D4A017`)
- no paintbrush effects, gothic type, generic decoration or invented content

Screenshots in this audit came from a local build with Supabase unreachable, so some findings concern fallback states.

Design system facts the implementer must know:
- **Font:** Inter only (`app/layout.tsx:30`).
- **Text sizes:** `tailwind.config.ts:12` overrides `text-xs` to 0.875rem and `text-sm` to 1rem, so they do **not** match Tailwind defaults.
- **Tokens:** semantic tokens exist in `app/globals.css:13-75` (`surface-*`, `content-*`, `edge-*`, `status-*`, `brand-*`), but TSX still hard-codes about 180 gray/slate utilities and about 490 raw colour utilities.
- **Layered overrides:** `app/globals.css` has two `@layer components` blocks, and the second (lines 478-524) overrides the first.
  - Button radius is 10px in the first block and 6px in the second. `components/ui/Button.tsx:23` still uses 10px.
  - `.page-hero` and `.band-maroon` are defined twice.

### WP-10 (P1) Fix visible defects on the home page
1. **Mobile hero gutter.**
   - `app/page.tsx:89`: `<section className="club-home-hero">` has no horizontal padding (`globals.css:480`), so the text touches the screen edge on phones.
   - Add `px-4 sm:px-6 lg:px-8`, matching `.section-padding`.
2. **Broken season sentence.**
   - `app/page.tsx:251-255` always appends "Facebook page." after the CMS body, which produces "...contact the club. Facebook page.".
   - Render it as its own sentence instead: "Updates are also posted on our [Facebook page]."
3. **Season CTA opens in a new tab.** The CTA at `app/page.tsx:258-262` always has `target="_blank"`, even for internal links like `/contact`. Only set `target` and `rel` for `http(s)://` URLs.
4. **Fallback copy mentions the CMS.** `lib/fallback-content.ts:27` and `:40` produce public text such as "Season information unavailable" and "...managed in the CMS...". Replace it with neutral club copy that already exists in the codebase (`SEASON_STATUS_DEFAULT_BODY`), and never mention the CMS publicly.
5. **Zero-value stats.** `components/home/HomeStatsStrip.tsx:18-27` can show "0 Teams across the club". Hide any stat whose value is 0 or unavailable, and hide the whole strip if fewer than 3 remain. Share the `GCA_START_YEAR` source with About (`app/about/page.tsx:61`) instead of hard-coding 1995.
6. **Duplicate sponsor CTAs.** Both `SponsorsMarquee.tsx:79` and `app/page.tsx:640` render "View all sponsors". Keep one.
7. **"Intro unavailable" caption.** `components/home/ClubIntro.tsx:142-153` overlaps a decorative chevron.
   - Remove the chevron (`:143-145`).
   - Replace `bg-[#dedede]` (`:111`) with `bg-surface-muted`.
   - When the video fails, show only the poster.
8. **Public "unavailable" copy.** `ProductCard.tsx:51-60` prints "Product image unavailable" publicly. Use a neutral `aria-hidden` block instead.

Acceptance: screenshots at 390px and 1440px, light and dark, show the gutter fixed and none of the defect text.

### WP-11 (P1) Calmer motion, in line with the design brief
1. Remove `TiltCard` from the news cards (`app/page.tsx:351-383`) and keep one hover cue: a 2px lift or a border colour change.
2. Remove the "DINOS" outline watermark and its `ParallaxLayer` (`HomeStatsStrip.tsx:11-15`, `globals.css:368-373`). Render the stats as static numbers.
3. Limit `ScrollReveal` to a simple fade with at most an 8px rise.
4. **Important for accessibility and SEO:**
   - `components/common/motion/ScrollReveal.tsx:113-115` server-renders `opacity:0`. Content, including the whole footer, is invisible until JavaScript runs and the element scrolls into view.
   - Apply the hidden state only after hydration, for example with a `data-ready` attribute set in `useEffect`.
   - Remove `ScrollReveal` from `components/layout/Footer.tsx:103` completely.
5. Delete the unused `components/common/motion/HeroParallax.tsx` and `MaskReveal.tsx`, plus any keyframes no longer referenced (confirm with `npm run check:unused`).

### WP-12 (P1) Logo, favicon and theme
1. **Logo.** The logo (`public/images/logo.jpg`, 1184x896, 367 KB) is shown in a `rounded-full` 48x36 box, which clips the shield corners (`Navbar.tsx:326-333, 541`, `Footer.tsx:107-113`, `not-found.tsx:8-14`).
   - Remove `rounded-full`.
   - Render at `h-11 w-auto`, keeping the 4:3 ratio.
2. **Favicon.** It is the same 367 KB non-square JPEG (`app/icon.jpg`). Generate `app/icon.png` (512x512) and `app/apple-icon.png` (180x180) **by cropping and resizing the supplied logo only**, with no new artwork, then remove `app/icon.jpg`.
3. **Social image.** Add a 1200x630 Open Graph image built from supplied club photography and the supplied logo, and reference it in the root metadata.
4. **Theme.** OWNER DECISION: `components/common/ThemeProvider.tsx:7` uses `defaultTheme="dark"`, so first-time visitors on a light-mode device get dark mode. The recommendation is `defaultTheme="system"`, so the white and maroon brand shows for most visitors.

### WP-13 (P2) Typography and heading consistency
1. **Headings.** Choose sentence case for all headings.
   - Remove the `uppercase tracking-wide` utilities from headings in `app/page.tsx` (lines 250, 344, 394, 436, 472), from `components/ui/Modal.tsx:361`, and from the "Raise Dough" feature.
   - Align `Button.tsx` to the 6px radius, then merge the two `@layer components` blocks in `globals.css` into one definition per class.
2. **Page titles.** Remove the duplicate " | NDCC" suffix from `app/pot-club/page.tsx:6`, `app/privacy/page.tsx:3` and `app/club-account/page.tsx:3`. The layout template already adds it, so browser tabs currently read "Pot Club | NDCC | NDCC Dinos".
3. **Pot Club hero.** Give Pot Club the standard `page-hero` used by its sibling pages.
4. **Heading order:**
   - event detail goes h1 -> h3 (`EventDetailClient.tsx:151`); change the h3 to h2
   - footer column headings should be h2
   - home news goes h3 -> h4; fix the order
5. **Eyebrows.** The eyebrow "Around the club" is used twice on the home page (`app/page.tsx:209, 493`). Give one of them a different label taken from the section's purpose.
6. **Admin login heading.** The admin login h1 is "NDCC". Change it to "Committee sign in".

### WP-14 (P2) Forms and feedback
1. **Contact form:**
   - Move focus to the success or error banner after submit (`ContactForm.tsx:56-88`).
   - Do not repeat the same sentence in the heading and the body.
   - Mark required fields consistently.
   - Add `autoComplete` attributes (name, email, tel).
   - Use `status-*` tokens so the banners work in dark mode.
2. **Checkout form.** Add an `aria-live` status region to `CheckoutForm.tsx`.
3. **Email typo hint.** On sign-up and checkout email fields, show a non-blocking hint for common domain typos such as `.con`, `gmial` or `hotmial` ("Did you mean ...com?"). This matches the real bounce seen in Resend.
4. **Input borders.** Raise input border contrast to at least 3:1 (WCAG 1.4.11): `--border-strong` is `#d1d5db` on white (1.47:1). Use roughly `#8a94a3` in light mode and `#6b7a99` in dark mode, or add a dedicated `--border-input` token.
5. **Admin feedback.** Create a shared `<AdminFeedback>` component with `role="status"` or `role="alert"`, modelled on `app/admin/season/registration/page.tsx:145-146`. Use it on the 18 admin pages that currently render plain `<p>` feedback (for example news, sponsors, events and calendar).
6. **Admin confirms.** Replace `window.confirm()` in `app/admin/kitchen/page.tsx:175,275`, `app/admin/orders/page.tsx:89,143` and `app/admin/apparel/page.tsx:233` with the existing Modal confirm pattern.

### WP-15 (P2) Accessibility clean-up
1. **Nested `<main>`.** Change the admin layout's `<main>` (`app/admin/layout.tsx:313`) to a `<div>`, because it sits inside the root `<main id="main-content">`. Add `aria-current="page"` to active admin navigation links.
2. **Alt text.** News cards currently use the article title as alt text (`app/page.tsx:355`, `app/news/page.tsx:76,116`). The images are real article photography from each post's `image_url`, so do **not** blank them: AGENTS.md requires meaningful alt text on every image.
   - Add an `image_alt` field for news through an additive migration, with an admin input that is required whenever an image is set.
   - Render `image_alt`, and fall back to the title only when `image_alt` is empty (the current behaviour).
   - Stop using `/images/Womens_Team.jpg` as the generic news fallback with the article title as its alt text. Use a neutral branded block instead.
3. **Event poster alt text.** Add an `image_alt` column for events and content blocks through an additive migration, with an admin field, so posters get real alt text. All key event details already appear as HTML text, which is correct; keep that.
4. **Decorative icons.** Add `aria-hidden="true"` to decorative icons in the footer (`Footer.tsx:121,127,133`) and the admin sidebar.
5. **Navbar:**
   - Remove `aria-haspopup="true"` from the disclosure buttons.
   - Remove the redundant `role="navigation"`.
   - Remove the `aria-label` that replaces the visible "Register" text (`Navbar.tsx:497-501`).
   - Delete the dead `const transparent = false` branches (`Navbar.tsx:278`).
6. **Loading skeleton.** `RouteSkeleton.tsx:8` needs a `sr-only` "Loading..." text and a hero-shaped first block, so the layout does not jump.
7. **Automated check.** Add an axe-core check (for example `@axe-core/playwright`) to the smoke tests from WP-18 for the main public routes.

### WP-16 (P2) Navigation and home-page structure
1. **Operator links.** Move "Record cash sales", an operator task, out of the public Raffles menu (`Navbar.tsx:31`) and into the club-account area or admin.
2. **Top-level groups.** Reduce the nine top-level groups (currently `text-[13px] px-[5px]` at `lg`) to about seven, for example by merging Raffles into Shop. OWNER DECISION on grouping.
3. **Home page.** The home page has about 12 stacked bands, and the Join/Volunteer/Contact CTAs repeat in the hero, the Juniors band, the navbar and the footer.
   - Reduce the Juniors band to one primary action plus a text link.
   - Give the Juniors band a light surface so it does not merge with the maroon footer.

### WP-17 (P3) Admin shell separated from public chrome
- The admin area currently renders inside the public navbar, the Acknowledgement and the footer (`app/layout.tsx:121-126`). This forces workarounds such as `lg:top-28` (`app/admin/layout.tsx:234`), and the sticky mobile admin header can sit under the fixed public navbar.
- Introduce route groups, `app/(public)/layout.tsx` and `app/admin/layout.tsx`, so admin pages get a minimal shell.
- This moves files, so do it as its own PR and confirm with `npm run smoke` and the route tests that every URL is unchanged.
- Also:
  - add an active state to the mobile admin navigation
  - add a "no results" message to the admin search
  - replace the bare "Loading..." / "Redirecting..." text with a skeleton

### WP-18 (P2) Images and performance
1. Recompress the public images larger than 300 KB. The existing `scripts/optimise-public-images.mjs` covers only part of this list:
   - It converts only PNG/JPEG to WebP. It does not recompress existing WebP files.
   - It skips `/downloads/`.
   - It deliberately keeps `/images/logo.jpg` and `/images/reverse-raffle-logo.png`, because receipt and raffle-ticket PDFs embed them. **Do not convert or rename these two files.**

   So:
   - Run the script for the PNG/JPEG images.
   - Extend it (or add a companion script) to recompress existing WebP files with `sharp`, at the same quality setting.
     - **Make it idempotent.** Record each processed file's output hash in a committed manifest (for example `scripts/optimised-webp-manifest.json`). Skip any file whose current hash matches its recorded output. Without this, every later run would lossy-encode the same photos again and degrade them.
     - Keep a result only if it is meaningfully smaller than the original (for example at least 10% smaller). Otherwise leave the file untouched and still record it in the manifest.
     - Add a test that runs the script twice and asserts that the second run changes nothing.
   - Leave `/downloads/` files in their published format. Recompressing the Club Song PNG losslessly is optional.
   - Handle the logo only through the new favicon and OG files in WP-12.

   The images, largest first:
   - `images/events/2026/dino-lotto-2026.webp` (1.0 MB)
   - `Turf.jpg` (848 KB)
   - `division-4-first-xi-premiers-2025-26.webp` (775 KB)
   - `Womens_Teams_2.jpg` (748 KB)
   - the Club Song PNG download (737 KB)
   - `apparel-sponsorship-2026-27.webp` (722 KB)
   - `logo.jpg` (367 KB): do not convert (PDF dependency, see above); addressed through WP-12
   - player portraits between 360 and 555 KB

   Keep the old URLs working through `lib/asset-redirects.json`.
2. Use plain `next/image` rather than the client-side `SafeImage` for local static assets.
3. Replace the gray/slate skeleton colours with `bg-surface-muted` (75 places).
4. Add a small Playwright smoke job to CI that runs `next start` and visits the main routes at 390px and 1440px. Build on `scripts/smoke-routes.mjs`, and assert no console errors and no visible "unavailable" text when fixtures are provided.

---

## 7. Code health and documentation

### WP-19 (P3) Code health
1. Generate `lib/database.types.ts` (`npm run db:generate-types`) and type the Supabase clients in `lib/supabase-server.ts` and `lib/supabase.ts`. Fix the resulting type errors in small PRs.
2. Reduce the approximately 138 uses of `any`. The main hotspots are `app/admin/fantasy/seasons/page.tsx` (30), `app/admin/fantasy/managers/page.tsx` (16) and `app/fantasy/_components/TransfersClient.tsx` (10).
3. Clean up the knip findings:
   - 5 unused files, 88 unused exports and 3 duplicate exports
   - the unlisted `postcss-load-config` dependency
   - the unused constants in `lib/constants.ts`

   Confirm each item before deleting it.
4. Plan to consolidate the two fantasy stacks: the old `lib/fantasy*.ts` files and the new `lib/dino-coach/`. Group the flat raffle, kitchen and public-data files under folders. Refactor only, with no behaviour change, and do it in separate PRs.
5. Split the largest files when they are next touched:
   - `app/page.tsx` (816 lines)
   - `components/admin/gallery/BulkUploadPanel.tsx` (800)
   - `app/api/payments/checkout-session/route.ts` (734)
   - `app/api/admin/resources/[resource]/route.ts` (671 lines, 43 KB)

### WP-20 (P3) Documentation
1. **README.md corrections:**
   - The CSP is enforced, not report-only (lines around 598 and 765).
   - `validate` requires all five jobs (around line 701).
   - React is 19, not 18 (around line 78).
   - Add `gallery-metadata` to the cron table (around lines 713-720).
2. **New README feature sections.** Add a short section for each of these, with its routes and library folder (use the inventory in section 8): reverse raffle, Pot Club, club accounts, trailer cash sales, donations, Cookie Dough and Dino Coach.
3. **Archive stale docs.** Move `docs/Architecture_Migration_Plan_Rev01.md` (it says Next.js 14 and GitHub media) to `docs/archive/`.
4. **New runbooks.** Add these to `docs/operations/`: payments and Stripe incidents, raffle and cash sales, and Dino Coach operations.
5. **Environment variables.** Document the legacy aliases `PLAYHQ_ORG_ID`, `PLAYHQ_TENANT_ID`, `PLAYHQ_TENANT_SHORT_NAME`, `FONTCONFIG_FILE` and `FONTCONFIG_PATH` in `.env.example`. Mark the `SUPABASE_AUTH_SMTP_*` entries as "Supabase dashboard only, not read by the app".
6. **AGENTS.md additions:**
   - The migration-history rule from WP-07.
   - Database tests need PostgreSQL (`PGHOST`).
   - Add a release note under `docs/releases/` for each release.

---

## 8. Feature inventory (for orientation)

| Feature | Public routes | Admin routes | Main code |
|---|---|---|---|
| CMS pages and navigation | `/`, `/about`, `/facilities`, `/join` | `/admin/content`, `/admin/site-pages`, `/admin/club-settings` | `lib/public-data.ts`, `lib/fallback-content.ts`, `app/api/admin/resources/[resource]` |
| News and publications | `/news`, `/publications`, `/newsletters`, `/match-reports` | `/admin/news`, `/admin/publications` | `lib/public-news.ts`, `lib/public-publications.ts` |
| Apparel shop | `/merchandise`, `/pay-balance` | `/admin/apparel`, `/admin/orders` | `lib/apparel/`, `lib/orders/`, cron `apparel-reminders` |
| Payments and receipts | `/payment` | `/admin/payments` | `lib/payments/`, `app/api/stripe`, `app/api/payments`, cron `payment-receipts` |
| Kitchen orders | `/kitchen` | `/admin/kitchen` | `lib/public-kitchen.ts`, `lib/meal-collection.ts` |
| Raffle and cash sales | `/raffle` | `/admin/raffle`, `/admin/raffle/cash` | `lib/raffle-*.ts`, `app/api/raffle/*` |
| Reverse raffle | `/reverse-raffle` | via raffle admin | `lib/reverse-raffle-*.ts` |
| Pot Club and club accounts | `/pot-club`, `/club-account` | `/admin/memberships/directory` | `lib/club-members.ts`, `app/api/club-account` |
| Dino Coach (fantasy) | `/fantasy/*` | `/admin/fantasy/*` | `lib/dino-coach/`, `lib/fantasy*.ts`, crons `dino-pricing`, `dino-registration`, `playhq-fantasy-sync` |
| PlayHQ, fixtures, teams | `/fixtures`, `/teams` | `/admin/teams`, `/admin/playhq-diagnostics` | `lib/playhq/` |
| Calendar | `/calendar`, `/committee-calendar` | `/admin/calendar` | `lib/calendar/` |
| Events | `/events` | `/admin/events` | `app/api/events` |
| Gallery | `/gallery` | `/admin/gallery` | `lib/gallery/`, cron `gallery-metadata` |
| Sponsors | `/sponsors`, `/player-sponsors` | `/admin/sponsors` | `lib/sponsor-*.ts` |
| Player registration | `/player-registration` | `/admin/season/registration` | `lib/player-registration.ts` |
| Volunteers | `/volunteer` | `/admin/volunteers` | `app/api/volunteers` |
| Meeting minutes | `/committee/minutes` | `/admin/minutes` | `lib/meeting-minute-files.ts` |
| Fundraising and donations | `/fundraising/cookie-dough` | none | `lib/cookie-dough.ts`, `app/api/donations` |
| Committee authentication | `/admin/login` | `/admin/users` | `lib/auth/`, `middleware.ts` |

**Cron jobs** (`vercel.json`, times in UTC):

| Cron | Schedule | What it does |
|---|---|---|
| `keep-alive` | 05:00 | Keep-alive ping; also retries Dino Coach feedback emails |
| `payment-receipts` | 05:10 | Processes the receipt outbox and retries Dino registration emails |
| `gallery-metadata` | 05:20 | Strips EXIF metadata from gallery images |
| `apparel-reminders` | 10:00 | Sends apparel balance reminders |
| `playhq-fantasy-sync` | 16:30 | Runs the PlayHQ sync for Dino Coach |
| `dino-registration` | 22:00 | Sends Dino Coach notifications |
| `dino-pricing` | 23:05 | Settles Dino Coach player prices |

---

## 9. Validation baseline at the time of this audit

These are the results of the audit's own runs on `2624dd7`, before any changes (Node v22.22.2 locally; CI uses Node 24):

| Command | Result |
|---|---|
| `npm ci` | exit 0 |
| `npm test` | 111/111 test scripts passed, exit 0 |
| `npm run lint` | exit 0, no findings (but see WP-09 item 10: `middleware.ts` is not linted) |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0. It logs expected "Supabase server client configuration is incomplete" messages because no secrets were available |
| `node scripts/check-migration-history.mjs` | passed, but see WP-07 for the gaps it misses |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npx knip` | 5 unused files, 88 unused exports, 38 unused types, 3 duplicate exports, 1 unlisted dependency |
| GitHub `PR validation` on `main` | success on the last 4 commits |

A PR that implements any work package must leave these results no worse and report its own results in the same format.

---

## 10. Suggested order

1. **Week 1 (P0):** WP-01, WP-02, WP-03, plus owner actions O-1, O-2, O-3, O-7 and O-9.
2. **Week 2 (P1):** WP-04, WP-05, WP-06, WP-07, WP-08, WP-10, WP-11 and WP-12.
3. **Then (P2):** WP-09 and WP-13 to WP-16, then WP-18.
4. **Later (P3):** WP-17, WP-19 and WP-20.

Every item is a separate PR. Roll back any PR by reverting its merge commit. Most migrations in this plan are additive. WP-08 contains destructive changes, and its own Rollback section gives the recovery steps for each one.
