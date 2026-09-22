const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
let authorised = true, paymentFailure = false;
const base = { id: 'paid', created_at: '2026-09-22T13:30:00Z', customer_name: 'Test', customer_email: 'test@example.com', items: [{ name: 'Shirt', quantity: 1, price: 60 }], total_amount: 60, amount_paid: 60, balance_due: 0, payment_status: 'paid', order_category: 'merch', order_status: 'submitted', deleted_at: null };
let orders = [base, { ...base, id: 'part', payment_status: 'part_paid', amount_paid: 20, balance_due: 40 }, { ...base, id: 'unpaid', payment_status: 'pending_bank_transfer', amount_paid: 0, balance_due: 60 }, { ...base, id: 'cancelled', order_status: 'cancelled' }, { ...base, id: 'event', order_category: 'event' }, { ...base, id: 'deleted', deleted_at: '2026-09-22' }];
const db = { from(table) { let filters = [], start = 0, end = 999; const q = {
 select() { return q; }, order() { return q; },
 eq(k,v) { filters.push(r => r[k] === v); return q; }, is(k,v) { return q.eq(k,v); },
 neq(k,v) { filters.push(r => r[k] !== v); return q; },
 lte(k,v) { filters.push(r => r[k] <= v); return q; },
 in(k,values) { filters.push(r => values.includes(r[k])); return q; },
 range(a,b) { start = a; end = b; return q; },
 then(resolve,reject) { return Promise.resolve({ data: (table === 'orders' ? orders : []).filter(r => filters.every(f => f(r))).slice(start,end+1), error: table === 'order_payments' && paymentFailure ? { message: 'offline' } : null }).then(resolve,reject); },
 }; return q; } };
class NextResponse extends Response { static json(body,init) { return new Response(JSON.stringify(body), { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } }); } }
const mocks = { 'next/server': { NextResponse }, '@/lib/auth/guard': { requirePermission: async () => authorised ? {} : null }, '@/lib/supabase-server': { createServerClient: () => db } };
function load(file) { const exports = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, URL, Date, console, require(name) { if(name in mocks) return mocks[name]; if(name.startsWith('@/')) return load(path.resolve(name.slice(2)+'.ts')); throw Error(name); } }); return exports; }
const route = load('app/api/admin/orders/export/route.ts');
const get = query => route.GET(new Request('https://www.ndcc.com.au/api/admin/orders/export?'+query));
(async()=>{
 for (const [status,id] of [['paid','paid'],['part_paid','part'],['unpaid','unpaid']]) {
  const response = await get('payment_status='+status);
  assert.equal(response.status,200);
  const csv = await response.text();
  assert.equal(csv.trim().split('\r\n').length,2);
  assert.ok(csv.includes('\r\n'+id+','));
 }
 assert.equal((await get('payment_status=part_paid&paid_in_full_only=1&include_part_paid=0')).status,200,'Explicit status wins over obsolete checkbox flags');
 assert.equal((await (await get('')).text()).trim().split('\r\n').length,2,'Omitted status remains paid only');
 assert.equal((await (await get('payment_status=all')).text()).trim().split('\r\n').length,4,'Explicit all includes active paid, part-paid and unpaid');
 const dated = await get('payment_status=paid&date_from=2026-09-22&date_to=2026-09-22');
 assert.equal(dated.status,200,'23:30 Melbourne is included on the to date');
 assert.equal((await get('payment_status=paid&date_to=2026-09-21')).status,404);
 assert.equal((await get('payment_status=unknown')).status,400);
 assert.equal((await get('date_from=not-a-date')).status,400);
 assert.equal((await get('date_from=2026-09-23&date_to=2026-09-22')).status,400);
 paymentFailure=true;
 assert.equal((await get('payment_status=paid')).status,500,'Do not export incomplete payment details');
 paymentFailure=false;
 authorised=false;
 assert.equal((await get('payment_status=paid')).status,403);
 authorised=true;
 orders=Array.from({length:501},(_,i)=>({...base,id:'order-'+i}));
 const large = await get('payment_status=paid');
 assert.equal((await large.text()).trim().split('\r\n').length,502,'Pagination retains all matching orders');
 console.log('Payment report: fully paid, part-paid, unpaid, inclusive Melbourne dates, pagination, empty results, failures and authorisation passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
