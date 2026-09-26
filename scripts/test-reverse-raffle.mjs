import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Isolated execution of production handlers. No real checkout, mail or DB writes.
function load(file, dependencies) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, URL, Buffer, process, console,
    require(name) { if (name === 'server-only') return {}; assert.ok(name in dependencies, name); return dependencies[name]; },
  });
  return exports;
}
const raffleConstants = load('lib/raffle-constants.ts', {});
const selection = load('lib/reverse-raffle-selection.ts', { '@/lib/raffle-constants': raffleConstants });
const realValidation = load('lib/order-input-validation.ts', {});
const input = { name: 'Test purchaser', email: 'buyer@example.com', phone: '', quantity: 2, selectedNumbers: [201, 300] };
let selected, inserted, payload, payloadOptions, hidden = false, soldOut = false, failure = '', released = false, expired = false;
let bankEnabled = false;
let pendingHolds = [], holdQuery = null, ipTokens = 0, ipTokenLimit = Infinity, turnstileAllowed = true;
const db = { from() { return {
  insert(value) { inserted = value; return this; }, select(columns) { if (columns === 'quantity') holdQuery = []; return this; },
  or(expression) { holdQuery?.push(['or', expression]); return this; },
  gte(key, value) { holdQuery?.push([key, value]); return this; },
  then(resolve, reject) { return Promise.resolve({ data: pendingHolds, error: null }).then(resolve, reject); },
  async single() { return soldOut ? { error: { message: 'Reverse raffle allocation unavailable' } } : { data: { id: 'test-order' } }; },
  update(value) { if(value.status === 'cancelled') released = true; return this; }, eq(key, value) { holdQuery?.push([key, value]); return this; }, async maybeSingle() { return failure === 'link' ? {error: new Error('link failed')} : { data: { id: 'test-order' } }; },
}; } };
const wheelRules = load('lib/prize-wheel/rules.ts', {});
const route = load('app/api/raffle/checkout/route.ts', {
  '@/lib/reverse-raffle-selection': selection,
  '@/lib/prize-wheel/rules': wheelRules,
  '@/lib/prize-wheel/checkout': load('lib/prize-wheel/checkout.ts', { './rules': wheelRules }),
  'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
  '@/lib/supabase-server': { createServerClient: () => db },
  '@/lib/payments/bank-transfer': { configuredBankDetails: () => ({account_name:'TEST ONLY',bsb:'000000',account_number:'00000000'}) },
  '@/lib/payments/capabilities': { loadMerchPaymentSettings: async () => ({}), deriveCapabilities: () => ({card:true,bank_transfer:bankEnabled}) },
  '@/lib/stripe': { getStripe: () => ({ checkout: { sessions: { create: async (value, options) => {
    if(failure === 'create') throw new Error('Stripe unavailable');
    payload = value; payloadOptions = options; return { ...value, id: 'cs_test', status: 'open', url: failure === 'validation' ? null : 'https://checkout.stripe.com/test' };
  }, expire: async()=>{expired = true; return {status:'expired'};} } } }) },
  '@/lib/server/request-guards': {
    enforceRateLimit: async key => { if (!key.startsWith('raffle-hold-ip:')) return true; ipTokens += 1; return ipTokens <= ipTokenLimit; },
    enforceTurnstile: async () => turnstileAllowed,
    getClientIp: () => 'test',
  },
  '@/lib/raffle-visibility': { getPublicRaffleCampaign: async code => {
    selected = code; return hidden ? null : { id: code, code, name: code === 'NDCCRRO' ? 'Reverse Raffle' : 'Dinos Trailer Raffle',
      price_cents: code === 'NDCCRRO' ? 6000 : 500, draw_label: code === 'NDCCRRO' ? null : 'Christmas Party - 19 December 2026' };
  } },
  '@/lib/payments/payment-config': { isCheckoutEnabled: () => true },
  '@/lib/payments/reference': { generateUniquePaymentReference: async () => 'NDCCRAF-2026-000100' },
  '@/lib/payments/site-url': { getCheckoutSiteUrl: () => 'https://www.ndcc.com.au' },
  '@/lib/payments/stripe-checkout': load('lib/payments/stripe-checkout.ts', {}),
  '@/lib/order-input-validation': { ...realValidation, PUBLIC_ORDER_LIMITS: { maximumOrderCents: 10000000 },
    readLimitedJsonObject: async () => ({ ok: true, value: input }), validateRaffleCheckoutInput: () => ({ ok: true, value: input }) },
  '@/lib/utils': { validateEmail: () => true, validatePhone: () => true },
});
for (const code of ['NDCCRRO', 'NDCCRAF']) {
  inserted = payload = null;
  const result = await route.POST({ url: `https://www.ndcc.com.au/api/raffle/checkout?campaign=${code}` });
  assert.equal(result.status, 200);
  assert.equal(selected, code);
  assert.equal(inserted.campaign_id, code);
  assert.equal(inserted.amount_cents, code === 'NDCCRRO' ? 12000 : 1000);
  assert.deepEqual(inserted.selected_ticket_numbers, code === 'NDCCRRO' ? [201, 300] : undefined);
  assert.ok(payload.line_items[0].price_data.product_data.name.includes(code === 'NDCCRRO' ? 'Reverse Raffle' : 'Dinos Trailer Raffle'));
  assert.equal(payload.success_url, `https://www.ndcc.com.au/${code === 'NDCCRRO' ? 'reverse-raffle' : 'raffle'}?payment=success`);
  assert.equal(result.body.payment_reference, payload.client_reference_id);
  if (code === 'NDCCRRO') assert.equal(payload.line_items[0].price_data.product_data.description, undefined);
  // Exact Stripe create() arguments (keys, key order, values, idempotency key)
  // as the route sent them before the shared Checkout helper (F59).
  const reference = 'NDCCRAF-2026-000100';
  const metadata = { ndcc_payment_reference: reference, ndcc_payment_type: 'raffle', ndcc_order_id: 'test-order',
    ndcc_reference_version: '1', item_number: reference, product: 'NDCC Raffle', raffle_order_id: 'test-order',
    expected_amount_cents: code === 'NDCCRRO' ? '12000' : '1000', quantity: '2', payment_reference: reference };
  const returnPath = code === 'NDCCRRO' ? '/reverse-raffle' : '/raffle';
  const expectedParams = { mode: 'payment', customer_email: 'buyer@example.com',
    ...(code === 'NDCCRRO' ? { expires_at: payload.expires_at } : {}),
    line_items: [{ price_data: { currency: 'aud', unit_amount: code === 'NDCCRRO' ? 6000 : 500, product_data: {
      name: `NDCC ${code === 'NDCCRRO' ? 'Reverse Raffle' : 'Dinos Trailer Raffle'} Ticket - ${reference}`,
      ...(code === 'NDCCRRO' ? {} : { description: 'Christmas Party - 19 December 2026' }) } }, quantity: 2 }],
    success_url: `https://www.ndcc.com.au${returnPath}?payment=success`, cancel_url: `https://www.ndcc.com.au${returnPath}?payment=cancelled`,
    client_reference_id: reference, metadata,
    payment_intent_data: { description: `${reference} - NDCC raffle`, metadata } };
  assert.equal(JSON.stringify(payload), JSON.stringify(expectedParams), `${code} Checkout create() params must be unchanged`);
  assert.equal(JSON.stringify(payloadOptions), JSON.stringify({ idempotencyKey: 'raffle-test-order' }));
  if (code === 'NDCCRRO') assert.ok(Math.abs(payload.expires_at - (Math.floor(Date.now() / 1000) + 35 * 60)) <= 2);
  else assert.equal(Object.hasOwn(payload, 'expires_at'), false, 'the standard raffle sends no expires_at');
}
// A bank deposit creates a pending order without calling Stripe or allocating tickets.
input.payment_method = 'bank_transfer'; inserted = payload = null;
assert.equal((await route.POST({url:'https://www.ndcc.com.au/api/raffle/checkout?campaign=NDCCRRO'})).status,503);
assert.equal(inserted,null); bankEnabled=true;
for (const code of ['NDCCRAF','NDCCRRO']) {
 inserted=payload=null;
 const response=await route.POST({url:`https://www.ndcc.com.au/api/raffle/checkout?campaign=${code}`});
 assert.equal(response.status,200); assert.equal(response.body.bank_transfer,true);
 assert.equal(inserted.payment_method,'bank_transfer'); assert.ok(inserted.bank_transfer_selected_at);
 assert.equal(inserted.status,undefined); assert.equal(payload,null);
 assert.equal(response.body.total_amount,code==='NDCCRRO'?120:10);
}
delete input.payment_method; bankEnabled=false;
for (const invalid of [undefined, [], [201], [201, 201], [200, 300], [201, 301], ['201', 300]]) {
  input.selectedNumbers = invalid;
  inserted = payload = null;
  assert.equal((await route.POST({ url: 'https://www.ndcc.com.au/api/raffle/checkout?campaign=NDCCRRO' })).status, 400);
  assert.equal(inserted, null);
  assert.equal(payload, null);
}
input.selectedNumbers = [201, 300];
inserted = null; hidden = true;
assert.equal((await route.POST({ url: 'https://www.ndcc.com.au/api/raffle/checkout?campaign=NDCCRRO' })).status, 503);
assert.equal(inserted, null, 'Hidden campaign must not create an order');
assert.equal((await route.POST({ url: 'https://www.ndcc.com.au/api/raffle/checkout?campaign=OTHER' })).status, 400);

