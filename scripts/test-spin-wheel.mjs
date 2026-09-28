// Deterministic Spin the Wheel tests: weighted server pick, odds maths,
// wheel geometry round trip, input validation mirrors, result references,
// spin pass tokens, escaped emails, public data shape and route wiring.
// No database, network, Stripe or email.
import assert from 'node:assert/strict';
import { deepEqual as loose } from 'node:assert';
import crypto from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, URL, Buffer, process, console, Intl, Date, Math, Number, Set, Map, Array, Object, String, JSON, Error,
    require(name) { if (name === 'server-only') return {}; assert.ok(name in dependencies, `unexpected import ${name} in ${file}`); return dependencies[name]; },
  });
  return exports;
}

const rules = load('lib/spin-wheel/rules.ts');
const random = load('lib/spin-wheel/random.ts', { 'node:crypto': crypto, '@/lib/spin-wheel/rules': rules });
const pass = load('lib/spin-wheel/pass.ts', { 'node:crypto': crypto });
const email = load('lib/spin-wheel/email.ts', { '@/lib/email-html': load('lib/email-html.ts') });
const geometry = load('lib/prize-wheel/wheel-geometry.ts');

// ---- Weighted pick: exact boundaries with an injected source ----
const segs = [
  { id: 'a', weight: 1, stock: null },
  { id: 'b', weight: 0, stock: null },   // never
  { id: 'c', weight: 3, stock: 0 },      // out of stock: never
  { id: 'd', weight: 2, stock: 5 },
  { id: 'e', weight: 7, stock: null },
];
// Pickable: a(1) d(2) e(7), total 10.
const pickWith = value => random.pickWeightedSegment(segs, new Set(), (min, max) => { assert.equal(min, 0); assert.equal(max, 10); return value; }).segment.id;
assert.equal(pickWith(0), 'a');
assert.equal(pickWith(1), 'd');
assert.equal(pickWith(2), 'd');
assert.equal(pickWith(3), 'e');
assert.equal(pickWith(9), 'e');
assert.match(random.pickWeightedSegment(segs, new Set(), () => 4).randomSource, /^node:crypto\.randomInt\(0,10\)=4$/);
assert.equal(random.pickWeightedSegment(segs, new Set(['e']), (min, max) => { assert.equal(max, 3); return 2; }).segment.id, 'd', 'excluded segments are skipped');
assert.throws(() => random.pickWeightedSegment([{ id: 'x', weight: 0, stock: null }, { id: 'y', weight: 4, stock: 0 }]), /No segment/);
assert.throws(() => random.pickWeightedSegment(segs, new Set(), () => 10), /outside/);
assert.throws(() => random.pickWeightedSegment(segs, new Set(), () => -1), /outside/);

// ---- Statistical sanity with the real CSPRNG ----
const counts = { a: 0, d: 0, e: 0 };
const draws = 100_000;
for (let i = 0; i < draws; i += 1) counts[random.pickWeightedSegment(segs).segment.id] += 1;
for (const [id, share] of [['a', 0.1], ['d', 0.2], ['e', 0.7]]) {
  assert.ok(Math.abs(counts[id] / draws - share) < 0.01, `${id} frequency ${counts[id] / draws} should be near ${share}`);
}

// ---- Probabilities shown to the committee match the picker ----
loose(rules.segmentProbabilities(segs).map(p => Math.round(p * 1000) / 1000), [0.1, 0, 0, 0.2, 0.7]);
assert.equal(rules.formatPercent(0), '0%');
assert.equal(rules.formatPercent(0.0005), '<0.1%');
assert.equal(rules.formatPercent(0.05), '5.0%');
assert.equal(rules.formatPercent(0.7), '70%');

// ---- Geometry: the wheel lands on the recorded segment ----
for (const count of [2, 8, 12, 24, 48]) {
  let rotation = 0;
  for (let target = 1; target <= count; target += 1) {
    rotation = geometry.rotationForNumber(target, count, rotation, 6);
    assert.equal(geometry.numberAtPointer(rotation, count), target, `${count} segments, target ${target}`);
    const step = 360 / count;
    for (const jitter of [-0.29 * step, 0.29 * step]) assert.equal(geometry.numberAtPointer(rotation - jitter, count), target, 'client jitter stays inside the segment');
  }
}

