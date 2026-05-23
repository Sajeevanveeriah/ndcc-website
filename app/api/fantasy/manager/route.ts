import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getAuthUserFromRequest } from '@/lib/fantasy-manager-auth';
import { getFantasySettings } from '@/lib/fantasy-game';
import { sendEmail, emailHtml } from '@/lib/email';

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

export async function GET(request: Request) {
  const user = await getAuthUserFromRequest(request);
  if (!user?.email) return NextResponse.json({ success: false, error: 'Sign in is required.' }, { status: 401 });

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('fantasy_managers')
    .select('id, auth_user_id, display_name, email, team_name, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, user: { email: user.email }, manager: data ?? null });
}

export async function POST(request: Request) {
  const user = await getAuthUserFromRequest(request);
  if (!user?.email) return NextResponse.json({ success: false, error: 'Sign in is required.' }, { status: 401 });

  const settings = await getFantasySettings();
  const supabase = createServerClient();
  const existing = await supabase.from('fantasy_managers').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (!existing.data && !settings.is_registration_open) {
    return NextResponse.json({ success: false, error: 'Fantasy registration is currently closed.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const displayName = cleanText(body.displayName || user.user_metadata?.display_name);
  const teamName = cleanText(body.teamName || user.user_metadata?.team_name);
  if (!displayName || !teamName) return NextResponse.json({ success: false, error: 'Display name and team name are required.' }, { status: 400 });
  if (displayName.length > 80 || teamName.length > 80) return NextResponse.json({ success: false, error: 'Names must be 80 characters or fewer.' }, { status: 400 });

  const payload = { auth_user_id: user.id, email: user.email.toLowerCase(), display_name: displayName, team_name: teamName, is_active: true };
  const { data, error } = await supabase
    .from('fantasy_managers')
    .upsert(payload, { onConflict: 'auth_user_id' })
    .select('id, auth_user_id, display_name, email, team_name, is_active')
    .single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  const isNewManager = !existing.data;
  if (isNewManager) {
    void sendEmail({
      to: user.email.toLowerCase(),
      subject: 'Welcome to NDCC Fantasy Cricket!',
      html: emailHtml(
        'Welcome to NDCC Fantasy Cricket',
        `<p style="font-size:15px;color:#374151;line-height:1.6;">Hi ${data.display_name},</p>
        <p style="font-size:15px;color:#374151;line-height:1.6;">Your fantasy manager profile is set up and ready to go.</p>
        <div style="background:#f3f4f6;border-radius:6px;padding:16px;margin:16px 0;">
          <p style="margin:0 0 6px;font-size:13px;color:#6b7280;font-weight:bold;">Your team</p>
          <p style="margin:0;font-size:16px;color:#800000;font-weight:bold;">${data.team_name}</p>
        </div>
        <p style="font-size:15px;color:#374151;line-height:1.6;">Head to your squad page to start picking your players. Good luck this season!</p>
        <p style="margin-top:24px;"><a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.ndcc.com.au'}/fantasy/squad" style="background:#800000;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Build Your Squad</a></p>`
      ),
    });
  }
  return NextResponse.json({ success: true, manager: data });
}
