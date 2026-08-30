import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { getFantasyImportBatchDetail, type FantasyImportStatus } from '@/lib/fantasy-leaderboard';

export const dynamic = 'force-dynamic';

const allowedStatuses: FantasyImportStatus[] = ['reviewed', 'published', 'rejected'];

function canMoveStatus(currentStatus: FantasyImportStatus, nextStatus: FantasyImportStatus) {
  if (nextStatus === 'reviewed') return currentStatus === 'draft';
  if (nextStatus === 'published') return currentStatus === 'draft' || currentStatus === 'reviewed';
  if (nextStatus === 'rejected') return currentStatus === 'draft' || currentStatus === 'reviewed';
  return false;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('fantasy.imports');
  if (!user) {
    return NextResponse.json({ success: false, error: 'Admin session required.' }, { status: 403 });
  }

  try {
    const batch = await getFantasyImportBatchDetail(id);
    if (!batch) {
      return NextResponse.json({ success: false, error: 'Import batch not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, batch });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Import batch could not be loaded.' },
      { status: 500 },
    );
  }
}

type PatchRequest = {
  status?: FantasyImportStatus;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('fantasy.imports');
  if (!user) {
    return NextResponse.json({ success: false, error: 'Admin session required.' }, { status: 403 });
  }

  let payload: PatchRequest;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON payload.' }, { status: 400 });
  }

  if (!payload.status || !allowedStatuses.includes(payload.status)) {
    return NextResponse.json({ success: false, error: 'Status must be reviewed, published, or rejected.' }, { status: 400 });
  }

  const supabase = createServerClient();
  const existing = await supabase
    .from('fantasy_import_batches')
    .select('id, status')
    .eq('id', id)
    .single();

  if (existing.error || !existing.data) {
    const status = existing.error?.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json({ success: false, error: existing.error?.message || 'Import batch not found.' }, { status });
  }

  const currentStatus = existing.data.status as FantasyImportStatus;
  if (!canMoveStatus(currentStatus, payload.status)) {
    return NextResponse.json({ success: false, error: `Cannot move import batch from ${currentStatus} to ${payload.status}.` }, { status: 400 });
  }

  const updated = await supabase
    .from('fantasy_import_batches')
    .update({ status: payload.status })
    .eq('id', id)
    .select('id, filename, source, status, created_at')
    .single();

  if (updated.error || !updated.data) {
    return NextResponse.json({ success: false, error: updated.error?.message || 'Import batch status could not be updated.' }, { status: 500 });
  }

  revalidatePath('/fantasy/leaderboard');
  revalidatePath('/fantasy');

  return NextResponse.json({ success: true, batch: updated.data });
}
