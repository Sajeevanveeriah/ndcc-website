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
//
// The queue is ordered by updated_at (oldest first), and a row that fails is
// "touched" (updated_at only) so it moves to the back of the queue. Without
// that, permanently failing files (missing or corrupt originals) would be
// re-selected first every run and 25 of them would stall the backfill. A
// touch never fakes metadata_stripped_at, creates no revision history (the
// revision trigger ignores updated_at-only changes) and the row is retried
// after every other pending row has had its turn.
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
    .order('updated_at', { ascending: true })
    .order('id', { ascending: true })
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
      await deprioritise(supabase, row.id as string);
    }
  }

  return NextResponse.json({ success: failed.length === 0, cleaned, failed: failed.length, remaining: Math.max(0, (rows?.length ?? 0) - cleaned) });
}

// Move a failed row to the back of the queue. Best effort: if the touch itself
// fails the row is simply retried first next run, as before.
async function deprioritise(supabase: ReturnType<typeof createServerClient>, id: string) {
  try {
    const { error } = await supabase
      .from('gallery_images')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id)
      .is('metadata_stripped_at', null);
    if (error) console.error('[cron/gallery-metadata] deprioritise failed', { id, code: error.code || 'unknown' });
  } catch {
    console.error('[cron/gallery-metadata] deprioritise failed', { id });
  }
}
