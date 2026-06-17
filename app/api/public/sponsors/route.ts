import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';

export const revalidate = 300;
export const preferredRegion = 'syd1';

const getActiveSponsors = unstable_cache(async () => {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('sponsors')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: true });
  return { data: data ?? [], error: error?.message ?? null };
}, ['public-sponsors'], { revalidate: 300, tags: ['sponsors'] });

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ success: false, error: 'Service not configured.' }, { status: 503 });
  }

  const { data, error } = await getActiveSponsors();

  if (error) return NextResponse.json({ success: false, error }, { status: 500 });
  return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } });
}
