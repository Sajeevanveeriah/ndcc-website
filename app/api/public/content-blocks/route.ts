import { NextResponse } from 'next/server';
import { getContentBlocks } from '@/lib/content-blocks';
import { isProductionStaticBuild } from '@/lib/fallback-content';
import { isServerSupabaseConfigured } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keys = searchParams.getAll('key').filter(Boolean);

  if (keys.length === 0) {
    return NextResponse.json({ success: true, data: {}, source: 'fallback', degraded: false, error: null });
  }

  const blocks = await getContentBlocks(keys);
  const degraded = isProductionStaticBuild || !isServerSupabaseConfigured();
  return NextResponse.json({ success: true, data: blocks, source: degraded ? 'fallback' : 'supabase', degraded, error: null });
}
