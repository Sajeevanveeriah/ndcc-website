import 'server-only';
import { sendEmail, emailHtml, escapeEmailHtml, getTransactionalReplyTo } from '@/lib/email';
import type { createServerClient } from '@/lib/supabase-server';

type ServerClient = ReturnType<typeof createServerClient>;

export async function sendRegistrationEmail(supabase: ServerClient, entryId: string) {
  const claimed = await supabase.rpc('claim_fantasy_registration_email', { p_entry_id: entryId });
  if (claimed.error) throw new Error(claimed.error.message);
  const job = claimed.data?.[0];
  if (!job) return { status: 'not_due' };
  const details = await supabase.from('fantasy_entries').select('fee_waived,is_demo,fantasy_managers(initial_squad_due_at)').eq('id',entryId).single();
  if (details.error) throw new Error(details.error.message);
  const joined = details.data.fantasy_managers;
  const manager = Array.isArray(joined) ? joined[0] : joined;
  const deadline = manager?.initial_squad_due_at ? new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Melbourne',dateStyle:'full',timeStyle:'short'}).format(new Date(manager.initial_squad_due_at)) : '';
  const delivery = job.delivery || {
    to: job.recipient,
    bcc: job.recipient.toLowerCase() === 'sajeevanveeriah@gmail.com' ? undefined : ['sajeevanveeriah@gmail.com'],
    replyTo: getTransactionalReplyTo(),
    subject: 'Dino Coach registration received',
    idempotencyKey: `dino-registration-${entryId}`,
    tags: [{ name: 'category', value: 'dino-registration' }],
    html: emailHtml('Dino Coach registration received',
      `<p>Hi ${escapeEmailHtml(job.display_name)},</p>
      <p>Your manager registration for <strong>${escapeEmailHtml(job.team_name)}</strong> has been recorded.</p>
      ${details.data.fee_waived ? '<p>Your complimentary entry is approved. No payment is required. Sign in using the password supplied by the administrator, then choose Change password in your account.</p>' : details.data.is_demo ? '<p>Your demo entry does not require payment.</p>' : `<p>The entry fee is AUD ${(job.entry_fee_cents / 100).toFixed(2)}. If you have already paid, your account shows your payment status. Team selection unlocks after payment settles and your team name is approved.</p>`}
      <p>Fill your first squad with 15 players within five days${deadline ? `, by ${escapeEmailHtml(deadline)}` : ''}. We will remind you while it is incomplete. After the deadline, ask Saj and Rick to reactivate your team. This requirement ends permanently when you complete your first squad.</p>
      <p><a href="https://www.ndcc.com.au/fantasy/account">Open your Dino Coach account</a> to complete payment or pick your squad.</p>`),
  };
  if (!job.delivery) {
    const frozen = await supabase.from('fantasy_registration_emails').update({delivery}).eq('entry_id',entryId).eq('attempts',job.attempts).is('sent_at',null);
    if (frozen.error) throw new Error(frozen.error.message);
  }
  const result = await sendEmail(delivery);
  const sent = result.status === 'sent';
  const update = await supabase.from('fantasy_registration_emails').update({
    ...(sent ? { sent_at: new Date().toISOString(), provider_message_id: result.id || null, last_error: null }
      : { last_error: result.reason,
        next_attempt_at: new Date(Date.now() + Math.min(360, 5 * 2 ** Math.min(job.attempts, 6)) * 60_000).toISOString() }),
    lease_until: null,
  }).eq('entry_id', entryId).eq('attempts', job.attempts).is('sent_at', null);
  if (update.error) throw new Error(update.error.message);
  return { status: sent ? 'sent' : 'retry_scheduled' };
}

export async function retryRegistrationEmails(supabase: ServerClient, deadline = Date.now() + 30_000) {
  const due = await supabase.from('fantasy_registration_emails').select('entry_id')
    .is('sent_at', null).lte('next_attempt_at', new Date().toISOString()).limit(20);
  if (due.error) throw new Error(due.error.message);
  const outcomes = [];
  for (const job of due.data || []) {
    if (Date.now() >= deadline) break;
    outcomes.push(await sendRegistrationEmail(supabase, job.entry_id));
  }
  return outcomes;
}
