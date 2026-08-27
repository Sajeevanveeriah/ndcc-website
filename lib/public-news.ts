import { createServerClient } from '@/lib/supabase-server';
import { isPublicNewsPostAllowed, normalizeNewsImage } from '@/lib/public-content-normalizers';

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

function normalizePublicNewsRecord(record: PublicNewsRecord | null) {
  if (!record) return null;
  return {
    ...record,
    image_url: normalizeNewsImage(record.title, record.image_url),
  };
}

function filterPublicNews(records: PublicNewsRecord[]) {
  return records
    .filter((record) => isPublicNewsPostAllowed(record.title))
    .map((record) => ({
      ...record,
      image_url: normalizeNewsImage(record.title, record.image_url),
    }));
}

async function getPublishedNewsUncached(options?: { id?: string; limit?: number }): Promise<PublicNewsRecord[] | PublicNewsRecord | null> {
  const supabase = createServerClient();
  const id = options?.id;
  const limit = options?.limit;
  const now = new Date().toISOString();

  if (id) {
    const initial = await supabase
      .from('news')
      .select(columnsWithImage)
      .eq('id', id)
      .eq('published', true)
      .or(`published_at.is.null,published_at.lte.${now}`)
      .maybeSingle();

    if (isMissingImageUrlColumn(initial.error?.message)) {
      const fallback = await supabase
        .from('news')
        .select(columnsWithoutImage)
        .eq('id', id)
        .eq('published', true)
        .or(`published_at.is.null,published_at.lte.${now}`)
        .maybeSingle();

      if (fallback.error) {
        if (isMissingSortOrderColumn(fallback.error.message)) {
          const noSortFallback = await supabase
            .from('news')
            .select(columnsWithoutImageNoSort)
            .eq('id', id)
            .eq('published', true)
            .or(`published_at.is.null,published_at.lte.${now}`)
            .maybeSingle();
          if (noSortFallback.error) throw new Error(noSortFallback.error.message);
          return normalizePublicNewsRecord((noSortFallback.data as PublicNewsRecord | null) ?? null);
        }
        throw new Error(fallback.error.message);
      }
      return normalizePublicNewsRecord((fallback.data as PublicNewsRecord | null) ?? null);
    }

    if (isMissingSortOrderColumn(initial.error?.message)) {
      const noSortFallback = await supabase
        .from('news')
        .select(columnsWithImageNoSort)
        .eq('id', id)
        .eq('published', true)
        .or(`published_at.is.null,published_at.lte.${now}`)
        .maybeSingle();

      if (isMissingImageUrlColumn(noSortFallback.error?.message)) {
        const noSortNoImageFallback = await supabase
          .from('news')
          .select(columnsWithoutImageNoSort)
          .eq('id', id)
          .eq('published', true)
          .or(`published_at.is.null,published_at.lte.${now}`)
          .maybeSingle();
        if (noSortNoImageFallback.error) throw new Error(noSortNoImageFallback.error.message);
      return normalizePublicNewsRecord((noSortNoImageFallback.data as PublicNewsRecord | null) ?? null);
      }

      if (noSortFallback.error) throw new Error(noSortFallback.error.message);
      return normalizePublicNewsRecord((noSortFallback.data as PublicNewsRecord | null) ?? null);
    }

    if (initial.error) throw new Error(initial.error.message);
    return normalizePublicNewsRecord((initial.data as PublicNewsRecord | null) ?? null);
  }

  let query = supabase
    .from('news')
    .select(columnsWithImage)
    .eq('published', true)
    .or(`published_at.is.null,published_at.lte.${now}`)
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
      .or(`published_at.is.null,published_at.lte.${now}`)
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
          .or(`published_at.is.null,published_at.lte.${now}`)
          .order('published_at', { ascending: false })
          .order('created_at', { ascending: false });

        if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
          noSortFallbackQuery = noSortFallbackQuery.limit(limit);
        }

        const noSortFallback = await noSortFallbackQuery;
        if (noSortFallback.error) throw new Error(noSortFallback.error.message);
        return filterPublicNews((noSortFallback.data as PublicNewsRecord[] | null) ?? []);
      }
      throw new Error(fallback.error.message);
    }
    return filterPublicNews((fallback.data as PublicNewsRecord[] | null) ?? []);
  }

  if (isMissingSortOrderColumn(initial.error?.message)) {
    let noSortFallbackQuery = supabase
      .from('news')
      .select(columnsWithImageNoSort)
      .eq('published', true)
      .or(`published_at.is.null,published_at.lte.${now}`)
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
        .or(`published_at.is.null,published_at.lte.${now}`)
        .order('published_at', { ascending: false })
        .order('created_at', { ascending: false });

      if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
        noSortNoImageFallbackQuery = noSortNoImageFallbackQuery.limit(limit);
      }

      const noSortNoImageFallback = await noSortNoImageFallbackQuery;
      if (noSortNoImageFallback.error) throw new Error(noSortNoImageFallback.error.message);
      return filterPublicNews((noSortNoImageFallback.data as PublicNewsRecord[] | null) ?? []);
    }

    if (noSortFallback.error) throw new Error(noSortFallback.error.message);
    return filterPublicNews((noSortFallback.data as PublicNewsRecord[] | null) ?? []);
  }

  if (initial.error) throw new Error(initial.error.message);
  return filterPublicNews((initial.data as PublicNewsRecord[] | null) ?? []);
}

// Uncached live read: public news is mutable CMS content, so it must be
// queried at request time rather than served from the build/Data Cache.
export const getPublishedNews = getPublishedNewsUncached;
