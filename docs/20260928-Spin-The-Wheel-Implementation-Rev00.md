# Spin the Wheel - Implementation Instructions (Rev00)

Prepared: 28 September 2026 (Australia/Melbourne)
Repository: `sajeevanveeriah/ndcc-website` (Next.js 15 App Router, React 19, Supabase, Stripe, Vercel)
Owner: Saj

## 1. What this is

An online **Spin the Wheel** feature for the club website. A visitor or club member opens the page, presses Spin, the wheel animates, and lands on a segment that shows what they won (or "Try again"). Committee users build wheels in the admin area: segments, prizes, odds (weights), prize stock, free spins and paid spins.

This is a **new, separate feature**. It does not replace or change the existing **Dinos Prize Wheel** small raffle (live clubroom draw), which already lives in:

- `lib/prize-wheel/*`
- `app/prize-wheel/*`
- `app/admin/raffle/wheel/*`
- `app/api/admin/raffle/wheel/*`, `app/api/raffle/wheel/numbers/route.ts`
- `supabase/migrations/20260927100000_prize_wheel_small_raffle.sql`

Leave all of those untouched. Reuse their helpers where stated below (import, do not copy-edit).

Scope decision (Saj, 28 September 2026): implement the full feature now without extra restrictions; policy, wording and compliance review happen afterwards.

## 2. Names and routes

| Item | Value |
|---|---|
| Feature name in UI | Spin the Wheel |
| Public page | `/spin-the-wheel` |
| Admin list | `/admin/spin-wheel` |
| Admin editor | `/admin/spin-wheel/[id]` |
| Admin results | `/admin/spin-wheel/[id]/results` |
| Public API | `/api/spin-wheel/*` |
| Admin API | `/api/admin/spin-wheel/*` |
| Library folder | `lib/spin-wheel/` |
| Components | `components/spin-wheel/` |
| Table prefix | `spin_wheel_` |
| Admin permission | reuse existing `raffle` permission key (`lib/auth/permissions.ts`) |

## 3. User flows

### 3.1 Visitor or member

1. Opens `/spin-the-wheel`. Sees the active wheel, its segments, the prize list (as HTML text, not only in the graphic), spins remaining, and the Spin button.
2. Spin sources:
   - **Free spins**: signed-in club account gets `free_spins_per_account` spins per wheel (admin setting, can be 0).
   - **Paid spins**: anyone (signed in or guest) buys N spins through Stripe Checkout at `spin_price_cents` each (admin setting; null = paid spins off).
   - **Admin-granted spins**: committee grants spins to an email address.
3. Presses Spin. Browser calls `POST /api/spin-wheel/spin`. The **server** picks the result, stores it, and returns it. The browser then animates the wheel to that stored segment.
4. Result panel shows the segment label and prize text, plus a result reference (for example `SPIN-7K3Q9D`). Winners are told how to claim (admin-configured `claim_instructions` text).
5. Result email is sent for winning spins (Resend, reuse existing email helpers).

### 3.2 Guest paid spins

1. Guest enters name and email and quantity, pays via Stripe.
2. Stripe webhook creates the entitlements and a **spin pass**: a random 32-byte token, stored only as a SHA-256 hash.
3. The token is emailed as a link `/spin-the-wheel?pass=<token>` (the plain token exists only in memory during the webhook and in that email). The page moves the token from the URL into `sessionStorage`, removes it from the address bar with `history.replaceState`, and sends it as the `X-Spin-Pass` header on spin requests. Signed-in buyers get the spins on their account and need no pass.

### 3.3 Committee

1. `/admin/spin-wheel`: list wheels, create, duplicate, archive.
2. Editor: name, slug, description, status (`draft`, `live`, `paused`, `ended`), start and end time (Melbourne time input, stored UTC), free spins per account, spin price, max paid spins per order, claim instructions, public visibility (reuse `hidden` / `scheduled` / `visible` pattern from raffles).
3. Segments editor: add, remove, reorder; per segment label, prize name, prize description, weight (integer >= 0), stock (integer or blank = unlimited), `is_prize` flag, colour choice from club palette.
4. Live odds preview: shows each segment's probability = weight / sum of in-stock weights.
5. Results: filterable table (wheel, date range, winners only, unclaimed), mark claimed, void result, CSV export, grant spins to an email.

