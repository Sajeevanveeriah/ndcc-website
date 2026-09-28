# Spin the Wheel - Implementation (Rev01, as built)

Prepared: 28 September 2026 (Australia/Melbourne)
Repository: `sajeevanveeriah/ndcc-website` (Next.js 15 App Router, React 19, Supabase, Stripe, Vercel)
Owner: Saj
Supersedes: Rev00 (merged in sajeevanveeriah/ndcc-website#277). Rev01 fixes the six Codex review findings on Rev00 and records the design that was actually implemented.

## 1. What it is

An online **Spin the Wheel**. A visitor or club member opens `/spin-the-wheel`, presses Spin, the wheel turns and lands on a segment that shows what they won (or a non-prize label such as "Try again"). Committee users with the Raffle permission build wheels: segments, prizes, odds (weights), prize stock, free spins per club account, a price for extra spins, and claim instructions.

It is separate from the **Dinos Prize Wheel** small raffle (live clubroom draw in `lib/prize-wheel`, `app/prize-wheel`, `app/admin/raffle/wheel`). That feature is unchanged; Spin the Wheel only imports its wheel geometry (`lib/prize-wheel/wheel-geometry.ts`).

Scope decision (Saj, 28 September 2026): build the full feature now without extra restrictions; policy, wording and compliance review come afterwards (section 12).

## 2. Routes

| Surface | Path |
|---|---|
| Public page | `/spin-the-wheel` |
| Admin list | `/admin/raffle/spin-wheel` (linked from `/admin/raffle`) |
| Admin editor, results, grants | `/admin/raffle/spin-wheel/[id]` (`new` creates) |
| Public API | `GET /api/spin-wheel`, `GET /api/spin-wheel/me`, `POST /api/spin-wheel/spin`, `POST /api/spin-wheel/checkout`, `GET /api/spin-wheel/orders/[id]`, `POST /api/spin-wheel/pass/resend` |
| Admin API | `GET/POST /api/admin/spin-wheel`, `GET/DELETE /api/admin/spin-wheel/[id]`, `POST /api/admin/spin-wheel/[id]/grant`, `GET/PATCH /api/admin/spin-wheel/[id]/results` |
| Daily cron | `GET /api/cron/spin-wheel-passes` (05:25 UTC, `vercel.json`) |

Admin pages sit under `/admin/raffle/` so they inherit the existing `raffle` permission; every admin API handler calls `requirePermissionResult('raffle')`, and CSRF is enforced by `middleware.ts` for all `/api/admin/*`.

## 3. How a spin works

1. The browser calls `POST /api/spin-wheel/spin` with either a spin link header (`X-Spin-Pass`) or the signed-in club account's bearer token (confirmed email required).
2. The server tops up free spins (signed-in accounts), loads segments, and picks one with `pickWeightedSegment` (`node:crypto.randomInt`, probability = weight / total weight of segments with weight > 0 and stock not 0).
3. `record_spin_wheel_result` runs in one transaction: checks the wheel is live, locks one unused and unrevoked spin (`for update skip locked`), locks the segment, refuses if out of stock, decrements stock, marks the spin used, and stores the result with a snapshot of the segment and the spinner's email and name.
4. Only then does the server reply. The browser turns the wheel to the recorded segment (6 s ease-out, instant under `prefers-reduced-motion`) and announces the result in an `aria-live` region.
5. If a prize ran out between pick and record, the server re-picks without that segment (up to 3 attempts). Winner emails are sent once per result; a failed email never undoes a spin.

## 4. Paid spins (fixes findings 1, 2 and 4)

Paid spins are ordinary `public.orders` rows with `order_category = 'spin_wheel'` and a general `NDCCPAY-YYYY-NNNNNN` reference, created by `POST /api/spin-wheel/checkout` and paid through the existing `/api/payments/checkout-session` (return path `/spin-the-wheel`). A `spin_wheel_orders` row links the order to the wheel, quantity and buyer (club account or guest pass).

Because they are normal orders, the existing, reviewed payment code handles everything:

- **Settlement only when paid (finding 1).** The existing webhook and ledger derive `orders.payment_status` from settled ledger rows, including `checkout.session.async_payment_succeeded`, amount, currency and PaymentIntent checks. Spins are granted by the trigger `spin_wheel_order_payment` on `orders` only when `payment_status` becomes `'paid'` (full payment). Part payments grant nothing.
- **Receipts (finding 2).** The standard `order_payment` receipt goes out through the existing durable outbox; `spin_wheel` normalises to the general category, which the outbox already accepts. No change to the outbox.
- **Refunds and disputes (finding 4).** `handleFinancialEvent` already recognises order payments. When a refund or withheld dispute moves the order off `'paid'`, the same trigger revokes every unused spin from that order. Spins already used stay on record. If the order returns to `'paid'` the revoked spins are restored.

The trigger never blocks a payment: any error is logged as a warning and the order update still commits. `GET /api/spin-wheel/orders/[id]` and the daily cron call `sync_spin_wheel_order_entitlements` again, so spins self-heal.

The Stripe webhook route is unchanged. The only payment-code change is adding `/spin-the-wheel` to the allowed return paths in `app/api/payments/checkout-session/route.ts` and `app/payment/page.tsx`.

## 5. Guest spin links (fixes finding 3)

A guest buyer gets a new pass per order. The link token is `HMAC-SHA256(SPIN_WHEEL_PASS_SECRET, pass id)` (falls back to the service role key with a domain-separation label), and the database stores only `SHA-256(token)`. Because the token is re-derivable from the pass id:

- the checkout response hands the token to the buyer's browser immediately (stored in `localStorage`, removed from the address bar);
- the spin link email is sent when the order is paid, from the order status check or the daily cron, and a failed send is retried (`pass_emailed_at` is claimed, then released on failure);
- "Lost your spin link?" re-sends links for that email's passes that still have spins (rate limited, same reply either way).

Admin grants create a new pass for the email and email the link; if email fails, the admin screen shows the link to send manually.

## 6. Free spins (fixes finding 5)

`ensure_spin_wheel_free_entitlements` inserts slots `1..free_spins_per_account` with `on conflict do nothing` against a unique index on `(wheel_id, auth_user_id, seq) where source = 'free'`. Concurrent balance and spin requests cannot over-grant, and used free spins are never re-granted. Purchased spins use the same pattern on `(spin_order_id, seq)`, so webhook retries and re-syncs cannot over-grant either.

## 7. Editing segments (fixes finding 6)

`spin_wheel_results.segment_id` is nullable with `on delete set null`; each result stores the position, label, prize name, prize description and prize flag at spin time. `save_spin_wheel` saves the wheel and the full ordered segment list atomically (deletes removed segments, reorders with a deferred unique constraint). Removing a segment that has already won keeps its results intact.

## 8. Data model

Migration: `supabase/migrations/20260928100000_spin_the_wheel.sql` (rollback SQL in its header).

| Table | Purpose |
|---|---|
| `spin_wheels` | Wheel settings: status (`draft`, `live`, `paused`, `ended`), open/close times, free spins, price, per-order limit, claim instructions, public visibility (`hidden`, `scheduled`, `visible`). |
| `spin_wheel_segments` | Up to 48 segments: label (24 chars), prize name/description, prize flag, weight, stock (null = unlimited), colour (club palette). |
| `spin_wheel_passes` | Guest passes: email, name, token hash. |
| `spin_wheel_orders` | Link from `orders` to wheel, quantity, buyer; `paid_at`, `pass_emailed_at`. |
| `spin_wheel_entitlements` | One row per spin: source `free`, `purchase` or `admin_grant`; `used_at`, `revoked_at`. |
| `spin_wheel_results` | Every spin with segment snapshot, spinner contact, claim and void state. |

Functions (service role only): `ensure_spin_wheel_free_entitlements`, `sync_spin_wheel_order_entitlements`, `record_spin_wheel_result`, `save_spin_wheel`, plus the trigger function on `orders`. RLS is enabled on every table and browser roles have no grants.

## 9. Public page and navigation

- `/spin-the-wheel` is a server page (404 when no wheel is public) with the client `SpinWheelClient.tsx` and the shared SVG `components/spin-wheel/SpinWheelGraphic.tsx`.
- Prizes, dates, prices and claim instructions are HTML text, not only in the graphic. Sold-out prizes are dimmed and marked "(all won)".
- The public API never returns weights or stock counts.
- Navigation: "Spin the Wheel" in the Raffles group, footer and sitemap only while a wheel is public (`lib/spin-wheel/visibility.ts`, `spinWheelPublic` in the cached site chrome).

## 10. Admin

- Settings, segment table with live chance per segment and total weight, reorder, add, remove, colour; warnings (not blocks) when nobody can win or no spins are available.
- Preview dialog with a test spin that records nothing.
- Grant spins to an email.
- Results: prizes won, unclaimed, every spin; mark claimed, undo, void with reason; CSV download (formula-injection safe).
- All changes are recorded with `scheduleAdminAudit`.

## 11. Tests and validation

| Check | What it covers |
|---|---|
| `scripts/test-spin-wheel.mjs` (`npm run test:spin-wheel`, part of `npm test`) | Weighted pick boundaries, 100,000-draw distribution, odds maths, geometry round trip for 2 to 48 segments, validation mirrors, visibility and phase, public data shape, references, pass tokens, escaped emails, error mapping, route guards and payment wiring, ASCII hyphens. |
| `scripts/test-spin-wheel.sql` (run by `npm run test:migration-replay`, CI database job) | Free top-up idempotency, stock, zero weight, no spins left, part payment grants nothing, full payment grants exactly N through the real ledger, re-sync never over-grants, refund revokes unused spins, paused wheel refuses, segment deletion keeps snapshots, one-segment wheel refused, browser roles have no access. |

Before completion, per `AGENTS.md`: `npm ci`, `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## 12. Deferred by decision

- Legal and compliance review of paid spins under Victorian gaming rules, age confirmation and terms (not blocked in code, as instructed).
- Set `SPIN_WHEEL_PASS_SECRET` in Vercel (optional; the service role key is used otherwise, and rotating either invalidates old links, which can be re-sent from the page).
- Apply the migration to the production Supabase project before creating a wheel (the site treats a missing migration as "no wheel").

## 13. Rollback

- Code: revert the PR's merge commit. Nothing is public until a wheel is set to Live and Visible.
- Fast switch-off: set the wheel to Paused or Ended, or its public page to Hidden.
- Database: rollback SQL is in the migration header. Export results first; they are the record of prizes won.
