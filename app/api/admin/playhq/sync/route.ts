import { NextResponse } from 'next/server';
import { requireAnyPermission, requirePermission } from '@/lib/auth/guard';
import { refreshPlayHQPublicData } from '@/lib/playhq/refresh';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store', Vary: 'Cookie' } as const;

export async function GET() {
  const user = await requirePermission('fantasy.seasons');
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403, headers: noStore });
  return NextResponse.json({ success: true, message: 'PlayHQ admin endpoint is available.' }, { headers: noStore });
}

// Same refresh path as "Refresh PlayHQ now" on /admin/season/playhq: purge the
// cached PlayHQ feed and the public pages that render it.
export async function POST() {
  const user = await requireAnyPermission(['season.setup', 'fantasy.seasons']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403, headers: noStore });
  const result = refreshPlayHQPublicData();
  return NextResponse.json({
    success: result.failures.length === 0,
    refreshedAt: result.refreshedAt,
    message: result.failures.length ? 'PlayHQ refresh partly failed. Try again shortly.' : 'PlayHQ data will be read again on the next visit to the fixtures and team pages.',
    ...(result.failures.length ? { failures: result.failures } : {}),
  }, { status: result.failures.length ? 500 : 200, headers: noStore });
}
