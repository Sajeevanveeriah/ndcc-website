import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { getEmailConfigStatus, sendEmail } from '@/lib/email';
import { enforceRateLimit } from '@/lib/server/request-guards';
import { NEWSLETTER_BATCH_SIZE, NEWSLETTER_SEND_INTERVAL_MS, validateNewsletterInput } from '@/lib/newsletter';
import { loadNewsletterRecipients, newsletterEmailHtml, newsletterSigningKey, unsubscribeUrlFor } from '@/lib/server/newsletter';

export const dynamic = 'force-dynamic';
// One batch sends at most NEWSLETTER_BATCH_SIZE emails spaced for Resend's rate limit.
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const STALE_CLAIM_MS = 5 * 60_000;
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const unavailable = (what = 'The newsletter') => reply({ success: false, error: `${what} is temporarily unavailable. Please retry.` }, 503);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isMissingTable(error: { code?: string; message?: string } | null) {
  return Boolean(error && (['42P01', 'PGRST205'].includes(error.code || '') || /newsletter_/.test(error.message || '')));
}

async function authorise() {
  // Full-access roles hold every permission; committee users need Memberships.
  return requirePermission('memberships');
}

export async function GET() {
  const user = await authorise();
  if (!user) return reply({ success: false, error: 'Forbidden.' }, 403);
  const client = createServerClient({ actorId: user.id });
  const email = getEmailConfigStatus();
  const [recipients, sends] = await Promise.all([
    loadNewsletterRecipients(client),
    client.from('newsletter_sends').select('id,subject,recipient_count,status,created_at,completed_at').order('created_at', { ascending: false }).limit(20),
  ]);
  return reply({
    success: true,
    email_ready: email.ready,
    test_mode: email.testMode,
    unsubscribe_ready: Boolean(newsletterSigningKey()),
    recipient_count: recipients.ok ? recipients.recipients.length : null,
    sends: sends.error ? [] : sends.data || [],
    log_available: !isMissingTable(sends.error) && !sends.error,
    sender_email: user.email,
  });
}

