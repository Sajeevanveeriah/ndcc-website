import { unstable_cache } from 'next/cache';
import { createServerClient, isServerSupabaseConfigured } from './supabase-server';
import { normalisePublicText } from './utils';
import { isProductionStaticBuild } from '@/lib/fallback-content';

export interface ContentBlock {
  block_key: string;
  title: string | null;
  body: string | null;
  image_url: string | null;
  cta_label: string | null;
  cta_url: string | null;
}

function mapContentBlocksForKeys(keys: string[], rows: Partial<ContentBlock>[] | null | undefined): Record<string, ContentBlock> {
  const dbByKey = new Map((rows ?? []).filter((row) => row.block_key).map((row) => [row.block_key as string, row]));

  return Object.fromEntries(keys.flatMap((key) => {
    const db = dbByKey.get(key);
    if (!db) return [];
    return [[key, {
      block_key: key,
      title: normalisePublicText(db.title) || null,
      body: normalisePublicText(db.body) || null,
      image_url: normalisePublicText(db.image_url) || null,
      cta_label: normalisePublicText(db.cta_label) || null,
      cta_url: normalisePublicText(db.cta_url) || null,
    } satisfies ContentBlock]];
  }));
}

async function getContentBlocksUncached(keys: string[]): Promise<Record<string, ContentBlock>> {
  if (isProductionStaticBuild || !isServerSupabaseConfigured()) {
    console.error('Supabase is not configured for public content blocks.', { keys });
    return {};
  }
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('content_blocks')
      .select('block_key,title,body,image_url,cta_label,cta_url')
      .eq('is_active', true)
      .in('block_key', keys);

    if (error) {
      console.error('Public content blocks query failed.', { keys, error: error.message });
      return {};
    }

    return mapContentBlocksForKeys(keys, data as Partial<ContentBlock>[]);
  } catch (error) {
    console.error('Public content blocks query timed out or failed.', { keys, error });
    return {};
  }
}

export const getContentBlocks = unstable_cache(getContentBlocksUncached, ['content-blocks'], {
  revalidate: 300,
  tags: ['content-blocks'],
});
