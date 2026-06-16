import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requireSession } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireSession(['admin', 'president', 'secretary', 'committee']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const supabase = createServerClient();
  const query = supabase.from('meeting_minutes').select('*').order('meeting_date', { ascending: false });
  const { data, error } = user.role === 'committee' ? await query.neq('status', 'draft') : await query;

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, minutes: data || [] });
}

export async function POST(request: Request) {
  const user = await requireSession(['admin', 'president', 'secretary']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const { title, meeting_date, content, status } = await request.json();
  if (!title || !meeting_date || !content) return NextResponse.json({ success: false, error: 'title, meeting_date, and content are required.' }, { status: 400 });

  const supabase = createServerClient();
  const { data, error } = await supabase.from('meeting_minutes').insert({
    title,
    meeting_date,
    content,
    status: status || 'draft',
    created_by: user.id,
    updated_by: user.id,
  }).select().single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, minute: data });
}

export async function PATCH(request: Request) {
  const user = await requireSession(['admin', 'president', 'secretary']);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const { id, ...payload } = await request.json();
  if (!id) return NextResponse.json({ success: false, error: 'id is required.' }, { status: 400 });

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
