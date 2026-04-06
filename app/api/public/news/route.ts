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
  const columnsWithImage = 'id,title,content,author,image_url,published,published_at,created_at';
  const columnsWithoutImage = 'id,title,content,author,published,published_at,created_at';

  if (id) {
    const initial = await supabase
      .from('news')
      .select(columnsWithImage)
      .eq('id', id)
      .eq('published', true)
      .maybeSingle();
    let data: Record<string, unknown> | null = initial.data as Record<string, unknown> | null;
    let error = initial.error;
    if (error?.message.includes("Could not find the 'image_url' column")) {
      const fallback = await supabase
        .from('news')
        .select(columnsWithoutImage)
        .eq('id', id)
        .eq('published', true)
        .maybeSingle();
      data = fallback.data;
      error = fallback.error;
    }

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ success: false, error: 'Article not found.' }, { status: 404 });
    return NextResponse.json({ success: true, data });
  }

  const initial = await supabase
    .from('news')
    .select(columnsWithImage)
    .eq('published', true)
    .order('published_at', { ascending: false })
    .order('created_at', { ascending: false });
  let data: Array<Record<string, unknown>> | null = initial.data as Array<Record<string, unknown>> | null;
  let error = initial.error;
  if (error?.message.includes("Could not find the 'image_url' column")) {
    const fallback = await supabase
      .from('news')
      .select(columnsWithoutImage)
      .eq('published', true)
      .order('published_at', { ascending: false })
      .order('created_at', { ascending: false });
    data = fallback.data;
    error = fallback.error;
  }

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: data ?? [] });
}
