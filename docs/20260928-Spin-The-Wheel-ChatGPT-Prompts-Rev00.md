# Spin the Wheel - ChatGPT Prompts (Rev00)

Prepared: 28 September 2026 (Australia/Melbourne)
Use with: `20260928-Spin-The-Wheel-Implementation-Rev00.md`

How to use:

- **One go**: paste Prompt 1 and attach or paste the implementation document after it.
- **In phases** (recommended for review): send Prompt 1 first, then Prompts 2 to 6 one at a time, each after the previous phase passes its checks.

---

## Prompt 1 - Master prompt (full implementation)

```text
You are working in the GitHub repository sajeevanveeriah/ndcc-website (Newcomb and District Cricket Club website): Next.js 15 App Router, React 19, TypeScript, Tailwind, Supabase (Postgres + RLS), Stripe Checkout, Resend email, deployed on Vercel.

Task: implement the new "Spin the Wheel" feature exactly as described in the attached implementation document "20260928-Spin-The-Wheel-Implementation-Rev00.md". Implement all of it now: database migration, server library, public and admin API routes, Stripe webhook branch, public page, admin pages, navigation/sitemap visibility, emails and tests. Do not cut scope and do not add extra restrictions beyond the document; compliance and wording review happens later.

Before writing code:
1. Read AGENTS.md and follow it.
2. Read these existing files and copy their patterns instead of inventing new ones:
   - lib/prize-wheel/random.ts, lib/prize-wheel/wheel-geometry.ts, lib/prize-wheel/server.ts, lib/prize-wheel/rules.ts
   - app/admin/raffle/wheel/[id]/draw/page.tsx (wheel SVG, spin animation, reduced motion)
   - app/prize-wheel/page.tsx and app/prize-wheel/PrizeWheelClient.tsx (public page structure)
   - app/admin/raffle/wheel/WheelCampaignManager.tsx and app/admin/raffle/wheel/[id]/page.tsx (admin UI)
   - app/api/admin/raffle/wheel/[id]/draw/route.ts (admin route, rate limit, RPC call)
   - app/api/raffle/checkout/route.ts and app/api/stripe/webhook/route.ts (Stripe)
   - app/api/raffle/cash/route.ts (signed-in club account via getAuthUserFromRequest)
   - lib/auth/guard.ts, lib/auth/permissions.ts, lib/server/request-guards.ts, lib/order-input-validation.ts
   - lib/server/nav-visibility.ts, components/layout/Navbar.tsx, components/layout/Footer.tsx, lib/server/sitemap-entries.ts, lib/server/revalidate-public.ts
   - lib/email-html.ts, lib/prize-wheel/winner-email.ts, lib/payments/receipt-delivery*
   - lib/admin-audit.ts, lib/revisions/
   - scripts/run-all-tests.mjs, scripts/test-prize-wheel.mjs
   - supabase/migrations/20260927100000_prize_wheel_small_raffle.sql
3. Do not modify the existing Prize Wheel raffle feature (lib/prize-wheel, app/prize-wheel, app/admin/raffle/wheel, their API routes and migration) except to import its helpers.

Hard rules:
- The spin result is chosen on the server with node:crypto randomInt (weighted by segment weight, excluding zero weight and out-of-stock segments) and stored through a single atomic security-definer RPC BEFORE the browser animates. The animation is presentation only.
- Stock can never go negative and an entitlement can be used only once, even under parallel requests (row locks inside the RPC).
- Public API responses never expose segment weights or stock counts.
- Guest spin pass tokens are stored only as SHA-256 hashes.
- All new tables have RLS enabled; access only through server routes using the service role client.
- Existing public, admin, API, payment, order, CMS and media behaviour must stay exactly as it is. The Stripe webhook change is a new branch keyed on metadata.kind === 'spin_wheel'; existing branches are untouched.
- Prize details appear as accessible HTML text, not only in the wheel graphic. Respect prefers-reduced-motion. Keyboard operable. aria-live result announcement.
- No new image assets. Use the club palette listed in the document.
- UK English in all UI text. No em or en dashes; use ASCII hyphens.
- Do not invent club facts (names, phone numbers, emails, prices, prizes, URLs). Everything wheel-specific is entered by committee users in the admin screens.
- No visible placeholder text.
- Include the rollback SQL as a comment block at the top of the migration.

Tests: add scripts/test-spin-wheel.mjs covering every item in section 11 of the document and register it in package.json as "test:spin-wheel".

Validation (must all pass before you say you are done):
  npm ci
  npm test
  npm run lint
  npx tsc --noEmit
  npm run build

Deliverable: one pull request (or one patch) with a summary that lists every file added or changed, the exact output result of each validation command, any decision you had to make that the document left open, and the rollback path. If any check fails, fix it and rerun; do not report success on a failing check.
```