// ---- Validation mirrors the database ----
const segment = (over = {}) => ({ id: null, label: 'Try again', prize_name: null, prize_description: null, is_prize: false, weight: 1, stock: null, colour: 'maroon', ...over });
const base = {
  id: null, name: 'Dinos Spin', description: null, status: 'live', starts_at: null, ends_at: null, free_spins_per_account: 1,
  spin_price_cents: 200, max_spins_per_order: 20, claim_instructions: null, public_visibility_mode: 'visible', public_opens_at: null,
  segments: [segment(), segment({ label: 'Cap', is_prize: true, prize_name: 'Club cap', stock: 3 })],
};
loose(rules.validateSpinWheel(base), []);
assert.ok(rules.validateSpinWheel({ ...base, segments: [segment()] }).some(e => e.includes('2 to 48 segments')));
assert.ok(rules.validateSpinWheel({ ...base, segments: Array.from({ length: 49 }, () => segment()) }).some(e => e.includes('2 to 48 segments')));
assert.ok(rules.validateSpinWheel({ ...base, segments: [segment({ weight: 0 }), segment({ weight: 0 })] }).some(e => e.includes('above 0')));
assert.ok(rules.validateSpinWheel({ ...base, segments: [segment({ is_prize: true }), segment()] }).some(e => e.includes('needs a prize name')));
assert.ok(rules.validateSpinWheel({ ...base, segments: [segment({ label: 'x'.repeat(25) }), segment()] }).some(e => e.includes('label')));
assert.ok(rules.validateSpinWheel({ ...base, segments: [segment({ weight: 1.5 }), segment()] }).some(e => e.includes('odds weight')));
assert.ok(rules.validateSpinWheel({ ...base, segments: [segment({ stock: -1 }), segment()] }).some(e => e.includes('stock')));
// Daily limit: blank or 1 to 100 whole spins.
loose(rules.validateSpinWheel({ ...base, max_spins_per_day: null }), []);
loose(rules.validateSpinWheel({ ...base, max_spins_per_day: 3 }), []);
for (const bad of [0, 101, 2.5]) assert.ok(rules.validateSpinWheel({ ...base, max_spins_per_day: bad }).some(e => e.includes('per person per day')), `daily limit ${bad} rejected`);
const normalised = rules.normaliseSpinWheelInput({ ...base, max_spins_per_day: '3', segments: [
  { label: 'Raffle', is_prize: true, prize_name: 'Raffle entry', once_per_spinner: true, weight: 1, colour: 'gold' },
  { label: 'Try again', is_prize: false, once_per_spinner: true, weight: 1, colour: 'navy' },
] });
assert.equal(normalised.max_spins_per_day, 3);
assert.equal(normalised.segments[0].once_per_spinner, true);
assert.equal(normalised.segments[1].once_per_spinner, false, 'once per person applies to prize segments only');
assert.equal(rules.normaliseSpinWheelInput({ ...base, max_spins_per_day: '' }).max_spins_per_day, null);
assert.ok(rules.validateSpinWheel({ ...base, spin_price_cents: 49 }).some(e => e.includes('spin price')));
loose(rules.validateSpinWheel({ ...base, spin_price_cents: null }), [], 'blank price turns paid spins off');
assert.ok(rules.validateSpinWheel({ ...base, free_spins_per_account: 101 }).some(e => e.includes('Free spins')));
assert.ok(rules.validateSpinWheel({ ...base, starts_at: '2026-10-02T00:00:00Z', ends_at: '2026-10-01T00:00:00Z' }).some(e => e.includes('after the start')));
assert.ok(rules.validateSpinWheel({ ...base, public_visibility_mode: 'scheduled', public_opens_at: null }).some(e => e.includes('public page opens')));
assert.equal(rules.normaliseSpinWheelInput({ ...base, status: 'bogus', segments: [{ colour: 'purple' }] }).status, 'draft');
assert.equal(rules.normaliseSpinWheelInput({ ...base, segments: [{ colour: 'purple' }] }).segments[0].colour, 'maroon');
assert.equal(rules.normaliseSpinWheelInput({ ...base, public_visibility_mode: 'visible', public_opens_at: '2026-10-01T00:00:00Z' }).public_opens_at, null);
assert.equal(rules.normaliseSpinWheelInput(null), null);
assert.equal(rules.normaliseSpinWheelInput({ name: 'x' }), null);
assert.ok(rules.spinWheelWarnings({ ...base, segments: [segment({ stock: 0 }), segment({ weight: 0 })] }).some(w => w.includes('nobody can spin')));
assert.ok(rules.spinWheelWarnings({ ...base, free_spins_per_account: 0, spin_price_cents: null }).some(w => w.includes('committee-granted')));

// ---- Live window and public visibility ----
const at = iso => new Date(iso);
const wheel = { status: 'live', starts_at: '2026-10-01T00:00:00Z', ends_at: '2026-10-02T00:00:00Z', public_visibility_mode: 'visible', public_opens_at: null };
assert.equal(rules.isSpinWheelLive(wheel, at('2026-09-30T23:59:59Z')), false);
assert.equal(rules.isSpinWheelLive(wheel, at('2026-10-01T00:00:00Z')), true);
assert.equal(rules.isSpinWheelLive(wheel, at('2026-10-02T00:00:00Z')), false, 'end is exclusive, as in the RPC');
assert.equal(rules.isSpinWheelLive({ ...wheel, status: 'paused' }, at('2026-10-01T12:00:00Z')), false);
assert.equal(rules.spinWheelPhase(wheel, at('2026-09-30T00:00:00Z')), 'upcoming');
assert.equal(rules.spinWheelPhase({ ...wheel, status: 'paused' }, at('2026-10-01T12:00:00Z')), 'paused');
assert.equal(rules.spinWheelPhase(wheel, at('2026-10-03T00:00:00Z')), 'ended');
assert.equal(rules.isSpinWheelPubliclyVisible({ ...wheel, status: 'draft' }, at('2026-10-01T12:00:00Z')), false);
assert.equal(rules.isSpinWheelPubliclyVisible({ ...wheel, public_visibility_mode: 'hidden' }, at('2026-10-01T12:00:00Z')), false);
assert.equal(rules.isSpinWheelPubliclyVisible({ ...wheel, public_visibility_mode: 'scheduled', public_opens_at: '2026-10-01T06:00:00Z' }, at('2026-10-01T05:59:00Z')), false);
assert.equal(rules.isSpinWheelPubliclyVisible({ ...wheel, public_visibility_mode: 'scheduled', public_opens_at: '2026-10-01T06:00:00Z' }, at('2026-10-01T06:00:00Z')), true);
assert.equal(rules.isSpinWheelPubliclyVisible(wheel, at('2026-10-02T00:00:00Z')), false, 'closed wheels leave the public page');
const chosen = rules.choosePublicSpinWheel([
  { ...wheel, id: 'paused', status: 'paused', starts_at: '2026-10-01T06:00:00Z' },
  { ...wheel, id: 'live' },
  { ...wheel, id: 'hidden', public_visibility_mode: 'hidden' },
], at('2026-10-01T12:00:00Z'));
assert.equal(chosen.id, 'live', 'a live wheel wins over a paused one');

