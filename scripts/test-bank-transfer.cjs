const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
class NextResponse extends Response { static json(body, init) { return new Response(JSON.stringify(body), { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } }); } }
const id = '11111111-1111-4111-8111-111111111111';
const original = { id, order_category: 'merch', customer_email: 'buyer@example.invalid', payment_status: 'pending_bank_transfer', order_status: 'submitted', total_amount: 60, amount_paid: 0, balance_due: 60, deleted_at: null, bank_transfer_selected_at: null };
let order = {...original}, enabled = true, rate = true, fault = false, writes = [], admin = null, rpcCalls = [];
const bankEnv = { NDCC_BANK_ACCOUNT_NAME: 'TEST ONLY', NDCC_BANK_BSB: '000000', NDCC_BANK_ACCOUNT_NUMBER: '00000000' };
function load(file, mocks = {}, env = bankEnv) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, console, Request, Response, Headers, URL, Date, process: {env}, require(name) { if (name in mocks) return mocks[name]; if(name.startsWith('@/')) return load(path.resolve(name.slice(2)+'.ts'),mocks,env); if(name === 'server-only') return {}; return require(name); } }, {filename:file});
  return exports;
}
const link = {token:'33333333-3333-4333-8333-333333333333',order_id:id};
const db = { from(table) { const predicates = []; let update; const q = {
 select:()=>q, eq:(k,v)=>{predicates.push(row=>row[k]===v);return q;}, is:(k,v)=>{predicates.push(row=>row[k]===v);return q;}, neq:(k,v)=>{predicates.push(row=>row[k]!==v);return q;}, update:value=>{update=value;return q;},
 maybeSingle:async()=>{if(fault)return {error:{message:'private db error'},data:null};const row = table === 'apparel_balance_links' ? link : order;if(!row||!predicates.every(fn=>fn(row)))return{data:null};if(table === 'apparel_balance_links')return{data:row};if(update){writes.push(update);order={...order,...update};}return{data:order};},
 };return q; }, rpc:async(name,args)=>{rpcCalls.push({name,args});return{data:true,error:null};} };
