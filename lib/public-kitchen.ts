import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';

export async function loadPublicKitchenMenu() {
  if (!isServerSupabaseConfigured()) throw new Error('Kitchen menu unavailable');

  const supabase = createServerClient();
  const { data: menu, error: menuError } = await supabase
    .from('kitchen_menus')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (menuError) throw new Error('Kitchen menu unavailable');
  if (!menu) return { menu: null, items: [] };

  const { data: items, error: itemsError } = await supabase
    .from('kitchen_items')
    .select('id,menu_id,name,description,image_url,price,is_available,is_hidden,sort_order,created_at')
    .eq('menu_id', menu.id)
    .eq('is_hidden', false)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (itemsError) throw new Error('Kitchen items unavailable');

  return { menu, items: items ?? [] };
}
