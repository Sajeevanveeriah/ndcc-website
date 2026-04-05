import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = searchParams.get('page');
  const keys = searchParams.get('keys');

  const supabase = createServerClient();
  let query = supabase.from('content_blocks').select('*').eq('is_active', true).order('page_slug');
  if (page) query = query.eq('page_slug', page);
  if (keys) query = query.in('block_key', keys.split(',').map((k) => k.trim()).filter(Boolean));

  const { data, error } = await query;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: data ?? [] });
}
