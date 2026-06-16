import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requireSession } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await requireSession();

  if (!user) {
    return NextResponse.json({ success: false, error: 'Not authenticated.' }, { status: 401 });
  }

  const { currentPassword, newPassword } = await request.json();

  if (!currentPassword || !newPassword || String(newPassword).length < 10) {
    return NextResponse.json({ success: false, error: 'Current password and a new password (10+ chars) are required.' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: verified } = await supabase.rpc('ndcc_verify_committee_user', {
    p_email: user.email,
    p_password: String(currentPassword),
  }).maybeSingle();

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