## 4. Data model (new migration)

Create `supabase/migrations/<YYYYMMDDHHMMSS>_spin_the_wheel.sql` with a timestamp later than the newest existing migration. Idempotent where the repo's other migrations are; RLS enabled on every table; no public direct-table access (all access through server routes using the service role client `createServerClient()`).

```sql
create table public.spin_wheels (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name text not null check (char_length(name) between 2 and 120),
  description text check (char_length(description) <= 2000),
  status text not null default 'draft' check (status in ('draft','live','paused','ended')),
  starts_at timestamptz,
  ends_at timestamptz,
  free_spins_per_account integer not null default 0 check (free_spins_per_account between 0 and 100),
  spin_price_cents integer check (spin_price_cents is null or spin_price_cents between 50 and 100000),
  max_spins_per_order integer not null default 20 check (max_spins_per_order between 1 and 100),
  claim_instructions text check (char_length(claim_instructions) <= 2000),
  public_visibility_mode text not null default 'hidden' check (public_visibility_mode in ('hidden','scheduled','visible')),
  public_opens_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table public.spin_wheel_segments (
  id uuid primary key default gen_random_uuid(),
  wheel_id uuid not null references public.spin_wheels(id) on delete cascade,
  position integer not null check (position between 1 and 48),
  label text not null check (char_length(label) between 1 and 40),
  prize_name text check (char_length(prize_name) <= 120),
  prize_description text check (char_length(prize_description) <= 500),
  is_prize boolean not null default false,
  weight integer not null default 1 check (weight between 0 and 1000000),
  stock integer check (stock is null or stock >= 0),
  colour text not null default 'maroon' check (colour in ('maroon','navy','blue','gold','cream')),
  unique (wheel_id, position)
);

create table public.spin_wheel_passes (
  id uuid primary key default gen_random_uuid(),
  wheel_id uuid not null references public.spin_wheels(id) on delete cascade,
  token_hash text not null unique,
  email text not null,
  name text,
  created_at timestamptz not null default now()
);

create table public.spin_wheel_orders (
  id uuid primary key default gen_random_uuid(),
  wheel_id uuid not null references public.spin_wheels(id),
  auth_user_id uuid,
  customer_name text not null,
  customer_email text not null,
  quantity integer not null check (quantity between 1 and 100),
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'pending' check (status in ('pending','paid','cancelled','refunded')),
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  pass_id uuid references public.spin_wheel_passes(id),
  payment_reference text not null unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table public.spin_wheel_entitlements (
  id uuid primary key default gen_random_uuid(),
  wheel_id uuid not null references public.spin_wheels(id) on delete cascade,
  auth_user_id uuid,
  pass_id uuid references public.spin_wheel_passes(id) on delete cascade,
  source text not null check (source in ('free','purchase','admin_grant')),
  order_id uuid references public.spin_wheel_orders(id),
  granted_by uuid,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (auth_user_id is not null or pass_id is not null)
);

create table public.spin_wheel_results (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  wheel_id uuid not null references public.spin_wheels(id),
  entitlement_id uuid not null unique references public.spin_wheel_entitlements(id),
  segment_id uuid not null references public.spin_wheel_segments(id),
  segment_position integer not null,
  segment_label text not null,
  prize_name text,
  is_prize boolean not null,
  random_source text not null,
  auth_user_id uuid,
  pass_id uuid,
  claimed_at timestamptz,
  claimed_by uuid,
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  created_at timestamptz not null default now()
);
```

Indexes: `spin_wheel_entitlements (wheel_id, auth_user_id) where used_at is null`, same for `pass_id`, `spin_wheel_results (wheel_id, created_at desc)`.

### 4.1 Atomic spin RPC

`public.record_spin_wheel_result(target_wheel uuid, target_segment uuid, actor_user uuid, actor_pass uuid, random_source text, result_reference text) returns jsonb`, `security definer`, `set search_path = public`, execute granted to `service_role` only. In one transaction:

