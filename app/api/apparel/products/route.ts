import { NextResponse } from 'next/server';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isServerSupabaseConfigured()) return NextResponse.json({ success: true, data: [] });
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('apparel_products')
    .select('id,slug,name,description,price,sizes,image_url,customisable,category,display_order,order_guidance,size_guidance')
    .eq('active', true)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}
