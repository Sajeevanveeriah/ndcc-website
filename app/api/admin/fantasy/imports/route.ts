import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { getFantasyImportBatches } from '@/lib/fantasy-leaderboard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requirePermission('fantasy.imports');
  if (!user) {
    return NextResponse.json({ success: false, error: 'Admin session required.' }, { status: 403 });
  }

  try {
    const batches = await getFantasyImportBatches();
    return NextResponse.json({ success: true, batches });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Import batches could not be loaded.' },
      { status: 500 },
    );
  }
}
