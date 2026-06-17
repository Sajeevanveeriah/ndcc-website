import { unstable_cache } from 'next/cache';
import { createServerClient, isServerSupabaseConfigured } from './supabase-server';
import { normalisePublicText } from './utils';
import { fallbackBlocksForKeys, isProductionStaticBuild } from '@/lib/fallback-content';

export interface ContentBlock {
  block_key: string;
  title: string | null;
  body: string | null;
  image_url: string | null;
  cta_label: string | null;
  cta_url: string | null;
}

async function getContentBlocksUncached(keys: string[]): Promise<Record<string, ContentBlock>> {
  if (isProductionStaticBuild || !isServerSupabaseConfigured()) {
    return fallbackBlocksForKeys(keys);
  }
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('content_blocks')
      .select('block_key,title,body,image_url,cta_label,cta_url')
      .eq('is_active', true)
      .in('block_key', keys);

    if (error) {
      console.warn('Public content blocks query failed; using fallback.');
      return fallbackBlocksForKeys(keys);
    }

    const cleaned = (data ?? []).map((row) => ({
      ...row,
      title: normalisePublicText(row.title),
      body: normalisePublicText(row.body),
      cta_label: normalisePublicText(row.cta_label),
    }));
    return Object.fromEntries(cleaned.map((row) => [row.block_key, row as ContentBlock]));
  } catch {
    console.warn('Public content blocks query timed out or failed; using fallback.');
    return fallbackBlocksForKeys(keys);
  }
}

export const getContentBlocks = unstable_cache(getContentBlocksUncached, ['content-blocks'], {
  revalidate: 300,
  tags: ['content-blocks'],
});
