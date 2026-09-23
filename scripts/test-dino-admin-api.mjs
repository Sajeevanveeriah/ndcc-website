import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync('app/api/admin/fantasy/managers/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let user=null,dbCalls=0,authCalls=0,rollbackCalls=0,rpcError=null,lastRpc=null;
const db={auth:{admin:{createUser:async()=>{authCalls++;return {data:{user:{id:'new-user'}},error:null};},deleteUser:async()=>{rollbackCalls++;return {error:null};}}},rpc:async(name,args)=>{dbCalls++;lastRpc={name,args};return {data:'new-manager',error:rpcError};},from:()=>({select:()=>({eq:()=>({eq:()=>({single:async()=>({data:{id:'entry'},error:null})})})})})};
const actions={exports:{}};
new Function('exports',ts.transpileModule(readFileSync('lib/dino-coach/admin-actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(actions.exports);
const eligibility={exports:{}};
new Function('exports',ts.transpileModule(readFileSync('lib/dino-coach/manager-eligibility.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(eligibility.exports);
const imports={
 '@/lib/dino-coach/manager-eligibility':eligibility.exports,
 'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})},after:()=>{}},
 '@/lib/auth/guard':{requirePermission:async()=>user}, '@/lib/supabase-server':{createServerClient:()=>db},
 '@/lib/fantasy-seasons':{resolveRequestSeason:async()=>({id:'season'})}, '@/lib/fantasy-game':{},
 '@/lib/dino-coach/server':{getDinoCoachSettings:async()=>({minimum_age:18})},
 '@/lib/dino-coach/domain':{isAdultOnDate:dob=>dob==='2000-01-01'}, '@/lib/dino-coach/lifecycle':{},
 '@/lib/dino-coach/admin-actions':actions.exports,
 '@/lib/dino-coach/notifications':{}, '@/lib/dino-coach/registration-email':{},
 '@/lib/order-input-validation':{readLimitedJsonObject:async req=>({ok:true,value:req.body})},
};
const mod={exports:{}};new Function('require','module','exports',source)(id=>{if(!(id in imports))throw Error(id);return imports[id];},mod,mod.exports);
const valid={email:'participant@example.invalid',password:'not-a-real-password',displayName:'Participant',teamName:'Test XI',dateOfBirth:'2000-01-01',reason:'Approved fee waiver',rulesAccepted:true};
assert.equal((await mod.exports.POST({body:valid})).status,403);assert.equal(authCalls,0);
user={id:'reviewer',role:'committee'};
assert.equal((await mod.exports.POST({body:valid})).status,403);assert.equal(authCalls,0);
assert.equal((await mod.exports.PATCH({body:{id:'m',expectedUpdatedAt:'date',reason:'test',changes:{fee_waived:true}}})).status,403);
user={id:'admin',role:'admin'};
for(const patch of [{displayName:123},{teamName:{}},{reason:[]},{dateOfBirth:null},{email:'bad'},{password:'short'},{rulesAccepted:false},{dateOfBirth:'2020-01-01'}])assert.equal((await mod.exports.POST({body:{...valid,...patch}})).status,400);
assert.equal(authCalls,0);
assert.equal((await mod.exports.POST({body:valid})).status,200);assert.equal(authCalls,1);assert.equal(dbCalls,1);assert.equal(rollbackCalls,0);
rpcError={message:'registration transaction failed'};
assert.equal((await mod.exports.POST({body:valid})).status,400);assert.equal(rollbackCalls,1);
assert.equal((await mod.exports.PATCH({body:{id:'m',expectedUpdatedAt:'date',reason:'test',changes:{deleted:true}}})).status,400);
assert.equal((await mod.exports.PATCH({body:{id:'m',expectedUpdatedAt:'date',reason:'test',changes:{deleted:'true'}}})).status,400);
rpcError=null;
const patch=body=>mod.exports.PATCH({body:{id:'m',expectedUpdatedAt:'date',...body}});
for(const [changes,expected] of [[{deleted:true},'Team deleted by the administrator.'],[{deleted:false,is_active:true},'Team restored by the administrator.'],[{reactivate:true,is_active:true},'Team reactivated by the club.']]) {
 for(const reason of [undefined,'','  ']) {
  assert.equal((await patch({changes,reason,confirmation:'DELETE TEAM'})).status,200);
  assert.equal(lastRpc.args.p_reason,expected);
  assert.equal(lastRpc.args.p_selection,null);
 }
}
assert.equal((await patch({changes:{deleted:true},confirmation:'DELETE TEAM',reason:'  Removing my test team  '})).status,200);
assert.equal(lastRpc.args.p_reason,'Removing my test team');
const priorCalls=dbCalls;
for(const body of [
 {changes:{deleted:true}},
 {changes:{deleted:true},confirmation:'delete team'},
 {changes:{deleted:true},confirmation:'DELETE TEAM',reason:{}},
 {changes:{deleted:true,team_name:'Unexplained edit'},confirmation:'DELETE TEAM'},
 {changes:{deleted:true},confirmation:'DELETE TEAM',selection:[]},
 {changes:{team_name:'Unexplained edit'}},
 {changes:{reactivate:true,is_active:true,hidden:true}},
])assert.equal((await patch(body)).status,400);
assert.equal(dbCalls,priorCalls);
user={id:'reviewer',role:'committee'};
assert.equal((await patch({changes:{deleted:true},confirmation:'DELETE TEAM'})).status,403);
assert.equal((await patch({changes:{deleted:false,is_active:true}})).status,403);
assert.equal((await patch({changes:{reactivate:true,is_active:true}})).status,200);
user={id:'admin',role:'admin'};rpcError={code:'40001',message:'Team changed since opening'};
assert.equal((await patch({changes:{deleted:true},confirmation:'DELETE TEAM'})).status,409);
console.log('PASS admin/reviewer boundaries, complimentary registration and compensation, delete/restore/reactivate with blank reasons, custom reasons, typed confirmation, mixed-edit rejection and stale-version conflict');