const mocks = {
 'next/server': {NextResponse}, '@/lib/supabase-server': {createServerClient:()=>db},
 '@/lib/server/request-guards': {enforceRateLimit:async()=>rate,getClientIp:()=> 'test'},
 '@/lib/order-input-validation': {readLimitedJsonObject:async request=>({ok:true,value:await request.json()})},
 '@/lib/payments/capabilities': {deriveCapabilities:()=>({bank_transfer:enabled}),loadMerchPaymentSettings:async()=>({})},
 '@/lib/auth/guard':{requirePermission:async()=>admin}, '@/lib/supabase-paginate':{fetchAllPages:async()=>({data:[]})},
};
const route=load('app/api/payments/bank-transfer/route.ts',mocks);
const adminRoute=load('app/api/admin/payments/bank-transfers/route.ts',mocks);
const req = body => new Request('https://example.invalid/api/payments/bank-transfer',{method:'POST',body:JSON.stringify(body)});
const call = body => route.POST(req({order_id:id,email:original.customer_email,...body}));
(async()=>{
 assert.equal((await call({selected:true,email:'other@example.invalid'})).status,404);assert.equal(writes.length,0);
 assert.equal((await route.POST(req({order_id:id,token:link.token,action:'read'}))).status,200);
 assert.equal((await route.POST(req({order_id:id,token:'44444444-4444-4444-8444-444444444444',action:'read'}))).status,404);
 assert.equal((await route.POST(req({order_id:'55555555-5555-4555-8555-555555555555',token:link.token,selected:true}))).status,404);
 order={...original,order_category:'kitchen'};assert.equal((await route.POST(req({order_id:id,token:link.token,selected:true}))).status,404);order={...original};
 assert.equal((await call({selected:'true'})).status,400);assert.equal(writes.length,0);
 assert.equal((await call({action:'read'})).status,200);assert.equal(writes.length,0);
 assert.equal((await call({selected:true,amount_paid:60,payment_status:'paid'})).status,200);
 assert.deepEqual(Object.keys(writes[0]),['bank_transfer_selected_at']);
 assert.equal(order.amount_paid,0);assert.equal(order.balance_due,60);assert.equal(order.payment_status,'pending_bank_transfer');
 const first=order.bank_transfer_selected_at;await call({selected:true});assert.equal(order.bank_transfer_selected_at,first);
 assert.equal((await (await call({action:'read'})).json()).selected,true);
 await call({selected:false});assert.equal(order.bank_transfer_selected_at,null);
 enabled=false;assert.equal((await call({selected:true})).status,409);enabled=true;
 for(const status of ['paid','refunded','needs_review','partially_refunded']){order={...original,payment_status:status};assert.equal((await call({selected:true})).status,409);}
 order={...original,order_status:'cancelled'};assert.equal((await call({selected:true})).status,409);
 order={...original,deleted_at:'2026-01-01'};assert.equal((await call({selected:true})).status,404);
 order={...original,balance_due:0};assert.equal((await call({selected:true})).status,409);
 order={...original};fault=true;const failed=await call({selected:true});assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/private db error/);fault=false;
 rate=false;assert.equal((await call({selected:true})).status,429);rate=true;
 const noBank=load('app/api/payments/bank-transfer/route.ts',mocks,{});assert.equal((await noBank.POST(req({order_id:id,email:original.customer_email,selected:true}))).status,409);
 const capabilities=load('lib/payments/capabilities.ts',{'@/lib/payments/payment-config':{isCheckoutEnabled:()=>true}},bankEnv);
 assert.equal(capabilities.deriveCapabilities({...capabilities.DEFAULT_SETTINGS,card_checkout_enabled:true}).bank_transfer,true);
 const missing=load('lib/payments/capabilities.ts',{'@/lib/payments/payment-config':{isCheckoutEnabled:()=>true}},{});
 assert.equal(missing.deriveCapabilities(missing.DEFAULT_SETTINGS).bank_transfer,false);
 const settings=await capabilities.loadMerchPaymentSettings({from:()=>({select:()=>({maybeSingle:async()=>({error:{message:'offline'}})})})});
 assert.equal(capabilities.deriveCapabilities(settings).bank_transfer,false);assert.equal(capabilities.deriveCapabilities(settings).card,false);
 const confirmation={kind:'raffle',id,expected_cents:6000,bank_reference:'TEST-ONLY',confirmed_received:true};
 assert.equal((await adminRoute.POST(req(confirmation))).status,403);assert.equal(rpcCalls.length,0);
 admin={id:'super',role:'super_admin'};assert.equal((await adminRoute.POST(req(confirmation))).status,403);
 admin={id:'22222222-2222-4222-8222-222222222222',role:'admin'};
 assert.equal((await adminRoute.POST(req({...confirmation,confirmed_received:false}))).status,400);
 assert.equal((await adminRoute.POST(req({...confirmation,expected_cents:0}))).status,400);
 assert.equal((await adminRoute.POST(req({...confirmation,bank_reference:''}))).status,400);
 assert.equal((await adminRoute.POST(req(confirmation))).status,200);assert.equal(rpcCalls[0].args.actor_id,admin.id);
 const {buildMerchExportRows,EXPORT_HEADER}=load('lib/orders/export.ts');
 const rows=buildMerchExportRows([{...original,created_at:'2026-09-26T00:00:00Z',customer_name:'Test',items:[{name:'Ticket',price:60,quantity:1}],bank_transfer_selected_at:'2026-09-26T00:00:00Z'}],[]);
 assert.equal(rows[1][EXPORT_HEADER.indexOf('amount_paid')],'0.00');assert.equal(rows[1][EXPORT_HEADER.indexOf('balance_due')],'60.00');assert.equal(rows[1][EXPORT_HEADER.indexOf('payment_methods')],'');assert.equal(rows[1][EXPORT_HEADER.indexOf('purchaser_payment_choice')],'bank_transfer');
 console.log('PASS bank transfer: ownership, validation, idempotent choice, unchanged ledger, unavailable methods, closed orders, admin-only receipt confirmation and truthful CSV totals.');
})().catch(error=>{console.error(error);process.exitCode=1;});