hidden = false; soldOut = true; payload = null;
assert.equal((await route.POST({ url: 'https://www.ndcc.com.au/api/raffle/checkout?campaign=NDCCRRO' })).status, 409);
assert.equal(payload, null, 'No Stripe checkout may be created when stock is reserved or sold');
soldOut = false;
for (const [stage,status] of [['create',500],['validation',502],['link',503]]) {
  failure = stage; released = expired = false;
  assert.equal((await route.POST({url:'https://www.ndcc.com.au/api/raffle/checkout?campaign=NDCCRRO'})).status,status);
  assert.ok(released, `${stage} failure must release its unpublished reservation`);
  if(stage !== 'create') assert.ok(expired,'Known sessions must expire before release');
}
failure = '';

// Hoarding caps: per-email pending holds and per-IP held numbers (F10).
const reverseUrl = { url: 'https://www.ndcc.com.au/api/raffle/checkout?campaign=NDCCRRO' };
assert.equal(realValidation.REVERSE_RAFFLE_HOLD_LIMITS.checkoutExpiryMinutes, 35, 'Stripe expiry stays at 35 minutes (Stripe minimum is 30)');
pendingHolds = []; ipTokens = 0; ipTokenLimit = Infinity; inserted = payload = null; holdQuery = null;
assert.equal((await route.POST(reverseUrl)).status, 200);
assert.equal(payload.expires_at - Math.floor(Date.now() / 1000) > 34 * 60, true, 'reverse raffle checkout keeps its 35 minute expiry');
assert.deepEqual(holdQuery.filter(([key]) => ['status', 'customer_email'].includes(key)), [['status', 'pending_payment'], ['customer_email', 'buyer@example.com']]);
assert.ok(holdQuery.some(([key,value]) => key === 'or' && /^bank_transfer_selected_at.not.is.null,created_at.gte./.test(value)), 'bank selections and recent card holds both count towards the cap');
assert.equal(ipTokens, 2, 'one IP hold token per requested number');

