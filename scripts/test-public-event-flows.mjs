import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Exercise the actual query and registration route with isolated adapters.
// These tests never write live records, send email or request payment.
function load(path, dependencies = {}, environment = {}) {
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'process', code)(name => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports, { env: environment });
  return module.exports;
}

const hour = 3_600_000;
const now = Date.now();
const event = (id, offset, overrides = {}) => ({
  id, start_at: new Date(now + offset * hour).toISOString(), end_at: null,
  status: 'published', visibility: 'public', show_on_calendar: true,
  show_on_home: true, show_on_contact: false, ...overrides,
});
const events = [
  ...Array.from({ length: 30 }, (_, i) => event(`past-${i}`, -100 + i)),
  event('ongoing', -2, { end_at: new Date(now + hour).toISOString() }),
  event('next', 24), event('later', 48, { show_on_contact: true }),
  event('private', 1, { visibility: 'committee' }),
  event('draft', 2, { status: 'draft' }),
];
const calendarDb = { from(table) {
  assert.equal(table, 'calendar_events');
  let data = [...events];
  const query = {
    select() { return query; },
    in(key, values) { data = data.filter(row => values.includes(row[key])); return query; },
    eq(key, value) { data = data.filter(row => row[key] === value); return query; },
    order(key) { if (key === 'start_at') data.sort((a, b) => a.start_at.localeCompare(b.start_at)); return query; },
    or(expression) {
      const cutoff = expression.match(/^end_at.gte.([^,]+),/)[1];
      data = data.filter(row => (row.end_at ?? row.start_at) >= cutoff);
      return query;
    },
    limit(value) { data = data.slice(0, value); return query; },
    then(resolve, reject) { return Promise.resolve({ data, error: null }).then(resolve, reject); },
  };
  return query;
} };
const calendar = load('lib/calendar/queries.ts', {
  '@/lib/supabase-server': { createServerClient: () => calendarDb, isServerSupabaseConfigured: () => true },
  './types': { CALENDAR_EVENT_TYPES: [] },
  '@/lib/public-link-url': { normalisePublicLinkUrl: value => value || null },
});
assert.deepEqual((await calendar.getUpcomingCalendarEvents()).data.map(row => row.id), ['ongoing', 'next', 'later']);
assert.deepEqual((await calendar.getUpcomingCalendarEvents({ home: true, limit: 1 })).data.map(row => row.id), ['ongoing']);
assert.deepEqual((await calendar.getUpcomingCalendarEvents({ contact: true })).data.map(row => row.id), ['later']);
console.log('PASS upcoming events survive historical rows, retain overlapping events, exclude private/draft events and honour placement/limit');

const id = '11111111-1111-4111-8111-111111111111';
// A fixed far-future winter date keeps the Melbourne time assertion stable
// (AEST, UTC+10) while never tripping the past-event guard.
let row = { id, title: 'Club event', date: '2036-07-03T09:30:00Z', ticket_price: 0, location: 'Clubrooms' };
let readError = null, registrationError = null, writes = [], sent = [], deletions = [], rpcCalls = [];
let existingRegistrations = [], rpcResult = { error: { code: 'PGRST202', message: 'Could not find the function' } };
const db = { rpc(name, args) { rpcCalls.push({ name, args }); return Promise.resolve(rpcResult); }, from(table) {
  let selected, inserted;
  const query = {
    select(columns) { selected = columns; return query; },
    eq() { return query; },
    async maybeSingle() {
      assert.equal(table, 'events');
      const allowed = ['id', 'title', 'date', 'ticket_price', 'location', 'capacity'];
      assert.ok(selected.split(',').every(column => allowed.includes(column)), 'event reads must match the deployed events schema');
      return { data: row, error: readError };
    },
    insert(value) { inserted = value; writes.push({ table, value }); return query; },
    delete() { deletions.push(table); return query; },
    async single() { return { data: { id: 'order-test' }, error: null }; },
    then(resolve, reject) {
      if (table === 'event_registrations' && !inserted) return Promise.resolve({ data: existingRegistrations, error: null }).then(resolve, reject);
      return Promise.resolve({ data: inserted, error: table === 'event_registrations' ? registrationError : null }).then(resolve, reject);
    },
  };
  return query;
} };
const route = load('app/api/events/route.ts', {
  '@/lib/supabase-server': { createServerClient: () => db },
  '@/lib/payments/bank-transfer': { configuredBankDetails: () => null },
  '@/lib/payments/capabilities': { loadMerchPaymentSettings: async () => ({}), deriveCapabilities: () => ({card:true,bank_transfer:false}) },
  'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
  '@/lib/server/request-guards': { enforceHoneypotAndTiming: () => true, enforceRateLimit: () => true, getClientIp: () => 'test' },
  '@/lib/utils': load('lib/utils.ts'),
  '@/lib/payments/reference': { generateUniquePaymentReference: async () => 'TEST-EVENT-1' },
  '@/lib/email': { sendEmail: async message => sent.push(message), emailHtml: (_, html) => html, bankDetailsHtml: () => '', escapeEmailHtml: value => value },
  '@/lib/order-input-validation': load('lib/order-input-validation.ts'),
  '@/lib/validation/uuid': load('lib/validation/uuid.ts'),
}, { NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'isolated-test' });
const submit = () => route.POST(new Request('https://example.invalid/api/events', {
  method: 'POST', body: JSON.stringify({ event_id: id, name: 'Test registrant', email: 'test@example.com',
    phone: '0412345678', quantity: 2, hp_field: '', submitted_at: now - 5000 }),
}));
let response = await submit();
assert.equal(response.status, 200);
assert.equal((await response.json()).total_amount, 0);
assert.equal(writes[0].table, 'event_registrations');
assert.equal(sent.length, 1);
assert.match(sent[0].html, /3 July 2036/);
assert.match(sent[0].html, /7:30 pm/);
console.log('PASS free event registration uses the deployed date column and emails the Melbourne event time');

