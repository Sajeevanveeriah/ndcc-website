#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PUBLIC_ORDER_LIMITS,
  audAmountToCents,
  readLimitedJsonObject,
  validateContactFormInput,
  validateKitchenOrderInput,
  validateMembershipOrderInput,
  validateRaffleCheckoutInput,
  validateVolunteerFormInput,
} from '../lib/order-input-validation.ts';

const now = Date.now() - 5_000;
const membershipPayload = (overrides = {}) => ({
  full_name: '  Alex Member  ',
  email: 'alex@example.com',
  phone: '0412 345 678',
  notes: '  Please email me.  ',
  membership_plan_id: '11111111-1111-4111-8111-111111111111',
  addons: [{ addon_id: '22222222-2222-4222-8222-222222222222', quantity: 1 }],
  hp_field: '',
  submitted_at: now,
  ...overrides,
});
const kitchenPayload = (overrides = {}) => ({
  customer_name: '  Casey Customer  ',
  customer_email: 'casey@example.com',
  customer_phone: '03 5555 5555',
  items: [{ item_id: '33333333-3333-4333-8333-333333333333', quantity: 2 }],
  hp_field: '',
  submitted_at: now,
  ...overrides,
});

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

await test('legitimate membership input is normalised without changing quantities', () => {
  const result = validateMembershipOrderInput(membershipPayload());
  assert.equal(result.ok, true);
  assert.equal(result.value.fullName, 'Alex Member');
  assert.equal(result.value.notes, 'Please email me.');
  assert.equal(result.value.addons[0].quantity, 1);
});

await test('membership add-on quantities must be bounded safe integers', () => {
  for (const quantity of [undefined, '1', 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, PUBLIC_ORDER_LIMITS.membershipAddonQuantity + 1]) {
    const result = validateMembershipOrderInput(membershipPayload({
      addons: [{ addon_id: '22222222-2222-4222-8222-222222222222', quantity }],
    }));
    assert.equal(result.ok, false, `quantity ${String(quantity)} must be rejected`);
  }
});

await test('duplicate and excessive membership add-ons are rejected', () => {
  const duplicate = validateMembershipOrderInput(membershipPayload({
    addons: [
      { addon_id: 'addon-1', quantity: 1 },
      { addon_id: 'addon-1', quantity: 1 },
    ],
  }));
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.error, /Duplicate/);

  const excessiveLines = validateMembershipOrderInput(membershipPayload({
    addons: Array.from({ length: PUBLIC_ORDER_LIMITS.membershipAddonLines + 1 }, (_, index) => ({
      addon_id: `addon-${index}`,
      quantity: 1,
    })),
  }));
  assert.equal(excessiveLines.ok, false);

  const excessiveUnits = validateMembershipOrderInput(membershipPayload({
    addons: [
      { addon_id: 'addon-1', quantity: PUBLIC_ORDER_LIMITS.membershipAddonQuantity },
      { addon_id: 'addon-2', quantity: PUBLIC_ORDER_LIMITS.membershipAddonQuantity },
      { addon_id: 'addon-3', quantity: PUBLIC_ORDER_LIMITS.membershipAddonQuantity },
    ],
  }));
  assert.equal(excessiveUnits.ok, false);
});

await test('membership text and identifier fields are type and length bounded', () => {
  assert.equal(validateMembershipOrderInput(membershipPayload({ full_name: { value: 'Alex' } })).ok, false);
  assert.equal(validateMembershipOrderInput(membershipPayload({ full_name: 'x'.repeat(PUBLIC_ORDER_LIMITS.nameLength + 1) })).ok, false);
  assert.equal(validateMembershipOrderInput(membershipPayload({ notes: 'x'.repeat(PUBLIC_ORDER_LIMITS.notesLength + 1) })).ok, false);
  assert.equal(validateMembershipOrderInput(membershipPayload({ membership_plan_id: '../unsafe' })).ok, false);
});

await test('legitimate kitchen input is normalised without changing quantities', () => {
  const result = validateKitchenOrderInput(kitchenPayload());
  assert.equal(result.ok, true);
  assert.equal(result.value.customerName, 'Casey Customer');
  assert.deepEqual(result.value.items, [{ itemId: '33333333-3333-4333-8333-333333333333', quantity: 2 }]);
});

await test('kitchen item quantities must be bounded safe integers', () => {
  for (const quantity of [undefined, '2', 0, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY, PUBLIC_ORDER_LIMITS.kitchenItemQuantity + 1]) {
    const result = validateKitchenOrderInput(kitchenPayload({
      items: [{ item_id: '33333333-3333-4333-8333-333333333333', quantity }],
    }));
    assert.equal(result.ok, false, `quantity ${String(quantity)} must be rejected`);
  }
});

