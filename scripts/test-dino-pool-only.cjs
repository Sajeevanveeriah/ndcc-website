const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const calls=[];
const imports={
 'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}},
 '@/lib/fantasy-manager-auth':{resolveFantasyManagerAuth:async()=>({auth:{manager:{id:'owner'}}})},
 '@/lib/supabase-server':{createServerClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:'saved'};}})},
 '@/lib/fantasy-game':{getRoundLockState:async()=>({locked:false,roundId:null})},
 '@/lib/dino-coach/server':{}, '@/lib/dino-coach/domain':{},
 '@/lib/fantasy-seasons':{resolveRequestSeason:async()=>({id:'season'}),seasonAllowsTeamChanges:()=>true}
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
 console.log('PASS former team-trade API actions rejected without database calls; pool buy/sell/replace retained');
})().catch(e=>{console.error(e);process.exit(1);});
