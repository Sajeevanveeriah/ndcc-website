import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { normalisePublicText } from '@/lib/utils';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keys = searchParams.getAll('key').filter(Boolean);

  if (keys.length === 0) {
    return NextResponse.json({ success: true, data: {} });
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('content_blocks')
      .select('block_key,title,body,image_url,cta_label,cta_url')
      .eq('is_active', true)
      .in('block_key', keys);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const mapped = Object.fromEntries((data ?? []).map((row) => [row.block_key, {
      ...row,
      title: normalisePublicText(row.title),
      body: normalisePublicText(row.body),
      cta_label: normalisePublicText(row.cta_label),
    }]));
    return NextResponse.json({ success: true, data: mapped });
  } catch {
    return NextResponse.json({ success: true, data: {} });
  }
}
