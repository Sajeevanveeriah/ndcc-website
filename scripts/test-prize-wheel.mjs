// Deterministic prize wheel tests: small raffle rule mirrors, number
// selection, draw RNG range, draw order and single-win state, re-spin
// labels, public visibility gating, checkout guards and no instant-win copy.
// No database, network, Stripe or email.
import assert from 'node:assert/strict';
import { deepEqual as loose } from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, URL, Buffer, process, console, Intl, Date, Math, Number, Set, Map, Array, Object, String, JSON,
    require(name) { if (name === 'server-only') return {}; assert.ok(name in dependencies, `unexpected import ${name} in ${file}`); return dependencies[name]; },
  });
  return exports;
}

const rules = load('lib/prize-wheel/rules.ts');
const iso = value => new Date(value).toISOString();
const base = {
  name: 'Dinos Prize Wheel', price_cents: 500, wheel_divisions: 24, draw_label: 'Clubrooms', active: true,
  sales_open_at: iso('2026-10-10T02:00:00Z'), draw_at: iso('2026-10-10T08:00:00Z'),
  public_visibility_mode: 'visible', public_opens_at: null,
  prizes: [{ name: 'Meat tray', retail_value_cents: 2500, quantity: 1 }, { name: 'Voucher', retail_value_cents: 1000, quantity: 2 }],
};

// ---- DB rule mirrors ----
loose(rules.validateWheelCampaign(base), []);
assert.equal(rules.prizeTotalCents(base.prizes), 4500);
// 2x-6x: 24 x $5 = $120 against $45 prizes is 2.67x.
assert.equal(rules.ticketValueSummary(500, 24, 4500).withinRange, true);
assert.equal(rules.ticketValueSummary(500, 20, 6000).withinRange, false, 'below 2x');
assert.equal(rules.ticketValueSummary(500, 100, 8000).withinRange, false, 'above 6x');
assert.equal(rules.ticketValueSummary(500, 24, 6000).withinRange, true, 'exactly 2x');
assert.equal(rules.ticketValueSummary(600, 10, 1000).withinRange, true, 'exactly 6x');
assert.ok(rules.validateWheelCampaign({ ...base, price_cents: 100 }).some(e => e.includes('between 2 and 6 times')));
// 8 hour window.
loose(rules.validateWheelCampaign({ ...base, sales_open_at: iso('2026-10-10T00:00:00Z') }), [], 'exactly 8 hours is allowed');
assert.ok(rules.validateWheelCampaign({ ...base, sales_open_at: iso('2026-10-09T23:59:00Z') }).some(e => e.includes('within 8 hours')));
assert.ok(rules.validateWheelCampaign({ ...base, sales_open_at: base.draw_at }).some(e => e.includes('after sales open')));
// $500 prize cap.
const big = { ...base, price_cents: 1000, wheel_divisions: 100, prizes: [{ name: 'Bat', retail_value_cents: 50001, quantity: 1 }] };
assert.ok(rules.validateWheelCampaign(big).some(e => e.includes('$500 or less')));
loose(rules.validateWheelCampaign({ ...big, prizes: [{ name: 'Bat', retail_value_cents: 25000, quantity: 2 }] }), []);
// $1,000 per Melbourne date across the club's wheels.
const others = [
  { id: 'a', draw_at: iso('2026-10-10T03:00:00Z'), prize_pool_cents: 50000, active: true },
  { id: 'b', draw_at: iso('2026-10-10T13:30:00Z'), prize_pool_cents: 50000, active: true }, // 11 Oct in Melbourne
  { id: 'c', draw_at: iso('2026-10-10T04:00:00Z'), prize_pool_cents: 50000, active: false },
];
assert.equal(rules.sameDayPrizeTotalCents(others, base.draw_at), 50000);
assert.equal(rules.melbourneDateKey('2026-10-10T12:30:00Z'), '2026-10-10');
assert.equal(rules.melbourneDateKey('2026-10-10T13:30:00Z'), '2026-10-11');
assert.notEqual(rules.melbourneDateKey('2026-10-10T13:30:00Z'), rules.melbourneDateKey('2026-10-10T03:00:00Z'));
const fullDay = { ...base, price_cents: 1000, wheel_divisions: 100, prizes: [{ name: 'Bat', retail_value_cents: 50000, quantity: 1 }] };
loose(rules.validateWheelCampaign(fullDay, others), [], '$500 + $500 is exactly $1,000');
assert.ok(rules.validateWheelCampaign({ ...fullDay, prizes: [{ name: 'Bat', retail_value_cents: 50000 + 0, quantity: 1 }] },
  [...others, { id: 'd', draw_at: base.draw_at, prize_pool_cents: 100, active: true }]).some(e => e.includes('$1,000')));
