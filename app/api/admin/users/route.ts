import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requireSession } from '@/lib/auth/guard';

const VALID_ROLES = ['admin', 'president', 'secretary', 'committee'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireAdmin() {
  return requireSession(['admin']);
}

function isMissingCreateUserRpc(error: { code?: string; message?: string }) {
  const message = error.message || '';
  return error.code === 'PGRST202' || error.code === '42883' || message.includes('Could not find the function') || message.includes('does not exist');
}

function isDuplicateEmail(error: { code?: string; message?: string }) {
  const message = error.message || '';
  return error.code === '23505' || message.includes('committee_users_email_key') || message.includes('duplicate key');
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
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ success: false, error: 'Missing Supabase service role key. Set SUPABASE_SERVICE_ROLE_KEY on the server before creating CMS users.' }, { status: 500 });
  }

  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const { email, fullName, role, password } = await request.json();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedFullName = String(fullName || '').trim();
  const normalizedRole = String(role || '');
  const normalizedPassword = String(password || '');

  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    return NextResponse.json({ success: false, error: 'Enter a valid email address.' }, { status: 400 });
  }

  if (!normalizedFullName) {
    return NextResponse.json({ success: false, error: 'Full name is required.' }, { status: 400 });
  }

  if (!VALID_ROLES.includes(normalizedRole)) {
    return NextResponse.json({ success: false, error: 'Role must be admin, president, secretary, or committee.' }, { status: 400 });
  }

  if (normalizedPassword.length < 10) {
    return NextResponse.json({ success: false, error: 'Password must be at least 10 characters.' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { error } = await supabase.rpc('ndcc_admin_create_committee_user', {
    p_email: normalizedEmail,
    p_full_name: normalizedFullName,
    p_role: normalizedRole,
    p_password: normalizedPassword,
    p_created_by: admin.id,
  });

  if (error) {
    if (isDuplicateEmail(error)) {
      return NextResponse.json({ success: false, error: 'A CMS user with that email already exists.' }, { status: 409 });
    }

    if (isMissingCreateUserRpc(error)) {
      return NextResponse.json({ success: false, error: 'Missing Supabase RPC ndcc_admin_create_committee_user. Apply the 20260401_custom_committee_auth.sql migration before creating CMS users.' }, { status: 500 });
    }

    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }

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
