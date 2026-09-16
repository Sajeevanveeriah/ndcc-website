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
let row = { id, title: 'Club event', date: '2026-10-03T09:30:00Z', ticket_price: 0, location: 'Clubrooms' };
let readError = null, registrationError = null, writes = [], sent = [], deletions = [];
const db = { from(table) {
  let selected, inserted;
  const query = {
    select(columns) { selected = columns; return query; },
    eq() { return query; },
    async maybeSingle() {
      assert.equal(table, 'events');
      const allowed = ['id', 'title', 'date', 'ticket_price', 'location'];
      assert.ok(selected.split(',').every(column => allowed.includes(column)), 'event reads must match the deployed events schema');
      return { data: row, error: readError };
    },
    insert(value) { inserted = value; writes.push({ table, value }); return query; },
    delete() { deletions.push(table); return query; },
    async single() { return { data: { id: 'order-test' }, error: null }; },
    then(resolve, reject) { return Promise.resolve({ data: inserted, error: table === 'event_registrations' ? registrationError : null }).then(resolve, reject); },
  };
  return query;
} };
const route = load('app/api/events/route.ts', {
  '@/lib/supabase-server': { createServerClient: () => db },
  'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
  '@/lib/server/request-guards': { enforceHoneypotAndTiming: () => true, enforceRateLimit: () => true, getClientIp: () => 'test' },
  '@/lib/utils': load('lib/utils.ts'),
  '@/lib/payments/reference': { generateUniquePaymentReference: async () => 'TEST-EVENT-1' },
  '@/lib/email': { sendEmail: async message => sent.push(message), emailHtml: (_, html) => html, bankDetailsHtml: () => '', escapeEmailHtml: value => value },
  '@/lib/order-input-validation': load('lib/order-input-validation.ts'),
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
assert.match(sent[0].html, /3 October 2026/);
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
