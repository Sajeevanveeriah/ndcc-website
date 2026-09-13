import { NextResponse } from 'next/server';
import { loadPublicKitchenMenu } from '@/lib/public-kitchen';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    return NextResponse.json({ success: true, data: await loadPublicKitchenMenu() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    console.error('[kitchen] Public menu unavailable');
    return NextResponse.json({ success: false, error: 'Menu temporarily unavailable.' }, {
      status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' },
    });
  }
}
