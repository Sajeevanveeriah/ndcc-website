import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync('app/api/admin/fantasy/managers/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let user=null,dbCalls=0,authCalls=0,rollbackCalls=0,rpcError=null;
const db={auth:{admin:{createUser:async()=>{authCalls++;return {data:{user:{id:'new-user'}},error:null};},deleteUser:async()=>{rollbackCalls++;return {error:null};}}},rpc:async()=>{dbCalls++;return {data:'new-manager',error:rpcError};},from:()=>({select:()=>({eq:()=>({eq:()=>({single:async()=>({data:{id:'entry'},error:null})})})})})};
const imports={
 'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})},after:()=>{}},
 '@/lib/auth/guard':{requirePermission:async()=>user}, '@/lib/supabase-server':{createServerClient:()=>db},
 '@/lib/fantasy-seasons':{resolveRequestSeason:async()=>({id:'season'})}, '@/lib/fantasy-game':{},
 '@/lib/dino-coach/server':{getDinoCoachSettings:async()=>({minimum_age:18})},
 '@/lib/dino-coach/domain':{isAdultOnDate:dob=>dob==='2000-01-01'}, '@/lib/dino-coach/lifecycle':{},
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
console.log('PASS anonymous/reviewer/admin boundaries, manual registration validation, successful orchestration, failed-registration compensation and typed deletion confirmation');
