import { NextResponse } from 'next/server';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';

export const revalidate = 300;
export const preferredRegion = 'syd1';

export async function GET() {
  if (!isServerSupabaseConfigured()) return NextResponse.json({ success: true, positions: [] }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } });
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('volunteer_positions')
    .select('id, title, description')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, positions: data || [] }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } });
}
