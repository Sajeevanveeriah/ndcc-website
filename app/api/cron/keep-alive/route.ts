import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

function jsonNoCache(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_CACHE_HEADERS,
      ...(init?.headers || {}),
    },
  });
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return jsonNoCache({ success: false, error: 'Unauthorized.' }, { status: 401 });
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonNoCache({ success: false, error: 'Service not configured.' }, { status: 503 });
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('content_blocks')
      .select('block_key')
      .limit(1);

    if (error) {
      return jsonNoCache({ success: false, error: error.message }, { status: 500 });
    }

    return jsonNoCache({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonNoCache(
      { success: false, error: error instanceof Error ? error.message : 'Unexpected error.' },
      { status: 500 },
    );
  }
}