loose(rules.validateWheelCampaign(fullDay, [...others, { id: 'd', draw_at: base.draw_at, prize_pool_cents: 100, active: true }], 'd'), [], 'self is excluded when editing');
assert.ok(rules.validateWheelCampaign({ ...base, wheel_divisions: 101 }).some(e => e.includes('between 2 and 100')));
assert.ok(rules.validateWheelCampaign({ ...base, wheel_divisions: 1 }).some(e => e.includes('between 2 and 100')));
assert.ok(rules.validateWheelCampaign({ ...base, wheel_divisions: 2, price_cents: 5000, prizes: [{ name: 'A', retail_value_cents: 100 }, { name: 'B', retail_value_cents: 100 }, { name: 'C', retail_value_cents: 100 }] }).some(e => e.includes('more prizes than wheel numbers')));
assert.ok(rules.validateWheelCampaign({ ...base, draw_label: '' }).some(e => e.includes('live draw happens')));
const normalised = rules.normaliseWheelCampaignInput({ ...base, prizes: [{ name: ' Tray ', retail_value_cents: '2500', quantity: '' }] });
assert.equal(normalised.prizes[0].name, 'Tray'); assert.equal(normalised.prizes[0].quantity, 1); assert.equal(normalised.prizes[0].retail_value_cents, 2500);
assert.equal(rules.normaliseWheelCampaignInput({ ...base, prizes: 'x' }), null);

// Migration mirrors the same numbers.
const migration = readFileSync('supabase/migrations/20260927100000_prize_wheel_small_raffle.sql', 'utf8');
for (const marker of ["draw_at - sales_open_at <= interval '8 hours'", 'prize_pool_cents between 1 and 50000', 'wheel_divisions between 2 and 100',
  '2::bigint * prize_pool_cents and 6::bigint * prize_pool_cents', 'day_total + new.prize_pool_cents > 100000', "interval '40 minutes'",
  'create unique index raffle_draws_ticket_wins_once', 'revoke update, delete, truncate on public.raffle_draws']) {
  assert.ok(migration.includes(marker), `migration must contain ${marker}`);
}
assert.equal(rules.WHEEL_MAX_PRIZE_POOL_CENTS, 50000); assert.equal(rules.WHEEL_DAILY_PRIZE_CAP_CENTS, 100000);
assert.equal(rules.WHEEL_ONLINE_CLOSE_MINUTES, 40); assert.equal(rules.WHEEL_MAX_SALES_WINDOW_MS, 8 * 3600 * 1000);
assert.doesNotMatch(migration, /[–—]/, 'ASCII hyphens only');