---

## Prompt 2 - Phase 1: database

```text
Phase 1 of Spin the Wheel (see the implementation document, section 4 and section 13).

Create supabase/migrations/<timestamp>_spin_the_wheel.sql with a timestamp later than the newest file in supabase/migrations. Include:
- tables spin_wheels, spin_wheel_segments, spin_wheel_passes, spin_wheel_orders, spin_wheel_entitlements, spin_wheel_results with the columns and checks in the document
- the listed indexes
- RLS enabled on every table, no anon or authenticated policies
- functions record_spin_wheel_result(...) and ensure_spin_wheel_free_entitlements(...), security definer, set search_path = public, execute revoked from public/anon/authenticated and granted to service_role only
- the rollback SQL as a comment block at the top
Match the style of supabase/migrations/20260927100000_prize_wheel_small_raffle.sql. The migration must apply cleanly after all existing migrations (scripts/test-migration-replay.mjs replays them in order).
Then run npm run check:migrations and npm test and report exact results.
```

## Prompt 3 - Phase 2: server library and API

```text
Phase 2 of Spin the Wheel (document sections 5, 6 and 10).

Create lib/spin-wheel/rules.ts, random.ts, reference.ts, pass.ts, server.ts, geometry.ts and the email helpers. Then create the public routes under app/api/spin-wheel/ (GET wheel, GET balance, POST spin, POST checkout, GET checkout/status, GET results) and the admin routes under app/api/admin/spin-wheel/ (list/create, read/update/delete, grant, results with CSV, mark claimed/void). Add the metadata.kind === 'spin_wheel' branch to app/api/stripe/webhook/route.ts without changing any existing branch.

Reuse: requirePermissionResult('raffle'), getAuthUserFromRequest, enforceRateLimit, readLimitedJsonObject, escapeEmailHtml, the receipt delivery outbox, the admin audit helpers, revalidatePublicContent, and the admin CSRF pattern used by existing /api/admin mutations. All responses use Cache-Control: private, no-store. The spin route retries up to 3 times on segment_out_of_stock. A failed email never fails a spin.
Run npm run lint, npx tsc --noEmit and npm test and report exact results.
```

## Prompt 4 - Phase 3: public page

```text
Phase 3 of Spin the Wheel (document sections 3.1, 3.2, 7 and 9).

Create app/spin-the-wheel/page.tsx (server, force-dynamic, notFound when no public wheel, pageMetadata only when public) and app/spin-the-wheel/SpinWheelClient.tsx plus any components in components/spin-wheel/. Build the SVG wheel with wheelSegments() and rotationForNumber() from the existing prize wheel geometry. Spin flow: call POST /api/spin-wheel/spin, then animate to the returned segment (6 s ease-out, no animation under prefers-reduced-motion), then announce the result in an aria-live region. Show spins left, prize list as HTML, buy spins form (only when a price is set), my results, sign-in prompt for free spins. Handle the ?pass= link (move to sessionStorage, strip from URL, send as X-Spin-Pass) and ?payment=success|cancelled.

Add spinWheelPublic (optional boolean) to lib/server/nav-visibility.ts, the "Spin the Wheel" link in the Raffles group in components/layout/Navbar.tsx, the matching Footer filter, and the sitemap entry while public.
Run npm run lint, npx tsc --noEmit, npm test and npm run build and report exact results.
```

## Prompt 5 - Phase 4: admin

```text
Phase 4 of Spin the Wheel (document sections 3.3 and 8).

Create app/admin/spin-wheel/page.tsx (list, create, duplicate, archive), app/admin/spin-wheel/[id]/page.tsx (wheel settings and segments editor with reorder, live odds, total weight, stock warning, preview modal with a test spin that records nothing) and app/admin/spin-wheel/[id]/results/page.tsx (filters, CSV export, mark claimed, void with reason, grant spins to an email). Use adminFetch, parseApiResponse, Button and Input as the existing wheel admin pages do. Date inputs are Melbourne time, stored UTC. Add the admin navigation link for users with the raffle permission.
Run npm run lint, npx tsc --noEmit, npm test and npm run build and report exact results.
```

## Prompt 6 - Phase 5: tests, validation and PR

```text
Phase 5 of Spin the Wheel (document sections 11 to 14).

Add scripts/test-spin-wheel.mjs covering every item in section 11 and register "test:spin-wheel" in package.json. Then run, in order:
  npm ci
  npm test
  npm run lint
  npx tsc --noEmit
  npm run build
Fix every failure and rerun until all pass. Then walk the acceptance checklist in section 14 and mark each item as verified (with how) or not verified (with why). Open one pull request whose description lists files changed, exact validation results, the acceptance checklist status, open decisions, and the rollback path from section 13.
```
