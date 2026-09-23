import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/auth/guard';
import { GALLERY_MEDIA_BUCKET, GALLERY_ALLOWED_MIME_TYPES, isPathWithinAlbum, isUuid } from '@/lib/gallery/shared';
import { sanitiseGalleryImage } from '@/lib/server/gallery-sanitise';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Called once per uploaded file, before finalisation, so originals in the
// public gallery bucket never keep camera metadata such as GPS location.
export async function POST(request: Request) {
  const user = await requirePermission('gallery');
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const raw = await request.json().catch(() => null) as { albumId?: unknown; path?: unknown; mimeType?: unknown } | null;
  const albumId = raw?.albumId;
  const path = typeof raw?.path === 'string' ? raw.path : '';
  const mimeType = typeof raw?.mimeType === 'string' ? raw.mimeType : '';
  if (!isUuid(albumId) || !isPathWithinAlbum(path, albumId) || !(mimeType in GALLERY_ALLOWED_MIME_TYPES)) {
    return NextResponse.json({ success: false, error: 'A valid album, path and image type are required.' }, { status: 400 });
  }

  const supabase = createServerClient();
  const bucket = supabase.storage.from(GALLERY_MEDIA_BUCKET);
  const { data: blob, error: downloadError } = await bucket.download(path);
  if (downloadError || !blob) {
    return NextResponse.json({ success: false, error: 'Uploaded file was not found in Storage. Retry the upload.' }, { status: 404 });
  }

  let clean: Buffer;
  try {
    clean = await sanitiseGalleryImage(Buffer.from(await blob.arrayBuffer()), mimeType);
  } catch (error) {
    console.error('[gallery-sanitise] rejected upload', { path, reason: error instanceof Error ? error.message : 'unknown' });
    await bucket.remove([path]).catch(() => undefined);
    return NextResponse.json({ success: false, error: 'This file could not be processed as an image. Check the file and upload it again.' }, { status: 422 });
  }

  const { error: uploadError } = await bucket.upload(path, clean, { contentType: mimeType, upsert: true, cacheControl: '31536000' });
  if (uploadError) {
    console.error('[gallery-sanitise] re-upload failed', { path, message: uploadError.message });
    return NextResponse.json({ success: false, error: 'The cleaned image could not be saved. Retry the upload.' }, { status: 502 });
  }

  return NextResponse.json({ success: true, sizeBytes: clean.length });
}