pendingHolds = [{ quantity: 10 }, { quantity: 9 }]; inserted = payload = null;
assert.equal((await route.POST(reverseUrl)).status, 429, 'pending holds + new numbers above the per-email cap are refused');
assert.equal(inserted, null); assert.equal(payload, null);
pendingHolds = [{ quantity: 18 }]; inserted = null;
assert.equal((await route.POST(reverseUrl)).status, 200, 'exactly reaching the per-email cap is allowed');
pendingHolds = []; ipTokens = 0; ipTokenLimit = 1; inserted = payload = null;
assert.equal((await route.POST(reverseUrl)).status, 429, 'per-IP held-number cap is enforced');
assert.equal(inserted, null); assert.equal(payload, null);
ipTokenLimit = Infinity; ipTokens = 0;
ipTokens = 0; inserted = null;
assert.equal((await route.POST({ url: 'https://www.ndcc.com.au/api/raffle/checkout?campaign=NDCCRAF' })).status, 200);
assert.equal(ipTokens, 0, 'the standard raffle has no number holds to cap');
turnstileAllowed = false; inserted = null;
assert.equal((await route.POST(reverseUrl)).status, 403, 'a failed optional Turnstile check blocks checkout');
assert.equal(inserted, null);
turnstileAllowed = true;
console.log('PASS reverse raffle hold caps per email/IP, 35 minute expiry and optional Turnstile gate');

