import { createServerClient } from '@/lib/supabase-server';

const columnsWithImage = 'id,title,content,author,image_url,sort_order,published,published_at,created_at';
const columnsWithoutImage = 'id,title,content,author,sort_order,published,published_at,created_at';

export type PublicNewsRecord = {
  id: string;
  title: string;
  content: string;
  author: string;
  image_url?: string | null;
  sort_order?: number;
  published: boolean;
  published_at: string | null;
  created_at: string;
};

export async function getPublishedNews(options?: { id?: string; limit?: number }): Promise<PublicNewsRecord[] | PublicNewsRecord | null> {
  const supabase = createServerClient();
  const id = options?.id;
  const limit = options?.limit;

  if (id) {
    const initial = await supabase
      .from('news')
      .select(columnsWithImage)
      .eq('id', id)
      .eq('published', true)
      .maybeSingle();

    if (initial.error?.message.includes("Could not find the 'image_url' column")) {
      const fallback = await supabase
        .from('news')
        .select(columnsWithoutImage)
        .eq('id', id)
        .eq('published', true)
        .maybeSingle();

      if (fallback.error) throw new Error(fallback.error.message);
      return (fallback.data as PublicNewsRecord | null) ?? null;
    }

    if (initial.error) throw new Error(initial.error.message);
    return (initial.data as PublicNewsRecord | null) ?? null;
  }

  let query = supabase
    .from('news')
    .select(columnsWithImage)
    .eq('published', true)
    .order('sort_order', { ascending: true })
    .order('published_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
    query = query.limit(limit);
  }

  const initial = await query;

  if (initial.error?.message.includes("Could not find the 'image_url' column")) {
    let fallbackQuery = supabase
      .from('news')
      .select(columnsWithoutImage)
      .eq('published', true)
      .order('sort_order', { ascending: true })
      .order('published_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
      fallbackQuery = fallbackQuery.limit(limit);
    }

    const fallback = await fallbackQuery;
    if (fallback.error) throw new Error(fallback.error.message);
    return (fallback.data as PublicNewsRecord[] | null) ?? [];
  }

  if (initial.error) throw new Error(initial.error.message);
  return (initial.data as PublicNewsRecord[] | null) ?? [];
}
