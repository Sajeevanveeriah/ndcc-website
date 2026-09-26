import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

// Execute the actual route handlers, with explicitly mocked Supabase and Stripe.
// No network, files, emails, database changes or payment transactions are made.
const require = createRequire(import.meta.url);
const ts = require(process.env.NDCC_TEST_TYPESCRIPT || 'typescript');
const root = path.resolve(import.meta.dirname, '..');
function loader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const source = ts.transpileModule(readFileSync(file, 'utf8'), {
      fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText;
    vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename: file })((id) => {
      if (id in mocks) return mocks[id];
      if (id.startsWith('@/')) return load(path.join(root, `${id.slice(2)}.ts`));
      if (id.startsWith('.')) return load(path.resolve(path.dirname(file), `${id}.ts`));
      return require(id);
    }, module, module.exports);
    return module.exports;
  }
  return (file) => load(path.join(root, file));
}
const plain = loader();
const meal = plain('lib/meal-collection.ts');
const { getKitchenOrderWindow: evaluateWindow, DEFAULT_KITCHEN_SETTINGS, validKitchenSettings } = plain('lib/kitchen-order-window.ts');
const getKitchenOrderWindow = (now) => evaluateWindow(now, { ...DEFAULT_KITCHEN_SETTINGS, enabled: true });
let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`PASS: ${name}`); }
await test('AEST Thursday cutoff: 09:59 open, 10:00 closed, correct service date', () => {
  assert.equal(getKitchenOrderWindow(new Date('2026-09-16T23:59:00Z')).open, true);
  assert.equal(getKitchenOrderWindow(new Date('2026-09-17T00:00:00Z')).open, false);
  assert.equal(meal.mealServiceDate(new Date('2026-09-16T23:59:00Z')), '2026-09-17');
});
await test('AEDT Thursday cutoff and Monday opening use Melbourne calendar', () => {
  assert.equal(getKitchenOrderWindow(new Date('2026-10-07T22:59:00Z')).open, true);
  assert.equal(getKitchenOrderWindow(new Date('2026-10-07T23:00:00Z')).open, false);
  assert.equal(getKitchenOrderWindow(new Date('2026-10-04T12:59:00Z')).open, false);
  assert.equal(getKitchenOrderWindow(new Date('2026-10-04T13:00:00Z')).open, true);
  assert.equal(meal.mealServiceDate(new Date('2026-10-04T13:00:00Z')), '2026-10-08');
});
await test('year rollover and historical missing values stay honest', () => {
  assert.equal(meal.mealServiceDate(new Date('2026-12-27T13:00:00Z')), '2026-12-31');
  assert.equal(meal.mealServiceDate(new Date('2026-12-31T13:00:00Z')), '2027-01-07');
  assert.equal(meal.mealServiceLabel(null), 'Service date not recorded');
  assert.equal(meal.mealCollectionLabel(null), 'Collection time not recorded');
});