// ---- Codes and references ----
assert.equal(rules.isWheelCampaignCode('NDCCWHL261010A'), true);
for (const code of ['NDCCWHL', 'NDCCRAF', 'NDCCRRO', 'NDCCWHL261010', 'NDCCWHL261010a', 'NDCCWHL261010AB']) assert.equal(rules.isWheelCampaignCode(code), false, code);
assert.equal(rules.wheelTicketReference('NDCCWHL261010A', 7), 'NDCCWHL-261010A-007');
loose({ ...rules.parseWheelTicketReference('NDCCWHL-261010A-100') }, { campaignCode: 'NDCCWHL261010A', ticketNumber: 100 });
assert.equal(rules.parseWheelTicketReference('NDCCWHL-261010A-000'), null);
assert.equal(rules.parseWheelTicketReference('NDCCRRO-20260201'), null);
assert.match('NDCCWHL-261010A-007', new RegExp(migration.match(/ticket_reference ~ '(\^NDCCWHL[^']+)'/)[1]));

// ---- Number selection ----
assert.equal(rules.validWheelSelection([1, 24], 2, 24), true);
assert.equal(rules.validWheelSelection([0], 1, 24), false);
assert.equal(rules.validWheelSelection([25], 1, 24), false);
assert.equal(rules.validWheelSelection([3, 3], 2, 24), false);
assert.equal(rules.validWheelSelection([3], 2, 24), false);
assert.equal(rules.validWheelSelection([1.5], 1, 24), false);
assert.equal(rules.validWheelSelection(Array.from({ length: 21 }, (_, i) => i + 1), 21, 24), false);

// ---- Sales window ----
const window = { sales_open_at: base.sales_open_at, draw_at: base.draw_at };
assert.equal(rules.wheelSalesState(window, new Date('2026-10-10T01:59:59Z')), 'upcoming');
assert.equal(rules.wheelSalesState(window, new Date('2026-10-10T02:00:00Z')), 'open');
assert.equal(rules.wheelSalesState(window, new Date('2026-10-10T07:20:00Z')), 'open');
assert.equal(rules.wheelSalesState(window, new Date('2026-10-10T07:20:01Z')), 'cash_only');
assert.equal(rules.wheelSalesState(window, new Date('2026-10-10T08:00:00Z')), 'closed');

// ---- Draw RNG ----
const random = load('lib/prize-wheel/random.ts', { 'node:crypto': { randomInt: (min, max) => { assert.equal(min, 1); return max - 1; } }, './rules': rules });
loose({ ...random.drawWinningNumber(24) }, { winningNumber: 24, randomValue: 'node:crypto.randomInt(1,25)=24' });
const realRandom = load('lib/prize-wheel/random.ts', { 'node:crypto': await import('node:crypto'), './rules': rules });
const seen = new Set();
for (let i = 0; i < 4000; i += 1) {
  const { winningNumber } = realRandom.drawWinningNumber(12);
  assert.ok(Number.isInteger(winningNumber) && winningNumber >= 1 && winningNumber <= 12);
  seen.add(winningNumber);
}
assert.equal(seen.size, 12, 'every division is reachable');
assert.throws(() => random.drawWinningNumber(1));
assert.throws(() => random.drawWinningNumber(101));
const badSource = load('lib/prize-wheel/random.ts', { 'node:crypto': { randomInt: () => 0 }, './rules': rules });
assert.throws(() => badSource.drawWinningNumber(10), /outside the wheel/);

// ---- Draw order, single win and re-spin logging ----
const prizes = [{ id: 'p2', position: 2, name: 'Voucher' }, { id: 'p1', position: 1, name: 'Tray' }];
let drawState = rules.wheelDrawState(prizes, []);
assert.equal(drawState.next.prize.id, 'p1', 'first draw is for first prize');
assert.equal(drawState.complete, false);
const d = (n, prize, ticket, reason = null) => ({ id: `d${n}`, prize_id: prize, draw_number: n, winning_number: n, ticket_id: ticket, respin_reason: reason, created_at: '' });
drawState = rules.wheelDrawState(prizes, [d(1, 'p1', null)]);
assert.equal(drawState.next.prize.id, 'p1'); assert.equal(drawState.next.status, 'respin');
drawState = rules.wheelDrawState(prizes, [d(1, 'p1', null), d(2, 'p1', 't1', 'unsold')]);
assert.equal(drawState.prizes[0].status, 'won'); assert.equal(drawState.next.prize.id, 'p2'); assert.equal(drawState.next.status, 'pending');
drawState = rules.wheelDrawState(prizes, [d(1, 'p1', null), d(2, 'p1', 't1', 'unsold'), d(3, 'p2', 't2'), d(4, 'p2', 't3', 'unclaimed')]);
assert.equal(drawState.complete, true); assert.equal(drawState.prizes[1].latest.ticket_id, 't3', 'unclaimed re-spin replaces the winner');
assert.equal(rules.respinReasonLabel('unsold'), 'Re-spin: previous number unsold');
assert.equal(rules.respinReasonLabel('unclaimed'), 'Re-spin: previous winner did not claim');
assert.equal(rules.respinReasonLabel('already_won'), 'Re-spin: previous number had already won');
assert.equal(rules.respinReasonLabel(null), 'First spin');
// The database refuses a second win for a ticket and out-of-order draws.
assert.match(migration, /Draw prizes in order: first draw wins first prize\./);
assert.match(migration, /not exists\(select 1 from public\.raffle_draws d where d\.ticket_id = t\.id\)/);
// Stored before animation: the route records via RPC before responding, and the screen animates only to the stored number.
const drawRoute = readFileSync('app/api/admin/raffle/wheel/[id]/draw/route.ts', 'utf8');
assert.ok(drawRoute.indexOf('drawWinningNumber(') < drawRoute.indexOf("rpc('record_wheel_draw'"));
const drawScreen = readFileSync('app/admin/raffle/wheel/[id]/draw/page.tsx', 'utf8');
assert.ok(drawScreen.indexOf('postWheelAction') < drawScreen.indexOf('rotationForNumber(draw.winning_number'));
assert.match(drawScreen, /prefers-reduced-motion: reduce/);
assert.doesNotMatch(drawScreen, /Math\.random/);

// ---- Wheel geometry (presentation) ----
const geometry = load('lib/prize-wheel/wheel-geometry.ts');
for (const divisions of [2, 7, 24, 100]) {
  const segments = geometry.wheelSegments(divisions, 400, 450);
  assert.equal(segments.length, divisions);
  loose(segments.map(segment => segment.number), Array.from({ length: divisions }, (_, i) => i + 1));
  for (const target of [1, Math.ceil(divisions / 2), divisions]) {
    const rotation = geometry.rotationForNumber(target, divisions, 123.4, 6);
    assert.ok(rotation >= 123.4 + 6 * 360);
    assert.equal(geometry.numberAtPointer(rotation, divisions), target, `wheel lands on ${target}/${divisions}`);
  }
}
assert.equal(geometry.rotationForNumber(3, 10, 0, 0) >= 0, true, 'reduced motion jumps without extra turns');

// ---- Public visibility gating ----
const server = load('lib/prize-wheel/server.ts', {
  react: { cache: fn => fn },
  '@/lib/supabase-server': { createServerClient: () => ({}) },
  '@/lib/supabase-schema-errors': load('lib/supabase-schema-errors.ts'),
  '@/lib/raffle-visibility-rules': load('lib/raffle-visibility-rules.ts'),
  '@/lib/prize-wheel/rules': rules,
});
// Sitemap reads: a missing wheel migration means no wheel; a real outage throws.
const wheelServerWith = (error) => load('lib/prize-wheel/server.ts', {
  react: { cache: fn => fn },
  '@/lib/supabase-server': { createServerClient: () => { const q = { from: () => q, select: () => q, eq: () => q, then: (ok) => Promise.resolve({ data: null, error }).then(ok) }; return q; } },
  '@/lib/supabase-schema-errors': load('lib/supabase-schema-errors.ts'),
  '@/lib/raffle-visibility-rules': load('lib/raffle-visibility-rules.ts'),
  '@/lib/prize-wheel/rules': rules,
});
assert.equal(await wheelServerWith({ code: '42703', message: 'column raffle_campaigns.kind does not exist' }).isPrizeWheelPublicStrict(), false);
await assert.rejects(wheelServerWith({ code: '08006', message: 'connection failure' }).isPrizeWheelPublicStrict(), /unavailable/);
const row = { id: 'w1', name: 'Wheel', code: 'NDCCWHL261010A', kind: 'wheel', price_cents: 500, wheel_divisions: 24, prize_pool_cents: 4500,
  sales_open_at: base.sales_open_at, draw_at: base.draw_at, draw_label: 'Clubrooms', active: true, public_visibility_mode: 'visible', public_opens_at: null };
const at = new Date('2026-10-10T03:00:00Z');
assert.equal(server.choosePublicWheelCampaign([row], at)?.id, 'w1');
assert.equal(server.choosePublicWheelCampaign([{ ...row, public_visibility_mode: 'hidden' }], at), null);
assert.equal(server.choosePublicWheelCampaign([{ ...row, active: false }], at), null);
assert.equal(server.choosePublicWheelCampaign([{ ...row, public_visibility_mode: 'scheduled', public_opens_at: iso('2026-10-10T04:00:00Z') }], at), null);
assert.equal(server.choosePublicWheelCampaign([{ ...row, kind: 'standard' }], at), null);
assert.equal(server.choosePublicWheelCampaign([row], new Date('2026-10-17T08:00:00Z')), null, 'hidden a week after the draw');
assert.equal(server.choosePublicWheelCampaign([row], new Date('2026-10-12T08:00:00Z'))?.id, 'w1', 'results remain visible after the draw');
assert.equal(server.choosePublicWheelCampaign([{ ...row, id: 'old', draw_at: iso('2026-10-09T08:00:00Z'), sales_open_at: iso('2026-10-09T02:00:00Z') }, row], at)?.id, 'w1', 'upcoming draw wins');
assert.equal(rules.publicWinnerInitial('jordan smith'), 'J.');
assert.equal(rules.publicWinnerInitial(''), '');
const gates = [
  ['app/prize-wheel/page.tsx', 'notFound()'],
  ['app/prize-wheel/page.tsx', 'getPublicWheelCampaign()'],
  ['lib/server/nav-visibility.ts', 'isPrizeWheelPublic()'],
  ['components/layout/Navbar.tsx', "(prizeWheelEnabled || link.href !== '/prize-wheel')"],
  ['components/layout/Footer.tsx', "!link.href.startsWith('/prize-wheel')"],
  ['lib/server/sitemap-entries.ts', 'if (await isPrizeWheelPublicStrict())'],
  ['app/api/raffle/wheel/numbers/route.ts', 'getPublicWheelCampaign()'],
];
for (const [file, marker] of gates) assert.ok(readFileSync(file, 'utf8').includes(marker), `${file} must contain ${marker}`);

// ---- Checkout guards ----
const checkout = load('lib/prize-wheel/checkout.ts', { './rules': rules });
const open = new Date('2026-10-10T03:00:00Z');
const body = { selectedNumbers: [1, 2], adult_confirmed: true };
assert.equal(checkout.wheelCheckoutFailure(row, body, 2, 'stripe', open), null);
assert.equal(checkout.wheelCheckoutFailure(row, { ...body, adult_confirmed: false }, 2, 'stripe', open).status, 400);
assert.match(checkout.wheelCheckoutFailure(row, body, 2, 'bank_transfer', open).error, /card online, or by cash/);
assert.equal(checkout.wheelCheckoutFailure(row, body, 2, 'stripe', new Date('2026-10-10T01:00:00Z')).status, 409);
assert.equal(checkout.wheelCheckoutFailure(row, body, 2, 'stripe', new Date('2026-10-10T07:30:00Z')).status, 409);
assert.equal(checkout.wheelCheckoutFailure(row, { ...body, selectedNumbers: [1, 25] }, 2, 'stripe', open).status, 400);
assert.equal(checkout.wheelCheckoutFailure({ ...row, kind: 'standard' }, body, 2, 'stripe', open).status, 503);

// Full checkout route with a wheel campaign: numbers held, 35 minute expiry, wheel return URL.
let inserted = null, stripePayload = null;
const db = { from() { return {
  insert(value) { inserted = value; return this; }, select() { return this; }, or() { return this; }, eq() { return this; }, gte() { return this; },
  then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); },
  async single() { return { data: { id: 'wheel-order' } }; }, update() { return this; }, async maybeSingle() { return { data: { id: 'wheel-order' } }; },
}; } };
const realValidation = load('lib/order-input-validation.ts', {});
const constants = load('lib/raffle-constants.ts', {});
const route = load('app/api/raffle/checkout/route.ts', {
  '@/lib/reverse-raffle-selection': load('lib/reverse-raffle-selection.ts', { '@/lib/raffle-constants': constants }),
  '@/lib/prize-wheel/rules': rules,
  '@/lib/prize-wheel/checkout': { wheelCheckoutFailure: (campaign, value, quantity, method) => checkout.wheelCheckoutFailure(campaign, value, quantity, method, open) },
  'next/server': { NextResponse: { json: (json, options) => ({ body: json, status: options?.status || 200 }) } },
  '@/lib/supabase-server': { createServerClient: () => db },
  '@/lib/payments/bank-transfer': { configuredBankDetails: () => ({}), BANK_TRANSFER_HOLD_MS: 48 * 60 * 60 * 1000, bankHoldLimitMessage: () => 'Bank hold limit reached.' },
  '@/lib/payments/bank-transfer-email': { sendBankTransferInstructions: async () => ({ status: 'simulated' }) },
  '@/lib/payments/capabilities': { loadMerchPaymentSettings: async () => ({}), deriveCapabilities: () => ({ card: true, bank_transfer: true }) },
  '@/lib/stripe': { getStripe: () => ({ checkout: { sessions: { create: async value => { stripePayload = value; return { ...value, id: 'cs_test', status: 'open', url: 'https://checkout.stripe.com/test' }; }, expire: async () => ({ status: 'expired' }) } } }) },
  '@/lib/server/request-guards': { enforceRateLimit: async () => true, enforceTurnstile: async () => true, getClientIp: () => 'test' },
  '@/lib/raffle-visibility': { getPublicRaffleCampaign: async code => code === row.code ? row : null },
  '@/lib/payments/payment-config': { isCheckoutEnabled: () => true },
  '@/lib/payments/reference': { generateUniquePaymentReference: async () => 'NDCCRAF-2026-000123' },
  '@/lib/payments/site-url': { getCheckoutSiteUrl: () => 'https://www.ndcc.com.au' },
  '@/lib/payments/stripe-checkout': load('lib/payments/stripe-checkout.ts', {}),
  '@/lib/order-input-validation': { ...realValidation, readLimitedJsonObject: async req => ({ ok: true, value: req.jsonBody }) },
  '@/lib/utils': { validateEmail: () => true, validatePhone: () => true },
});
const request = value => ({ url: `https://www.ndcc.com.au/api/raffle/checkout?campaign=${row.code}`, jsonBody: value });
const purchase = { name: 'Test buyer', email: 'buyer@example.com', phone: '', quantity: 2, selectedNumbers: [5, 9], adult_confirmed: true, payment_method: 'stripe' };
const ok = await route.POST(request(purchase));
assert.equal(ok.status, 200, JSON.stringify(ok.body));
loose(inserted.selected_ticket_numbers, [5, 9]);
assert.equal(inserted.amount_cents, 1000);
assert.equal(stripePayload.success_url, 'https://www.ndcc.com.au/prize-wheel?payment=success');
assert.ok(Math.abs(stripePayload.expires_at - (Math.floor(Date.now() / 1000) + 35 * 60)) <= 2);
assert.equal(stripePayload.metadata.product, 'NDCC Raffle', 'existing webhook contract is unchanged');
inserted = null;
assert.equal((await route.POST(request({ ...purchase, adult_confirmed: false }))).status, 400);
assert.equal((await route.POST(request({ ...purchase, payment_method: 'bank_transfer' }))).status, 400);
assert.equal((await route.POST(request({ ...purchase, selectedNumbers: [5, 99] }))).status, 400);
assert.equal(inserted, null, 'rejected wheel checkouts create no order');
const unknown = { ...request(purchase), url: 'https://www.ndcc.com.au/api/raffle/checkout?campaign=NDCCWHL261010Z' };
assert.equal((await route.POST(unknown)).status, 503, 'a hidden wheel campaign cannot be bought');

