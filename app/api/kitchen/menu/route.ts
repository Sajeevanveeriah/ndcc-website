import { NextResponse } from 'next/server';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isServerSupabaseConfigured()) {
    return NextResponse.json({ success: true, data: { menu: null, items: [] } });
  }

  const supabase = createServerClient();
  const { data: menu, error: menuError } = await supabase
    .from('kitchen_menus')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (menuError) return NextResponse.json({ success: false, error: menuError.message }, { status: 500 });
  if (!menu) return NextResponse.json({ success: true, data: { menu: null, items: [] } });

  const { data: items, error: itemsError } = await supabase
    .from('kitchen_items')
    .select('id,menu_id,name,description,image_url,price,is_available,is_hidden,sort_order,created_at')
    .eq('menu_id', menu.id)
    .eq('is_hidden', false)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (itemsError) return NextResponse.json({ success: false, error: itemsError.message }, { status: 500 });

  return NextResponse.json({ success: true, data: { menu, items: items ?? [] } });
}
