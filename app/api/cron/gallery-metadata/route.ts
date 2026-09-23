import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { GALLERY_MEDIA_BUCKET, GALLERY_ALLOWED_MIME_TYPES } from '@/lib/gallery/shared';
import { sanitiseGalleryImage } from '@/lib/server/gallery-sanitise';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

const BATCH_SIZE = 25;
const TIME_BUDGET_MS = 45_000;

// Backfill: strips camera metadata from gallery originals uploaded before the
// upload flow cleaned files itself. Idempotent; each run handles a batch.
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ success: false, error: 'Service not configured.' }, { status: 503 });
  }

  const started = Date.now();
  const supabase = createServerClient();
  const { data: rows, error } = await supabase
    .from('gallery_images')
    .select('id, storage_path, mime_type')
    .is('metadata_stripped_at', null)
    .not('storage_path', 'is', null)
    .order('uploaded_at', { ascending: true })
    .limit(BATCH_SIZE);
  if (error) {
    console.error('[cron/gallery-metadata] query failed', error.message);
    return NextResponse.json({ success: false, error: 'Gallery query failed.' }, { status: 500 });
  }

  const bucket = supabase.storage.from(GALLERY_MEDIA_BUCKET);
  let cleaned = 0;
  const failed: string[] = [];
  for (const row of rows ?? []) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const path = row.storage_path as string;
    const mimeType = typeof row.mime_type === 'string' && row.mime_type in GALLERY_ALLOWED_MIME_TYPES
      ? row.mime_type
      : path.toLowerCase().endsWith('.png') ? 'image/png' : path.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    try {
      const { data: blob, error: downloadError } = await bucket.download(path);
      if (downloadError || !blob) throw new Error('download failed');
      const clean = await sanitiseGalleryImage(Buffer.from(await blob.arrayBuffer()), mimeType);
      const { error: uploadError } = await bucket.upload(path, clean, { contentType: mimeType, upsert: true, cacheControl: '31536000' });
      if (uploadError) throw new Error('upload failed');
      const { error: stampError } = await supabase
        .from('gallery_images')
        .update({ metadata_stripped_at: new Date().toISOString(), file_size_bytes: clean.length })
        .eq('id', row.id);
      if (stampError) throw new Error('stamp failed');
      cleaned += 1;
    } catch (cause) {
      failed.push(row.id as string);
      console.error('[cron/gallery-metadata] image failed', { id: row.id, reason: cause instanceof Error ? cause.message : 'unknown' });
    }
  }

  return NextResponse.json({ success: failed.length === 0, cleaned, failed: failed.length, remaining: Math.max(0, (rows?.length ?? 0) - cleaned) });
}
