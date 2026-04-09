import { createServerClient } from '@/lib/supabase-server';

const columnsWithImage = 'id,title,content,author,image_url,sort_order,published,published_at,created_at';
const columnsWithoutImage = 'id,title,content,author,sort_order,published,published_at,created_at';
const columnsWithImageNoSort = 'id,title,content,author,image_url,published,published_at,created_at';
const columnsWithoutImageNoSort = 'id,title,content,author,published,published_at,created_at';

function isMissingImageUrlColumn(message?: string) {
  return Boolean(message?.includes("Could not find the 'image_url' column"));
}

function isMissingSortOrderColumn(message?: string) {
  if (!message) return false;
  return message.includes('sort_order') && message.includes('news');
}

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

    if (isMissingImageUrlColumn(initial.error?.message)) {
      const fallback = await supabase
        .from('news')
        .select(columnsWithoutImage)
        .eq('id', id)
        .eq('published', true)
        .maybeSingle();

      if (fallback.error) {
        if (isMissingSortOrderColumn(fallback.error.message)) {
          const noSortFallback = await supabase
            .from('news')
            .select(columnsWithoutImageNoSort)
            .eq('id', id)
            .eq('published', true)
            .maybeSingle();
          if (noSortFallback.error) throw new Error(noSortFallback.error.message);
          return (noSortFallback.data as PublicNewsRecord | null) ?? null;
        }
        throw new Error(fallback.error.message);
      }
      return (fallback.data as PublicNewsRecord | null) ?? null;
    }

    if (isMissingSortOrderColumn(initial.error?.message)) {
      const noSortFallback = await supabase
        .from('news')
        .select(columnsWithImageNoSort)
        .eq('id', id)
        .eq('published', true)
        .maybeSingle();

      if (isMissingImageUrlColumn(noSortFallback.error?.message)) {
        const noSortNoImageFallback = await supabase
          .from('news')
          .select(columnsWithoutImageNoSort)
          .eq('id', id)
          .eq('published', true)
          .maybeSingle();
        if (noSortNoImageFallback.error) throw new Error(noSortNoImageFallback.error.message);
        return (noSortNoImageFallback.data as PublicNewsRecord | null) ?? null;
      }

      if (noSortFallback.error) throw new Error(noSortFallback.error.message);
      return (noSortFallback.data as PublicNewsRecord | null) ?? null;
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

  if (isMissingImageUrlColumn(initial.error?.message)) {
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
    if (fallback.error) {
      if (isMissingSortOrderColumn(fallback.error.message)) {
        let noSortFallbackQuery = supabase
          .from('news')
          .select(columnsWithoutImageNoSort)
          .eq('published', true)
          .order('published_at', { ascending: false })
          .order('created_at', { ascending: false });

        if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
          noSortFallbackQuery = noSortFallbackQuery.limit(limit);
        }

        const noSortFallback = await noSortFallbackQuery;
        if (noSortFallback.error) throw new Error(noSortFallback.error.message);
        return (noSortFallback.data as PublicNewsRecord[] | null) ?? [];
      }
      throw new Error(fallback.error.message);
    }
    return (fallback.data as PublicNewsRecord[] | null) ?? [];
  }

  if (isMissingSortOrderColumn(initial.error?.message)) {
    let noSortFallbackQuery = supabase
      .from('news')
      .select(columnsWithImageNoSort)
      .eq('published', true)
      .order('published_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
      noSortFallbackQuery = noSortFallbackQuery.limit(limit);
    }

    const noSortFallback = await noSortFallbackQuery;
    if (isMissingImageUrlColumn(noSortFallback.error?.message)) {
      let noSortNoImageFallbackQuery = supabase
        .from('news')
        .select(columnsWithoutImageNoSort)
        .eq('published', true)
        .order('published_at', { ascending: false })
        .order('created_at', { ascending: false });

      if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
        noSortNoImageFallbackQuery = noSortNoImageFallbackQuery.limit(limit);
      }

      const noSortNoImageFallback = await noSortNoImageFallbackQuery;
      if (noSortNoImageFallback.error) throw new Error(noSortNoImageFallback.error.message);
      return (noSortNoImageFallback.data as PublicNewsRecord[] | null) ?? [];
    }

    if (noSortFallback.error) throw new Error(noSortFallback.error.message);
    return (noSortFallback.data as PublicNewsRecord[] | null) ?? [];
  }

  if (initial.error) throw new Error(initial.error.message);
  return (initial.data as PublicNewsRecord[] | null) ?? [];
}
