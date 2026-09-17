import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { authEmailReturnPath } from '../lib/auth/email-return.ts';

const fragment = '#access_token=demo&refresh_token=demo&type=signup';
assert.equal(authEmailReturnPath('/', fragment), '/fantasy/account');
assert.equal(authEmailReturnPath('/', fragment.replace('signup','recovery')), '/fantasy/reset-password');
assert.equal(authEmailReturnPath('/fantasy/account', fragment), null);
assert.equal(authEmailReturnPath('/', '#access_token=x&type=signup'), null);
assert.equal(authEmailReturnPath('/', fragment.replace('signup','https://evil.invalid')), null);
console.log('PASS confirmation fallback, recovery, no loop and fixed local destinations');

let delivered = false, attempts = 0, sendCount = 0, fail = true, saved;
const payloads = [];
const supabase = {
  rpc: async () => ({ data: delivered ? [] : [{ entry_id:'demo',recipient:'sajeevanveeriah+dino-demo@gmail.com',display_name:'<Demo>',team_name:'Demo XI',entry_fee_cents:2500,attempts:++attempts }], error:null }),
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { fee_waived:false,is_demo:false,fantasy_managers:{initial_squad_due_at:'2026-10-01T00:00:00Z'} },error:null }) }) }), update: data => { saved=data; const chain={eq:()=>chain,is:async()=>{if(data.sent_at)delivered=true;return {error:null};}};return chain;} }),
};
const source=ts.transpileModule(readFileSync('lib/dino-coach/registration-email.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const module={exports:{}};
new Function('require','module','exports',source)(id=>{
 if(id==='server-only')return {};
 if(id==='@/lib/email')return {sendEmail:async p=>{sendCount++;payloads.push(p);return fail?{status:'failed',reason:'temporary provider outage'}:{status:'sent',id:'provider-demo'};},emailHtml:(t,b)=>b,escapeEmailHtml:s=>s.replaceAll('<','&lt;').replaceAll('>','&gt;'),getTransactionalReplyTo:()=> 'ndcc.secretary1@gmail.com'};
 throw Error(id);
},module,module.exports);
assert.equal((await module.exports.sendRegistrationEmail(supabase,'demo')).status,'retry_scheduled');
assert.equal(saved.sent_at,undefined);
assert.ok(Date.parse(saved.next_attempt_at)>Date.now());
fail=false;
assert.equal((await module.exports.sendRegistrationEmail(supabase,'demo')).status,'sent');
assert.equal(saved.provider_message_id,'provider-demo');
assert.equal((await module.exports.sendRegistrationEmail(supabase,'demo')).status,'not_due');
assert.equal(sendCount,2);
assert.deepEqual(payloads[0],payloads[1]);
assert.deepEqual(payloads[1].bcc,['sajeevanveeriah@gmail.com']);
assert.match(payloads[1].html,/&lt;Demo&gt;/);
assert.match(payloads[1].html,/AUD 25.00/);
console.log('PASS failed delivery retries, immutable provider key/payload, delivery marker, duplicate suppression, recipient copy and HTML escaping');

const clientSource=ts.transpileModule(readFileSync('lib/fantasy-browser.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const clientModule={exports:{}};
const deadlines=[];
new Function('require','module','exports','process','setTimeout','clearTimeout','fetch',clientSource)(
 ()=>({createClient:()=>null}),clientModule,clientModule.exports,{env:{}},
 (_fn,ms)=>{deadlines.push(ms);return 1;},()=>{},async()=>({ok:true,json:async()=>({success:true})}),
);
await clientModule.exports.fantasyJsonFetch('/read');
await clientModule.exports.fantasyJsonFetch('/write',{method:'POST',body:'{}'});
await clientModule.exports.fantasyJsonFetch('/write',{method:'patch',body:'{}'});
assert.deepEqual(deadlines,[30000,45000,45000]);
console.log('PASS bounded read and mutation deadlines allow payment processing to finish');
