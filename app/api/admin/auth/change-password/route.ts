import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requireSession } from '@/lib/auth/guard';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
import { enforceRateLimit, getClientIp } from '@/lib/server/request-guards';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await requireSession();

  if (!user) {
    return NextResponse.json({ success: false, error: 'Not authenticated.' }, { status: 401 });
  }

  // Current-password verification is a credential check, so bound guesses
  // per signed-in account and per client address.
  const ip = getClientIp(request);
  const permits = await Promise.all([
    enforceRateLimit(`admin-change-password-user:${user.id}`, 5, 15 * 60_000),
    enforceRateLimit(`admin-change-password-ip:${ip}`, 10, 15 * 60_000),
  ]);
  if (permits.some((allowed) => !allowed)) {
    return NextResponse.json({ success: false, error: 'Too many password change attempts. Please wait and try again.' }, { status: 429 });
  }

  const parsedBody = await readLimitedJsonObject(request, 8 * 1024);
  if (!parsedBody.ok) {
    return NextResponse.json(
      { success: false, error: parsedBody.error },
      { status: parsedBody.error === 'Request body is too large.' ? 413 : 400 },
    );
  }
  const { currentPassword, newPassword } = parsedBody.value;

  if (!currentPassword || !newPassword || String(newPassword).length < 10) {
    return NextResponse.json({ success: false, error: 'Current password and a new password (10+ chars) are required.' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: verified, error: verifyError } = await supabase.rpc('ndcc_verify_committee_user', {
    p_email: user.email,
    p_password: String(currentPassword),
  }).maybeSingle();

  if (verifyError) {
    console.error('Change password verification failed', { code: verifyError.code });
    return NextResponse.json({ success: false, error: 'Unable to update password.' }, { status: 503 });
  }
  if (!verified) {
    return NextResponse.json({ success: false, error: 'Current password is incorrect.' }, { status: 400 });
  }

  const { error } = await supabase.rpc('ndcc_set_committee_password', {
    p_user_id: user.id,
    p_password: String(newPassword),
  });

  if (error) {
    return NextResponse.json({ success: false, error: 'Unable to update password.' }, { status: 500 });
  }

  await supabase.from('committee_sessions').delete().eq('user_id', user.id);

  return NextResponse.json({ success: true });
}