await test('duplicate and excessive kitchen items are rejected', () => {
  const duplicate = validateKitchenOrderInput(kitchenPayload({
    items: [
      { item_id: 'item-1', quantity: 1 },
      { item_id: 'item-1', quantity: 2 },
    ],
  }));
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.error, /Duplicate/);

  const excessiveLines = validateKitchenOrderInput(kitchenPayload({
    items: Array.from({ length: PUBLIC_ORDER_LIMITS.kitchenItemLines + 1 }, (_, index) => ({
      item_id: `item-${index}`,
      quantity: 1,
    })),
  }));
  assert.equal(excessiveLines.ok, false);
});

await test('kitchen total units and customer fields are bounded', () => {
  const excessiveUnits = validateKitchenOrderInput(kitchenPayload({
    items: [
      { item_id: 'item-1', quantity: PUBLIC_ORDER_LIMITS.kitchenItemQuantity },
      { item_id: 'item-2', quantity: PUBLIC_ORDER_LIMITS.kitchenItemQuantity },
      { item_id: 'item-3', quantity: 1 },
    ],
  }));
  assert.equal(excessiveUnits.ok, false);
  assert.equal(validateKitchenOrderInput(kitchenPayload({ customer_email: 'x'.repeat(PUBLIC_ORDER_LIMITS.emailLength + 1) })).ok, false);
  assert.equal(validateKitchenOrderInput(kitchenPayload({ customer_phone: ['0412345678'] })).ok, false);
});

