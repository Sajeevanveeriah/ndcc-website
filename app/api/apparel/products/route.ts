import { NextResponse } from 'next/server';
import { loadPublicCatalogue } from '@/lib/apparel/public-catalogue';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await loadPublicCatalogue();
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    console.error('[apparel] Public catalogue unavailable');
    return NextResponse.json({ success: false, error: 'Catalogue temporarily unavailable.' }, {
      status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' },
    });
  }
}
