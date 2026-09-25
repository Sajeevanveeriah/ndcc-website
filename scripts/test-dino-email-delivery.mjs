import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { authEmailReturnPath } from '../lib/auth/email-return.ts';

const manualSource = ts.transpileModule(readFileSync('lib/dino-coach/manual.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const manualModule = {exports:{}};
new Function('exports',manualSource)(manualModule.exports);
const { DINO_MANUAL_FILENAME, DINO_MANUAL_PATH, DINO_MANUAL_URL } = manualModule.exports;
assert.ok(readFileSync(`public${DINO_MANUAL_PATH}`).subarray(0,5).equals(Buffer.from('%PDF-')));
for (const page of ['app/fantasy/page.tsx','app/fantasy/rules/page.tsx']) {
  assert.match(readFileSync(page,'utf8'),/href=\{DINO_MANUAL_PATH\}/);
}

const fragment = '#access_token=demo&refresh_token=demo&type=signup';
assert.equal(authEmailReturnPath('/', fragment), '/club-account');
assert.equal(authEmailReturnPath('/', fragment.replace('signup','recovery')), '/club-account/reset-password');
assert.equal(authEmailReturnPath('/fantasy/account', fragment), null);
assert.equal(authEmailReturnPath('/fantasy/reset-password', fragment.replace('signup','recovery')), null);
assert.equal(authEmailReturnPath('/club-account/reset-password', fragment.replace('signup','recovery')), null);
assert.equal(authEmailReturnPath('/', '#access_token=x&type=signup'), null);
assert.equal(authEmailReturnPath('/', fragment.replace('signup','https://evil.invalid')), null);
console.log('PASS confirmation fallback, recovery, no loop and fixed local destinations');

let delivered = false, attempts = 0, sendCount = 0, fail = true, saved, frozenDelivery;
const payloads = [];
const supabase = {
  rpc: async () => ({ data: delivered ? [] : [{ entry_id:'demo',recipient:'sajeevanveeriah+dino-demo@gmail.com',display_name:'<Demo>',team_name:'Demo XI',entry_fee_cents:2500,delivery:frozenDelivery,attempts:++attempts }], error:null }),
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { fee_waived:false,is_demo:false,fantasy_managers:{initial_squad_due_at:'2026-10-01T00:00:00Z'} },error:null }) }) }), update: data => { saved=data; const chain={eq:()=>chain,is:async()=>{if(data.delivery)frozenDelivery=data.delivery;if(data.sent_at)delivered=true;return {error:null};}};return chain;} }),
};
const source=ts.transpileModule(readFileSync('lib/dino-coach/registration-email.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const module={exports:{}};
new Function('require','module','exports',source)(id=>{
 if(id==='server-only')return {};
 if(id==='./manual')return manualModule.exports;
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
assert.deepEqual(payloads[1].attachments,[{filename:DINO_MANUAL_FILENAME,path:DINO_MANUAL_URL}]);
assert.ok(payloads[1].html.includes(`href="${DINO_MANUAL_URL}"`));
assert.equal(frozenDelivery,payloads[0]);
console.log('PASS published PDF, both website links and automatic attachment retained on retry');
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

const lifecycleSource=ts.transpileModule(readFileSync('lib/dino-coach/lifecycle.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const lifecycleModule={exports:{}};new Function('exports',lifecycleSource)(lifecycleModule.exports);
const noticeSource=ts.transpileModule(readFileSync('lib/dino-coach/notifications.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const noticeModule={exports:{}};
let noticeFail=true, noticeSends=[];
const noticeJob={id:'notice-test',manager_id:'manager',season_id:'season',kind:'admin_change',attempts:0,payload:{reason:'<Correction>',changes:{team_name:{after:'Updated XI'}}}};
const noticeManager={email:'manager@example.invalid',display_name:'<Manager>',team_name:'Updated XI',is_active:true,initial_squad_due_at:'2027-01-01T00:00:00Z'};
const noticeSettings={notification_recipients:['one@example.invalid','two@example.invalid'],initial_reminders_enabled:true};
const noticeDb={
 rpc:async()=>({data:noticeJob.sent_at||noticeJob.cancelled_at||Date.parse(noticeJob.next_attempt_at||'')>Date.now()?[]:[{...noticeJob,attempts:++noticeJob.attempts}],error:null}),
 from:table=>{const q={select:()=>q,eq:()=>q,is:()=>q,single:async()=>({data:table==='fantasy_managers'?noticeManager:noticeSettings,error:null}),update:patch=>{Object.assign(noticeJob,patch);return q;},then:resolve=>resolve({error:null})};return q;},
};
new Function('require','module','exports',noticeSource)(id=>{
 if(id==='server-only'||id==='@/lib/supabase-server')return {};
 if(id==='./lifecycle')return lifecycleModule.exports;
 if(id==='@/lib/email')return {sendEmail:async payload=>{noticeSends.push(payload);return noticeFail?{status:'failed',reason:'provider unavailable'}:{status:'sent',id:'provider-notice'};},emailHtml:(_title,body)=>body,escapeEmailHtml:s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;')};
 throw Error(id);
},noticeModule,noticeModule.exports);
assert.equal((await noticeModule.exports.processDinoNotifications(noticeDb)).retrying,1);
assert.equal(noticeJob.sent_at,undefined);assert.ok(noticeJob.delivery);assert.ok(Date.parse(noticeJob.next_attempt_at)>Date.now());
noticeManager.team_name='Changed between attempts';noticeJob.next_attempt_at=null;noticeFail=false;
assert.equal((await noticeModule.exports.processDinoNotifications(noticeDb)).sent,1);
assert.deepEqual(noticeSends[0],noticeSends[1]);
assert.match(noticeSends[1].html,/&lt;Correction&gt;/);assert.match(noticeSends[1].html,/&lt;Manager&gt;/);
assert.deepEqual(noticeSends[1].replyTo,noticeSettings.notification_recipients);
assert.equal((await noticeModule.exports.processDinoNotifications(noticeDb)).sent,0);
Object.assign(noticeJob,{sent_at:null,kind:'reminder',payload:{due_at:noticeManager.initial_squad_due_at}});
noticeManager.first_squad_completed_at=new Date().toISOString();
assert.equal((await noticeModule.exports.processDinoNotifications(noticeDb)).cancelled,1);
assert.equal(noticeSends.length,2);
console.log('PASS manager-change outbox: durable retry, frozen delivery, HTML escaping, reply-to contacts, no resend and completed-squad cancellation');
