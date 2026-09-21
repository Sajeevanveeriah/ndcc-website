import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { MINUTE_BUCKET } from '@/lib/meeting-minute-files';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('minutes');
  if (!user) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  const { id } = await context.params;
  const client = createServerClient();
  const { data: minute, error } = await client.from('meeting_minutes')
    .select('status,attachment_path,attachment_name,attachment_type').eq('id', id).single();
  if (error || !minute?.attachment_path || (user.role === 'committee' && minute.status === 'draft')) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }
  const { data, error: downloadError } = await client.storage.from(MINUTE_BUCKET).download(minute.attachment_path);
  if (downloadError || !data) return NextResponse.json({ error: 'Document is temporarily unavailable. Please try again.' }, { status: 503 });
  return new Response(data, { headers: {
    'Content-Type': minute.attachment_type || 'application/octet-stream',
    'Content-Disposition': `attachment; filename="minutes.${minute.attachment_path.split('.').pop()}"; filename*=UTF-8''${encodeURIComponent(minute.attachment_name || 'minutes').replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16))}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  } });
}
