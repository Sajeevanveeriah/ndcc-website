import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await requirePermission('minutes');
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const { action_type, notes } = await request.json();
  if (!['accepted', 'seconded'].includes(action_type)) {
    return NextResponse.json({ success: false, error: 'action_type must be accepted or seconded.' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { error } = await supabase.from('meeting_minute_actions').insert({
    minute_id: params.id,
    action_type,
    acted_by: user.id,
    notes: notes || '',
  });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  if (action_type === 'accepted' || action_type === 'seconded') {
    await supabase.from('meeting_minutes').update({ status: action_type }).eq('id', params.id);
  }

  return NextResponse.json({ success: true });
}