await test('raffle checkout input is strict, normalised and bounded', () => {
  const valid = validateRaffleCheckoutInput({
    name: '  Riley Raffle  ',
    email: 'RILEY@example.com',
    phone: '0412 345 678',
    quantity: 3,
  });
  assert.deepEqual(valid, {
    ok: true,
    value: {
      name: 'Riley Raffle',
      email: 'riley@example.com',
      phone: '0412 345 678',
      quantity: 3,
    },
  });
  for (const quantity of ['3', 0, 1.5, 21, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(validateRaffleCheckoutInput({
      name: 'Riley Raffle', email: 'riley@example.com', phone: '', quantity,
    }).ok, false, `quantity ${String(quantity)} must be rejected`);
  }
  assert.equal(validateRaffleCheckoutInput({
    name: 'x'.repeat(PUBLIC_ORDER_LIMITS.nameLength + 1),
    email: 'riley@example.com',
    quantity: 1,
  }).ok, false);
});

await test('AUD amounts use exact bounded integer cents', () => {
  assert.deepEqual(audAmountToCents('12.34'), { ok: true, value: 1_234 });
  assert.deepEqual(audAmountToCents(0.1), { ok: true, value: 10 });
  assert.equal(audAmountToCents('1.001').ok, false);
  assert.equal(audAmountToCents('1e3').ok, false);
  assert.equal(audAmountToCents(-1).ok, false);
  assert.equal(audAmountToCents(Number.POSITIVE_INFINITY).ok, false);
  assert.equal(audAmountToCents((PUBLIC_ORDER_LIMITS.maximumOrderCents + 1) / 100).ok, false);
  assert.equal(audAmountToCents(0, { allowZero: false }).ok, false);
});

await test('JSON reader accepts a small object and rejects arrays or malformed JSON', async () => {
  const valid = await readLimitedJsonObject(new Request('https://ndcc.example/api', {
    method: 'POST',
    body: JSON.stringify({ name: 'Dino 🦖' }),
  }));
  assert.equal(valid.ok, true);
  assert.equal(valid.value.name, 'Dino 🦖');

  assert.equal((await readLimitedJsonObject(new Request('https://ndcc.example/api', { method: 'POST', body: '[]' }))).ok, false);
  assert.equal((await readLimitedJsonObject(new Request('https://ndcc.example/api', { method: 'POST', body: '{' }))).ok, false);
});

await test('JSON reader rejects both declared and streamed oversized bodies', async () => {
  const declared = await readLimitedJsonObject(new Request('https://ndcc.example/api', {
    method: 'POST',
    headers: { 'content-length': String(PUBLIC_ORDER_LIMITS.bodyBytes + 1) },
    body: '{}',
  }));
  assert.deepEqual(declared, { ok: false, error: 'Request body is too large.' });

  const streamed = await readLimitedJsonObject(new Request('https://ndcc.example/api', {
    method: 'POST',
    body: JSON.stringify({ notes: 'x'.repeat(PUBLIC_ORDER_LIMITS.bodyBytes) }),
  }));
  assert.deepEqual(streamed, { ok: false, error: 'Request body is too large.' });
});

await test('contact form input is bounded and enquiry types are allowlisted', () => {
  const payload = {
    name: '  Jordan Contact  ',
    email: 'JORDAN@example.com',
    message: '  I have a membership question.  ',
    enquiry_type: 'membership',
    hp_field: '',
    submitted_at: now,
  };
  const valid = validateContactFormInput(payload);
  assert.deepEqual(valid, {
    ok: true,
    value: {
      name: 'Jordan Contact',
      email: 'jordan@example.com',
      message: 'I have a membership question.',
      enquiryType: 'membership',
      hpField: '',
      submittedAt: now,
    },
  });
  assert.equal(validateContactFormInput({ ...payload, enquiry_type: 'attacker-controlled' }).ok, false);
  assert.equal(validateContactFormInput({
    name: {}, email: 'jordan@example.com', message: 'Question', submitted_at: now,
  }).ok, false);
  assert.equal(validateContactFormInput({
    name: 'Jordan', email: 'jordan@example.com', message: 'x'.repeat(5_001), submitted_at: now,
  }).ok, false);
});

await test('volunteer form input requires bounded text and a valid phone', () => {
  const valid = validateVolunteerFormInput({
    name: '  Taylor Volunteer  ',
    email: 'TAYLOR@example.com',
    phone: '0412 345 678',
    role: 'Canteen',
    availability: '  Saturday mornings  ',
    hp_field: '',
    submitted_at: now,
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.value.email, 'taylor@example.com');
  assert.equal(valid.value.availability, 'Saturday mornings');
  assert.equal(validateVolunteerFormInput({
    name: 'Taylor', email: 'taylor@example.com', phone: '123', role: 'Canteen', submitted_at: now,
  }).ok, false);
  assert.equal(validateVolunteerFormInput({
    name: 'Taylor', email: 'taylor@example.com', phone: '0412345678', role: ['Canteen'], submitted_at: now,
  }).ok, false);
  assert.equal(validateVolunteerFormInput({
    name: 'Taylor', email: 'taylor@example.com', phone: '0412345678', role: 'Canteen',
    availability: 'x'.repeat(PUBLIC_ORDER_LIMITS.notesLength + 1), submitted_at: now,
  }).ok, false);
});

await test('live routes use the shared validation and cents arithmetic', () => {
  const merchandiseRoute = readFileSync('app/api/orders/route.ts', 'utf8');
  const membershipRoute = readFileSync('app/api/memberships/route.ts', 'utf8');
  const kitchenRoute = readFileSync('app/api/kitchen/orders/route.ts', 'utf8');
  const eventRoute = readFileSync('app/api/events/route.ts', 'utf8');
  for (const source of [merchandiseRoute, membershipRoute, kitchenRoute]) {
    assert.match(source, /readLimitedJsonObject\(request\)/);
    assert.match(source, /audAmountToCents/);
    assert.doesNotMatch(source, /Math\.max\(1,\s*Number\([^)]*quantity/);
  }
  assert.match(merchandiseRoute, /order_category !== 'merch'/);
  assert.match(merchandiseRoute, /order_category: 'merch'/);
  assert.match(merchandiseRoute, /MERCH_ITEM_LINES_LIMIT/);
  assert.match(merchandiseRoute, /MERCH_ITEM_QUANTITY_LIMIT/);
  assert.match(merchandiseRoute, /MERCH_ITEM_UNITS_LIMIT/);
  assert.match(membershipRoute, /PUBLIC_ORDER_LIMITS\.maximumOrderCents/);
  assert.match(kitchenRoute, /PUBLIC_ORDER_LIMITS\.maximumOrderCents/);
  assert.match(membershipRoute, /validateMembershipOrderInput/);
  assert.match(kitchenRoute, /validateKitchenOrderInput/);

  const raffleRoute = readFileSync('app/api/raffle/checkout/route.ts', 'utf8');
  assert.match(raffleRoute, /readLimitedJsonObject\(request, 16 \* 1024\)/);
  assert.match(raffleRoute, /validateRaffleCheckoutInput/);
  assert.match(raffleRoute, /PUBLIC_ORDER_LIMITS\.maximumOrderCents/);
  assert.doesNotMatch(raffleRoute, /Number\(body\.quantity\)/);

  assert.match(eventRoute, /readLimitedJsonObject\(request, 16 \* 1024\)/);
  assert.match(eventRoute, /Number\.isSafeInteger\(quantity\)/);
  assert.match(eventRoute, /\.eq\('published', true\)/);
  assert.match(eventRoute, /audAmountToCents\(eventRow\.ticket_price \|\| 0\)/);
  assert.match(eventRoute, /PUBLIC_ORDER_LIMITS\.maximumOrderCents/);
  assert.doesNotMatch(eventRoute, /Number\(quantity\)/);

  const contactRoute = readFileSync('app/api/contacts/route.ts', 'utf8');
  const volunteerRoute = readFileSync('app/api/volunteers/route.ts', 'utf8');
  assert.match(contactRoute, /readLimitedJsonObject\(request, 16 \* 1024\)/);
  assert.match(contactRoute, /validateContactFormInput/);
  assert.doesNotMatch(contactRoute, /await request\.json\(\)/);
  assert.match(volunteerRoute, /readLimitedJsonObject\(request, 16 \* 1024\)/);
  assert.match(volunteerRoute, /validateVolunteerFormInput/);
  assert.match(volunteerRoute, /\.eq\('is_active', true\)/);
  assert.match(volunteerRoute, /The selected volunteer role is no longer available\./);
  assert.doesNotMatch(volunteerRoute, /position\?\.id \|\| null/);
});

console.log(`Public order input security checks passed (${passed}).`);
