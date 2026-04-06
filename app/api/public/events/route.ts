import { NextResponse } from 'next/server';
import { createPublicServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ success: false, error: 'Service not configured.' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const supabase = createPublicServerClient();

  if (id) {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .eq('published', true)
      .maybeSingle();

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ success: false, error: 'Event not found.' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  }

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('published', true)
    .order('date', { ascending: true });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: data ?? [] });
}
