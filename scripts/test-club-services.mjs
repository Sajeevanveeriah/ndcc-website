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
const db={from:table=>{assert.equal(table,'club_members');const chain={select:()=>chain,eq:(...args)=>{filters.push(args);return chain;},upsert:(record)=>{writes.push(record);return chain;},maybeSingle:async()=>({data:null,error:null}),single:async()=>({data:{id:'owned'},error:null})};return chain;}};
const route=load('app/api/club-account/route.ts',{
 'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
 '@/lib/fantasy-manager-auth':{getAuthUserFromRequest:async()=>user},
 '@/lib/supabase-server':{createServerClient:()=>db},
 '@/lib/order-input-validation':{readLimitedJsonObject:async request=>({ok:true,value:await request.json()})},
 '@/lib/server/request-guards':{enforceRateLimit:async()=>limit},
 '@/lib/club-members':{parseClubMember},
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
console.log('PASS confirmed account ownership, private reads, server-selected identity, no permission escalation, rate limits and new/legacy raffle references');