1. Lock the wheel row; fail unless `status = 'live'` and now is inside `starts_at` / `ends_at`.
2. Lock and pick one unused entitlement for this user or pass (`for update skip locked`, oldest first); fail with `no_spins_left` if none.
3. Lock the segment; fail with `segment_out_of_stock` if `stock = 0`; decrement stock when not null.
4. Mark the entitlement used, insert the result row (snapshot label, prize name, is_prize), return the result as JSON.

### 4.2 Free spin top-up RPC

`public.ensure_spin_wheel_free_entitlements(target_wheel uuid, target_user uuid)`: inserts `free` entitlements so the account has exactly `free_spins_per_account` free entitlements for that wheel in total (used + unused). Called before reading balance or spinning.

## 5. Server library (`lib/spin-wheel/`)

| File | Contents |
|---|---|
| `rules.ts` | Types, constants, validation of wheel and segment input (mirror DB checks), `wheelIsSpinnable(wheel, now)`, `segmentProbabilities(segments)`, formatting helpers. Client safe. |
| `random.ts` | `pickWeightedSegment(segments, source = randomInt)`: filter `weight > 0` and (`stock` null or > 0); total weight; `node:crypto.randomInt(0, total)`; walk cumulative weights; return segment and a `random_source` string such as `node:crypto.randomInt(0,120)=37`. Throw if nothing is pickable. Pattern: `lib/prize-wheel/random.ts`. |
| `reference.ts` | `spinResultReference()` -> `SPIN-` + 6 chars from an unambiguous alphabet via `randomInt`. |
| `pass.ts` | `createSpinPass()` returns `{ token, tokenHash }`; `hashSpinPass(token)` SHA-256 hex; token as base64url. |
| `server.ts` | `import 'server-only'`. Load public wheel, segments, balance for user or pass, results. Degrade to "no wheel" when the migration is not applied (pattern: `lib/prize-wheel/server.ts` and `isMissingSchemaError`). |
| `geometry.ts` | Re-export `wheelSegments`, `rotationForNumber`, `numberAtPointer` from `lib/prize-wheel/wheel-geometry.ts` (segment position = number). Visual segments are equal width; odds come from weights. |

Retry rule for the spin route: if the RPC fails with `segment_out_of_stock` (race), re-pick excluding that segment, up to 3 attempts.

## 6. API routes

All responses `Cache-Control: private, no-store`. Body reads via `readLimitedJsonObject` (`lib/order-input-validation.ts`). Rate limit via `enforceRateLimit` (`lib/server/request-guards.ts`). Signed-in identity via `getAuthUserFromRequest` (`lib/fantasy-manager-auth.ts`), browser side via `fantasyAuthHeaders()` (`lib/fantasy-browser.ts`). Admin via `requirePermissionResult('raffle')` (`lib/auth/guard.ts`) and the existing admin CSRF pattern used by other `/api/admin/*` mutations.

### Public

| Method and path | Purpose |
|---|---|
| `GET /api/spin-wheel` | Current public wheel: name, description, segments (position, label, prize_name, prize_description, colour, is_prize, in_stock), price, status. Never returns weights or stock numbers. |
| `GET /api/spin-wheel/balance` | Spins left for signed-in user (after free top-up) or `X-Spin-Pass`. |
| `POST /api/spin-wheel/spin` | Server picks with `pickWeightedSegment`, calls `record_spin_wheel_result`, returns `{ result: { reference, segment_position, segment_label, prize_name, is_prize }, spinsLeft }`. Sends winner email after success (failure to email never fails the spin). Rate limit 10 per minute per user or pass. |
| `POST /api/spin-wheel/checkout` | Body `{ name, email, quantity }`. Validates, creates `spin_wheel_orders` row (`pending`), creates Stripe Checkout Session (AUD, line item "Spin the Wheel - N spins", metadata `{ kind: 'spin_wheel', order_id, wheel_id }`, success URL `/spin-the-wheel?payment=success&session_id={CHECKOUT_SESSION_ID}`, cancel URL `/spin-the-wheel?payment=cancelled`). Follow the Stripe usage in `app/api/raffle/checkout/route.ts`. |
| `GET /api/spin-wheel/checkout/status?session_id=` | After redirect: returns `pending` or `paid` for that order only (no personal data). Signed-in buyers see the new spins on their account; guests are told to open the spin link emailed to them. |
| `GET /api/spin-wheel/results` | The caller's own results (signed-in or pass). |

