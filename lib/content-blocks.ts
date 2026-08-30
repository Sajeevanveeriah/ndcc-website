import { createServerClient, isServerSupabaseConfigured } from './supabase-server';
import { normalisePublicText } from './utils';
import { fallbackBlocksForKeys } from '@/lib/fallback-content';
import { resolvePublicLinkUrl } from './public-link-url';

export interface ContentBlock {
  block_key: string;
  title: string | null;
  body: string | null;
  image_url: string | null;
  cta_label: string | null;
  cta_url: string | null;
}

function resolveContentBlock(
  key: string,
  db: Partial<ContentBlock> | undefined,
  fallback: ContentBlock | undefined
): ContentBlock | null {
  if (!db && !fallback) return null;

  return {
    block_key: key,
    title: normalisePublicText(db?.title) || fallback?.title || null,
    body: normalisePublicText(db?.body) || fallback?.body || null,
    image_url: normalisePublicText(db?.image_url) || fallback?.image_url || null,
    cta_label: normalisePublicText(db?.cta_label) || fallback?.cta_label || null,
    cta_url: resolvePublicLinkUrl(db?.cta_url, fallback?.cta_url),
  };
}

function mapContentBlocksForKeys(keys: string[], rows: Partial<ContentBlock>[] | null | undefined): Record<string, ContentBlock> {
  const dbByKey = new Map((rows ?? []).filter((row) => row.block_key).map((row) => [row.block_key as string, row]));
  const fallbackByKey = fallbackBlocksForKeys(keys);

  return Object.fromEntries(keys.flatMap((key) => {
    const resolved = resolveContentBlock(key, dbByKey.get(key), fallbackByKey[key]);
    return resolved ? [[key, resolved]] : [];
  }));
}

async function getContentBlocksUncached(keys: string[]): Promise<Record<string, ContentBlock>> {
  if (!isServerSupabaseConfigured()) return fallbackBlocksForKeys(keys);

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('content_blocks')
      .select('block_key,title,body,image_url,cta_label,cta_url')
      .eq('is_active', true)
      .in('block_key', keys);

    if (error) {
      console.warn('Public content blocks query failed; using controlled fallbacks.', { keys, error: error.message });
      return fallbackBlocksForKeys(keys);
    }

    return mapContentBlocksForKeys(keys, data as Partial<ContentBlock>[]);
  } catch (error) {
    console.warn('Public content blocks query failed; using controlled fallbacks.', { keys, error: error instanceof Error ? error.message : 'unknown' });
    return fallbackBlocksForKeys(keys);
  }
}

// Uncached live read: content blocks are edited through admin, so they must be
// queried at request time rather than served from the build/Data Cache.
export const getContentBlocks = getContentBlocksUncached;
