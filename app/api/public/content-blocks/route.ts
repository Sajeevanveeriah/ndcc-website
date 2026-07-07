import { NextResponse } from 'next/server';
import { getContentBlocks } from '@/lib/content-blocks';
import { isServerSupabaseConfigured } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const noStoreHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keys = searchParams.getAll('key').filter(Boolean);

  if (keys.length === 0) {
    return NextResponse.json({ success: true, data: {}, source: 'fallback', degraded: false, error: null }, { headers: noStoreHeaders });
  }

  const blocks = await getContentBlocks(keys);
  const degraded = !isServerSupabaseConfigured();
  return NextResponse.json(
    { success: true, data: blocks, source: degraded ? 'fallback' : 'supabase', degraded, error: null },
    { headers: noStoreHeaders },
  );
}
