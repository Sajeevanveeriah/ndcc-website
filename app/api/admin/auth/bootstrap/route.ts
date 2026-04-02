import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const { email, fullName, password } = await request.json();

  if (!email || !fullName || !password || String(password).length < 10) {
    return NextResponse.json({ success: false, error: 'Email, fullName, and password (10+ chars) are required.' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { count, error: countError } = await supabase
    .from('committee_users')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('is_active', true);

  if (countError) return NextResponse.json({ success: false, error: 'Unable to validate bootstrap state.' }, { status: 500 });
  if ((count || 0) > 0) return NextResponse.json({ success: false, error: 'Bootstrap disabled: admin already exists.' }, { status: 403 });

  const { error } = await supabase.rpc('ndcc_bootstrap_first_admin', {
    p_email: String(email).trim().toLowerCase(),
    p_full_name: String(fullName).trim(),
    p_password: String(password),
  });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });

  return NextResponse.json({ success: true, message: 'Initial admin created. You can now log in.' });
}
