import 'server-only';
import { createServerClient } from '@/lib/supabase-server';
import { emailHtml, escapeEmailHtml, sendEmail } from '@/lib/email';

type DB = ReturnType<typeof createServerClient>;

export async function processDinoFeedback(db: DB, deadline = Date.now() + 20_000, id?: string) {
  let sent = 0;
  let retrying = 0;
  while (Date.now() < deadline) {
    const claim = await db.rpc('claim_dino_feedback', { p_id: id || null });
    if (claim.error) throw new Error('Could not claim feedback notification.');
    const job = claim.data?.[0];
    if (!job) break;
    try {
      const esc = escapeEmailHtml;
      const request = job.request;
      const delivery = job.delivery || {
        to: job.recipients,
        replyTo: request.email,
        subject: `Dino Coach feedback - ${request.kind}`,
        html: emailHtml('Dino Coach feedback', `<p>A visitor has shared feedback about Dino Coach.</p><p><strong>Name:</strong> ${esc(request.name)}<br><strong>Email:</strong> ${esc(request.email)}<br><strong>Type:</strong> ${esc(request.kind)}</p><div style="white-space:pre-wrap">${esc(request.message)}</div><p><strong>Reference:</strong> ${esc(job.id)}</p><p>Reply to this email to respond to the sender. A copy is saved in <a href="https://www.ndcc.com.au/admin/enquiries">CMS Enquiries</a>.</p>`),
      };
      if (!job.delivery) {
        const frozen = await db.from('dino_feedback_jobs').update({ delivery }).eq('id', job.id).eq('attempts', job.attempts);
        if (frozen.error) throw new Error('Could not prepare feedback notification.');
      }
      const result = await sendEmail({ ...delivery, idempotencyKey: `dino-feedback-${job.id}`, tags: [{ name: 'category', value: 'dino-feedback' }] });
      if (result.status !== 'sent') throw new Error('Email delivery is pending retry.');
      const saved = await db.from('dino_feedback_jobs').update({ sent_at: new Date().toISOString(), provider_message_id: result.id || null, lease_until: null, last_error: null }).eq('id', job.id).eq('attempts', job.attempts).is('sent_at', null);
      if (saved.error) throw new Error('Could not confirm feedback notification delivery.');
      sent++;
    } catch {
      const saved = await db.from('dino_feedback_jobs').update({ last_error: 'Delivery could not be confirmed; awaiting retry.', lease_until: null, next_attempt_at: new Date(Date.now() + 10 * 60_000).toISOString() }).eq('id', job.id).eq('attempts', job.attempts).is('sent_at', null);
      if (saved.error) throw new Error('Could not schedule feedback retry.');
      retrying++;
    }
    if (id) break;
  }
  return { sent, retrying };
}
