import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,imports={}){const exports={};const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',code)(id=>{assert.ok(id in imports,`Unexpected import ${id}`);return imports[id];},exports);return exports;}
const {parseClubMember}=load('lib/club-members.ts');
const valid={full_name:' Test Member ',email:'untrusted@example.invalid',phone:'+61 400 000 000',member_type:'player'};
assert.deepEqual(parseClubMember(valid,'Verified@example.invalid'),{...valid,full_name:'Test Member',email:'verified@example.invalid'});
for(const bad of [{...valid,full_name:'x'.repeat(121)},{...valid,email:'bad'},{...valid,member_type:'admin'},{...valid,phone:'<script>'}])assert.equal(parseClubMember(bad),null);
const refs=load('lib/raffle-constants.ts');
assert.equal(refs.parseRaffleReference('NDCCTRO-20260001').ticketNumber,1);
assert.equal(refs.parseRaffleReference('NDCCTRO-20260001',{code:'NDCCRAF',year_code:'26'}).code,'NDCCRAF');
assert.equal(refs.parseRaffleReference('NDCCRAF-260001').ticketNumber,1);
assert.equal(refs.parseRaffleReference('NDCCTRO-20260001',{code:'NDCCRRO',year_code:'2026'}),null);
assert.equal(refs.parseRaffleReference('NDCCTRO-20270001',{code:'NDCCRAF',year_code:'26'}),null);
assert.equal(refs.parseRaffleReference('NDCCTRO-202600001'),null);
let user=null;let writes=[];let filters=[];let limit=true;
let unclaimed=[];let claims=[];let lookups=[];
const db={from:table=>{assert.equal(table,'club_members');let claiming=null;const chain={select:()=>chain,eq:(...args)=>{if(claiming)claiming.filters.push(['eq',...args]);else filters.push(args);return chain;},
 is:(...args)=>{if(claiming)claiming.filters.push(['is',...args]);else lookups.push(['is',...args]);return chain;},ilike:(...args)=>{lookups.push(['ilike',...args]);return chain;},order:()=>chain,
 limit:async()=>({data:unclaimed,error:null}),update:record=>{claiming={record,filters:[]};claims.push(claiming);return chain;},
 upsert:(record)=>{writes.push(record);return chain;},maybeSingle:async()=>claiming?({data:{id:claiming.filters.find(f=>f[1]==='id')[2],membership_status:'active'},error:null}):({data:null,error:null}),single:async()=>({data:{id:'owned'},error:null})};return chain;}};
const route=load('app/api/club-account/route.ts',{
 'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
 '@/lib/account/server-auth':{getAuthUserFromRequest:async()=>user},
 '@/lib/supabase-server':{createServerClient:()=>db},
 '@/lib/order-input-validation':{readLimitedJsonObject:async request=>({ok:true,value:await request.json()})},
 '@/lib/server/request-guards':{enforceRateLimit:async()=>limit},
 '@/lib/club-members':{parseClubMember},
 '@/lib/club-account/claim':load('lib/club-account/claim.ts'),
 '@/lib/club-account/purchases':load('lib/club-account/purchases.ts'),
});
const request=(body={...valid,privacyAccepted:true})=>new Request('https://example.invalid/api/club-account',{method:'POST',body:JSON.stringify(body)});
assert.equal((await route.GET(request())).status,401);
assert.equal((await route.POST(request())).status,401);
user={id:'owner',email:'verified@example.invalid'};
assert.equal((await route.POST(request())).status,401,'Unconfirmed users cannot write');
user.email_confirmed_at='2026-09-24';
assert.equal((await route.GET(request())).status,200);assert.deepEqual(filters,[['auth_user_id','owner']]);
assert.equal((await route.POST(request({...valid,privacyAccepted:false}))).status,400);
assert.equal((await route.POST(request({...valid,privacyAccepted:true,auth_user_id:'victim',id:'victim',membership_status:'active',created_by:'admin'}))).status,200);
assert.equal(writes.length,1);assert.equal(writes[0].auth_user_id,'owner');assert.equal(writes[0].email,user.email);
for(const field of ['id','membership_status','created_by'])assert.equal(writes[0][field],undefined);
limit=false;assert.equal((await route.POST(request())).status,429);assert.equal(writes.length,1);
assert.equal(claims.length,0,'No unclaimed record means no claim update');
// A committee-created record with the same verified email is linked, not duplicated.
limit=true;filters=[];lookups=[];
unclaimed=[{id:'newer-active',email:'verified@example.invalid',full_name:'Other',membership_status:'active',auth_user_id:null,created_at:'2026-09-02'},
 {id:'older-active',email:'VERIFIED@example.invalid',full_name:'Other',membership_status:'active',auth_user_id:null,created_at:'2026-09-01'},
 {id:'claimed',email:'verified@example.invalid',membership_status:'active',auth_user_id:'someone',created_at:'2026-01-01'}];
let claimedBody=await (await route.GET(request())).json();
assert.equal(claimedBody.claimed,true);assert.equal(claims.length,1);assert.equal(claims[0].record.auth_user_id,'owner');
assert.deepEqual(Object.keys(claims[0].record).sort(),['auth_user_id','updated_at'],'A claim never overwrites membership status or committee fields');
assert.ok(claims[0].filters.some(f=>f[0]==='eq'&&f[1]==='id'&&f[2]==='older-active'));
assert.ok(claims[0].filters.some(f=>f[0]==='is'&&f[1]==='auth_user_id'&&f[2]===null),'Claims are conditional on the record still being unclaimed');
assert.ok(lookups.some(f=>f[0]==='ilike'&&f[1]==='email'&&f[2]==='verified@example.invalid'));
// On a profile save the typed name picks the right record behind a shared family email.
unclaimed=[...unclaimed,{id:'named-pending',email:'verified@example.invalid',full_name:'Test Member',membership_status:'pending',auth_user_id:null,created_at:'2026-09-03'}];
assert.equal((await route.POST(request())).status,200);assert.equal(claims.length,2);
assert.ok(claims[1].filters.some(f=>f[0]==='eq'&&f[1]==='id'&&f[2]==='named-pending'));
assert.equal(writes.at(-1).membership_status,undefined);unclaimed=[];
console.log('PASS confirmed account ownership, private reads, server-selected identity, no permission escalation, rate limits and new/legacy raffle references');
const pricing=JSON.parse(readFileSync('data/dino-coach-researched-baselines-20260924.json','utf8'));
for(const player of pricing.players){assert.equal(player.knownPoints,player.runs+10*(player.wickets+player.catches+player.stumpings));assert.equal(player.priceDinoDollars,Math.ceil((500000+Math.min(player.knownPoints/913,1)*1500000)/1000)*1000);}
const inputValidation=load('lib/order-input-validation.ts');const utilities=load('lib/utils.ts');
let cashAuth={user:null,status:401,error:'Sign in'};let cashCalls=[];let cashDeliveryFails=true;let immediateStatus='delivered';
const cashRoute=load('app/api/admin/raffle/cash/route.ts',{
 'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
 '@/lib/auth/guard':{requirePermissionResult:async permission=>{assert.equal(permission,'raffle');return cashAuth;}},
 '@/lib/supabase-server':{createServerClient:()=>({rpc:async(name,args)=>{cashCalls.push({name,args});return {data:{orderId:'saved',ticketReferences:['NDCCTRO-20260001'],amountCents:500,paymentReference:'NDCCRAF-2026-000001'},error:null};},from(table){assert.equal(table,'receipt_delivery_jobs');const chain={select:()=>chain,eq:(field,value)=>{assert.equal(field,'raffle_order_id');assert.equal(value,'saved');return chain;},maybeSingle:async()=>({data:{status:'delivered'},error:null})};return chain;}})},
 '@/lib/order-input-validation':inputValidation,'@/lib/utils':utilities,
 '@/lib/server/request-guards':{enforceRateLimit:async()=>true},
 '@/lib/payments/receipt-delivery':{enqueuePaymentReceiptJob:async()=>{if(cashDeliveryFails)throw new Error('Provider unavailable');return {ok:true,jobId:'job'};},attemptPaymentReceiptDelivery:async()=>({status:immediateStatus})},
});
const cashBody={name:'Buyer',email:'buyer@example.invalid',phone:'',quantity:1,cashReceived:true,saleKey:'00000000-0000-4000-8000-000000000001',priceCents:500,actor_id:'forged'};
const cashRequest=(body=cashBody)=>new Request('https://example.invalid/api/admin/raffle/cash',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
assert.equal((await cashRoute.POST(cashRequest())).status,401);assert.equal(cashCalls.length,0);
cashAuth={user:{id:'actual-staff'},status:200};
for(const body of [{...cashBody,cashReceived:false},{...cashBody,priceCents:'500'},{...cashBody,saleKey:'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'},{...cashBody,email:'invalid'}])assert.equal((await cashRoute.POST(cashRequest(body))).status,400);
assert.equal(cashCalls.length,0);
const queued=await cashRoute.POST(cashRequest());assert.equal(queued.status,200);assert.equal((await queued.json()).deliveryStatus,'queued','Delivery failure must not claim the saved sale failed');
assert.equal(cashCalls[0].args.actor_id,'actual-staff');assert.equal(cashCalls[0].args.sale_key,cashBody.saleKey);
cashDeliveryFails=false;assert.equal((await (await cashRoute.POST(cashRequest())).json()).deliveryStatus,'delivered');assert.deepEqual(cashCalls[0],cashCalls[1],'Retries use the same atomic operation and sale reference');
immediateStatus='not_claimed';
assert.equal((await (await cashRoute.POST(cashRequest())).json()).deliveryStatus,'delivered','Replayed delivery reports the existing completed job');
console.log('PASS reviewed pricing arithmetic and cash API permission, input validation, staff identity, retry and delivery-failure recovery');

// Reopening the bookmarked sale must report persisted delivery, not invent
// a queued state. Only the staff member who recorded it may recover it.
let recoveredStatus='delivered';let recoveryError=false;let recoveredSale=true;
const recoveryFilters=[];
const recoveryRoute=load('app/api/admin/raffle/cash/route.ts',{
 'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
 '@/lib/auth/guard':{requirePermissionResult:async()=>cashAuth},
 '@/lib/supabase-server':{createServerClient:()=>({from(table){
  const chain={select:()=>chain,eq:(...args)=>{recoveryFilters.push([table,...args]);return chain;},
   single:async()=>({data:{name:'Trailer',active:true,price_cents:500,draw_at:'2099-01-01'},error:null}),
   maybeSingle:async()=>table==='raffle_orders'?{data:recoveredSale?{id:'saved',amount_cents:1000,payment_reference:'reference',raffle_tickets:[{ticket_number:2,ticket_reference:'NDCCTRO-20260002'},{ticket_number:1,ticket_reference:'NDCCTRO-20260001'}]}:null,error:null}:{data:recoveredStatus?{status:recoveredStatus}:null,error:recoveryError?{message:'unavailable'}:null}};
  return chain;
 }})},
 '@/lib/order-input-validation':inputValidation,'@/lib/utils':utilities,
 '@/lib/server/request-guards':{enforceRateLimit:async()=>true},
 '@/lib/payments/receipt-delivery':{enqueuePaymentReceiptJob:async()=>{throw new Error('GET must not queue a receipt');},attemptPaymentReceiptDelivery:async()=>{throw new Error('GET must not send a receipt');}},
});
const recover=()=>recoveryRoute.GET(new Request(`https://example.invalid/api/admin/raffle/cash?sale=${cashBody.saleKey}`));
for(const status of ['delivered','queued','processing','retry','dead_letter','cancelled']){
 recoveredStatus=status;
 const response=await recover();assert.equal(response.status,200);
 const result=await response.json();assert.equal(result.sale.deliveryStatus,status);
 assert.deepEqual(result.sale.ticketReferences,['NDCCTRO-20260001','NDCCTRO-20260002']);
}
assert.ok(recoveryFilters.some(filter=>JSON.stringify(filter)===JSON.stringify(['raffle_orders','cash_received_by','actual-staff'])));
assert.ok(recoveryFilters.some(filter=>JSON.stringify(filter)===JSON.stringify(['receipt_delivery_jobs','raffle_order_id','saved'])));
recoveryError=true;
assert.equal((await (await recover()).json()).sale.deliveryStatus,'unknown','Saved sale survives a delivery-status outage');
recoveryError=false;recoveredStatus=null;
assert.equal((await (await recover()).json()).sale.deliveryStatus,'unknown','Missing delivery evidence is not queued');
recoveredSale=false;recoveryFilters.length=0;
assert.equal((await (await recover()).json()).sale,null);
assert.equal(recoveryFilters.some(filter=>filter[0]==='receipt_delivery_jobs'),false,'No receipt lookup before ownership succeeds');
cashAuth={user:null,status:401,error:'Sign in'};
assert.equal((await recover()).status,401);
console.log('PASS cash sale recovery, staff ownership and accurate persisted delivery states');

// Member access uses a confirmed Supabase identity and an owned club profile,
// never a committee role or caller-supplied collector ID.
let memberUser=null,memberProfile=null,memberLimit=true,memberVisible=true;
const memberFilters=[],memberCalls=[];
const memberDb={from(table){const chain={select:()=>chain,eq:(...args)=>{memberFilters.push([table,...args]);return chain;},single:async()=>({data:{name:'Trailer',active:true,price_cents:500,draw_at:'2099-01-01'},error:null}),maybeSingle:async()=>({data:table==='club_members'?memberProfile:table==='raffle_orders'?{id:'owned-order',amount_cents:500,payment_reference:'ref',raffle_tickets:[{ticket_number:200,ticket_reference:'NDCCTRO-20260200'}]}:{status:'delivered'},error:null})};return chain;},rpc:async(name,args)=>{memberCalls.push({name,args});return {data:{orderId:'owned-order',ticketReferences:['NDCCTRO-20260200'],amountCents:500,paymentReference:'ref'},error:null};}};
const memberRoute=load('app/api/raffle/cash/route.ts',{
 'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
 '@/lib/fantasy-manager-auth':{getAuthUserFromRequest:async()=>memberUser},
 '@/lib/raffle-visibility':{isRafflePublic:async()=>memberVisible},
 '@/lib/supabase-server':{createServerClient:()=>memberDb},
 '@/lib/order-input-validation':inputValidation,'@/lib/utils':utilities,
 '@/lib/server/request-guards':{enforceRateLimit:async()=>memberLimit},
 '@/lib/payments/receipt-delivery':{enqueuePaymentReceiptJob:async()=>({ok:true,jobId:'job'}),attemptPaymentReceiptDelivery:async()=>({status:'delivered'})},
});
const memberGet=()=>memberRoute.GET(new Request(`https://example.invalid/api/raffle/cash?sale=${cashBody.saleKey}`));
assert.equal((await memberRoute.POST(cashRequest())).status,401);
memberUser={id:'confirmed-user',email:'member@example.invalid'};
assert.equal((await memberGet()).status,401);
memberUser.email_confirmed_at='2026-09-24';
assert.equal((await memberRoute.POST(cashRequest())).status,403,'Profile completion is required');
memberProfile={id:'actual-member',full_name:'Member',privacy_accepted_at:'2026-09-24',membership_status:'pending'};
assert.equal((await memberRoute.POST(cashRequest())).status,403,'Self-registered pending accounts cannot issue tickets');
assert.equal(memberCalls.length,0);
memberProfile.membership_status='active';
assert.equal((await memberRoute.POST(cashRequest())).status,200,'Active ordinary members can sell without committee access');
assert.equal(memberCalls[0].name,'record_member_cash_trailer_sale');
assert.equal(memberCalls[0].args.actor_id,'actual-member');
assert.equal(memberCalls[0].args.sale_key,cashBody.saleKey);
assert.equal((await (await memberGet()).json()).sale.deliveryStatus,'delivered');
assert.ok(memberFilters.some(row=>JSON.stringify(row)===JSON.stringify(['club_members','auth_user_id','confirmed-user'])));
assert.ok(memberFilters.some(row=>JSON.stringify(row)===JSON.stringify(['raffle_orders','cash_received_by_member','actual-member'])));
memberVisible=false;assert.equal((await (await memberGet()).json()).campaign.active,false,'Closed public sales do not block owned ticket recovery');
memberProfile.membership_status='inactive';assert.equal((await memberRoute.POST(cashRequest())).status,403);
memberProfile.membership_status='active';memberLimit=false;assert.equal((await memberRoute.POST(cashRequest())).status,429);
assert.equal(memberCalls.length,1);
console.log('PASS member cash sale sign-in, confirmed email, profile gate, pending-member rejection and ordinary active-member access, collector identity, private recovery and rate limits');
let reconciliationAuth={user:null,status:401,error:'Sign in'},handoverWrites=[],handoverFilters=[];
const handoverRoute=load('app/api/admin/raffle/cash-collections/route.ts',{
 'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
 '@/lib/auth/guard':{requirePermissionResult:async permission=>{assert.equal(permission,'raffle');return reconciliationAuth;}},
 '@/lib/order-input-validation':inputValidation,
 '@/lib/supabase-server':{createServerClient:()=>({from:()=>{const chain={update:record=>{handoverWrites.push(record);return chain;},eq:(...args)=>{handoverFilters.push(args);return chain;},is:(...args)=>{handoverFilters.push(args);return chain;},not:(...args)=>{handoverFilters.push(args);return chain;},order:()=>chain,range:async()=>({data:[],error:null}),select:()=>chain,maybeSingle:async()=>({data:{id:'sale'},error:null})};return chain;}})},
});
const handoverRequest=()=>new Request('https://example.invalid/api/admin/raffle/cash-collections',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId:cashBody.saleKey,cashReceived:true,cash_handed_in_by:'forged'})});
assert.equal((await handoverRoute.PATCH(handoverRequest())).status,401);
reconciliationAuth={user:{id:'raffle-staff'},status:200};
assert.equal((await handoverRoute.PATCH(handoverRequest())).status,200);
assert.equal(handoverWrites[0].cash_handed_in_by,'raffle-staff');
assert.deepEqual(handoverFilters,[['id',cashBody.saleKey],['payment_method','cash'],['status','paid'],['cash_received_by_member','is',null],['cash_handed_in_at',null]]);
handoverFilters=[];
assert.equal((await handoverRoute.GET()).status,200);
assert.deepEqual(handoverFilters,[['payment_method','cash'],['status','paid'],['cash_received_by_member','is',null]]);
console.log('PASS cash handover requires raffle staff, lists only member collections and excludes existing committee receipts');
