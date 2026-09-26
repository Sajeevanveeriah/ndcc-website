// Bank deposit hardening (WP2). Isolated handlers with mocked Supabase,
// Stripe and email: no database, network, payment or message is touched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');

class NextResponse extends Response { static json(body, init) { return new Response(JSON.stringify(body), { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } }); } }
const bankEnv = { NDCC_BANK_ACCOUNT_NAME: 'TEST ONLY', NDCC_BANK_BSB: '000000', NDCC_BANK_ACCOUNT_NUMBER: '00000000' };
function load(file, mocks = {}, env = bankEnv) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, console, Request, Response, Headers, URL, Date, crypto, process: { env }, require(name) {
      if (name in mocks) return mocks[name];
      if (name === 'server-only') return {};
      if (name.startsWith('@/')) return load(path.resolve(name.slice(2) + '.ts'), mocks, env);
      if (name.startsWith('./')) return load(path.resolve(path.dirname(file), name.slice(2) + '.ts'), mocks, env);
      return require(name);
    } }, { filename: file });
  return exports;
}
const read = file => fs.readFileSync(file, 'utf8');
const id = '11111111-1111-4111-8111-111111111111';
const adminId = '22222222-2222-4222-8222-222222222222';
const req = (url, body) => new Request(url, { method: 'POST', body: JSON.stringify(body) });
let passed = 0;
async function test(name, fn) { await fn(); passed += 1; console.log(`  ok - ${name}`); }

