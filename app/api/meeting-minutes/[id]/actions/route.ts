import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/auth/guard';
import { readLimitedJsonObject } from '@/lib/order-input-validation';

export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('minutes');
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ success: false, error: 'A valid meeting minute is required.' }, { status: 400 });
  }
  const rawBody = await readLimitedJsonObject(request, 8 * 1024);
  if (!rawBody.ok) {
    return NextResponse.json(
      { success: false, error: rawBody.error },
      { status: rawBody.error === 'Request body is too large.' ? 413 : 400 },
    );
  }
  const { action_type, notes } = rawBody.value;
  if (typeof action_type !== 'string' || !['accepted', 'seconded'].includes(action_type)
    || (notes !== undefined && notes !== null && typeof notes !== 'string')
    || (typeof notes === 'string' && notes.trim().length > 2_000)) {
    return NextResponse.json({ success: false, error: 'action_type must be accepted or seconded.' }, { status: 400 });
  }
  const safeNotes = typeof notes === 'string' ? notes.trim() : '';

  const supabase = createServerClient();
  const { error } = await supabase.from('meeting_minute_actions').insert({
    minute_id: id,
    action_type,
    acted_by: user.id,
    notes: safeNotes,
  });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  if (action_type === 'accepted' || action_type === 'seconded') {
    await supabase.from('meeting_minutes').update({ status: action_type }).eq('id', id);
  }

  return NextResponse.json({ success: true });
}