// ---- Paid spin sales stop before the checkout window can outlive the wheel ----
const priced = { ...wheel, spin_price_cents: 200 };
assert.equal(rules.SPIN_CHECKOUT_CLOSE_MINUTES, 70, 'longer than the 60 minute Stripe Checkout Session');
assert.equal(rules.isSpinCheckoutOpen(priced, at('2026-10-01T22:49:00Z')), true, '71 minutes before close');
assert.equal(rules.isSpinCheckoutOpen(priced, at('2026-10-01T22:50:00Z')), false, 'exactly 70 minutes before close');
assert.equal(rules.isSpinCheckoutOpen({ ...priced, ends_at: null }, at('2026-10-01T22:50:00Z')), true, 'no close time');
assert.equal(rules.isSpinCheckoutOpen({ ...priced, spin_price_cents: null }, at('2026-10-01T12:00:00Z')), false);
assert.equal(rules.isSpinCheckoutOpen({ ...priced, status: 'paused' }, at('2026-10-01T12:00:00Z')), false);
// Closing detection for the admin confirmation.
const now = at('2026-10-01T12:00:00Z');
assert.equal(rules.closesSpinWheel({ public_visibility_mode: 'visible', public_opens_at: null, status: 'live', ends_at: null }, { public_visibility_mode: 'visible', public_opens_at: null, status: 'paused', ends_at: null }, now), true);
assert.equal(rules.closesSpinWheel({ public_visibility_mode: 'visible', public_opens_at: null, status: 'live', ends_at: null }, { public_visibility_mode: 'visible', public_opens_at: null, status: 'ended', ends_at: null }, now), true);
assert.equal(rules.closesSpinWheel({ public_visibility_mode: 'visible', public_opens_at: null, status: 'live', ends_at: null }, { public_visibility_mode: 'visible', public_opens_at: null, status: 'live', ends_at: '2026-10-01T12:30:00Z' }, now), true, 'close moved inside the window');
assert.equal(rules.closesSpinWheel({ public_visibility_mode: 'visible', public_opens_at: null, status: 'live', ends_at: null }, { public_visibility_mode: 'visible', public_opens_at: null, status: 'live', ends_at: '2026-10-05T12:00:00Z' }, now), false, 'close far away');
assert.equal(rules.closesSpinWheel({ public_visibility_mode: 'visible', public_opens_at: null, status: 'live', ends_at: '2026-10-01T12:30:00Z' }, { public_visibility_mode: 'visible', public_opens_at: null, status: 'live', ends_at: '2026-10-01T12:30:00Z' }, now), false, 'unchanged close time');
assert.equal(rules.closesSpinWheel({ public_visibility_mode: 'visible', public_opens_at: null, status: 'paused', ends_at: null }, { public_visibility_mode: 'visible', public_opens_at: null, status: 'ended', ends_at: null }, now), false, 'already not live');

// ---- Public data never carries odds or stock ----
const published = rules.publicSegments([
  { id: 's2', position: 2, label: 'Cap', prize_name: 'Club cap', prize_description: null, is_prize: true, weight: 5, stock: 0, colour: 'gold' },
  { id: 's1', position: 1, label: 'Again', prize_name: null, prize_description: null, is_prize: false, weight: 95, stock: null, colour: 'navy' },
]);
loose(published.map(item => item.position), [1, 2]);
for (const item of published) {
  loose(Object.keys(item).sort(), ['available', 'colour', 'is_prize', 'label', 'once_per_spinner', 'position', 'prize_description', 'prize_name']);
}
assert.equal(published[1].available, false, 'out of stock shows as unavailable');

