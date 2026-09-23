const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const calls=[];
const eligibility={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/dino-coach/manager-eligibility.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:eligibility});
let acceptedRules='current';
const publicErrors={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/server/public-errors.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:publicErrors,console});
const imports={
 '@/lib/dino-coach/manager-eligibility':eligibility,
 'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}},
 '@/lib/fantasy-manager-auth':{resolveFantasyManagerAuth:async()=>({auth:{manager:{id:'owner',is_active:true,initial_squad_due_at:'2099-01-01',age_verified_at:'2026-01-01',team_name_status:'approved',rules_version_accepted:acceptedRules}}})},
 '@/lib/supabase-server':{createServerClient:()=>({from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:{status:'paid'},error:null})}),rpc:async(name,args)=>{calls.push({name,args});return {data:'saved'};}})},
 '@/lib/fantasy-game':{getRoundLockState:async()=>({locked:false,roundId:null})},
 '@/lib/dino-coach/server':{getDinoCoachSettings:async()=>({rules_version:'current'})}, '@/lib/dino-coach/domain':{},
 '@/lib/fantasy-seasons':{resolveRequestSeason:async()=>({id:'season'}),seasonAllowsTeamChanges:()=>true},
 '@/lib/server/public-errors':publicErrors
};
const exports1={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/fantasy/transfers/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exports1,require:n=>{assert(n in imports,n);return imports[n];}});
(async()=>{
 for(const action of ['propose','accept','decline','cancel']){
  const r=await exports1.POST({json:async()=>({action})});assert.equal(r.status,400);assert.equal(calls.length,0);
 }
 for(const action of ['sell','buy','swap']){
  const r=await exports1.POST({json:async()=>({action,playerOutId:'out',playerInId:'in',expectedPrice:100000})});assert.equal(r.status,200);assert.equal(calls.at(-1).name,'dino_market_action');assert.equal(calls.at(-1).args.mid,'owner');assert.equal(calls.at(-1).args.action,action);
 }
 acceptedRules='old';
 const before=calls.length;
 const blocked=await exports1.POST({json:async()=>({action:'sell'})});
 assert.equal(blocked.status,403);assert.match(blocked.body.error,/updated Dino Coach rules/);assert.equal(calls.length,before);
 console.log('PASS former team-trade API actions rejected without database calls; pool buy/sell/replace retained');
})().catch(e=>{console.error(e);process.exit(1);});