const constants = load('lib/raffle-constants.ts', {});
const vector = load('lib/reverse-raffle-ticket.ts', { './raffle-constants': constants });
const ticket = load('lib/raffle-ticket.ts', {
  './email-html': load('lib/email-html.ts', {}),
  './reverse-raffle-ticket': vector,
  './trailer-raffle-ticket': load('lib/trailer-raffle-ticket.ts', { './raffle-constants': constants, './email-html': load('lib/email-html.ts', {}) }),
  './raffle-constants': constants,
  './prize-wheel/rules': wheelRules,
  './prize-wheel/ticket': load('lib/prize-wheel/ticket.ts', { '../email-html': load('lib/email-html.ts', {}), '../raffle-constants': constants, './rules': wheelRules }),
  'node:fs/promises': { default: { readFile: async () => Buffer.from('test-logo') } },
  'node:path': { default: { join: (...parts) => parts.join('/') } },
  './server-fonts.mjs': { getServerSharp: async () => buffer => ({ png: () => ({ toBuffer: async () => buffer }) }) },
});
const zero = (await ticket.renderRaffleTicket('NDCCRRO-20260201')).toString();
assert.ok(zero.includes('NDCCRRO-20260201') && zero.includes('REVERSE</text>') && zero.includes('RAFFLE</text>') && zero.includes('$60 AUD'));
assert.ok(zero.includes('>201</text>'));
assert.ok((await ticket.renderRaffleTicket('NDCCRRO-20260300')).toString().includes('>300</text>'));
await assert.rejects(() => ticket.renderRaffleTicket('NDCCRRO-20260200'));
await assert.rejects(() => ticket.renderRaffleTicket('NDCCRRO-20260301'));
assert.ok(!zero.includes('19 DECEMBER') && !zero.includes('TRAILER'));
assert.ok((await ticket.renderRaffleTicket('NDCCRAF-260001')).toString().includes('$5 AUD'));
const trailer2026=(await ticket.renderRaffleTicket('NDCCTRO-20260001')).toString();
const trailer200=(await ticket.renderRaffleTicket('NDCCTRO-20260200')).toString();
assert.ok(trailer200.includes('>200</text>')&&trailer200.includes('NDCCTRO-20260200')&&trailer200.includes('TRAILER</text>'));
assert.ok(trailer2026.includes('NDCCTRO-20260001')&&trailer2026.includes('$5 AUD')&&trailer2026.includes('TRAILER'));
await assert.rejects(()=>ticket.renderRaffleTicket('NDCCTRO-20260001',undefined,{code:'NDCCRRO',year_code:'2026'}));
await assert.rejects(() => ticket.renderRaffleTicket('NDCCRRO-202600000'));
await assert.rejects(() => ticket.renderRaffleTicket('NDCCRRO-2026<script>'));
// References derive from campaign code + year_code: any 4-digit reverse raffle year is accepted...
assert.ok((await ticket.renderRaffleTicket('NDCCRRO-20270250')).toString().includes('>250</text>'));
// ...but an explicit campaign must match its year_code.
await assert.rejects(() => ticket.renderRaffleTicket('NDCCRRO-20270250', undefined, { code: 'NDCCRRO', year_code: '2026' }));
await assert.rejects(() => ticket.renderRaffleTicket('NDCCRAF-260001', undefined, { code: 'NDCCRRO', year_code: '2026' }));
await assert.rejects(() => ticket.renderRaffleTicket('NDCCRAF-2026000'));
// Price and draw text come from the campaign details when supplied.
const custom = (await ticket.renderRaffleTicket('NDCCRAF-270002', { name: 'Test Raffle', priceCents: 1000, drawLabel: 'Drawn at test night' })).toString();
assert.ok(custom.includes('TEST RAFFLE') && custom.includes('$10 AUD') && custom.includes('DRAWN AT TEST NIGHT'));
assert.ok((await ticket.renderRaffleTicket('NDCCRAF-260001')).toString().includes('DRAWN 19 DECEMBER 2026 AT THE CHRISTMAS PARTY'));
assert.ok((await ticket.renderRaffleTicket('NDCCRRO-20260201', { name: 'Reverse Raffle', priceCents: 7500, drawLabel: null })).toString().includes('$75 AUD'));
assert.equal(constants.REVERSE_RAFFLE_MIN_NUMBER, 201);
assert.equal(constants.REVERSE_RAFFLE_MAX_NUMBER, 300);
assert.match(readFileSync('supabase/migrations/20260922104834_reverse_raffle_201_300.sql', 'utf8'), /201/);
let mail, marked = false;
const paid = { id: 'order-test',status:'paid',currency:'aud',amount_cents:12000,quantity:2,paid_at:'2026-09-22T00:00:00Z',
  payment_reference:'NDCCRAF-2026-000100',stripe_payment_intent_id:'pi_test',customer_email:'buyer@example.com',customer_name:'Test buyer',
  raffle_campaigns:{name:'Reverse Raffle',price_cents:6000,draw_label:null},
  raffle_tickets:[{ticket_reference:'NDCCRRO-20260201',ticket_number:201},{ticket_reference:'NDCCRRO-20260202',ticket_number:202}] };