// ---- Report ----
const report = load('lib/raffle-report.ts', { './csv': load('lib/csv.ts') });
const order = { id: 'o1', campaign_id: 'w1', payment_reference: 'NDCCRAF-2026-000123', customer_name: 'Jordan Smith', customer_email: 'j@example.invalid', customer_phone: '', quantity: 2, amount_cents: 1000, status: 'paid', payment_method: 'stripe', created_at: '', paid_at: '', cash_received_at: null, cash_handed_in_at: null, cash_received_by_member: null, customer_email_sent_at: null, member: null, staff: null, raffle_tickets: [{ ticket_number: 5, ticket_reference: 'NDCCWHL-261010A-005' }, { ticket_number: 9, ticket_reference: 'NDCCWHL-261010A-009' }], receipt_delivery_jobs: null };
const wheelPrizes = [{ id: 'p1', position: 1, name: 'Tray', retail_value_cents: 2500, quantity: 1 }, { id: 'p2', position: 2, name: 'Voucher', retail_value_cents: 1000, quantity: 2 }];
const summary = report.wheelReportSummary([order, { ...order, id: 'o2', status: 'cancelled' }], wheelPrizes);
assert.equal(summary.paidCents, 1000); assert.equal(summary.prizeCostCents, 4500); assert.equal(summary.netCents, -3500); assert.equal(summary.tickets, 2);
const csv = report.wheelReportCsv({ campaignName: 'Wheel', campaignCode: 'NDCCWHL261010A', orders: [order], prizes: wheelPrizes,
  draws: [d(1, 'p1', null), { ...d(2, 'p1', 't5', 'unsold'), winning_number: 5, random_value: 'node:crypto.randomInt(1,25)=5', operator_id: 'u1' }],
  tickets: [{ id: 't5', ticket_number: 5, ticket_reference: 'NDCCWHL-261010A-005', order: { customer_name: 'Jordan Smith', customer_email: 'j@example.invalid' } }],
  collections: [{ draw_id: 'd2', collected_at: '2026-10-10T09:00:00Z', staff: { full_name: 'Committee Member' }, note: null }], operators: { u1: 'Operator One' } });
