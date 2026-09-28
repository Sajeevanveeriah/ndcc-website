# Spin the Wheel - ChatGPT Prompts (Rev01)

Prepared: 28 September 2026 (Australia/Melbourne)
Use with: `20260928-Spin-The-Wheel-Implementation-Rev01.md`

Status: Spin the Wheel is now implemented in the repository (see the implementation document, section 2 for files and routes). Rev00's build prompts are replaced by the prompts below, which review or extend the built feature instead of rebuilding it.

---

## Prompt 1 - Independent review

```text
You are reviewing the "Spin the Wheel" feature in the GitHub repository sajeevanveeriah/ndcc-website (Next.js 15, React 19, TypeScript, Supabase, Stripe, Vercel). Read AGENTS.md and docs/20260928-Spin-The-Wheel-Implementation-Rev01.md first.

Review these files for correctness, security and money-handling bugs:
- supabase/migrations/20260928100000_spin_the_wheel.sql
- lib/spin-wheel/*.ts, components/spin-wheel/SpinWheelGraphic.tsx
- app/spin-the-wheel/*, app/api/spin-wheel/**, app/api/admin/spin-wheel/**, app/admin/raffle/spin-wheel/**, app/api/cron/spin-wheel-passes/route.ts
- the small changes in app/api/payments/checkout-session/route.ts, app/payment/page.tsx, lib/server/nav-visibility.ts, lib/server/sitemap-entries.ts, components/layout/Navbar.tsx, components/layout/Footer.tsx, app/api/public/raffle-status/route.ts

Focus on: spins granted without full payment; spins kept after refund or dispute; double spending of one spin under concurrency; stock going negative; weights or stock leaking to the public API; guest spin links that cannot be recovered; missing permission checks on admin routes; unescaped values in emails; anything that could break existing orders, payments, receipts or the Prize Wheel raffle.

For each finding give file and line, a concrete failure scenario, and a minimal fix. Do not report style preferences. If you change code, run npm test, npm run lint, npx tsc --noEmit and npm run build and report the exact results.
```

## Prompt 2 - Extend the feature

```text
You are extending the existing "Spin the Wheel" feature in sajeevanveeriah/ndcc-website. Read AGENTS.md and docs/20260928-Spin-The-Wheel-Implementation-Rev01.md first, then read the files listed in its section 2 before changing anything.

Change requested: <describe the change here>

Rules:
- Keep the server-first spin: the result is picked with node:crypto and recorded by record_spin_wheel_result() before the browser animates.
- Paid spins stay as public.orders rows (order_category 'spin_wheel') paid through /api/payments/checkout-session; do not add a separate Stripe path or change the Stripe webhook.
- Spins are granted and revoked only by sync_spin_wheel_order_entitlements() from the order's payment status.
- Public API responses never include segment weights or stock counts.
- Any schema change is a new migration after the newest file in supabase/migrations, with rollback SQL in its header; keep scripts/test-spin-wheel.sql passing in npm run test:migration-replay.
- UK English, ASCII hyphens only, no invented club facts, no visible placeholders.
- Add or update checks in scripts/test-spin-wheel.mjs for the change.

Before you finish, run npm ci, npm test, npm run lint, npx tsc --noEmit and npm run build, and report each exact result and a rollback path.
```