(async () => {
  // ---- B1 named constants and helpers ------------------------------------
  const bank = load('lib/payments/bank-transfer.ts');
  await test('B1 bank hold lifetime is a named 48 hour constant', async () => {
    assert.equal(bank.BANK_TRANSFER_HOLD_HOURS, 48);
    assert.equal(bank.BANK_TRANSFER_HOLD_MS, 48 * 3_600_000);
    const now = Date.parse('2026-09-27T00:00:00Z');
    assert.equal(bank.bankHoldExpired('2026-09-24T23:59:59Z', now), true);
    assert.equal(bank.bankHoldExpired('2026-09-25T00:00:01Z', now), false);
    assert.equal(bank.bankHoldExpired(null, now), false, 'card orders never expire as bank holds');
    assert.equal(bank.bankHoldExpired('not a date', now), false);
  });
  await test('B1 SQL defines the same named constant, expires only unconfirmed bank holds and guards confirmation', async () => {
    const files = fs.readdirSync('supabase/migrations').filter(f => /^2026092702\d{4}_.*\.sql$/.test(f));
    const sql = files.map(f => read(`supabase/migrations/${f}`)).join('\n');
    assert.match(sql, /function public\.reverse_raffle_bank_hold_interval\(\)[\s\S]*?interval '48 hours'/);
    assert.match(sql, /create or replace function public\.reverse_raffle_unavailable_numbers\(\)/);
    assert.match(sql, /create or replace function public\.confirm_special_bank_transfer\(/);
    assert.match(sql, /Reverse raffle numbers no longer available/);
    assert.match(sql, /raffle_bank_transfer_enabled boolean/);
    assert.match(sql, /dino_bank_transfer_enabled boolean/);
    assert.match(sql, /donation_bank_transfer_enabled boolean/);
    assert.match(sql, /on public\.raffle_orders\s*\(bank_transfer_confirmed_by\)/);
    assert.match(sql, /on public\.fantasy_entries\s*\(bank_transfer_confirmed_by\)/);
    assert.match(sql, /switch_dino_bank_transfer_to_card/);
    for (const f of files) {
      const text = read(`supabase/migrations/${f}`);
      assert.match(text, /^-- Rollback/m, `${f} documents rollback`);
      assert.match(text, /set local lock_timeout = '3s';/, `${f} sets lock_timeout`);
      assert.doesNotMatch(text, /[\u2013\u2014]/, `${f} uses ASCII hyphens`);
    }
    assert.ok(fs.existsSync('docs/operations/bank-transfer-selection-rollback.md'), 'rollback runbook for 20260926022450');
    assert.match(read('docs/operations/bank-transfer-selection-rollback.md'), /20260926022450/);
  });

  // ---- B3 per-product capability ------------------------------------------
  await test('B3 per-product bank switches inherit the general switch when NULL', async () => {
    const caps = load('lib/payments/capabilities.ts', { '@/lib/payments/payment-config': { isCheckoutEnabled: () => true } });
    const base = { ...caps.DEFAULT_SETTINGS, bank_transfer_enabled: true };
    for (const product of ['raffle', 'reverse_raffle', 'dino', 'donation']) {
      assert.equal(caps.deriveCapabilities(base, product).bank_transfer, true, `${product} inherits on`);
      assert.equal(caps.deriveCapabilities({ ...base, bank_transfer_enabled: false }, product).bank_transfer, false, `${product} inherits off`);
      assert.equal(caps.deriveCapabilities({ ...base, [`${product}_bank_transfer_enabled`]: false }, product).bank_transfer, false, `${product} override off`);
      assert.equal(caps.deriveCapabilities({ ...base, bank_transfer_enabled: false, [`${product}_bank_transfer_enabled`]: true }, product).bank_transfer, true, `${product} override on`);
    }
    assert.equal(caps.deriveCapabilities({ ...base, raffle_bank_transfer_enabled: false }).bank_transfer, true, 'general (merch) capability is unchanged by product overrides');
    assert.equal(caps.bankTransferProduct('dino'), 'dino');
    assert.equal(caps.bankTransferProduct('merch'), undefined);
    // Missing columns: the first select errors, the legacy select still works.
    const calls = [];
    const client = { from: () => ({ select: columns => ({ maybeSingle: async () => { calls.push(columns); return columns.includes('raffle_bank_transfer_enabled') ? { error: { message: 'column does not exist' }, data: null } : { error: null, data: { bank_transfer_enabled: true, card_checkout_enabled: false, partial_payments_enabled: false, minimum_partial_amount: 10, required_deposit_percent: null } }; } }) }) };
    const settings = await caps.loadMerchPaymentSettings(client);
    assert.equal(calls.length, 2);
    assert.equal(settings.bank_transfer_enabled, true);
    assert.equal(caps.deriveCapabilities(settings, 'dino').bank_transfer, true, 'pre-migration behaviour preserved');
    const full = { from: () => ({ select: () => ({ maybeSingle: async () => ({ error: null, data: { bank_transfer_enabled: true, card_checkout_enabled: false, partial_payments_enabled: false, minimum_partial_amount: 10, required_deposit_percent: null, raffle_bank_transfer_enabled: null, reverse_raffle_bank_transfer_enabled: null, dino_bank_transfer_enabled: false, donation_bank_transfer_enabled: null } }) }) }) };
    const loaded = await caps.loadMerchPaymentSettings(full);
    assert.equal(loaded.dino_bank_transfer_enabled, false);
    assert.equal(loaded.raffle_bank_transfer_enabled, null);
    assert.equal(caps.deriveCapabilities(loaded, 'dino').bank_transfer, false);
    assert.equal(caps.deriveCapabilities(loaded, 'raffle').bank_transfer, true);
  });
  await test('B3 capabilities endpoint and product routes pass their product', async () => {
    let seenProduct = 'unset';
    const route = load('app/api/payments/capabilities/route.ts', {
      'next/server': { NextResponse },
      '@/lib/supabase-server': { createServerClient: () => ({}), isServerSupabaseConfigured: () => true },
      '@/lib/payments/capabilities': { DEFAULT_SETTINGS: {}, bankTransferProduct: value => ['dino', 'raffle'].includes(value) ? value : undefined, loadMerchPaymentSettings: async () => ({}), deriveCapabilities: (_s, product) => { seenProduct = product; return { card: true, bank_transfer: true }; } },
    });
    await route.GET(new Request('https://example.invalid/api/payments/capabilities?product=dino'));
    assert.equal(seenProduct, 'dino');
    await route.GET(new Request('https://example.invalid/api/payments/capabilities?product=nonsense'));
    assert.equal(seenProduct, undefined);
    await route.GET(new Request('https://example.invalid/api/payments/capabilities'));
    assert.equal(seenProduct, undefined);
    assert.match(read('app/api/raffle/checkout/route.ts'), /deriveCapabilities\(await loadMerchPaymentSettings\(db\), campaignCode === 'NDCCRRO' \? 'reverse_raffle' : 'raffle'\)/);
    assert.match(read('app/api/fantasy/checkout/route.ts'), /deriveCapabilities\(await loadMerchPaymentSettings\(supabase\), 'dino'\)/);
    assert.match(read('app/api/donations/route.ts'), /deriveCapabilities\(settings, 'donation'\)/);
    assert.match(read('components/payments/PaymentMethodChoice.tsx'), /product/);
    assert.match(read('app/admin/orders/components/PaymentSettingsPanel.tsx'), /BANK_TRANSFER_PRODUCT_SETTINGS/);
    assert.match(read('app/admin/orders/components/shared.tsx'), /key: 'dino_bank_transfer_enabled'/);
    assert.match(read('app/api/admin/resources/[resource]/route.ts'), /'donation_bank_transfer_enabled'/);
  });

  // ---- B10 rate limits -----------------------------------------------------
  await test('B10 the read action uses a separate, looser limit from mutations', async () => {
    const keys = [];
    const order = { id, order_category: 'merch', customer_email: 'buyer@example.invalid', payment_status: 'pending_bank_transfer', order_status: 'submitted', total_amount: 60, amount_paid: 0, balance_due: 60, bank_transfer_selected_at: null };
    const db = { from: () => { const q = { select: () => q, eq: () => q, is: () => q, neq: () => q, update: () => q, maybeSingle: async () => ({ data: order }) }; return q; } };
    const route = load('app/api/payments/bank-transfer/route.ts', {
      'next/server': { NextResponse }, '@/lib/supabase-server': { createServerClient: () => db },
      '@/lib/server/request-guards': { enforceRateLimit: async (key, limit, windowMs) => { keys.push([key, limit, windowMs]); return true; }, getClientIp: () => 'ip' },
      '@/lib/order-input-validation': { readLimitedJsonObject: async request => ({ ok: true, value: await request.json() }) },
      '@/lib/payments/capabilities': { deriveCapabilities: () => ({ bank_transfer: true }), loadMerchPaymentSettings: async () => ({}) },
    });
    const url = 'https://example.invalid/api/payments/bank-transfer';
    assert.equal((await route.POST(req(url, { order_id: id, email: order.customer_email, action: 'read' }))).status, 200);
    assert.deepEqual(keys, [['bank-transfer-read:ip', 60, 60_000]]);
    keys.length = 0;
    assert.equal((await route.POST(req(url, { order_id: id, email: order.customer_email, selected: true }))).status, 200);
    assert.deepEqual(keys, [['bank-transfer:ip', 12, 60_000]]);
  });

  // ---- B1/B2 checkout caps and messages ------------------------------------
  const holdInput = { name: 'Test', email: 'buyer@example.com', phone: '', quantity: 2, selectedNumbers: [201, 202], payment_method: 'stripe' };
  let pending = [], orQuery = '', emails = [], insertError = null;
  const raffleDb = { from() { return {
    insert() { return this; }, select() { return this; }, or(expression) { orQuery = expression; return this; }, eq() { return this; },
    then(resolve, reject) { return Promise.resolve({ data: pending, error: null }).then(resolve, reject); },
    async single() { return insertError ? { error: insertError } : { data: { id: 'raffle-order' } }; },
    update() { return this; }, async maybeSingle() { return { data: { id: 'raffle-order' } }; },
  }; } };
  const validation = load('lib/order-input-validation.ts', {});
  const raffleMocks = {
    'next/server': { NextResponse },
    '@/lib/supabase-server': { createServerClient: () => raffleDb },
    '@/lib/payments/capabilities': { loadMerchPaymentSettings: async () => ({}), deriveCapabilities: () => ({ card: true, bank_transfer: true }) },
    '@/lib/stripe': { getStripe: () => ({ checkout: { sessions: { create: async value => ({ ...value, id: 'cs_test', status: 'open', url: 'https://checkout.stripe.com/x' }), expire: async () => ({ status: 'expired' }) } } }) },
    '@/lib/server/request-guards': { enforceRateLimit: async () => true, enforceTurnstile: async () => true, getClientIp: () => 'ip' },
    '@/lib/raffle-visibility': { getPublicRaffleCampaign: async code => ({ id: code, code, name: 'Reverse Raffle', price_cents: 6000, draw_label: null }) },
    '@/lib/payments/payment-config': { isCheckoutEnabled: () => true },
    '@/lib/payments/reference': { generateUniquePaymentReference: async () => 'NDCCRAF-2026-000200' },
    '@/lib/payments/site-url': { getCheckoutSiteUrl: () => 'https://www.ndcc.com.au' },
    '@/lib/order-input-validation': { ...validation, readLimitedJsonObject: async () => ({ ok: true, value: holdInput }), validateRaffleCheckoutInput: () => ({ ok: true, value: holdInput }) },
    '@/lib/utils': { validateEmail: () => true, validatePhone: () => true },
    '@/lib/payments/bank-transfer-email': { sendBankTransferInstructions: async value => { emails.push(value); return { status: 'sent' }; } },
  };
  const raffle = load('app/api/raffle/checkout/route.ts', raffleMocks);
  const reverseUrl = { url: 'https://www.ndcc.com.au/api/raffle/checkout?campaign=NDCCRRO' };
  await test('B1 per-email cap counts only bank holds inside the 48 hour window', async () => {
    pending = [];
    assert.equal((await raffle.POST(reverseUrl)).status, 200);
    assert.match(orQuery, /^bank_transfer_selected_at\.gte\.\d{4}-\d{2}-\d{2}T[^,]+,created_at\.gte\./);
    const bankCutoff = Date.parse(orQuery.split(',')[0].replace('bank_transfer_selected_at.gte.', ''));
    assert.ok(Math.abs(Date.now() - bankCutoff - 48 * 3_600_000) < 5_000, 'bank cutoff is 48 hours ago');
  });
  await test('B2 a bank-hold cap shows the accurate bank message and reference', async () => {
    pending = [{ quantity: 19, payment_method: 'bank_transfer', payment_reference: 'NDCCRAF-2026-000150', bank_transfer_selected_at: new Date().toISOString() }];
    const response = await raffle.POST(reverseUrl);
    assert.equal(response.status, 429);
    const body = await response.json();
    assert.match(body.error, /bank deposit/);
    assert.match(body.error, /NDCCRAF-2026-000150/);
    assert.match(body.error, /48 hours/);
    assert.doesNotMatch(body.error, /35 minutes/);
    pending = [{ quantity: 19, payment_method: 'stripe', payment_reference: 'NDCCRAF-2026-000151', bank_transfer_selected_at: null }];
    const card = await (await raffle.POST(reverseUrl)).json();
    assert.match(card.error, /35 minutes/, 'card holds keep the existing message');
  });
  await test('B5 raffle bank selection emails instructions once per order with idempotency', async () => {
    pending = []; emails = []; holdInput.payment_method = 'bank_transfer';
    const response = await raffle.POST(reverseUrl);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.bank_transfer, true);
    assert.equal(emails.length, 1);
    assert.equal(emails[0].kind, 'raffle');
    assert.equal(emails[0].sourceId, 'raffle-order');
    assert.equal(emails[0].to, 'buyer@example.com');
    assert.equal(emails[0].reference, 'NDCCRAF-2026-000200');
    assert.equal(emails[0].amountCents, 12000);
    assert.deepEqual([...emails[0].selectedNumbers], [201, 202]);
    // Email failure never fails the order response.
    raffleMocks['@/lib/payments/bank-transfer-email'].sendBankTransferInstructions = async () => { throw new Error('mail down'); };
    const failing = load('app/api/raffle/checkout/route.ts', raffleMocks);
    assert.equal((await failing.POST(reverseUrl)).status, 200);
    holdInput.payment_method = 'stripe';
  });

  // ---- B5 email builder and idempotency -----------------------------------
  await test('B5 instruction emails include reference, amount and bank details with a stable idempotency key', async () => {
    const sent = [];
    const mailer = load('lib/payments/bank-transfer-email.ts', {
      '@/lib/email': { ...load('lib/email.ts', { resend: { Resend: class {} } }), sendEmail: async payload => { sent.push(payload); return { status: 'sent' }; } },
    });
    const first = await mailer.sendBankTransferInstructions({ kind: 'dino', sourceId: id, to: 'buyer@example.invalid', name: 'Buyer <b>', reference: 'NDCCDCO-2026-000001', amountCents: 2500, productLabel: 'Dino Coach entry', selectedAt: '2026-09-27T00:00:00.000Z' });
    assert.equal(first.status, 'sent');
    await mailer.sendBankTransferInstructions({ kind: 'dino', sourceId: id, to: 'buyer@example.invalid', name: 'Buyer', reference: 'NDCCDCO-2026-000001', amountCents: 2500, productLabel: 'Dino Coach entry', selectedAt: '2026-09-27T00:00:00.000Z' });
    assert.equal(sent.length, 2);
    assert.equal(sent[0].idempotencyKey, sent[1].idempotencyKey, 'retries reuse the same key');
    assert.match(sent[0].idempotencyKey, /^bank-instructions\/dino\//);
    assert.match(sent[0].html, /NDCCDCO-2026-000001/);
    assert.match(sent[0].html, /25\.00/);
    assert.match(sent[0].html, /000000/);
    assert.doesNotMatch(sent[0].html, /<b>/, 'purchaser names are escaped');
    assert.doesNotMatch(sent[0].html, /pay-balance/, 'no merch pay-balance link for special payments');
    const reselected = await mailer.sendBankTransferInstructions({ kind: 'dino', sourceId: id, to: 'buyer@example.invalid', name: 'Buyer', reference: 'NDCCDCO-2026-000001', amountCents: 2500, productLabel: 'Dino Coach entry', selectedAt: '2026-09-28T00:00:00.000Z' });
    assert.equal(reselected.status, 'sent');
    assert.notEqual(sent[2].idempotencyKey, sent[0].idempotencyKey, 'a new selection after switching back to card is a new message');
    const raffleMail = await mailer.sendBankTransferInstructions({ kind: 'raffle', sourceId: id, to: 'buyer@example.invalid', name: 'Buyer', reference: 'NDCCRAF-2026-000001', amountCents: 12000, productLabel: 'Reverse Raffle tickets', selectedNumbers: [201, 202] });
    assert.equal(raffleMail.status, 'sent');
    assert.match(sent[3].html, /201, 202/);
    assert.match(sent[3].html, /48 hours/);
    const noBank = load('lib/payments/bank-transfer-email.ts', { '@/lib/email': { ...load('lib/email.ts', { resend: { Resend: class {} } }, {}), sendEmail: async () => { throw new Error('must not send'); } } }, {});
    assert.equal((await noBank.sendBankTransferInstructions({ kind: 'donation', sourceId: id, to: 'a@example.invalid', name: 'A', reference: 'NDCCPAY-2026-000001', amountCents: 1000, productLabel: 'Donation' })).status, 'skipped');
  });

  // ---- B7 site URL ---------------------------------------------------------
  await test('B7 bank details link uses the canonical www site URL', async () => {
    const email = load('lib/email.ts', { resend: { Resend: class {} } });
    const html = email.bankDetailsHtml('NDCCMER-2026-000001', 10);
    assert.match(html, /https:\/\/www\.ndcc\.com\.au\/pay-balance\?reference=NDCCMER-2026-000001/);
    assert.doesNotMatch(read('lib/email.ts'), /https:\/\/ndcc\.com\.au\/pay-balance/);
  });

  // ---- Admin route: B1 expired queue, B4 switch, B6 receipts, B9 ------------
  let admin = { id: adminId, role: 'admin' }, rpcCalls = [], rpcResult = { data: true, error: null }, receiptCalls = [], listRows = {}, updates = [];
  const adminDb = {
    from(table) { const q = { select: () => q, not: () => q, is: () => q, neq: () => q, in: () => q, gt: () => q, eq: () => q, order: () => q, range: () => q, update: value => { updates.push({ table, value }); return q; }, maybeSingle: async () => ({ data: { id } }), insert: async () => ({ error: null }) }; q.table = table; return q; },
    rpc: async (name, args) => { rpcCalls.push({ name, args }); return typeof rpcResult === 'function' ? rpcResult(name, args) : rpcResult; },
  };
  const adminRoute = load('app/api/admin/payments/bank-transfers/route.ts', {
    'next/server': { NextResponse },
    '@/lib/auth/guard': { requirePermission: async () => admin },
    '@/lib/supabase-server': { createServerClient: () => adminDb },
    '@/lib/supabase-paginate': { fetchAllPages: async build => { const q = build(0, 999); return { data: listRows[q.table] || [] }; } },
    '@/lib/order-input-validation': { readLimitedJsonObject: async request => ({ ok: true, value: await request.json() }) },
    '@/lib/payments/receipt-delivery': {
      enqueuePaymentReceiptJob: async (_db, kind, sourceId) => { receiptCalls.push(['enqueue', kind, sourceId]); return { ok: true, jobId: 'job-1' }; },
      attemptPaymentReceiptDelivery: async (_db, jobId) => { receiptCalls.push(['attempt', jobId]); return { attempted: true, status: 'delivered' }; },
    },
  });
  const adminUrl = 'https://example.invalid/api/admin/payments/bank-transfers';
  await test('B1 admin queue marks expired reverse raffle holds', async () => {
    const old = new Date(Date.now() - 49 * 3_600_000).toISOString();
    const fresh = new Date(Date.now() - 3_600_000).toISOString();
    listRows = { raffle_orders: [
      { id: 'a', payment_reference: 'NDCCRAF-2026-000001', customer_name: 'Old', amount_cents: 6000, bank_transfer_selected_at: old, selected_ticket_numbers: [201] },
      { id: 'b', payment_reference: 'NDCCRAF-2026-000002', customer_name: 'New', amount_cents: 6000, bank_transfer_selected_at: fresh, selected_ticket_numbers: [202] },
      { id: 'c', payment_reference: 'NDCCRAF-2026-000003', customer_name: 'Trailer', amount_cents: 500, bank_transfer_selected_at: old, selected_ticket_numbers: null },
    ] };
    const body = await (await adminRoute.GET(new Request(adminUrl))).json();
    const byId = Object.fromEntries(body.rows.map(row => [row.id, row]));
    assert.equal(byId.a.hold_expired, true);
    assert.equal(byId.b.hold_expired, false);
    assert.equal(byId.c.hold_expired, false, 'trailer raffle orders hold no numbers');
    const csv = await (await adminRoute.GET(new Request(`${adminUrl}?format=csv`))).text();
    assert.match(csv, /hold expired/i);
    listRows = {};
  });
  await test('B6 confirmation processes the receipt job immediately, best-effort', async () => {
    rpcCalls = []; receiptCalls = []; rpcResult = { data: true, error: null };
    const confirm = { kind: 'raffle', id, expected_cents: 6000, bank_reference: 'TEST-ONLY', confirmed_received: true };
    const response = await adminRoute.POST(req(adminUrl, confirm));
    assert.equal(response.status, 200);
    assert.deepEqual(receiptCalls, [['enqueue', 'raffle_order', id], ['attempt', 'job-1']]);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.receipt_delivery, 'delivered');
    receiptCalls = [];
    await adminRoute.POST(req(adminUrl, { ...confirm, kind: 'dino' }));
    assert.deepEqual(receiptCalls[0], ['enqueue', 'dino_entry', id]);
    // Duplicate confirmation still succeeds and never sends twice beyond the outbox claim.
    rpcResult = { data: false, error: null }; receiptCalls = [];
    assert.equal((await adminRoute.POST(req(adminUrl, confirm))).status, 200);
  });
  await test('B1 confirmation of a re-sold expired hold fails safely with an admin message', async () => {
    receiptCalls = [];
    rpcResult = { data: null, error: { message: 'Reverse raffle numbers no longer available: the bank deposit hold expired and one or more numbers were sold or are held by another checkout' } };
    const response = await adminRoute.POST(req(adminUrl, { kind: 'raffle', id, expected_cents: 6000, bank_reference: 'TEST-ONLY', confirmed_received: true }));
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.match(body.error, /hold expired/i);
    assert.match(body.error, /no tickets were issued/i);
    assert.deepEqual(receiptCalls, [], 'no receipt is processed for a failed confirmation');
    rpcResult = { data: true, error: null };
  });
  await test('B4 admin can switch an unconfirmed Dino bank selection back to card', async () => {
    rpcCalls = [];
    const body = { action: 'switch_to_card', kind: 'dino', id, confirmed_switch: true };
    assert.equal((await adminRoute.POST(req(adminUrl, { ...body, confirmed_switch: false }))).status, 400);
    assert.equal((await adminRoute.POST(req(adminUrl, { ...body, kind: 'raffle' }))).status, 400);
    admin = { id: 'x', role: 'president' };
    assert.equal((await adminRoute.POST(req(adminUrl, body))).status, 403);
    admin = { id: adminId, role: 'admin' };
    rpcResult = { data: true, error: null };
    assert.equal((await adminRoute.POST(req(adminUrl, body))).status, 200);
    assert.equal(rpcCalls[0].name, 'switch_dino_bank_transfer_to_card');
    assert.equal(rpcCalls[0].args.actor_id, adminId);
    assert.equal(rpcCalls[0].args.target_entry_id, id);
    rpcResult = { data: false, error: null };
    assert.equal((await adminRoute.POST(req(adminUrl, body))).status, 409, 'confirmed or paid entries are rejected');
    // Before the migration: conditional update fallback preserves the same guards.
    updates = [];
    rpcResult = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
    assert.equal((await adminRoute.POST(req(adminUrl, body))).status, 200);
    assert.equal(JSON.stringify(updates.find(u => u.table === 'fantasy_entries').value), JSON.stringify({ bank_transfer_selected_at: null, bank_transfer_reference: null }));
    rpcResult = { data: true, error: null };
  });
  await test('B9 confirm/cancel/switch stay admin-only and the link is hidden for other roles', async () => {
    admin = { id: 'x', role: 'secretary' };
    for (const body of [{ kind: 'raffle', id, expected_cents: 6000, bank_reference: 'TEST', confirmed_received: true }, { action: 'cancel', kind: 'raffle', id, confirmed_cancelled: true }]) {
      assert.equal((await adminRoute.POST(req(adminUrl, body))).status, 403);
    }
    admin = { id: adminId, role: 'admin' };
    const orders = read('app/admin/orders/page.tsx');
    assert.match(orders, /isAdministrator && <a className="block mb-4 underline" href="\/admin\/payments\/bank-transfers">/);
    const page = read('app/admin/payments/bank-transfers/page.tsx');
    assert.match(page, /Hold expired - release\?/);
    assert.match(page, /Switch back to card/);
  });

  // ---- B4 fantasy copy and B5 Dino email idempotency ------------------------
  await test('B5 Dino bank selection emails only on the first selection', async () => {
    const source = read('app/api/fantasy/checkout/route.ts');
    assert.match(source, /sendBankTransferInstructions\(/);
    assert.match(source, /\.is\('bank_transfer_selected_at', null\)/);
    const dinoManager = { id: 'mgr-1', email: 'coach@example.invalid', age_verified_at: '2026-01-01', team_name_status: 'approved', rules_version_accepted: 'r1', is_active: true };
    let entry, updateResult, dinoEmails = [], filters = [];
    const dinoDb = {
      from(table) { const q = {
        select: () => q, eq: () => q, in: () => q, upsert: () => { q.upserting = true; return q; }, not: (...args) => { filters.push(['not', ...args]); return q; },
        is: (...args) => { filters.push(['is', ...args]); return q; }, update: value => { q.updating = value; return q; },
        single: async () => table === 'fantasy_managers' ? { data: dinoManager } : { data: entry },
        maybeSingle: async () => { if (table !== 'fantasy_entries' || q.upserting) return { data: null, error: null }; if (q.updating) { if (updateResult) { entry = { ...entry, ...q.updating }; return { data: { id: entry.id }, error: null }; } return { data: null, error: null }; } return { data: entry.bank_transfer_selected_at ? { id: entry.id } : null, error: null }; },
      }; return q; },
      rpc: async () => ({ data: 'NDCCDCO-2026-000007', error: null }),
    };
    const dino = load('app/api/fantasy/checkout/route.ts', {
      'next/server': { NextResponse },
      '@/lib/fantasy-manager-auth': { resolveFantasyManagerAuth: async () => ({ auth: { manager: { id: 'mgr-1', display_name: 'Coach' } } }) },
      '@/lib/fantasy-seasons': { resolveRequestSeason: async () => ({ id: 'season-1', name: 'Dino Coach 2026' }) },
      '@/lib/dino-coach/server': { getDinoCoachSettings: async () => ({ public_launch_enabled: true, registration_open: true, entry_fee_cents: 2500, entry_fee_currency: 'AUD', rules_version: 'r1' }) },
      '@/lib/supabase-server': { createServerClient: () => dinoDb },
      '@/lib/payments/capabilities': { loadMerchPaymentSettings: async () => ({}), deriveCapabilities: (_s, product) => ({ card: true, bank_transfer: product === 'dino' }) },
      '@/lib/payments/bank-transfer-email': { sendBankTransferInstructions: async value => { dinoEmails.push(value); return { status: 'sent' }; } },
      '@/lib/stripe': { getStripe: () => { throw new Error('Stripe must not be called for bank deposit'); } },
      '@/lib/payments/payment-config': { isCheckoutEnabled: () => true },
      '@/lib/payments/reference': { isCanonicalPaymentReference: value => value === 'NDCCDCO-2026-000007' },
      '@/lib/payments/site-url': { getCheckoutSiteUrl: () => 'https://www.ndcc.com.au' },
      '@/lib/server/request-guards': { enforceRateLimit: async () => true },
      '@/lib/order-input-validation': { PUBLIC_ORDER_LIMITS: { maximumOrderCents: 10000000 }, readLimitedJsonObject: async () => ({ ok: true, value: { payment_method: 'bank_transfer' } }) },
    });
    const call = async () => { const response = await dino.POST(new Request('https://www.ndcc.com.au/api/fantasy/checkout', { method: 'POST' })); return { status: response.status, body: await response.json() }; };
    entry = { id: 'entry-1', entry_fee_cents: 2500, currency: 'AUD', status: 'payment_required', stripe_checkout_session_id: null, stripe_payment_intent_id: null, bank_transfer_selected_at: null };
    updateResult = true;
    const first = await call();
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.instructions_emailed, true);
    assert.ok(filters.some(([op, key, value]) => op === 'is' && key === 'bank_transfer_selected_at' && value === null), 'first selection is conditional on no earlier selection');
    assert.equal(dinoEmails.length, 1);
    assert.equal(dinoEmails[0].kind, 'dino');
    assert.equal(dinoEmails[0].amountCents, 2500);
    assert.equal(dinoEmails[0].reference, 'NDCCDCO-2026-000007');
    assert.equal(dinoEmails[0].selectedAt, entry.bank_transfer_selected_at);
    const retry = await call();
    assert.equal(retry.status, 200);
    assert.equal(dinoEmails.length, 1, 'a retry after selection sends nothing');
    // Concurrent first selections: the loser returns success without a second email.
    entry = { ...entry, bank_transfer_selected_at: null }; updateResult = false;
    const raced = { ...entry };
    const originalMaybe = dinoDb.from;
    dinoDb.from = table => { const q = originalMaybe(table); const inner = q.maybeSingle; q.maybeSingle = async () => { if (table === 'fantasy_entries' && !q.updating && !q.upserting) return { data: { id: raced.id }, error: null }; return inner(); }; return q; };
    const loser = await call();
    assert.equal(loser.status, 200, JSON.stringify(loser.body));
    assert.equal(dinoEmails.length, 1);
    dinoDb.from = originalMaybe;
    const donation = read('app/api/donations/route.ts');
    assert.match(donation, /sendBankTransferInstructions\(/);
  });

  // ---- B11 / B12 UI guards -------------------------------------------------
  await test('B11 apparel balance button is disabled while any payment opens', async () => {
    assert.match(read('components/club-account/MemberPurchases.tsx'), /onClick=\{\(\) => void pay\(order\)\} isLoading=\{paying === order\.id\} disabled=\{Boolean\(paying\)\}/);
  });
  await test('B12 raffle copy states when tickets are issued', async () => {
    assert.match(read('app/raffle/RaffleClient.tsx'), /Tickets are issued after online payment, cash payment, or once your bank deposit is confirmed\./);
  });

  console.log(`PASS bank transfer hardening: ${passed} checks. No payments, database writes or messages.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
