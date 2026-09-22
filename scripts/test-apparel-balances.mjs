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

let passed=0;
async function test(name, fn) {await fn();passed++;console.log(`PASS: ${name}`);}
const plain=loader();
const groups=plain('lib/orders/purchase-groups.ts');
await test('separate event purchases and retain dynamic future categories',()=>{
  assert.equal(groups.purchaseGroup({order_category:'merch'}),'merch');
  assert.equal(groups.purchaseGroup({order_category:'event',items:[{name:'Footy Sweep'}]}),'event:Footy Sweep');
  assert.notEqual(groups.purchaseGroup({order_category:'event',items:[{name:'Pot Club'}]}),'event:Footy Sweep');
  assert.equal(groups.purchaseGroup({order_category:'new_fundraiser'}),'new_fundraiser');
});
let orders,links,jobs,emails,claimed,checkoutCalls,rateAllowed=true;
function reset(){
 orders=[{id:'11111111-1111-4111-8111-111111111111',order_category:'merch',payment_reference:'NDCCMER-2026-000016',customer_name:'Test Customer',customer_email:'customer@example.com',total_amount:195,amount_paid:20,balance_due:175,payment_status:'part_paid',order_status:'submitted',deleted_at:null,apparel_export_batch_id:null,items:[]}];
 links=[{order_id:orders[0].id,token:'22222222-2222-4222-8222-222222222222'}];
 jobs=[{id:'job-1',order_id:orders[0].id,cycle:1,lease_token:'lease-1'}];emails=[];claimed=false;checkoutCalls=[];
}
reset();
function query(table){let filters=[],patch;const q={
 select(){return q;},order(){return q;},limit(){return q;},
 eq(k,v){filters.push(r=>r[k]===v);return q;},is(k,v){return q.eq(k,v);},
 neq(k,v){filters.push(r=>r[k]!==v);return q;},lte(k,v){filters.push(r=>r[k]<=v);return q;},
 update(v){patch=v;return q;},
 result(single){const rows=(table==='orders'?orders:table==='apparel_balance_links'?links:table==='order_payments'?[]:jobs).filter(r=>filters.every(f=>f(r)));if(patch)rows.forEach(r=>Object.assign(r,patch));return {data:single?rows[0]||null:rows,error:null};},
 single(){return Promise.resolve(q.result(true));},maybeSingle(){return q.single();},then(a,b){return Promise.resolve(q.result(false)).then(a,b);}
};return q;}
const db={from:query,async rpc(){if(claimed)return {data:[],error:null};claimed=true;return {data:[jobs[0]],error:null};}};
const mocks={'server-only':{},'@/lib/supabase-server':{createServerClient:()=>db},
 '@/lib/server/request-guards':{enforceRateLimit:async()=>rateAllowed,getClientIp:()=> 'test'},
 '@/lib/auth/guard':{requirePermission:async()=>({id:'admin'})},
 '../checkout-session/route':{POST:async request=>{checkoutCalls.push(await request.json());return new Response(JSON.stringify({checkout_url:'https://checkout.stripe.com/test'}));}},
 '@/lib/payments/site-url':{getCheckoutSiteUrl:()=> 'https://www.ndcc.com.au'},
 '@/lib/email':{escapeEmailHtml:s=>String(s).replaceAll('<','&lt;'),emailHtml:(title,body)=>title+body,getTransactionalReplyTo:()=> 'club@example.com',sendEmail:async p=>{emails.push(p);return {status:'sent',id:'message-1'};}}
};
const load=loader(mocks);const balance=load('app/api/payments/balance/route.ts');
const request=body=>new Request('https://www.ndcc.com.au/api/payments/balance',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
await test('reference and email lookup returns live balance without identity details',async()=>{const res=await balance.POST(request({reference:' ndccmer-2026-000016 ',email:'CUSTOMER@example.com'}));assert.equal(res.status,200);const body=await res.json();assert.equal(body.balance,175);assert.equal(body.customer_email,undefined);assert.equal(body.id,undefined);});
await test('incorrect email cannot disclose order balance',async()=>{assert.equal((await balance.POST(request({reference:orders[0].payment_reference,email:'wrong@example.com'}))).status,404);});
await test('valid private link resolves same balance',async()=>{assert.equal((await (await balance.POST(request({token:links[0].token}))).json()).balance,175);});
await test('checkout reuses original order without accepting browser-supplied amount or ID',async()=>{await balance.POST(request({token:links[0].token,checkout:true,amount:0.01,order_id:'attacker'}));assert.deepEqual(checkoutCalls,[{order_id:orders[0].id,return_path:'/merchandise'}]);});
await test('deleted and wrong-category orders cannot be looked up',async()=>{orders[0].deleted_at='2026-09-22';assert.equal((await balance.POST(request({token:links[0].token}))).status,404);reset();orders[0].order_category='kitchen';assert.equal((await balance.POST(request({token:links[0].token}))).status,404);reset();});
await test('refunded orders cannot start balance checkout',async()=>{orders[0].payment_status='refunded';assert.equal((await balance.POST(request({token:links[0].token,checkout:true}))).status,409);reset();});
await test('lookup rate limiting is enforced',async()=>{rateAllowed=false;assert.equal((await balance.POST(request({token:links[0].token}))).status,429);rateAllowed=true;});
const reminders=load('lib/payments/balance-reminders.ts');
await test('reminder uses outstanding balance, original reference and durable payment link',async()=>{const result=await reminders.processBalanceReminders(request({}));assert.equal(result.sent,1);assert.match(emails[0].html,/AUD 175.00/);assert.match(emails[0].html,/Full payment is required to process your order/);assert.match(emails[0].html,/NDCCMER-2026-000016/);assert.match(emails[0].html,/pay-balance\?token=/);assert.equal(jobs[0].status,'sent');assert.equal(jobs[0].provider_message_id,'message-1');});
await test('repeated worker call does not resend a sent reminder',async()=>{await reminders.processBalanceReminders(request({}));assert.equal(emails.length,1);});
await test('settled order is rechecked before sending',async()=>{reset();orders[0].payment_status='paid';orders[0].balance_due=0;const result=await reminders.processBalanceReminders(request({}));assert.equal(result.cancelled,1);assert.equal(emails.length,0);});
await test('changed balance cancels stale frozen email',async()=>{reset();jobs[0].delivery={to:'customer@example.com'};jobs[0].balance_cents=18000;const result=await reminders.processBalanceReminders(request({}));assert.equal(result.cancelled,1);assert.equal(emails.length,0);});
const exportRoute=loader({...mocks,'@/lib/orders/apparel-workbook':{buildApparelWorkbook:rows=>Buffer.from(JSON.stringify(rows))}})('app/api/admin/merch/export/route.ts');
await test('supplier export reserves only fully paid, active, unexported orders',async()=>{reset();const base=orders[0];orders=[base,{...base,id:'paid',payment_status:'paid',amount_paid:195,balance_due:0},{...base,id:'deleted',payment_status:'paid',balance_due:0,deleted_at:'today'},{...base,id:'cancelled',payment_status:'paid',balance_due:0,order_status:'cancelled'},{...base,id:'already-exported',payment_status:'paid',balance_due:0,apparel_export_batch_id:'old'},{...base,id:'inconsistent',payment_status:'paid',balance_due:5}];const res=await exportRoute.POST();const rows=JSON.parse(await res.text());assert.deepEqual(rows.map(r=>r.id),['paid']);assert.equal(base.apparel_export_batch_id,null);});
console.log(`${passed} apparel balance checks passed. No live payments or emails sent.`);