### Stripe webhook

Extend `app/api/stripe/webhook/route.ts` with a branch for `metadata.kind === 'spin_wheel'` on `checkout.session.completed`: idempotently mark the order paid, create the pass (hash only) when the buyer is a guest, create `quantity` entitlements (`source = 'purchase'`), enqueue the receipt email with the pass link. Existing branches must behave exactly as before.

### Admin

| Method and path | Purpose |
|---|---|
| `GET/POST /api/admin/spin-wheel` | List and create wheels. |
| `GET/PATCH/DELETE /api/admin/spin-wheel/[id]` | Read, update (wheel + full segment list in one request), delete draft wheels only (archive otherwise via `status = 'ended'`). |
| `POST /api/admin/spin-wheel/[id]/grant` | Grant N spins to an email (creates or reuses a pass, emails the link). |
| `GET /api/admin/spin-wheel/[id]/results` | Results with filters; `?format=csv` for export. |
| `PATCH /api/admin/spin-wheel/[id]/results/[resultId]` | Mark claimed or void (with reason). |

Record admin changes through the existing audit helpers (`lib/admin-audit.ts`, `lib/revisions/`) the same way other admin resources do.

## 7. Public page (`app/spin-the-wheel/`)

- `page.tsx` (server): `export const dynamic = 'force-dynamic'`; load the public wheel; `notFound()` when none is public (same as `app/prize-wheel/page.tsx`). Metadata via `pageMetadata` from `lib/seo` only when a wheel is public. Hero uses the existing `.page-hero` classes.
- Sections: About (name, description, running dates in Melbourne time), Prizes (HTML list of prize segments with prize name and description), the wheel, Spins left, Buy spins form (only when `spin_price_cents` is set), My results, How it works (server picks the result with a secure random generator before the wheel turns).
- `SpinWheelClient.tsx` (client): SVG wheel built from `wheelSegments()`; pointer at top; rotation via CSS transform with `transition: transform 6000ms cubic-bezier(0.12, 0.8, 0.18, 1)`; `rotationForNumber(position, segmentCount, currentRotation, 6)`; respects `prefers-reduced-motion` (no animation, instant result); Spin button disabled while spinning or when no spins left; result announced in an `aria-live="assertive"` region; keyboard operable; minimum 44 px targets. Pattern: `app/admin/raffle/wheel/[id]/draw/page.tsx`.
- Colours: club palette used by the draw screen (`#880000` maroon, `#162845` navy, `#8cc6d1` blue, `#edc266` gold, `#FBF7F0` cream) mapped from the segment `colour` value; text colour chosen for contrast.
- Sign-in prompt for free spins uses the existing club account sign-in link used elsewhere on the site.
- Optional light celebration on a prize result (CSS only, disabled under reduced motion). No new image assets.

## 8. Admin UI (`app/admin/spin-wheel/`)

- Follow the layout and components of `app/admin/raffle/wheel/WheelCampaignManager.tsx` and `app/admin/raffle/wheel/[id]/page.tsx` (`adminFetch`, `parseApiResponse`, `Button`, `Input`).
- Add a "Spin the Wheel" link in the admin navigation next to Raffle for users with the `raffle` permission.
- Segment editor: table rows with up/down reorder, live odds column, total weight, warning (not a block) when all prize segments are out of stock.
- Preview button: renders the public wheel component in a modal with a test spin that runs the animation to a locally chosen segment and records nothing.

## 9. Navigation, sitemap, visibility

