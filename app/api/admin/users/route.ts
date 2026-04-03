import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requireSession } from '@/lib/auth/guard';

async function requireAdmin() {
  return requireSession(['admin']);
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('committee_users')
    .select('id, email, full_name, role, is_active, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ success: false, error: 'Failed to load users.' }, { status: 500 });

  return NextResponse.json({ success: true, users: data });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const { email, fullName, role, password } = await request.json();

  if (!email || !fullName || !role || !password || String(password).length < 10) {
    return NextResponse.json({ success: false, error: 'Email, full name, role, and password (10+ chars) are required.' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { error } = await supabase.rpc('ndcc_admin_create_committee_user', {
    p_email: String(email).trim().toLowerCase(),
    p_full_name: String(fullName).trim(),
    p_role: String(role),
    p_password: String(password),
    p_created_by: admin.id,
  });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });

  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const { userId, resetPassword, isActive } = await request.json();
  if (!userId) return NextResponse.json({ success: false, error: 'userId is required.' }, { status: 400 });

  const supabase = createServerClient();

  if (typeof isActive === 'boolean') {
    const { error } = await supabase
      .from('committee_users')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) return NextResponse.json({ success: false, error: 'Failed to update user status.' }, { status: 500 });
  }

  if (resetPassword) {
    if (String(resetPassword).length < 10) {
      return NextResponse.json({ success: false, error: 'Reset password must be 10+ characters.' }, { status: 400 });
    }

    const { error } = await supabase.rpc('ndcc_set_committee_password', {
      p_user_id: userId,
      p_password: String(resetPassword),
    });

    if (error) return NextResponse.json({ success: false, error: 'Failed to reset password.' }, { status: 500 });

    await supabase.from('committee_sessions').delete().eq('user_id', userId);
  }

  return NextResponse.json({ success: true });
}