const emailDb = { from(table) { return {select(){return this;},eq(){return this;},limit(){return this;},
  async single(){return {data:paid};},async maybeSingle(){return {data:null};},update(){return this;},async is(){marked=true; return {};}};} };
const mailer = load('lib/raffle-email.ts', {
  '@/lib/payments/receipt-recipients':{receiptRecipients:email=>({to:email})},
  '@/lib/supabase-server':{createServerClient:()=>emailDb},
  '@/lib/email':{emailHtml:(_,body)=>body,getTransactionalReplyTo:()=>undefined,sendEmail:async value=>{mail=value;return {status:'sent',id:'message-test'};}},
  '@/lib/payment-receipt-pdf':{buildPaymentReceiptFilename:()=> 'receipt.pdf',buildPaymentReceiptPdf:async data=>{if(paid.raffle_tickets[0].ticket_reference.startsWith('NDCCRRO'))assert.ok(data.descriptionLines.includes('Raffle numbers: 201, 202'));return 'pdf';}},
  '@/lib/raffle-ticket':{renderRaffleTicket:ticket.renderRaffleTicket},
  '@/lib/payments/receipt-delivery-policy':{canRecordSimulatedReceiptDelivery:()=>false},
  '@/lib/payments/reference':{isCanonicalPaymentReference:()=>true},
  '@/lib/raffle-constants':raffleConstants,
});
assert.equal((await mailer.sendPaidRaffleEmails(paid.id)).status,'sent');
assert.equal(mail.attachments.length,3,'Two numbered PNG tickets and one PDF receipt');
assert.deepEqual(Array.from(mail.attachments,a=>a.filename),['NDCCRRO-20260201.png','NDCCRRO-20260202.png','receipt.pdf']);
assert.ok(mail.html.includes('Raffle number 201') && mail.html.includes('Raffle number 202'));
assert.ok(marked);
paid.status='pending_payment'; mail=null;
assert.equal((await mailer.sendPaidRaffleEmails(paid.id)).status,'failed');
assert.equal(mail,null,'Unpaid buyers cannot receive valid tickets');
console.log('Reverse raffle: checkout stock rejection, 201/300 bounds, legacy compatibility, two PNG tickets plus PDF receipt, and unpaid delivery rejection passed.');

// Member cash evidence produces the same buyer PNG ticket and PDF receipt.
Object.assign(paid,{status:'paid',payment_method:'cash',stripe_payment_intent_id:null,cash_received_by:null,cash_received_by_member:'member',cash_received_at:'2026-09-24',cash_sale_key:'key',quantity:1,amount_cents:500,raffle_campaigns:{name:'Dinos Trailer Raffle',price_cents:500,draw_label:null},raffle_tickets:[{ticket_reference:'NDCCTRO-20260200',ticket_number:200}]});
mail=null;
assert.equal((await mailer.sendPaidRaffleEmails(paid.id)).status,'sent');
assert.deepEqual(Array.from(mail.attachments,a=>a.filename),['NDCCTRO-20260200.png','receipt.pdf']);
assert.ok(mail.html.includes('NDCCTRO-20260200'));
assert.ok(Buffer.from(mail.attachments[0].content,'base64').toString().includes('>200</text>'));
paid.cash_received_by='staff';mail=null;
assert.equal((await mailer.sendPaidRaffleEmails(paid.id)).status,'failed','Two collector identities must not count as valid payment evidence');
assert.equal(mail,null);
console.log('PASS trailer design number 200, member cash receipt attachments and ambiguous cash-evidence rejection');

Object.assign(paid,{payment_method:'bank_transfer',cash_received_by:null,cash_received_by_member:null,cash_received_at:null,cash_sale_key:null,bank_transfer_confirmed_at:'2026-09-26',bank_transfer_confirmed_by:'admin',bank_transfer_reference:'BANK-TEST'});
mail=null;assert.equal((await mailer.sendPaidRaffleEmails(paid.id)).status,'sent');
assert.match(mail.html,/NDCC has confirmed receipt of your bank transfer/);assert.doesNotMatch(mail.html,/Stripe has confirmed/);
paid.bank_transfer_confirmed_at=null;mail=null;assert.equal((await mailer.sendPaidRaffleEmails(paid.id)).status,'failed');assert.equal(mail,null);
console.log('PASS bank raffle receipt accurately describes confirmed deposit and rejects purchaser selection alone');
