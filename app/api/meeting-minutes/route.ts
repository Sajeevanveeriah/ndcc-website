import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/auth/guard';
import { readLimitedJsonObject } from '@/lib/order-input-validation';

export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MINUTE_STATUSES = new Set(['draft', 'published', 'accepted', 'seconded']);

function parseMinutePayload(body: Record<string, unknown>) {
  if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 200
    || typeof body.meeting_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.meeting_date)
    || typeof body.content !== 'string' || !body.content.trim() || body.content.length > 50_000
    || typeof body.status !== 'string' || !MINUTE_STATUSES.has(body.status)) {
    return null;
  }
  const parsedDate = new Date(`${body.meeting_date}T00:00:00Z`);
  if (Number.isNaN(parsedDate.getTime())
    || parsedDate.toISOString().slice(0, 10) !== body.meeting_date) return null;
  return {
    title: body.title.trim(),
    meeting_date: body.meeting_date,
    content: body.content.trim(),
    status: body.status,
  };
}

export async function GET() {
  const user = await requirePermission('minutes');
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const supabase = createServerClient();
  const query = supabase.from('meeting_minutes').select('*').order('meeting_date', { ascending: false });
  const { data, error } = user.role === 'committee' ? await query.neq('status', 'draft') : await query;

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, minutes: data || [] });
}

export async function POST(request: Request) {
  const user = await requirePermission('minutes', ['admin', 'president', 'secretary']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const rawBody = await readLimitedJsonObject(request, 64 * 1024);
  if (!rawBody.ok) {
    return NextResponse.json(
      { success: false, error: rawBody.error },
      { status: rawBody.error === 'Request body is too large.' ? 413 : 400 },
    );
  }
  const payload = parseMinutePayload(rawBody.value);
  if (!payload) {
    return NextResponse.json({ success: false, error: 'Meeting minute details are invalid.' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase.from('meeting_minutes').insert({
    ...payload,
    created_by: user.id,
    updated_by: user.id,
  }).select().single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, minute: data });
}

export async function PATCH(request: Request) {
  const user = await requirePermission('minutes', ['admin', 'president', 'secretary']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const rawBody = await readLimitedJsonObject(request, 64 * 1024);
  if (!rawBody.ok) {
    return NextResponse.json(
      { success: false, error: rawBody.error },
      { status: rawBody.error === 'Request body is too large.' ? 413 : 400 },
    );
  }
  const id = rawBody.value.id;
  const payload = parseMinutePayload(rawBody.value);
  if (typeof id !== 'string' || !UUID_PATTERN.test(id) || !payload) {
    return NextResponse.json({ success: false, error: 'Meeting minute details are invalid.' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('meeting_minutes')
    .update({ ...payload, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, minute: data });
}
