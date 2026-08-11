import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/auth/guard';
import {
  GALLERY_MEDIA_BUCKET,
  buildGalleryStoragePath,
  isUuid,
  validateGalleryBatch,
  type GalleryUploadFileMeta,
} from '@/lib/gallery/shared';

export const dynamic = 'force-dynamic';

const SIGNED_UPLOAD_TTL_SECONDS = 2 * 60 * 60;

export async function POST(request: Request) {
  const user = await requirePermission('gallery');
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const raw = await request.json().catch(() => null);
  if (!raw || typeof raw !== 'object') return NextResponse.json({ success: false, error: 'Invalid request body.' }, { status: 400 });
  const { albumId, files } = raw as { albumId?: unknown; files?: unknown };

  if (!isUuid(albumId)) return NextResponse.json({ success: false, error: 'A valid album id is required.' }, { status: 400 });
  const batchError = validateGalleryBatch(files as GalleryUploadFileMeta[]);
  if (batchError) return NextResponse.json({ success: false, error: batchError }, { status: 400 });

  const supabase = createServerClient();
  const { data: album, error: albumError } = await supabase
    .from('gallery_albums').select('id').eq('id', albumId).single();
  if (albumError || !album) return NextResponse.json({ success: false, error: 'Album not found.' }, { status: 404 });

  const year = new Date().getUTCFullYear();
  const entries = [];
  for (const file of files as GalleryUploadFileMeta[]) {
    const path = buildGalleryStoragePath(albumId, year, randomUUID(), file.filename as string, file.mimeType as string);
    const { data: signed, error: signError } = await supabase.storage
      .from(GALLERY_MEDIA_BUCKET)
      .createSignedUploadUrl(path);
    if (signError || !signed) {
      return NextResponse.json({
        success: false,
        error: `Could not prepare an upload slot for ${String(file.filename)}: ${signError?.message ?? 'unknown storage error'}`,
        entries,
      }, { status: 502 });
    }
    entries.push({
      clientId: typeof file.clientId === 'string' ? file.clientId.slice(0, 100) : null,
      bucket: GALLERY_MEDIA_BUCKET,
      path: signed.path,
      token: signed.token,
      expiresAt: new Date(Date.now() + SIGNED_UPLOAD_TTL_SECONDS * 1000).toISOString(),
    });
  }

  return NextResponse.json({ success: true, bucket: GALLERY_MEDIA_BUCKET, entries });
}