// ---- Result references and quantities ----
const refs = new Set();
for (let i = 0; i < 10_000; i += 1) {
  const ref = random.spinResultReference();
  assert.ok(rules.isSpinResultReference(ref), ref);
  assert.doesNotMatch(ref.slice(5), /[ILOU]/);
  refs.add(ref);
}
assert.ok(refs.size > 9_990, 'references are effectively unique');
assert.equal(rules.validSpinQuantity(1, 20), true);
assert.equal(rules.validSpinQuantity(21, 20), false);
assert.equal(rules.validSpinQuantity(0, 20), false);
assert.equal(rules.validSpinQuantity(2.5, 20), false);

// ---- Spin passes: re-derivable token, only the hash is stored ----
const env = { SPIN_WHEEL_PASS_SECRET: 'test-secret-value' };
const passId = '7d7f4c1e-8a44-4d5b-9a1e-0f7a6c3e2b11';
const token = pass.spinPassToken(passId, env);
assert.equal(token, pass.spinPassToken(passId, env), 'same pass id gives the same token, so links can be re-sent');
assert.notEqual(token, pass.spinPassToken('8d7f4c1e-8a44-4d5b-9a1e-0f7a6c3e2b11', env));
assert.notEqual(token, pass.spinPassToken(passId, { SPIN_WHEEL_PASS_SECRET: 'other' }));
assert.equal(pass.isSpinPassToken(token), true);
assert.equal(pass.isSpinPassToken(`${token}x`), false);
const hashed = pass.hashSpinPassToken(token);
assert.match(hashed, /^[0-9a-f]{64}$/);
assert.ok(!hashed.includes(token));
assert.equal(pass.spinPassToken(passId, { SUPABASE_SERVICE_ROLE_KEY: 'fallback' }), pass.spinPassToken(passId, { SUPABASE_SERVICE_ROLE_KEY: 'fallback' }));
assert.throws(() => pass.spinPassToken(passId, {}), /not configured/);
assert.equal(pass.spinPassUrl('https://www.ndcc.com.au/', token), `https://www.ndcc.com.au/spin-the-wheel?pass=${token}`);

// ---- Emails escape every value ----
const passHtml = email.spinPassEmailBody({ name: '<b>x</b>', wheelName: 'Wheel & Co', spins: 3, link: 'https://example.invalid/?a="1"' });
assert.ok(!passHtml.includes('<b>x</b>') && passHtml.includes('&lt;b&gt;') && passHtml.includes('Wheel &amp; Co') && !passHtml.includes('"1"'));
const winHtml = email.spinWinnerEmailBody({ name: null, email: 'w@example.invalid', wonAt: 'Monday 28 September 2026 at 7:00 pm', wheelName: 'Wheel', reference: 'SPIN-ABC123', prizeName: '<i>Cap</i>', prizeDescription: null, claimInstructions: 'Line 1\n<script>' });
assert.ok(!winHtml.includes('<i>Cap</i>') && !winHtml.includes('<script>') && winHtml.includes('Line 1<br>'));
assert.ok(email.spinWinnerEmailBody({ name: 'A', email: 'a@example.invalid', wonAt: 'now', wheelName: 'W', reference: 'SPIN-ABC123', prizeName: 'Cap', prizeDescription: null, claimInstructions: null }).includes('reply to this email'));
// Winner email is a prize receipt: reference, prize, time, winner and the bar.
const receipt = email.spinWinnerEmailBody({ name: 'Sam <x>', email: 's@example.invalid', wonAt: 'Monday 28 September 2026 at 7:00 pm', wheelName: 'Dino Wheel', reference: 'SPIN-ABC123', prizeName: 'Raffle entry', prizeDescription: 'One entry', claimInstructions: 'Show at the bar' });
for (const part of ['prize receipt', 'SPIN-ABC123', 'Raffle entry', 'One entry', 'Monday 28 September 2026 at 7:00 pm', 's@example.invalid', 'club bar']) assert.ok(receipt.includes(part), `receipt shows ${part}`);
assert.ok(!receipt.includes('Sam <x>') && receipt.includes('Sam &lt;x&gt;'));
assert.equal(email.spinWinnerEmailSubject({ wheelName: 'Dino Wheel', prizeName: 'Raffle entry', reference: 'SPIN-ABC123' }), 'Prize receipt SPIN-ABC123 - Dino Wheel: Raffle entry');

// ---- Error mapping ----
assert.equal(rules.spinErrorMessage('spin_wheel:segment_out_of_stock').retrySegment, true);
assert.equal(rules.spinErrorMessage('spin_wheel:no_spins_left').status, 409);
assert.match(rules.spinErrorMessage('spin_wheel:daily_limit').message, /today.*midnight/);
assert.equal(rules.spinErrorMessage('spin_wheel:daily_limit').retrySegment, false);
assert.equal(rules.spinErrorMessage('boom').status, 503);

