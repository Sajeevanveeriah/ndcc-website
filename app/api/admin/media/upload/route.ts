import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/guard';
import { hasPermission, MEDIA_UPLOAD_PERMISSIONS } from '@/lib/auth/permissions';
import { createServerClient } from '@/lib/supabase-server';
import { enforceRateLimit } from '@/lib/server/request-guards';
import { MEDIA_BUCKET, STAGING_BUCKET, MEDIA_TYPES, mediaLimit, signUploadTicket, verifyUploadTicket, validateMedia } from '@/lib/server/cms-media';

export const dynamic = 'force-dynamic';
// Session validation, rate limiting and three bounded storage calls run in
// sequence. Keep the host deadline above their combined cold-start budget.
export const maxDuration = 120;

export async function POST(request: Request) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });
  if (!MEDIA_UPLOAD_PERMISSIONS.some((permission) => hasPermission(user, permission))) {
    return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });
  }
  if (!await enforceRateLimit(`cms-media:${user.id}`, 100, 60_000)) {
    return NextResponse.json({ success: false, error: 'Uploads are temporarily limited. Please wait and try again.' }, { status: 429 });
  }
  try {
    const client = createServerClient({ fetchTimeoutMs: 12_000 });
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const body = await request.json().catch(() => null);
    if (body?.action === 'prepare') {
      if (!MEDIA_TYPES.has(body.type) || !Number.isInteger(body.size) || body.size <= 0 || body.size > mediaLimit(body.type)) {
        return NextResponse.json({ success: false, error: 'Use JPEG, PNG, WebP or GIF up to 4 MB, or a PDF up to 10 MB.' }, { status: 400 });
      }
      const path = `${user.id}/${randomUUID()}`;
      const { data, error } = await client.storage.from(STAGING_BUCKET).createSignedUploadUrl(path);
      if (error || !data) throw new Error('prepare_failed');
      const ticket = signUploadTicket({ path, owner: user.id, type: body.type, size: body.size, expires: Date.now() + 15 * 60_000 }, secret);
      return NextResponse.json({ success: true, bucket: STAGING_BUCKET, path, token: data.token, ticket });
    }
    if (body?.action !== 'finalise') return NextResponse.json({ success: false, error: 'Refresh this page before uploading.' }, { status: 400 });
    const ticket = verifyUploadTicket(body.ticket, user.id, secret);
    if (!ticket) return NextResponse.json({ success: false, error: 'Upload permission expired. Please upload the file again.' }, { status: 400 });
    const { data, error } = await client.storage.from(STAGING_BUCKET).download(ticket.path);
    if (error || !data) throw new Error('download_failed');
    if (data.size !== ticket.size) return NextResponse.json({ success: false, error: 'The uploaded file size does not match. Please try again.' }, { status: 400 });
    let media;
    try { media = await validateMedia(Buffer.from(await data.arrayBuffer()), ticket.type); }
    catch {
      await client.storage.from(STAGING_BUCKET).remove([ticket.path]);
      return NextResponse.json({ success: false, error: 'The file could not be validated. Export it again and retry.' }, { status: 400 });
    }
    const saved = await client.storage.from(MEDIA_BUCKET).upload(media.path, media.content, {
      contentType: media.contentType, cacheControl: '31536000', upsert: false,
    });
    // Content hashes are immutable: an existing object can safely be reused.
    if (saved.error && !['409', 'Duplicate'].includes(String(saved.error.statusCode)) && !/already exists/i.test(saved.error.message)) throw new Error('publish_failed');
    await client.storage.from(STAGING_BUCKET).remove([ticket.path]);
    const { data: published } = client.storage.from(MEDIA_BUCKET).getPublicUrl(media.path);
    console.info(JSON.stringify({ event: 'cms_media_published', bytes: media.content.length, type: media.contentType }));
    return NextResponse.json({ success: true, path: published.publicUrl });
  } catch {
    console.error(JSON.stringify({ event: 'cms_media_upload_failed' }));
    return NextResponse.json({ success: false, error: 'Media storage is temporarily unavailable. Please try again.' }, { status: 503 });
  }
}
