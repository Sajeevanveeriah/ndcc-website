import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getAuthUserFromRequest, type FantasyManagerRecord } from '@/lib/fantasy-manager-auth';
import { getFantasySettings } from '@/lib/fantasy-game';
import { sendEmail, emailHtml } from '@/lib/email';

export const dynamic = 'force-dynamic';

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function publicManagerSelect() {
  return 'id, auth_user_id, display_name, email, team_name, is_active';
}

export async function GET(request: Request) {
  const user = await getAuthUserFromRequest(request);
  if (!user?.email) {
    console.warn('[fantasy-manager] GET without authenticated Supabase user.');
    return NextResponse.json({ success: false, error: 'Sign in is required.' }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('fantasy_managers')
    .select(publicManagerSelect())
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('[fantasy-manager] GET database error', { userId: user.id, message: error.message });
    return NextResponse.json({ success: false, error: 'Could not load your fantasy manager profile. Please try again or contact the club.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, user: { email: user.email }, manager: data ?? null });
}

export async function POST(request: Request) {
  const user = await getAuthUserFromRequest(request);
  if (!user?.email) {
    console.warn('[fantasy-manager] POST without authenticated Supabase user.');
    return NextResponse.json({ success: false, error: 'Sign in is required before creating a fantasy manager profile.' }, { status: 401 });
  }

  const supabase = createServerClient();
  const existing = await supabase
    .from('fantasy_managers')
    .select(publicManagerSelect())
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (existing.error) {
    console.error('[fantasy-manager] Existing manager lookup failed', { userId: user.id, message: existing.error.message });
    return NextResponse.json({ success: false, error: 'Could not check your existing fantasy manager profile.' }, { status: 500 });
  }

  const settings = await getFantasySettings();
  if (!existing.data && !settings.is_registration_open) {
    return NextResponse.json({ success: false, error: 'Fantasy registration is currently closed.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const displayName = cleanText(body.displayName || user.user_metadata?.display_name);
  const teamName = cleanText(body.teamName || user.user_metadata?.team_name);
  if (!displayName || !teamName) {
    return NextResponse.json({ success: false, error: 'Display name and team name are required.' }, { status: 400 });
  }
  if (displayName.length > 80 || teamName.length > 80) {
    return NextResponse.json({ success: false, error: 'Display name and team name must be 80 characters or fewer.' }, { status: 400 });
  }

  const payload = {
    auth_user_id: user.id,
    email: user.email.toLowerCase(),
    display_name: displayName,
    team_name: teamName,
    is_active: true,
  };

  const { data, error } = await supabase
    .from('fantasy_managers')
    .upsert(payload, { onConflict: 'auth_user_id' })
    .select(publicManagerSelect())
    .single();

  if (error) {
    console.error('[fantasy-manager] Upsert failed', { userId: user.id, code: error.code, message: error.message });
    const duplicateMessage = error.code === '23505'
      ? 'A fantasy manager already exists for this account or email. Sign in with the original account or contact the club.'
      : 'Could not save your fantasy manager profile. Please try again or contact the club.';
    return NextResponse.json({ success: false, error: duplicateMessage }, { status: error.code === '23505' ? 409 : 500 });
  }

  const manager = data as unknown as FantasyManagerRecord;
  const isNewManager = !existing.data;
  let emailResult: Awaited<ReturnType<typeof sendEmail>> | null = null;
  if (isNewManager) {
    emailResult = await sendEmail({
      to: user.email.toLowerCase(),
      subject: 'Welcome to NDCC Fantasy Cricket!',
      html: emailHtml(
        'Welcome to NDCC Fantasy Cricket',
        `<p style="font-size:15px;color:#374151;line-height:1.6;">Hi ${escapeHtml(manager.display_name)},</p>
        <p style="font-size:15px;color:#374151;line-height:1.6;">Your fantasy manager profile is set up and ready to go.</p>
        <div style="background:#f3f4f6;border-radius:6px;padding:16px;margin:16px 0;">
          <p style="margin:0 0 6px;font-size:13px;color:#6b7280;font-weight:bold;">Your team</p>
          <p style="margin:0;font-size:16px;color:#800000;font-weight:bold;">${escapeHtml(manager.team_name)}</p>
        </div>
        <p style="font-size:15px;color:#374151;line-height:1.6;">Head to your squad page to start picking your players. Good luck this season!</p>
        <p style="margin-top:24px;"><a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.ndcc.com.au'}/fantasy/squad" style="background:#800000;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Build Your Squad</a></p>`
      ),
    });
    if (emailResult.status !== 'sent') {
      console.warn('[fantasy-manager] Welcome email did not send', { userId: user.id, status: emailResult.status, reason: emailResult.reason });
    }
  }

  console.info('[fantasy-manager] Manager profile saved', { userId: user.id, managerId: manager.id, created: isNewManager });
  return NextResponse.json({
    success: true,
    manager,
    created: isNewManager,
    email: emailResult ? { status: emailResult.status } : undefined,
  });
}
