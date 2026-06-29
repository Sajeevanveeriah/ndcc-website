import { NextResponse } from 'next/server';
import { getPublicGallery } from '@/lib/public-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await getPublicGallery();
  if (result.error) return NextResponse.json({ success: false, data: [], error: result.error }, { status: 500 });
  return NextResponse.json({ success: true, data: result.data, source: result.source });
}
