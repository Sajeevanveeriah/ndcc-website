import { NextResponse } from 'next/server';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isServerSupabaseConfigured()) return NextResponse.json({ success: true, positions: [] });
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('volunteer_positions')
    .select('id, title, description')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Volunteer positions lookup failed', { code: error.code, message: error.message });
    return NextResponse.json({ success: false, error: 'Volunteer roles are temporarily unavailable.' }, { status: 500 });
  }
  return NextResponse.json({ success: true, positions: data || [] });
}
