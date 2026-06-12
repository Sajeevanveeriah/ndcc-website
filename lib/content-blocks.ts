import { unstable_cache } from 'next/cache';
import { createServerClient } from './supabase-server';
import { normalisePublicText } from './utils';

export interface ContentBlock {
  block_key: string;
  title: string | null;
  body: string | null;
  image_url: string | null;
  cta_label: string | null;
  cta_url: string | null;
}

async function getContentBlocksUncached(keys: string[]): Promise<Record<string, ContentBlock>> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {};
  }
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('content_blocks')
      .select('block_key,title,body,image_url,cta_label,cta_url')
      .eq('is_active', true)
      .in('block_key', keys);

    const cleaned = (data ?? []).map((row) => ({
      ...row,
      title: normalisePublicText(row.title),
      body: normalisePublicText(row.body),
      cta_label: normalisePublicText(row.cta_label),
    }));
    return Object.fromEntries(cleaned.map((row) => [row.block_key, row as ContentBlock]));
  } catch {
    return {};
  }
}

export const getContentBlocks = unstable_cache(getContentBlocksUncached, ['content-blocks'], {
  revalidate: 300,
  tags: ['content-blocks'],
});
