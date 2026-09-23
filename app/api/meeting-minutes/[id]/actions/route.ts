import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/auth/guard';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
import { isUuidV1ToV5 } from '@/lib/validation/uuid';

export const dynamic = 'force-dynamic';


// Minute statuses are draft | published | accepted | seconded (see
// app/api/meeting-minutes/route.ts MINUTE_STATUSES). Drafts are unpublished and
// cannot be accepted or seconded. Once published, a minute may be moved for
// acceptance and seconded in either order, and a repeated action is recorded
// without changing the status.
const ACTIONABLE_MINUTE_TRANSITIONS: Record<string, ReadonlyArray<string>> = {
  published: ['accepted', 'seconded'],
  accepted: ['accepted', 'seconded'],
  seconded: ['accepted', 'seconded'],
};

function isAllowedMinuteTransition(currentStatus: string, actionType: string) {
  return ACTIONABLE_MINUTE_TRANSITIONS[currentStatus]?.includes(actionType) === true;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('minutes');
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  if (!isUuidV1ToV5(id)) {
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
  const { data: minute, error: minuteError } = await supabase
    .from('meeting_minutes')
    .select('id,status')
    .eq('id', id)
    .maybeSingle<{ id: string; status: string }>();
  if (minuteError) {
    console.error('Meeting minute action lookup failed', { minuteId: id, code: minuteError.code, message: minuteError.message });
    return NextResponse.json({ success: false, error: 'Unable to record action.' }, { status: 500 });
  }
  // Committee members never see drafts in the listing or document routes, so
  // a draft is reported exactly like a missing minute.
  if (!minute || (user.role === 'committee' && minute.status === 'draft')) {
    return NextResponse.json({ success: false, error: 'Minute not found.' }, { status: 404 });
  }
  if (!isAllowedMinuteTransition(minute.status, action_type)) {
    return NextResponse.json({ success: false, error: 'This minute cannot be marked as that yet.' }, { status: 409 });
  }

  const { error } = await supabase.from('meeting_minute_actions').insert({
    minute_id: id,
    action_type,
    acted_by: user.id,
    notes: safeNotes,
  });

  if (error) {
    console.error('Meeting minute action insert failed', { minuteId: id, code: error.code, message: error.message });
    return NextResponse.json({ success: false, error: 'Unable to record action.' }, { status: 500 });
  }

  if (minute.status !== action_type) {
    const { error: updateError } = await supabase
      .from('meeting_minutes')
      .update({ status: action_type })
      .eq('id', id)
      .eq('status', minute.status);
    if (updateError) {
      console.error('Meeting minute status update failed', { minuteId: id, code: updateError.code, message: updateError.message });
      return NextResponse.json({ success: false, error: 'The action was recorded but the minute status could not be updated.' }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