- `lib/server/nav-visibility.ts`: add optional `spinWheelPublic?: boolean` (optional so older cached snapshots remain valid, as done for `prizeWheelPublic`).
- `components/layout/Navbar.tsx`: add `{ label: 'Spin the Wheel', href: '/spin-the-wheel' }` to the Raffles group; filter it out when `spinWheelPublic` is not true.
- `components/layout/Footer.tsx`: same filter rule.
- `lib/server/sitemap-entries.ts`: include `/spin-the-wheel` only while public.
- Call the existing `revalidatePublicContent()` (`lib/server/revalidate-public.ts`) after admin writes so the nav cache refreshes.

## 10. Emails

- Winner email: result reference, prize name and description, claim instructions, club name from club settings.
- Paid spins receipt: amount, quantity, payment reference, spin pass link.
- Grant email: spin pass link.
- Use the existing Resend email helpers and `escapeEmailHtml` (`lib/email-html.ts`) as used by `lib/prize-wheel/winner-email.ts` and the receipt outbox (`lib/payments/receipt-delivery`). Never place raw user input into HTML unescaped.

## 11. Tests (no database, no network)

Add `scripts/test-spin-wheel.mjs` and register it as `"test:spin-wheel"` in `package.json` (picked up by `scripts/run-all-tests.mjs`). Cover:

1. `pickWeightedSegment` with an injected deterministic source: correct segment for boundary values, zero-weight and out-of-stock segments never picked, throws when nothing pickable.
2. Statistical sanity with 100 000 injected uniform draws: each frequency within 1 percentage point of its weight share.
3. `rotationForNumber` + `numberAtPointer` round trip for every position on 2, 8, 12, 24 and 48 segment wheels.
4. Validation: wheel and segment input rules mirror the SQL checks.
5. Reference and pass: format, uniqueness over 10 000 generations, hash is SHA-256 hex and not the token.
6. Source checks (read files as text): spin route calls the RPC before returning; public `GET` never serialises `weight` or `stock`; admin routes call `requirePermissionResult('raffle')`; webhook branch keyed on `kind === 'spin_wheel'`.

`scripts/test-migration-replay.mjs` already replays every file in `supabase/migrations` (CI PostgreSQL job), so the new migration must apply cleanly after all existing ones.

## 12. Validation before completion

Per `AGENTS.md`:

```bash
npm ci
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Report each command and its exact result.

## 13. Rollback

- Code: revert the PR merge commit.
- Database: the migration only adds new `spin_wheel_*` tables and functions. Rollback SQL (include as a comment block at the top of the migration, as the prize wheel migration does):

```sql
drop function if exists public.record_spin_wheel_result(uuid, uuid, uuid, uuid, text, text);
drop function if exists public.ensure_spin_wheel_free_entitlements(uuid, uuid);
drop table if exists public.spin_wheel_results;
drop table if exists public.spin_wheel_entitlements;
drop table if exists public.spin_wheel_orders;
drop table if exists public.spin_wheel_passes;
drop table if exists public.spin_wheel_segments;
drop table if exists public.spin_wheels;
```

- Fast switch-off without deploy: set every wheel to `paused` or `hidden`; the page returns 404 and nav links disappear.

## 14. Acceptance checklist

- [ ] Committee user can create a wheel with segments, weights, stock, free spins and price, and set it live.
- [ ] Public page shows the wheel and prize list as HTML text; hidden wheels return 404 and no nav link.
- [ ] Signed-in account receives the configured free spins; spinning uses one each.
- [ ] Result is chosen and stored on the server before the animation; refreshing mid-spin shows the same result in My results.
- [ ] Out-of-stock segments are never won; stock never goes negative under parallel spins.
- [ ] Guest can buy spins with Stripe, receives a pass link, and can spin with it.
- [ ] Winner and receipt emails send; a failed email does not undo a spin.
- [ ] Admin can view, filter, export, mark claimed and void results, and grant spins.
- [ ] Reduced motion, keyboard use and screen reader announcement work.
- [ ] Existing Prize Wheel, raffles, reverse raffle, orders and payments behave exactly as before.
- [ ] `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` all pass.

## 15. Deferred to later (by decision, not blockers)

- Legal and compliance review of paid spins (Victorian gaming rules), age confirmation wording, terms and conditions page.
- Guest free spins, per-day spin limits, anti-abuse beyond rate limits.
- Weighted visual segment widths, sound effects, confetti assets.
