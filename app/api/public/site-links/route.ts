import { NextResponse } from 'next/server';
import { getPageLinkCards } from '@/lib/structured-content';
import { withPublicCdnCache } from '@/lib/server/public-cdn-cache';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const noStoreHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

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
    return NextResponse.json({ success: false, error: 'Unknown site link section.' }, { status: 400, headers: noStoreHeaders });
  }

  const data = await getPageLinkCards('site', section);
  const degraded = data.some((link) => link.id.startsWith('fallback-'));
  return NextResponse.json(
    { success: true, data, source: degraded ? 'fallback' : 'supabase', degraded, error: null },
    // An empty list may be a failed read for a section without fallbacks, so
    // only a non-empty live list is shared at the CDN.
    { headers: withPublicCdnCache(noStoreHeaders, !degraded && data.length > 0) },
  );
}
