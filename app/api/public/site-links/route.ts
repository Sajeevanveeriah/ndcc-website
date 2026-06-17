import { NextResponse } from 'next/server';
import { getPageLinkCards } from '@/lib/structured-content';

export const revalidate = 300;
export const preferredRegion = 'syd1';

const allowedSections = new Set([
  'header_nav',
  'footer_quick_links',
  'footer_get_involved',
  'footer_affiliations',
]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const section = searchParams.get('section') || '';

  if (!allowedSections.has(section)) {
    return NextResponse.json({ success: false, error: 'Unknown site link section.' }, { status: 400 });
  }

  const data = await getPageLinkCards('site', section);
  return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } });
}
