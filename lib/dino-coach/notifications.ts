import 'server-only';
import { createServerClient } from '@/lib/supabase-server';
import { emailHtml, escapeEmailHtml, sendEmail } from '@/lib/email';
import { shouldCancelInitialNotice } from './lifecycle';

type DB = ReturnType<typeof createServerClient>;
const labels: Record<string,string> = { display_name: 'Manager name', team_name: 'Team name', team_name_status: 'Team-name approval', team_name_locked: 'Team-name lock', is_active: 'Account active', hidden_at: 'Hidden from standings', deleted_at: 'Deleted team', initial_squad_due_at: 'Initial squad deadline', fee_waived: 'Complimentary entry' };
const date = (value: string) => new Intl.DateTimeFormat('en-AU', {timeZone:'Australia/Melbourne',dateStyle:'full',timeStyle:'short'}).format(new Date(value));
export async function processDinoNotifications(db: DB, deadline = Date.now()+25_000) {
  let sent = 0; let cancelled = 0; let retrying = 0;
  while(Date.now()<deadline) {
    const claim=await db.rpc('claim_dino_notification');
    if(claim.error) throw new Error(claim.error.message);
    const job=claim.data?.[0]; if(!job) break;
    try {
      const [manager,settings]=await Promise.all([
        db.from('fantasy_managers').select('email,display_name,team_name,is_active,deleted_at,first_squad_completed_at,initial_squad_due_at').eq('id',job.manager_id).single(),
        db.from('fantasy_dino_settings').select('notification_recipients,initial_reminders_enabled').eq('season_id',job.season_id).single(),
      ]);
      if(manager.error||settings.error) throw new Error(manager.error?.message||settings.error?.message);
      const m=manager.data;
      if(['reminder','expired'].includes(job.kind) && (!settings.data.initial_reminders_enabled || shouldCancelInitialNotice(job.kind))) {
        const saved=await db.from('fantasy_notification_jobs').update({cancelled_at:new Date().toISOString(),lease_until:null}).eq('id',job.id).eq('attempts',job.attempts);
        if(saved.error) throw new Error(saved.error.message); cancelled++; continue;
      }
      const contacts: string[]=settings.data.notification_recipients || [];
      if(!contacts.length) throw new Error('Set reactivation contacts in Dino Coach settings before sending notices.');
      const esc=escapeEmailHtml;
      const subject='Your Dino Coach team has been updated';
      let body=`<p>Hi ${esc(m.display_name)},</p>`;
      if(job.kind==='admin_change') {
        body+=`<p>The club has updated <strong>${esc(m.team_name)}</strong>.</p><p>${esc(job.payload.reason)}</p><ul>`;
        for(const [key,value] of Object.entries(job.payload.changes || {})) {
          const change=value as {after:unknown};
          if(key==='squad') { body+='<li>Your squad selection or captaincy was updated. Open your team to review all 15 slots.</li>'; continue; }
          const display = key.endsWith('_at') ? (change.after ? date(String(change.after)) : 'Cleared') : typeof change.after==='boolean' ? (change.after ? 'Yes' : 'No') : String(change.after ?? 'Cleared');
          body+=`<li>${esc(labels[key]||key)}: ${esc(display)}</li>`;
        }
        body+='</ul>';
      }
      body+='<p><a href="https://www.ndcc.com.au/fantasy/account">Open your Dino Coach account</a></p><p>Thanks,<br>The NDCC Dino Coach team</p>';
      const delivery = job.delivery || {to:m.email,replyTo:contacts,subject,html:emailHtml(subject,body)};
      if(!job.delivery) {
        const frozen=await db.from('fantasy_notification_jobs').update({delivery}).eq('id',job.id).eq('attempts',job.attempts);
        if(frozen.error) throw new Error(frozen.error.message);
      }
      const result=await sendEmail({...delivery,idempotencyKey:`dino-notification-${job.id}`,tags:[{name:'category',value:`dino-${job.kind.replaceAll('_','-')}`}]});
      if(result.status!=='sent') throw new Error(result.reason);
      const update=await db.from('fantasy_notification_jobs').update({sent_at:new Date().toISOString(),provider_message_id:result.id||null,last_error:null,lease_until:null}).eq('id',job.id).eq('attempts',job.attempts).is('sent_at',null);
      if(update.error) throw new Error(update.error.message); sent++;
    } catch(error) {
      retrying++;
      const update=await db.from('fantasy_notification_jobs').update({last_error:error instanceof Error?error.message:'Delivery failed',lease_until:null,next_attempt_at:new Date(Date.now()+Math.min(360,5*2**Math.min(job.attempts,6))*60_000).toISOString()}).eq('id',job.id).eq('attempts',job.attempts).is('sent_at',null);
      if(update.error) throw new Error(update.error.message);
    }
  }
  return {sent,cancelled,retrying};
}