export async function POST(request: Request) {
  const user = await authorise();
  if (!user) return reply({ success: false, error: 'Forbidden.' }, 403);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = body?.action;
  const client = createServerClient({ actorId: user.id });

  if (action === 'preview' || action === 'test') {
    const input = validateNewsletterInput(body?.subject, body?.body);
    if (!input.ok) return reply({ success: false, error: input.error }, 400);
    const html = newsletterEmailHtml(input.subject, input.body, null);
    if (action === 'preview') return reply({ success: true, html });
    if (!await enforceRateLimit(`newsletter-test:${user.id}`, 5, 60_000)) return reply({ success: false, error: 'Please wait a minute before sending another test.' }, 429);
    const result = await sendEmail({ to: user.email, subject: `[Test] ${input.subject}`, html, tags: [{ name: 'category', value: 'newsletter_test' }] });
    if (result.status === 'sent' || result.status === 'simulated') {
      return reply({ success: true, message: result.status === 'sent' ? `Test sent to ${user.email}.` : 'Email test mode is on: the test send was simulated.' });
    }
    return reply({ success: false, error: `The test email was not sent: ${result.reason}` }, 502);
  }

  if (action === 'create') {
    const input = validateNewsletterInput(body?.subject, body?.body);
    if (!input.ok) return reply({ success: false, error: input.error }, 400);
    if (!getEmailConfigStatus().ready) return reply({ success: false, error: 'Email sending is not configured, so the newsletter cannot be sent.' }, 503);
    if (!newsletterSigningKey()) return reply({ success: false, error: 'Unsubscribe links cannot be signed on this server, so the newsletter cannot be sent.' }, 503);
    if (!await enforceRateLimit(`newsletter-create:${user.id}`, 3, 60 * 60_000)) return reply({ success: false, error: 'Too many newsletters started. Please wait before sending another.' }, 429);
    const recipients = await loadNewsletterRecipients(client);
    if (!recipients.ok) return unavailable('The member list');
    const count = recipients.recipients.length;
    if (count === 0) return reply({ success: false, error: 'No members have opted in to email updates.' }, 400);
    if (body?.confirm_recipient_count !== count) {
      return reply({ success: false, error: `The recipient count is now ${count}. Review and confirm again before sending.`, recipient_count: count }, 409);
    }
    const created = await client.from('newsletter_sends').insert({
      subject: input.subject, body: input.body, sent_by: user.id, recipient_count: count, status: 'sending',
    }).select('id').single();
    if (created.error || !created.data) {
      return isMissingTable(created.error)
        ? reply({ success: false, error: 'The newsletter needs the latest database update before it can be sent.' }, 503)
        : unavailable();
    }
    const sendId = created.data.id as string;
    for (let index = 0; index < count; index += 500) {
      const chunk = recipients.recipients.slice(index, index + 500).map((recipient) => ({ send_id: sendId, member_id: recipient.member_id, email: recipient.email }));
      const inserted = await client.from('newsletter_deliveries').insert(chunk);
      if (inserted.error) {
        await client.from('newsletter_sends').update({ status: 'failed', completed_at: new Date().toISOString() }).eq('id', sendId);
        return unavailable('Preparing the recipient list');
      }
    }
    console.info(JSON.stringify({ event: 'newsletter_created', send_id: sendId, recipients: count }));
    return reply({ success: true, send_id: sendId, recipient_count: count });
  }

  if (action === 'batch') {
    const sendId = typeof body?.send_id === 'string' ? body.send_id : '';
    if (!UUID.test(sendId)) return reply({ success: false, error: 'Choose a newsletter to continue.' }, 400);
    const send = await client.from('newsletter_sends').select('id,subject,body,status').eq('id', sendId).maybeSingle();
    if (send.error) return unavailable();
    if (!send.data) return reply({ success: false, error: 'Newsletter not found.' }, 404);
    if (send.data.status !== 'sending') return reply({ success: true, remaining: 0, status: send.data.status, sent: 0, failed: 0, skipped: 0 });

    const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
    const claimable = `status.eq.pending,and(status.eq.sending,claimed_at.lt.${staleBefore})`;
    const candidates = await client.from('newsletter_deliveries').select('id').eq('send_id', sendId).or(claimable)
      .order('created_at', { ascending: true }).order('id', { ascending: true }).limit(NEWSLETTER_BATCH_SIZE);
    if (candidates.error) return unavailable();
    const ids = (candidates.data || []).map((row) => row.id as string);
    let sent = 0; let failed = 0; let skipped = 0;
    if (ids.length) {
      // Claim atomically: rows another tab claimed first are not returned.
      const claimed = await client.from('newsletter_deliveries').update({ status: 'sending', claimed_at: new Date().toISOString() })
        .in('id', ids).or(claimable).select('id,email,member_id');
      if (claimed.error) return unavailable();
      const rows = (claimed.data || []) as Array<{ id: string; email: string; member_id: string | null }>;
      // Honour unsubscribes made since the send started.
      const memberIds = rows.map((row) => row.member_id).filter((id): id is string => Boolean(id));
      const prefs = memberIds.length
        ? await client.from('club_account_preferences').select('member_id,email_updates').in('member_id', memberIds)
        : { data: [], error: null };
      if (prefs.error) {
        await client.from('newsletter_deliveries').update({ status: 'pending', claimed_at: null }).in('id', rows.map((row) => row.id));
        return unavailable();
      }
      const optedIn = new Set((prefs.data || []).filter((row) => row.email_updates === true).map((row) => row.member_id as string));
      const key = newsletterSigningKey();
      for (const [index, row] of rows.entries()) {
        if (!row.member_id || !optedIn.has(row.member_id)) {
          await client.from('newsletter_deliveries').update({ status: 'skipped', error: 'No longer opted in.' }).eq('id', row.id);
          skipped += 1;
          continue;
        }
        if (index > 0) await sleep(NEWSLETTER_SEND_INTERVAL_MS);
        const result = await sendEmail({
          to: row.email,
          subject: send.data.subject,
          html: newsletterEmailHtml(send.data.subject, send.data.body, unsubscribeUrlFor(row.member_id, key)),
          tags: [{ name: 'category', value: 'newsletter' }],
          // Retries of a claimed row (e.g. after a timeout) never send twice.
          idempotencyKey: `ndcc-newsletter-${sendId}-${row.id}`,
        });
        const ok = result.status === 'sent' || result.status === 'simulated';
        if (ok) sent += 1; else failed += 1;
        await client.from('newsletter_deliveries').update({
          status: ok ? 'sent' : 'failed',
          sent_at: ok ? new Date().toISOString() : null,
          error: ok ? (result.status === 'simulated' ? 'Simulated (email test mode).' : null) : String('reason' in result ? result.reason : 'Send failed.').slice(0, 500),
        }).eq('id', row.id);
      }
    }

    const remaining = await client.from('newsletter_deliveries').select('id', { count: 'exact', head: true }).eq('send_id', sendId).in('status', ['pending', 'sending']);
    if (remaining.error) return unavailable();
    let status = 'sending';
    if ((remaining.count ?? 0) === 0) {
      const [okCount, failCount] = await Promise.all([
        client.from('newsletter_deliveries').select('id', { count: 'exact', head: true }).eq('send_id', sendId).eq('status', 'sent'),
        client.from('newsletter_deliveries').select('id', { count: 'exact', head: true }).eq('send_id', sendId).eq('status', 'failed'),
      ]);
      const delivered = okCount.count ?? 0;
      const failures = failCount.count ?? 0;
      status = failures === 0 ? 'sent' : delivered === 0 ? 'failed' : 'partial';
      await client.from('newsletter_sends').update({ status, completed_at: new Date().toISOString() }).eq('id', sendId).eq('status', 'sending');
    }
    return reply({ success: true, remaining: remaining.count ?? 0, status, sent, failed, skipped });
  }

  return reply({ success: false, error: 'Unknown action.' }, 400);
}