// ---- Route and payment wiring (source checks) ----
const read = file => readFileSync(file, 'utf8');
const spinRoute = read('app/api/spin-wheel/spin/route.ts');
assert.ok(spinRoute.indexOf("rpc('record_spin_wheel_result'") > 0 && spinRoute.indexOf("rpc('record_spin_wheel_result'") < spinRoute.indexOf('spinReply({ success: true'), 'the result is recorded before the reply');
assert.match(spinRoute, /pickWeightedSegment/);
const publicRoute = read('app/api/spin-wheel/route.ts');
assert.match(publicRoute, /publicSegments\(segments\)/);
assert.doesNotMatch(publicRoute, /\.weight\b|\.stock\b|\bweight:|\bstock:/, 'public wheel route never serialises odds or stock');
for (const file of ['app/api/admin/spin-wheel/route.ts', 'app/api/admin/spin-wheel/[id]/route.ts', 'app/api/admin/spin-wheel/[id]/grant/route.ts', 'app/api/admin/spin-wheel/[id]/results/route.ts']) {
  const source = read(file);
  const handlers = source.match(/export async function (GET|POST|PATCH|DELETE)/g) || [];
  const guards = source.match(/requirePermissionResult\('raffle'\)/g) || [];
  assert.ok(handlers.length > 0 && guards.length === handlers.length, `${file}: every handler checks the raffle permission`);
}
const checkout = read('app/api/spin-wheel/checkout/route.ts');
assert.match(checkout, /order_category: SPIN_ORDER_CATEGORY/);
assert.match(checkout, /generateUniquePaymentReference\('general'\)/);
assert.doesNotMatch(checkout, /stripe\.checkout|getStripe/, 'spin orders are paid through the shared order checkout, not a new Stripe path');
assert.equal(rules.SPIN_ORDER_CATEGORY, 'spin_wheel');
const session = read('app/api/payments/checkout-session/route.ts');
assert.match(session, /spin_wheel: '\/spin-the-wheel'/);
assert.match(session, /path === '\/spin-the-wheel'/);
assert.match(read('app/payment/page.tsx'), /value === '\/spin-the-wheel'/);
assert.doesNotMatch(read('app/api/stripe/webhook/route.ts'), /spin/i, 'the Stripe webhook is unchanged');
const migration = read('supabase/migrations/20260928100000_spin_the_wheel.sql');
assert.match(migration, /after update of payment_status, deleted_at on public\.orders/);
assert.match(migration, /if v_payment_status = 'paid' and v_deleted is null then/);
assert.match(migration, /on conflict \(wheel_id, auth_user_id, seq\) where source = 'free' do nothing/);
assert.match(migration, /segment_id uuid references public\.spin_wheel_segments\(id\) on delete set null/);
assert.match(migration, /exception when others then\s+raise warning/);
const cron = JSON.parse(read('vercel.json')).crons.map(item => item.path);
assert.ok(cron.includes('/api/cron/spin-wheel-passes'));
assert.match(read('components/layout/Navbar.tsx'), /\(spinWheelEnabled \|\| link\.href !== '\/spin-the-wheel'\)/);
assert.match(read('components/layout/Footer.tsx'), /spinWheelEnabled === true \|\| !link\.href\.startsWith\('\/spin-the-wheel'\)/);
assert.match(read('lib/server/sitemap-entries.ts'), /isSpinWheelPublicStrict/);

