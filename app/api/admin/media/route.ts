import { NextResponse } from 'next/server';
import { requireAnyPermission, requirePermission } from '@/lib/auth/guard';
import { MEDIA_UPLOAD_PERMISSIONS } from '@/lib/auth/permissions';
import { createServerClient } from '@/lib/supabase-server';
import { MEDIA_BUCKET } from '@/lib/server/cms-media';
import { findMediaReferences, getMediaAsset, listMediaAssets } from '@/lib/server/media-library';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: noStore });
const unavailable = () => reply({ success: false, error: 'The media library is temporarily unavailable. Please retry.' }, 503);
const notMigrated = () => reply({ success: false, error: 'The media library needs the latest database update before it can be used.' }, 503);

/** Browse/search the library. Any editor who can upload media can pick from it. */
export async function GET(request: Request) {
  const user = await requireAnyPermission(MEDIA_UPLOAD_PERMISSIONS);
  if (!user) return reply({ success: false, error: 'Forbidden.' }, 403);
  const params = new URL(request.url).searchParams;
  const kindParam = params.get('kind');
  const kind = kindParam === 'image' || kindParam === 'pdf' ? kindParam : 'all';
  try {
    const result = await listMediaAssets(createServerClient({ actorId: user.id }), {
      search: params.get('q') || '',
      kind,
      limit: Number(params.get('limit')) || 48,
      offset: Number(params.get('offset')) || 0,
    });
    if (!result.ok) return result.missingTable ? reply({ success: true, data: [], total: 0, available: false }) : unavailable();
    return reply({ success: true, data: result.assets, total: result.total, available: true });
  } catch {
    return unavailable();
  }
}

/** Edit alt text (and the optional usage note). */
export async function PATCH(request: Request) {
  const user = await requireAnyPermission(MEDIA_UPLOAD_PERMISSIONS);
  if (!user) return reply({ success: false, error: 'Forbidden.' }, 403);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!UUID.test(id)) return reply({ success: false, error: 'Choose a library file to update.' }, 400);
  const update: Record<string, string | null> = {};
  if ('alt_text' in (body || {})) {
    if (typeof body?.alt_text !== 'string' || body.alt_text.length > 300) return reply({ success: false, error: 'Alt text must be 300 characters or fewer.' }, 400);
    update.alt_text = body.alt_text.trim();
  }
  if ('usage_hint' in (body || {})) {
    if (body?.usage_hint !== null && (typeof body?.usage_hint !== 'string' || body.usage_hint.length > 80)) return reply({ success: false, error: 'Usage note must be 80 characters or fewer.' }, 400);
    update.usage_hint = typeof body?.usage_hint === 'string' ? body.usage_hint.trim() || null : null;
  }
  if (!Object.keys(update).length) return reply({ success: false, error: 'Nothing to update.' }, 400);
  try {
    const { data, error } = await createServerClient({ actorId: user.id }).from('media_assets').update(update).eq('id', id).select('id,alt_text,usage_hint').maybeSingle();
    if (error) return unavailable();
    if (!data) return reply({ success: false, error: 'File not found.' }, 404);
    return reply({ success: true, data });
  } catch {
    return unavailable();
  }
}

/**
 * Delete a library file only when no known CMS column references it. A
 * failed or incomplete reference check always refuses the delete.
 */
export async function DELETE(request: Request) {
  const user = await requirePermission('content');
  if (!user) return reply({ success: false, error: 'Forbidden.' }, 403);
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!UUID.test(id)) return reply({ success: false, error: 'Choose a library file to delete.' }, 400);
  try {
    const client = createServerClient({ actorId: user.id });
    const found = await getMediaAsset(client, id);
    if (!found.ok) return found.missingTable ? notMigrated() : unavailable();
    if (!found.asset) return reply({ success: false, error: 'File not found.' }, 404);
    if (found.asset.bucket !== MEDIA_BUCKET) return reply({ success: false, error: 'Only CMS uploads can be deleted here.' }, 409);
    const report = await findMediaReferences(client, found.asset.path);
    if (report.status === 'referenced') {
      return reply({ success: false, error: `This file is still used (${report.references.map((ref) => `${ref.label}: ${ref.count}`).join(', ')}). Remove it from those places first.`, references: report.references }, 409);
    }
    if (report.status === 'unknown') return reply({ success: false, error: `${report.reason} The file was kept.` }, 503);
    const removed = await client.storage.from(MEDIA_BUCKET).remove([found.asset.path]);
    if (removed.error) return unavailable();
    const { error } = await client.from('media_assets').delete().eq('id', id);
    if (error) return unavailable();
    console.info(JSON.stringify({ event: 'cms_media_deleted', actor: user.id }));
    return reply({ success: true, data: { id } });
  } catch {
    return unavailable();
  }
}
