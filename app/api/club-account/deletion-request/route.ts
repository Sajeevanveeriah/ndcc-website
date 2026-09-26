import { NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/account/server-auth';
import { createServerClient } from '@/lib/supabase-server';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
import { enforceRateLimit } from '@/lib/server/request-guards';
import { parseDeletionRequest } from '@/lib/club-account/account-data';
import { emailHtml, escapeEmailHtml, getContactEmailRecipients, sendEmail } from '@/lib/email';
export const dynamic = 'force-dynamic';
const fields = 'id,status,created_at,actioned_at';
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const unavailable = () => reply({ success: false, error: 'Your request could not be recorded. Please retry or contact the club.' }, 503);
// Records a request only. The committee actions it manually; orders,
// payments and raffle records are kept as required for club accounts.
async function latest(userId: string) {
  return createServerClient().from('club_account_deletion_requests').select(fields)
    .eq('auth_user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
}
export async function GET(request: Request) {
  const user = await getAuthUserFromRequest(request);
  if (!user?.email_confirmed_at || !user.email) return reply({ success: false, error: 'Sign in with a confirmed email.' }, 401);
  try {
    const { data, error } = await latest(user.id);
    // Before the table exists the account still works; the form stays hidden.
    if (error) return reply({ success: true, request: null, available: false });
    return reply({ success: true, request: data || null, available: true });
  } catch { return reply({ success: true, request: null, available: false }); }
}
export async function POST(request: Request) {
  const user = await getAuthUserFromRequest(request);
  if (!user?.email_confirmed_at || !user.email) return reply({ success: false, error: 'Sign in with a confirmed email.' }, 401);
  if (!await enforceRateLimit(`club-deletion:${user.id}`, 3, 60_000)) return reply({ success: false, error: 'Please wait a minute before trying again.' }, 429);
  const body = await readLimitedJsonObject(request, 4096);
  const input = body.ok ? parseDeletionRequest(body.value) : null;
  if (!input) return reply({ success: false, error: 'Confirm the request. Any reason must be 1,000 characters or fewer.' }, 400);
  try {
    const db = createServerClient();
    const existing = await latest(user.id);
    if (existing.error) return unavailable();
    if (existing.data?.status === 'pending') return reply({ success: true, request: existing.data });
    const member = await db.from('club_members').select('id,full_name').eq('auth_user_id', user.id).maybeSingle();
    if (member.error) return unavailable();
    const created = await db.from('club_account_deletion_requests')
      .insert({ auth_user_id: user.id, member_id: member.data?.id ?? null, email: user.email, reason: input.reason })
      .select(fields).single();
    if (created.error) {
      // A concurrent submission already opened the request.
      const retry = await latest(user.id);
      if (!retry.error && retry.data?.status === 'pending') return reply({ success: true, request: retry.data });
      return unavailable();
    }
    const contact = getContactEmailRecipients();
    const name = member.data?.full_name ? String(member.data.full_name) : '';
    const delivery = await sendEmail({
      to: contact.effectiveContactRecipient, cc: contact.cc.length ? contact.cc : undefined,
      subject: 'Club account deletion request',
      html: emailHtml('Club account deletion request', `<p>A member has asked the club to delete their website account.</p>
<p><strong>Email:</strong> ${escapeEmailHtml(user.email)}${name ? `<br><strong>Name:</strong> ${escapeEmailHtml(name)}` : ''}</p>
${input.reason ? `<p><strong>Reason given:</strong><br>${escapeEmailHtml(input.reason).replace(/\n/g, '<br>')}</p>` : ''}
<p>Review and mark the request as actioned in the CMS under Memberships. Keep order, payment and raffle records.</p>`),
      idempotencyKey: `club-account-deletion-${created.data.id}`,
      tags: [{ name: 'category', value: 'club_account_deletion' }],
    }).catch(() => ({ status: 'failed' as const, reason: 'send error' }));
    if (delivery.status === 'failed') console.error('[club-account] Deletion request notification failed', { requestId: created.data.id });
    return reply({ success: true, request: created.data }, 201);
  } catch { return unavailable(); }
}
