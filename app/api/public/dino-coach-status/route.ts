import { NextResponse } from 'next/server';
import { isServerSupabaseConfigured } from '@/lib/supabase-server';
import { getCachedDinoLaunchState } from '@/lib/server/dino-public-cache';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isServerSupabaseConfigured()) {
    return NextResponse.json({ enabled: false }, { headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const { publicLaunchEnabled } = await getCachedDinoLaunchState();
    return NextResponse.json({ enabled: publicLaunchEnabled }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ enabled: false }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
