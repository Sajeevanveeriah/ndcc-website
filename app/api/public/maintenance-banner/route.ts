import { NextResponse } from 'next/server';
import { getPublicMaintenanceBanner } from '@/lib/server/maintenance-banner';

export const dynamic = 'force-dynamic';

// The current maintenance notice, so pages already open pick up a banner
// switched on, changed or switched off in the CMS without a reload. Pages
// re-check at most every 15 seconds, only on a page change or on returning
// to the tab. A failed read answers 503, never "no banner", so an open page
// keeps its notice when the database is unavailable (for example during the
// maintenance itself).
export async function GET() {
  const { banner, failed } = await getPublicMaintenanceBanner();
  const headers = { 'Cache-Control': 'no-store, max-age=0' };
  if (failed) return NextResponse.json({ error: 'The maintenance notice could not be checked.' }, { status: 503, headers });
  return NextResponse.json({ banner }, { headers });
}