// ---- CMS show/hide switch ----
const toggleMigration = read('supabase/migrations/20260928113301_spin_wheel_public_toggle.sql');
assert.match(toggleMigration, /add column if not exists spin_wheel_enabled boolean not null default true/);
assert.doesNotMatch(toggleMigration, /\b(delete|drop|truncate|update)\b/i, 'Hiding must never touch wheel data');
const visibilitySource = read('lib/spin-wheel/visibility.ts');
assert.match(visibilitySource, /select\('spin_wheel_enabled'\)/);
assert.match(visibilitySource, /if \(!enabled \|\| error \|\| !Array\.isArray\(data\)\) return null;/, 'Every public surface reads getPublicSpinWheel, so the switch gates them all');
assert.match(visibilitySource, /spin_wheel_enabled !== false/, 'Only an explicit false hides the feature');
assert.match(visibilitySource, /if \(!setting\.enabled\) return false;/, 'Sitemap respects the switch');
const toggleRoute = read('app/api/admin/spin-wheel/visibility/route.ts');
assert.equal((toggleRoute.match(/requirePermissionResult\('raffle'\)/g) || []).length, 2);
assert.match(toggleRoute, /typeof enabled !== 'boolean'/);
assert.match(toggleRoute, /\.update\(\{ spin_wheel_enabled: enabled \}\)/);
assert.doesNotMatch(toggleRoute, /from\('spin_wheel/, 'The switch never writes wheel tables');
assert.match(toggleRoute, /revalidatePublicContent\('clubSettings'\)/);
assert.match(toggleRoute, /revalidateTag\(SPIN_SWITCH_CACHE_TAG\)/, 'the switch clears its cached value immediately');
assert.match(visibilitySource, /unstable_cache\([\s\S]*revalidate: 60, tags: \[SPIN_SWITCH_CACHE_TAG\]/, 'no extra database read per public request');
assert.match(read('app/api/admin/resources/[resource]/route.ts'), /clubSettings: \['club-settings'\]/, 'club details saves clear the same tag');
assert.match(read('app/admin/raffle/spin-wheel/page.tsx'), /Show Spin the Wheel on the public website/);

// Behaviour: the switch hides the live wheel from every public read and
// showing it again returns the same wheel; a missing column keeps it shown.
{
  const liveWheel = { id: 'w1', name: 'Live', status: 'live', ends_at: null, public_visibility_mode: 'visible', public_opens_at: null, starts_at: null, created_at: '2026-09-01T00:00:00Z' };
  const makeVisibility = (setting) => load('lib/spin-wheel/visibility.ts', {
    react: { cache: fn => fn },
    'next/cache': { unstable_cache: fn => fn },
    '@/lib/supabase-schema-errors': { isMissingSchemaError: error => ['42703', 'PGRST204'].includes(error?.code || '') },
    '@/lib/spin-wheel/rules': rules,
    '@/lib/supabase-server': { createServerClient: () => ({ from(table) {
      const query = { select() { return query; }, eq() { return query; }, in() { return Promise.resolve({ data: [liveWheel], error: null }); },
        maybeSingle() { return Promise.resolve(setting); } };
      assert.ok(['club_settings', 'spin_wheels'].includes(table));
      return query;
    } }) },
  });
  const shown = makeVisibility({ data: { spin_wheel_enabled: true }, error: null });
  assert.equal((await shown.getPublicSpinWheel())?.id, 'w1');
  assert.equal(await shown.isSpinWheelPublicStrict(), true);
  const hidden = makeVisibility({ data: { spin_wheel_enabled: false }, error: null });
  assert.equal(await hidden.getPublicSpinWheel(), null);
  assert.equal(await hidden.isSpinWheelPublic(), false);
  assert.equal(await hidden.isSpinWheelPublicStrict(), false);
  const premigration = makeVisibility({ data: null, error: { code: '42703', message: 'column does not exist' } });
  assert.equal((await premigration.getPublicSpinWheel())?.id, 'w1');
  const outage = makeVisibility({ data: null, error: { code: '57014', message: 'timeout' } });
  assert.equal(await outage.getPublicSpinWheel(), null);
  await assert.rejects(outage.isSpinWheelPublicStrict(), /unavailable/);
}

// Checkout of an existing spin order also respects the switch (read fresh).
{
  const openWheel = { status: 'live', starts_at: null, ends_at: null, spin_price_cents: 200, public_visibility_mode: 'visible', public_opens_at: null };
  const guard = (setting) => load('lib/spin-wheel/checkout-guard.ts', {
    '@/lib/spin-wheel/rules': rules,
    '@/lib/supabase-schema-errors': { isMissingSchemaError: error => ['42703', 'PGRST204'].includes(error?.code || '') },
  }).spinOrderCheckoutFailure({ from(table) {
    const query = { select() { return query; }, eq() { return query; },
      maybeSingle() { return Promise.resolve(table === 'club_settings' ? setting : { data: { wheel: openWheel }, error: null }); } };
    return query;
  } }, 'order-1');
  assert.equal(await guard({ data: { spin_wheel_enabled: true }, error: null }), null);
  assert.match(await guard({ data: { spin_wheel_enabled: false }, error: null }), /not available at the moment\. No payment was taken/);
  assert.equal(await guard({ data: null, error: { code: '42703', message: 'column does not exist' } }), null);
  assert.match(await guard({ data: null, error: { code: '57014', message: 'timeout' } }), /could not be checked/);
}

// ---- Review follow-ups (#278) ----
const checkoutRoute = read('app/api/spin-wheel/checkout/route.ts');
assert.match(checkoutRoute, /if \(!isSpinCheckoutOpen\(wheel\)\)/, 'checkout refuses inside the closing window');
const adminSave = read('app/api/admin/spin-wheel/route.ts');
assert.ok(adminSave.indexOf('closesSpinWheel(current, input)') > 0 && adminSave.indexOf('closesSpinWheel(current, input)') < adminSave.indexOf("rpc('save_spin_wheel'"), 'closing is confirmed before saving');
assert.match(adminSave, /confirm_close !== true/);
const adminDelete = read('app/api/admin/spin-wheel/[id]/route.ts');
for (const table of ['spin_wheel_results', 'spin_wheel_orders', 'spin_wheel_passes', 'spin_wheel_entitlements']) assert.ok(adminDelete.includes(`'${table}'`), `delete checks ${table}`);
const cronRoute = read('app/api/cron/spin-wheel-passes/route.ts');
// Daily limit enforced before an order is created; winner receipts copied to the committee list.
assert.match(checkoutRoute, /spinDailyCapacity\(db, wheel\.id, \{ userId: authUserId \}, email\)/);
assert.ok(checkoutRoute.indexOf('spinDailyCapacity(') < checkoutRoute.indexOf("from('orders').insert"), 'daily limit checked before the order is created');
const serverSource = read('lib/spin-wheel/server.ts');
assert.match(serverSource, /getNotificationRecipients\('spin_wheel_winners'\)/);
assert.match(serverSource, /bcc: copies\.length \? copies : undefined/);
assert.match(read('app/api/spin-wheel/me/route.ts'), /spinDailyCapacity/);
assert.match(cronRoute, /spin_wheel_orders_needing_work/, 'cron works through every outstanding order');
assert.doesNotMatch(cronRoute, /\.limit\(500\)/, 'no single capped query');
assert.match(cronRoute, /sendSpinWinnerEmail/, 'cron retries winner emails');
const client = read('app/spin-the-wheel/SpinWheelClient.tsx');
assert.doesNotMatch(client, /localStorage/, 'spin links are not kept after the browser closes');
assert.match(client, /sessionStorage/);
assert.match(client, /result\.emailed \?/, 'the page only claims an email was sent when it was');
assert.match(read('app/api/spin-wheel/spin/route.ts'), /spinsLeft: left, emailed \}/);

// ---- Second review round (#278) ----
const session2 = read('app/api/payments/checkout-session/route.ts');
assert.ok(session2.includes("order.order_category === 'spin_wheel'") && session2.includes('spinOrderCheckoutFailure(supabase, order.id)'), 'each Stripe session re-checks the spin wheel');
assert.match(read('lib/spin-wheel/checkout-guard.ts'), /isSpinCheckoutOpen\(wheel\)/);
const editor = read('app/admin/raffle/spin-wheel/[id]/page.tsx');
assert.match(editor, /datetimeLocalToClubIso/, 'admin dates are Melbourne time whatever the browser zone');
assert.match(editor, /toDatetimeLocalInClubTimezone/);
assert.doesNotMatch(editor, /getTimezoneOffset/);
const results = read('app/api/admin/spin-wheel/[id]/results/route.ts');
assert.doesNotMatch(results, /\.limit\(5000\)/, 'results are paged, never capped');
assert.match(results, /nextCursor/);
assert.match(adminSave, /Only one wheel can be live at a time/);
const followUp = read('supabase/migrations/20260928110000_spin_the_wheel_single_live.sql');
assert.match(followUp, /create unique index spin_wheels_single_live on public\.spin_wheels \(\(true\)\) where status = 'live'/);
assert.match(followUp, /keep := greatest\(allowance - used_count, 0\);/);

// ---- Third review round (#278) ----
const adminLib = load('lib/spin-wheel/admin.ts');
const cursor = adminLib.parseSpinCursor('2026-09-28T00:12:00.123456+00:00|7d7f4c1e-8a44-4d5b-9a1e-0f7a6c3e2b11');
assert.equal(cursor.createdAt, '2026-09-28T00:12:00.123456+00:00', 'microseconds are kept exactly');
assert.equal(adminLib.spinCursorOf({ created_at: cursor.createdAt, id: cursor.id }), '2026-09-28T00:12:00.123456+00:00|7d7f4c1e-8a44-4d5b-9a1e-0f7a6c3e2b11');
assert.equal(adminLib.spinKeysetFilter(cursor, 'desc'), 'created_at.lt."2026-09-28T00:12:00.123456+00:00",and(created_at.eq."2026-09-28T00:12:00.123456+00:00",id.lt.7d7f4c1e-8a44-4d5b-9a1e-0f7a6c3e2b11)');
assert.match(adminLib.spinKeysetFilter(cursor, 'asc'), /^created_at\.gt\.".*id\.gt\./);
for (const bad of [null, '', 'x|y', '2026-09-28T00:12:00Z', '2026-09-28T00:12:00Z|not-a-uuid', '2026-09-28T00:12:00Z",id.gt.x|7d7f4c1e-8a44-4d5b-9a1e-0f7a6c3e2b11', '2026-09-28T00:12:00Z|7d7f4c1e-8a44-4d5b-9a1e-0f7a6c3e2b11|x']) {
  assert.equal(adminLib.parseSpinCursor(bad), null, `rejects cursor ${bad}`);
}
const resultsRoute = read('app/api/admin/spin-wheel/[id]/results/route.ts');
assert.match(resultsRoute, /spinKeysetFilter\(cursor, 'desc'\)/, 'results page from the last row shown');
assert.doesNotMatch(resultsRoute, /\.range\(/, 'no offset paging for results');
const cron3 = read('app/api/cron/spin-wheel-passes/route.ts');
assert.match(cron3, /rpc\('spin_wheel_orders_needing_work', \{ since, max_rows: PAGE_SIZE, skip_ids: \[\.\.\.attempted\] \}\)/, 'cron queries only outstanding work');
assert.doesNotMatch(cron3, /\.range\(/);
const serverLib = read('lib/spin-wheel/server.ts');
assert.match(serverLib, /update\(\{ token_hash: hash \}\)\.eq\('id', passId\)\.neq\('token_hash', hash\)/, 're-sent links move the stored hash to the current secret');
assert.equal((serverLib.match(/await currentPassLink\(db, pass\.id\)/g) || []).length, 2, 'both link emails use the current link');
assert.match(read('supabase/migrations/20260928120000_spin_the_wheel_cron_work.sql'), /create function public\.spin_wheel_orders_needing_work\(since timestamptz, max_rows integer, skip_ids uuid\[\] default '\{\}'\)/);

// ---- Fourth review round (#278) ----
const liveNow = at('2026-10-01T12:00:00Z');
assert.equal(rules.closesSpinWheel({ public_visibility_mode: 'visible', public_opens_at: null, status: 'live', starts_at: null, ends_at: null }, { public_visibility_mode: 'visible', public_opens_at: null, status: 'live', starts_at: '2026-10-02T00:00:00Z', ends_at: null }, liveNow), true, 'moving the start later closes an open wheel');
assert.equal(rules.closesSpinWheel({ public_visibility_mode: 'visible', public_opens_at: null, status: 'live', starts_at: '2026-10-02T00:00:00Z', ends_at: null }, { public_visibility_mode: 'visible', public_opens_at: null, status: 'paused', starts_at: '2026-10-02T00:00:00Z', ends_at: null }, liveNow), false, 'a wheel not open yet closes nothing');
assert.equal(rules.closesSpinWheel({ public_visibility_mode: 'visible', public_opens_at: null, status: 'live', starts_at: null, ends_at: null }, { public_visibility_mode: 'visible', public_opens_at: null, status: 'live', starts_at: '2026-09-01T00:00:00Z', ends_at: null }, liveNow), false, 'moving the start earlier keeps it open');
assert.match(read('app/api/admin/spin-wheel/route.ts'), /rpc\('spin_wheel_close_impact'/, 'in-progress checkouts come from the payment ledger');
assert.match(read('app/api/payments/bank-transfer/route.ts'), /order\.order_category === 'spin_wheel'/, 'spin orders cannot switch to bank deposit');
const server4 = read('lib/spin-wheel/server.ts');
assert.match(server4, /linked\.payment_status !== 'paid'/, 'no link email after a refund');
assert.match(server4, /spins: openSpins/, 'the email states the spins still open');
const guard = read('supabase/migrations/20260928130000_spin_the_wheel_settlement_guard.sql');
assert.match(guard, /v_wheel\.status = 'ended' or \(v_wheel\.ends_at is not null and v_wheel\.ends_at <= now\(\)\)/);
assert.match(guard, /needs_review_reason = 'Spin the Wheel closed before this payment settled/);

// ---- Post-merge review (#278, head 7768189) ----
const openLive = { status: 'live', starts_at: null, ends_at: null, public_visibility_mode: 'visible', public_opens_at: null };
assert.equal(rules.closesSpinWheel(openLive, { ...openLive, public_visibility_mode: 'hidden' }, liveNow), true, 'hiding the public page closes an open wheel');
assert.equal(rules.closesSpinWheel(openLive, { ...openLive, public_visibility_mode: 'scheduled', public_opens_at: '2026-10-05T00:00:00Z' }, liveNow), true, 'rescheduling the page later closes it');
assert.equal(rules.closesSpinWheel({ ...openLive, public_visibility_mode: 'hidden' }, { ...openLive, status: 'ended' }, liveNow), false, 'a hidden wheel closes nothing');
assert.equal(rules.isSpinCheckoutOpen({ ...openLive, spin_price_cents: 200, public_visibility_mode: 'hidden' }, liveNow), false, 'no sales while the page is hidden');
assert.equal(rules.isSpinCheckoutOpen({ ...openLive, spin_price_cents: 200 }, liveNow), true);
assert.match(read('lib/spin-wheel/checkout-guard.ts'), /public_visibility_mode,public_opens_at/, 'the Stripe session guard sees visibility');
const balance = read('app/api/payments/balance/route.ts');
assert.match(balance, /order\.order_category === 'spin_wheel' \? \{ \.\.\.derived, bank_transfer: false \}/, 'pay-balance never shows bank details for spin orders');
assert.match(balance, /order\.order_category === 'spin_wheel' \? '\/spin-the-wheel'/);
const statusRoute = read('app/api/spin-wheel/orders/[id]/route.ts');
assert.match(statusRoute, /if \(sync\.error\) return spinReply\(\{ success: false/, 'a failed re-sync is not reported as spins added');
assert.match(statusRoute, /\(count \|\| 0\) < link\.quantity/);
assert.match(read('app/api/spin-wheel/checkout/route.ts'), /if \(passId\) await db\.from\('spin_wheel_passes'\)\.delete\(\)\.eq\('id', passId\)/, 'failed checkout removes the guest pass');

// ---- ASCII hyphens only in the new files ----
function files(dir) { return readdirSync(dir).flatMap(name => { const full = path.join(dir, name); return statSync(full).isDirectory() ? files(full) : [full]; }); }
const newFiles = [...files('app/spin-the-wheel'), ...files('app/api/spin-wheel'), ...files('app/api/admin/spin-wheel'), ...files('app/admin/raffle/spin-wheel'),
  ...files('lib/spin-wheel'), ...files('components/spin-wheel'), 'app/api/cron/spin-wheel-passes/route.ts', 'supabase/migrations/20260928100000_spin_the_wheel.sql', 'supabase/migrations/20260928110000_spin_the_wheel_single_live.sql', 'supabase/migrations/20260928120000_spin_the_wheel_cron_work.sql', 'supabase/migrations/20260928130000_spin_the_wheel_settlement_guard.sql'];
for (const file of newFiles) assert.doesNotMatch(read(file), /[–—]/, `${file}: ASCII hyphens only`);

console.log('Spin the Wheel pick, odds, geometry, validation, visibility, public shape, references, passes, emails and wiring checks passed.');
