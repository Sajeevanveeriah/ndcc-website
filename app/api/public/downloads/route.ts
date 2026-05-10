import { NextResponse } from 'next/server';
import { getPublicDownloads } from '@/lib/cms-content';
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return NextResponse.json({ success: true, data: await getPublicDownloads(searchParams.get('category') || undefined) });
}