const token = '22222222-2222-4222-8222-222222222222';
const itemId = '33333333-3333-4333-8333-333333333333';
const orderId = '11111111-1111-4111-8111-111111111111';
let order, payments, sessions, created, expired, savedArgs;
const emails = [];
let kitchenPermission = true;
let gateOpen = true;
function reset(window = 'juniors') {
  order = { id: orderId, total_amount: 20, amount_paid: 0, payment_status: 'pending_bank_transfer',
    deleted_at: null, order_status: 'submitted', order_category: 'kitchen', payment_reference: 'NCDDKIT-2026-000001',
    customer_email: 'test@example.com', meal_draft_token: token, meal_revision: 1,
    meal_collection_window: window, meal_service_date: '2026-09-17', meal_editing: false };
  payments = []; sessions = new Map(); created = 0; expired = 0; savedArgs = null;
}
reset();
function query(table) {
  let filters = [], patch = null;
  const q = {
    select() { return q; }, order() { return q; }, in() { return q; }, range() { return q; },
    eq(k,v) { filters.push([k,v]); return q; }, is(k,v) { filters.push([k,v]); return q; },
    update(value) { patch = value; return q; },
    result(single) {
      let rows = table === 'orders' ? [order] : table === 'kitchen_items'
        ? [{ id: itemId, name: 'Test meal', price: 10, is_available: true, is_hidden: false }] : payments;
      rows = rows.filter(r => filters.every(([k,v]) => r[k] === v));
      if (patch) for (const row of rows) Object.assign(row, patch);
      return { data: single ? rows[0] || null : rows, error: null };
    },
    maybeSingle() { return Promise.resolve(q.result(true)); },
    then(resolve,reject) { return Promise.resolve(q.result(false)).then(resolve,reject); },
  }; return q;
}
const db = { from: query, async rpc(name,args) {
  if (name === 'save_meal_order') {
    savedArgs = args; order.meal_collection_window = args.target_request.collection_window;
    order.meal_request = args.target_request; return { data: order, error: null };
  }
  if (name === 'begin_meal_order_edit') {
    if (payments.some(p => ['pending','settled'].includes(p.status))) return { error: { message: 'Locked' } };
    order.meal_editing = true; return { data: order };
  }
  assert.equal(name, 'reserve_meal_stripe_payment');
  assert.equal(args.target_token, token); assert.equal(args.target_revision, order.meal_revision);
  const end = Math.floor(Date.now()/1000)+3600;
  payments.push({ id:'payment-1', order_id:order.id, amount:20, currency:'AUD', provider:'stripe',
    status:'pending', provider_reference:null, payment_reference:args.target_payment_reference,
    metadata:{}, created_at:new Date().toISOString() });
  return { data:[{ payment_id:'payment-1', checkout_expires_at_unix:end }] };
} };
const stripe = { checkout: { sessions: {
  async create(params) {
    created++; const session = { id:`cs_test_${created}`, url:'https://checkout.example.test/session', status:'open',
      mode:params.mode, amount_total:params.line_items[0].price_data.unit_amount, currency:'aud',
      client_reference_id:params.client_reference_id, metadata:params.metadata, expires_at:params.expires_at };
    sessions.set(session.id,session); return session;
  },
  async retrieve(id) { if (!sessions.has(id)) throw new Error('Unavailable'); return sessions.get(id); },
  async expire(id) { expired++; const session=sessions.get(id); if(session.status==='complete')throw new Error('Complete');session.status='expired';return session; },
} } };
const mocks = {
  '@/lib/auth/guard': { requirePermission: async () => kitchenPermission ? { id: 'test-staff' } : null },
  'next/server': { NextResponse: { json: (data,init) => Response.json(data,init) } },
  '@/lib/supabase-server': { createServerClient:()=>db, isServerSupabaseConfigured:()=>true },
  '@/lib/stripe': { getStripe:()=>stripe },
  '@/lib/server/request-guards': { enforceRateLimit:()=>true, enforceHoneypotAndTiming:()=>true, getClientIp:()=> 'test' },
  '@/lib/club-settings': { getClubSettings:async()=>({}) },
  // CMS recipient table unreadable: fall back to the hardcoded lists.
  '@/lib/notification-recipients': (() => {
    const fallback = plain('lib/notification-recipients-fallback.ts');
    const { receiptRecipients } = plain('lib/payments/receipt-recipients.ts');
    return {
      getStaffOrderNotificationRecipients: async (category) => fallback.fallbackNotificationRecipients(category === 'apparel' ? 'apparel_order_staff' : 'kitchen_order_staff'),
      getReceiptRecipients: async (purchaser, department = []) => receiptRecipients(purchaser, department, fallback.fallbackNotificationRecipients('receipt_copy')),
    };
  })(),
  '@/lib/payments/capabilities': { loadMerchPaymentSettings:async()=>({ minimum_partial_amount:10 }), deriveCapabilities:()=>({ card:true, partial_payments:false }) },
  '@/lib/payments/reference': { generateUniquePaymentReference:async()=> 'NCDDKIT-2026-000002',
    isCanonicalPaymentReference:v=>/^NCDDKIT-2026-\d{6}$/.test(v), normalisePaymentReferenceCategory:v=>v },
  '@/lib/payments/site-url': { getCheckoutSiteUrl:()=> 'http://localhost:3100' },
  '@/lib/kitchen-ordering-settings': { getLiveKitchenOrderWindow:async()=>({open:gateOpen,serviceDate:'2026-09-17',message:'Orders disabled.'}) },
  '@/lib/email': { sendEmail:async(payload)=>{emails.push(payload);return {status:'sent'};},emailHtml:(_title,body)=>body,bankDetailsHtml:()=>'',escapeEmailHtml:String },
};
const load = loader(mocks);
const kitchen = load('app/api/kitchen/orders/route.ts');
const checkout = load('app/api/payments/checkout-session/route.ts');
const exportRoute = load('app/api/admin/kitchen/orders/export/route.ts');
const request = body => new Request('http://localhost:3100/api/test', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const payload = { draft_token:token,revision:0,customer_name:'Test Customer',customer_email:'test@example.com',
  customer_phone:'0412345678',items:[{item_id:itemId,quantity:2}],submitted_at:Date.now()-5000,hp_field:'' };
await test('CMS export requires kitchen permission and a valid Thursday; exports only the selected service', async () => {
  kitchenPermission = false;
  assert.equal((await exportRoute.GET(new Request('http://localhost/export?service_date=2026-09-17'))).status,403);
  kitchenPermission = true;
  for (const date of ['', '2026-09-16', '2026-02-30', '2026-09-17x']) {
    assert.equal((await exportRoute.GET(new Request(`http://localhost/export?service_date=${date}`))).status,400);
  }
  Object.assign(order, { customer_name: 'CSV Test', items: [{ name: 'Roast', quantity: 2 }] });
  const exported = await exportRoute.GET(new Request('http://localhost/export?service_date=2026-09-17'));
  assert.equal(exported.status,200);
  assert.equal(exported.headers.get('Cache-Control'),'private, no-store');
  assert.ok((await exported.text()).includes('"CSV Test"'));
  order.deleted_at = new Date().toISOString();
  const deletedExport = await exportRoute.GET(new Request('http://localhost/export?service_date=2026-09-17'));
  assert.ok(!(await deletedExport.text()).includes('"CSV Test"'));
  order.deleted_at = null;
  const otherWeek = await exportRoute.GET(new Request('http://localhost/export?service_date=2026-09-24'));
  assert.ok(!(await otherWeek.text()).includes('"CSV Test"'));
});
await test('order endpoint rejects missing and manipulated collection values before saving', async()=>{
  for(const value of [undefined,null,'',[],['juniors','seniors'],{},'18:00','Juniors','seniors ']) {
    const response=await kitchen.POST(request({...payload,collection_window:value}));
    assert.equal(response.status,400);assert.equal((await response.json()).error,meal.MEAL_COLLECTION_REQUIRED_MESSAGE);
    assert.equal(savedArgs,null);
    assert.equal(emails.length,0);
  }
});
await test('each window is passed to atomic save with server Thursday and catalogue prices',async()=>{
  for(const value of ['juniors','seniors']) {
    const response=await kitchen.POST(request({...payload,collection_window:value,service_date:'2099-01-01',total_amount:1}));
    assert.equal(response.status,200);const body=await response.json();assert.equal(body.collection_window,value);
    assert.equal(body.service_date,'2026-09-17');assert.equal(body.total_amount,20);
    assert.equal(savedArgs.target_service_date,'2026-09-17');assert.equal(savedArgs.target_token,token);
    assert.equal(savedArgs.target_request.items[0].price,10);
    const email = emails.at(-1);
    assert.ok(JSON.stringify(email).includes('ndcc.secretary1@gmail.com'));
    assert.ok(JSON.stringify(email).includes('ndcc.treasurer1@gmail.com'));
    assert.ok(JSON.stringify(email).includes('test@example.com'));
    assert.ok(email.html.includes(meal.mealCollectionLabel(value)));
    assert.equal(email.idempotencyKey, `meal-order-${orderId}-1`);
  }
});
await test('checkout rejects missing selection, wrong token, stale revision and editing state',async()=>{
  for(const change of [{meal_collection_window:null},{meal_collection_window:'invalid'},{meal_editing:true}]) {
    reset();Object.assign(order,change);assert.equal((await checkout.POST(request({order_id:orderId,meal_draft_token:token,meal_revision:1}))).status,400);assert.equal(created,0);
  }
  reset();for(const body of [{},{meal_draft_token:'wrong',meal_revision:1},{meal_draft_token:token,meal_revision:0}]){
    assert.equal((await checkout.POST(request({order_id:orderId,...body}))).status,400);assert.equal(created,0);
  }
});
await test('both valid selections survive actual checkout handler; retry reuses a pending session',async()=>{
  for(const value of ['juniors','seniors']) {
    reset(value);const body={order_id:orderId,meal_draft_token:token,meal_revision:1};
    const first=await checkout.POST(request(body));assert.equal(first.status,200,JSON.stringify(await first.clone().json()));
    assert.equal(created,1);assert.equal(payments.length,1);
    assert.equal(meal.mealContractMatches(order,sessions.get('cs_test_1').metadata),true);
    assert.equal(meal.mealContractMatches(order,payments[0].metadata),true);
    assert.equal((await checkout.POST(request(body))).status,200);assert.equal(created,1);
  }
});
await test('editing expires payable checkout before unlock; completed payment cannot unlock',async()=>{
  reset();await checkout.POST(request({order_id:orderId,meal_draft_token:token,meal_revision:1}));
  const response=await kitchen.POST(request({action:'edit',draft_token:token,revision:1}));
  assert.equal(response.status,200);assert.equal(expired,1);assert.equal(sessions.get('cs_test_1').status,'expired');
  assert.equal(order.meal_editing,true);assert.equal(payments[0].status,'failed');
  reset();await checkout.POST(request({order_id:orderId,meal_draft_token:token,meal_revision:1}));
  sessions.get('cs_test_1').status='complete';
  assert.equal((await kitchen.POST(request({action:'edit',draft_token:token,revision:1}))).status,409);
  assert.equal(expired,0);assert.equal(order.meal_editing,false);
});
await test('resume preserves saved selection; tampered callback metadata fails contract check',async()=>{
  reset('seniors');const response=await kitchen.POST(request({action:'resume',draft_token:token}));
  assert.equal((await response.json()).collection_window,'seniors');
  const metadata={meal_collection_window:'seniors',meal_service_date:'2026-09-17',meal_revision:'1',meal_time_zone:'Australia/Melbourne'};
  assert.equal(meal.mealContractMatches(order,metadata),true);
  for(const patch of [{meal_collection_window:'juniors'},{meal_service_date:'2026-09-24'},{meal_revision:'0'}]){
    assert.equal(meal.mealContractMatches(order,{...metadata,...patch}),false);
  }
});


await test('manual disable wins over weekly opening; custom schedule and invalid settings fail closed', () => {
  const now = new Date('2026-09-14T00:00:00Z');
  assert.equal(evaluateWindow(now).open, false);
  assert.equal(evaluateWindow(now, {...DEFAULT_KITCHEN_SETTINGS, enabled:false}).open, false);
  assert.equal(evaluateWindow(now, {...DEFAULT_KITCHEN_SETTINGS, enabled:true, open_time:'11:00'}).open, false);
  assert.equal(evaluateWindow(now, {...DEFAULT_KITCHEN_SETTINGS, enabled:true, open_time:'09:00'}).open, true);
  for (const patch of [{enabled:'true'}, {open_time:'25:00'}, {open_day:0}, {close_day:5}, {open_day:4,open_time:'11:00'}]) {
    assert.equal(validKitchenSettings({...DEFAULT_KITCHEN_SETTINGS,...patch}),false);
  }
});

await test('disabled ordering rejects save, edit and checkout but permits read-only resume', async () => {
  reset(); gateOpen = false;
  assert.equal((await kitchen.POST(request({...payload, collection_window:'juniors'}))).status,403);
  assert.equal(savedArgs,null);
  assert.equal((await kitchen.POST(request({action:'edit',draft_token:token,revision:1}))).status,403);
  assert.equal((await checkout.POST(request({order_id:orderId,meal_draft_token:token,meal_revision:1}))).status,403);
  assert.equal(created,0);
  assert.equal((await kitchen.POST(request({action:'resume',draft_token:token}))).status,200);
  gateOpen = true;
});
await test('CMS settings reject unauthorised and invalid writes; valid changes persist', async () => {
  let allowed = false, persisted = null;
  const settingsRoute = loader({
    '@/lib/auth/guard': { requirePermission:async()=>allowed ? {role:'admin'} : null },
    '@/lib/kitchen-ordering-settings': { readKitchenOrderingSettings:async()=>persisted || DEFAULT_KITCHEN_SETTINGS },
    '@/lib/supabase-server': { createServerClient:()=>({from:()=>({update:value=>{persisted=value;return {eq:()=>({select:()=>({single:async()=>({data:value,error:null})})})};}})}) },
  })('app/api/admin/kitchen/settings/route.ts');
  assert.equal((await settingsRoute.GET()).status,403);
  assert.equal((await settingsRoute.PATCH(request(DEFAULT_KITCHEN_SETTINGS))).status,403);
  assert.equal(persisted,null); allowed=true;
  assert.equal((await settingsRoute.PATCH(request({...DEFAULT_KITCHEN_SETTINGS,enabled:'true'}))).status,400);
  for (const enabled of [true,false]) {
    assert.equal((await settingsRoute.PATCH(request({...DEFAULT_KITCHEN_SETTINGS,enabled}))).status,200);
    assert.equal((await (await settingsRoute.GET()).json()).data.enabled,enabled);
  }
});
console.log(`${passed} meal flow checks passed. Supabase/Stripe are mocks; SQL concurrency and real payment integration are not tested.`);
