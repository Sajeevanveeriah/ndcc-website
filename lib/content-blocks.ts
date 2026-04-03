import { createServerClient } from './supabase-server';

export interface ContentBlock {
  block_key: string;
  title: string | null;
  body: string | null;
  image_url: string | null;
  cta_label: string | null;
  cta_url: string | null;
}

export async function getContentBlocks(keys: string[]): Promise<Record<string, ContentBlock>> {
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

    return Object.fromEntries((data ?? []).map((row) => [row.block_key, row as ContentBlock]));
  } catch {
    return {};
  }
}