writes = []; sent = [];
row = { ...row, ticket_price: 12.34 };
response = await submit();
assert.equal(response.status, 200);
assert.equal((await response.json()).total_amount, 24.68);
assert.equal(writes[0].value.total_amount, 24.68);
assert.equal(writes[1].value.order_id, 'order-test');
assert.equal(writes[1].value.payment_reference, 'TEST-EVENT-1');
assert.equal(sent.length, 0, 'paid events retain the existing payment receipt workflow');
console.log('PASS paid registration retains exact totals, payment reference and linked order');

writes = [];
registrationError = { message: 'Isolated insert failure' };
assert.equal((await submit()).status, 500);
assert.deepEqual(deletions, ['orders']);
registrationError = null;
console.log('PASS failed registration removes its pending order');

writes = [];
readError = { message: 'Isolated database failure' };
assert.equal((await submit()).status, 503);
assert.equal(writes.length, 0);
readError = null; row = null;
assert.equal((await submit()).status, 404);
assert.equal(writes.length, 0);
console.log('PASS database failures are distinguished from missing events and cannot create orders');

// Past-event and capacity guards (F14).
writes = []; sent = []; deletions = []; rpcCalls = [];
row = { ...row, ticket_price: 0, date: new Date(now - hour).toISOString() };
response = await submit();
assert.equal(response.status, 409);
assert.match((await response.json()).error, /closed/);
assert.equal(writes.length, 0); assert.equal(rpcCalls.length, 0);
console.log('PASS registrations for events that have started are refused before any write');

row = { ...row, date: '2036-07-03T09:30:00Z', capacity: 10 };
existingRegistrations = [
  { quantity: 5, payment_status: 'paid' },
  { quantity: 3, payment_status: 'pending_bank_transfer' },
  { quantity: 7, payment_status: 'cancelled' },
  { quantity: 4, payment_status: 'failed' },
];
response = await submit();
assert.equal(response.status, 200, '8 held + 2 requested fits capacity 10 (cancelled/failed excluded)');
existingRegistrations = [...existingRegistrations, { quantity: 1, payment_status: 'not_required' }];
writes = []; rpcCalls = [];
response = await submit();
assert.equal(response.status, 409, '9 held + 2 requested exceeds capacity 10');
assert.match((await response.json()).error, /not enough places/);
assert.equal(writes.length, 0); assert.equal(rpcCalls.length, 0);
console.log('PASS application-level capacity check counts active registrations only');

existingRegistrations = []; writes = []; rpcCalls = []; sent = [];
rpcResult = { data: 'registration-id', error: null };
response = await submit();
assert.equal(response.status, 200);
assert.equal(rpcCalls[0].name, 'ndcc_register_event_attendee');
assert.equal(rpcCalls[0].args.p_quantity, 2);
assert.equal(rpcCalls[0].args.p_payment_status, 'not_required');
assert.equal(writes.some(write => write.table === 'event_registrations'), false, 'RPC path does not double insert');
console.log('PASS atomic registration RPC is used when deployed');

row = { ...row, ticket_price: 12.34 };
writes = []; deletions = []; rpcCalls = [];
rpcResult = { data: null, error: { code: 'P0001', message: 'Event registration capacity reached' } };
response = await submit();
assert.equal(response.status, 409);
assert.deepEqual(deletions, ['orders'], 'a refused paid registration removes its pending order');
rpcResult = { error: { code: 'PGRST202', message: 'Could not find the function' } };
row = { ...row, ticket_price: 0, capacity: undefined };
console.log('PASS concurrent capacity refusal from the RPC maps to 409 and cleans up the order');