assert.ok(csv.startsWith('﻿')); assert.equal(csv.indexOf('﻿', 1), -1, 'one BOM only');
for (const text of ['3 years', 'Draw log', 'No winner - re-spin required', 'unsold', 'NDCCWHL-261010A-005', 'Operator One', 'Committee Member', 'Sales', '-35.00', '45.00']) {
  assert.ok(csv.includes(text), `report includes ${text}`);
}

// ---- No online game or instant-win wording on public surfaces ----
function files(dir) { return readdirSync(dir).flatMap(name => { const full = path.join(dir, name); return statSync(full).isDirectory() ? files(full) : [full]; }); }
const publicSource = [...files('app/prize-wheel'), 'lib/prize-wheel/winner-email.ts', 'lib/prize-wheel/ticket.ts'].map(file => readFileSync(file, 'utf8')).join('\n');
for (const banned of [/spin now/i, /instant/i, /spin to win/i, /play now/i, /you('| ha)ve won/i, /\bjackpot\b/i]) {
  assert.doesNotMatch(publicSource, banned, `public prize wheel copy must not contain ${banned}`);
}
const page = readFileSync('app/prize-wheel/page.tsx', 'utf8');
assert.match(page, /Nothing is spun or won online/);
assert.match(page, /18\+ only/);
assert.ok(page.includes('GAMBLING_HELP_PHONE') && rules.GAMBLING_HELP_PHONE === '1800 858 858');
assert.equal(rules.GAMBLING_HELP_URL, 'https://www.gamblinghelponline.org.au');
const client = readFileSync('app/prize-wheel/PrizeWheelClient.tsx', 'utf8');
assert.match(client, /I confirm I am 18 or older/);
assert.match(client, /canCheckout = ready && adult/);
assert.doesNotMatch(publicSource, /[–—]/, 'ASCII hyphens only');

// ---- Winner email escapes values ----
const winner = load('lib/prize-wheel/winner-email.ts', { '@/lib/email-html': load('lib/email-html.ts') });
const html = winner.winnerEmailBody({ customerName: '<b>x</b>', campaignName: 'Wheel', prizePosition: 1, prizeName: 'Tray', ticketNumber: 5, ticketReference: 'NDCCWHL-261010A-005', drawLabel: 'Clubrooms', collected: false });
assert.ok(!html.includes('<b>x</b>') && html.includes('reply to this email'));

console.log('Prize wheel rules, selection, RNG range, draw order, single win, re-spins, visibility, checkout, report and copy checks passed.');
