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
const selection = load('lib/reverse-raffle-selection.ts', {});
const input = { name: 'Test purchaser', email: 'buyer@example.com', phone: '', quantity: 2, selectedNumbers: [201, 300] };
let selected, inserted, payload, hidden = false, soldOut = false, failure = '', released = false, expired = false;
const db = { from() { return {
  insert(value) { inserted = value; return this; }, select() { return this; },
  async single() { return soldOut ? { error: { message: 'Reverse raffle allocation unavailable' } } : { data: { id: 'test-order' } }; },
  update(value) { if(value.status === 'cancelled') released = true; return this; }, eq() { return this; }, async maybeSingle() { return failure === 'link' ? {error: new Error('link failed')} : { data: { id: 'test-order' } }; },
}; } };
const route = load('app/api/raffle/checkout/route.ts', {
  '@/lib/reverse-raffle-selection': selection,
  'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
  '@/lib/supabase-server': { createServerClient: () => db },
  '@/lib/stripe': { getStripe: () => ({ checkout: { sessions: { create: async value => {
    if(failure === 'create') throw new Error('Stripe unavailable');
    payload = value; return { ...value, id: 'cs_test', status: 'open', url: failure === 'validation' ? null : 'https://checkout.stripe.com/test' };
  }, expire: async()=>{expired = true; return {status:'expired'};} } } }) },
  '@/lib/server/request-guards': { enforceRateLimit: async () => true, getClientIp: () => 'test' },
  '@/lib/raffle-visibility': { getPublicRaffleCampaign: async code => {
    selected = code; return hidden ? null : { id: code, code, name: code === 'NDCCRRO' ? 'Reverse Raffle' : 'Dinos Trailer Raffle',
      price_cents: code === 'NDCCRRO' ? 6000 : 500, draw_label: code === 'NDCCRRO' ? null : 'Christmas Party - 19 December 2026' };
  } },
  '@/lib/payments/payment-config': { isCheckoutEnabled: () => true },
  '@/lib/payments/reference': { generateUniquePaymentReference: async () => 'NDCCRAF-2026-000100' },
  '@/lib/payments/site-url': { getCheckoutSiteUrl: () => 'https://www.ndcc.com.au' },
  '@/lib/order-input-validation': { PUBLIC_ORDER_LIMITS: { maximumOrderCents: 10000000 },
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
}
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
const vector = load('lib/reverse-raffle-ticket.ts', {});
const ticket = load('lib/raffle-ticket.ts', {
  './reverse-raffle-ticket': vector,
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
assert.ok((await ticket.renderRaffleTicket('NDCCRAF-260001')).toString().includes('$5.00 AUD'));
await assert.rejects(() => ticket.renderRaffleTicket('NDCCRRO-202600000'));
await assert.rejects(() => ticket.renderRaffleTicket('NDCCRRO-2026<script>'));
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
  '@/lib/payment-receipt-pdf':{buildPaymentReceiptFilename:()=> 'receipt.pdf',buildPaymentReceiptPdf:async data=>{assert.ok(data.descriptionLines.includes('Raffle numbers: 201, 202'));return 'pdf';}},
  '@/lib/raffle-ticket':{renderRaffleTicket:ticket.renderRaffleTicket},
  '@/lib/payments/receipt-delivery-policy':{canRecordSimulatedReceiptDelivery:()=>false},
  '@/lib/payments/reference':{isCanonicalPaymentReference:()=>true},
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
