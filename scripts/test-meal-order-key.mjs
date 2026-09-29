// Kitchen order key remembered per browser: resumes a retry in a new tab,
// expires after 12 hours, never stores contact details, and ignores past services.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MEAL_ORDER_KEY_MAX_AGE_MS, isPastService, parseStoredOrderKey, serialiseOrderKey } from '../lib/meal-order-key.ts';

const token = '33333333-3333-4333-8333-333333333333';
const now = Date.parse('2026-09-29T11:16:00Z');
assert.equal(parseStoredOrderKey(serialiseOrderKey(token, now - 5 * 60_000), now), token, 'a retry minutes later resumes');
assert.equal(parseStoredOrderKey(serialiseOrderKey(token, now - MEAL_ORDER_KEY_MAX_AGE_MS - 1), now), null, 'forgotten after 12 hours');
assert.equal(parseStoredOrderKey(serialiseOrderKey(token, now + 10 * 60_000), now), null, 'future timestamps rejected');
for (const raw of [null, '', 'not json', '{}', JSON.stringify({ token: 'nope', savedAt: now }), JSON.stringify({ token, savedAt: 'x' })]) assert.equal(parseStoredOrderKey(raw, now), null, String(raw));
assert.deepEqual(Object.keys(JSON.parse(serialiseOrderKey(token, now))).sort(), ['savedAt', 'token'], 'only the key and a timestamp are stored');
assert.equal(isPastService('2026-09-24', '2026-10-01'), true);
for (const value of ['2026-10-01', '2026-10-08', null, undefined, 'garbage']) assert.equal(isPastService(value, '2026-10-01'), false, String(value));

const client = readFileSync('app/kitchen/KitchenClient.tsx', 'utf8');
assert.match(client, /parseStoredOrderKey\(localStorage\.getItem\(MEAL_ORDER_STORAGE_NAME\), Date\.now\(\)\)/, 'new tabs read the remembered key');
assert.match(client, /const token = saved\?\.token \|\| remembered \|\| crypto\.randomUUID\(\)/, 'tab draft first, then the remembered key');
assert.match(client, /if \(saved \|\| remembered\)/, 'a remembered key resumes the order');
assert.match(client, /isPastService\(order\.service_date, mealServiceDate\(\)\)/, 'past-service orders start fresh');
assert.match(client, /if \(\(!order\.editing \|\| !saved\) && order\.draft\)/, 'a new tab shows the saved order even mid-edit');
assert.match(client, /response\.status === 410\)[\s\S]{0,200}setDraftToken\(crypto\.randomUUID\(\)\)/, 'a removed order rotates the key on resume');
assert.match(client, /res\.status === 410\) \{ setDraftToken\(crypto\.randomUUID\(\)\)/, 'a removed order rotates the key on submit');
const route = readFileSync('app/api/kitchen/orders/route.ts', 'utf8');
assert.match(route, /if \(order\.deleted_at\) return NextResponse\.json\(\{ error: DELETED_MEAL_ORDER_MESSAGE, deleted: true \}, \{ status: 410 \}\)/, 'resume and edit refuse removed orders');
assert.ok(route.indexOf("if (order.deleted_at)") < route.indexOf("if (action === 'resume')"), 'the removed check runs before resume returns');
assert.match(route, /select\('id,deleted_at'\)\.eq\('meal_draft_token', token\)[\s\S]{0,300}existing\.data\?\.deleted_at\) return NextResponse\.json\(\{ error: DELETED_MEAL_ORDER_MESSAGE, deleted: true \}, \{ status: 410 \}\)/, 'saving refuses a removed order key');
assert.ok(route.indexOf("existing.data?.deleted_at") < route.indexOf("rpc('save_meal_order'"), 'the removed check runs before the save');
assert.match(client, /localStorage\.setItem\(MEAL_ORDER_STORAGE_NAME, serialiseOrderKey\(draftToken, Date\.now\(\)\)\)/);
assert.doesNotMatch(client, /localStorage\.setItem\([^)]*(name|email|phone)/, 'contact details never go to local storage');
console.log('PASS: kitchen order key resumes retries across tabs, expires after 12 hours, stores no contact details and ignores past services.');
