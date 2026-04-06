import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ success: false, error: 'Service not configured.' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const supabase = createServerClient();

  if (id) {
    const { data, error } = await supabase
      .from('news')
      .select('id,title,content,author,image_url,published,published_at,created_at')
      .eq('id', id)
      .maybeSingle();

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ success: false, error: 'Article not found.' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  }

  const { data, error } = await supabase
    .from('news')
    .select('id,title,content,author,image_url,published,published_at,created_at')
    .eq('published', true)
    .order('published_at', { ascending: false });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: data ?? [] });
}
