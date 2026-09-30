import { NextResponse } from 'next/server';
import { getNavVisibility } from '@/lib/server/nav-visibility';

export const dynamic = 'force-dynamic';

// The current maintenance notice, so pages already open pick up a banner
// switched on, changed or switched off in the CMS without a reload. Served
// from the shared site-chrome snapshot, which a CMS save refreshes at once.
export async function GET() {
  const nav = await getNavVisibility();
  return NextResponse.json({ banner: nav.maintenance ?? null }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
