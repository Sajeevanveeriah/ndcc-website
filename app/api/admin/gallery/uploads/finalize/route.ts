import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';
import { requireSession } from '@/lib/auth/guard';
import { GALLERY_ADMIN_ROLES } from '@/lib/gallery/roles';
import {
  GALLERY_MEDIA_BUCKET,
  MAX_GALLERY_BATCH_FILES,
  galleryFallbackAltText,
  isPathWithinAlbum,
  isUuid,
  validateGalleryFileMeta,
  type GalleryUploadFileMeta,
} from '@/lib/gallery/shared';

export const dynamic = 'force-dynamic';

type FinalizeEntry = GalleryUploadFileMeta & {
  path?: unknown;
  title?: unknown;
  caption?: unknown;
  altText?: unknown;
};

type FinalizeDefaults = {
  caption?: unknown;
  altPrefix?: unknown;
  allowDownload?: unknown;
  publishImages?: unknown;
};

function optionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

/**
 * Receives metadata for objects the browser has ALREADY uploaded to Storage
 * with signed tokens, verifies each object really exists inside the album's
 * bucket prefix, and inserts gallery_images rows in one bounded batch.
 * Storage object creation and the database insert are NOT one distributed
 * transaction: on database failure the objects stay in the bucket, the album
 * stays draft, and finalisation can be retried (already-inserted paths are
 * skipped as duplicates, so retries are idempotent).
 */
export async function POST(request: Request) {
  const user = await requireSession(GALLERY_ADMIN_ROLES);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const raw = await request.json().catch(() => null);
  if (!raw || typeof raw !== 'object') return NextResponse.json({ success: false, error: 'Invalid request body.' }, { status: 400 });
  const { albumId, entries, defaults = {}, totalCount } = raw as {
    albumId?: unknown; entries?: unknown; defaults?: FinalizeDefaults; totalCount?: unknown;
  };

  if (!isUuid(albumId)) return NextResponse.json({ success: false, error: 'A valid album id is required.' }, { status: 400 });
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > MAX_GALLERY_BATCH_FILES) {
    return NextResponse.json({ success: false, error: `entries must contain between 1 and ${MAX_GALLERY_BATCH_FILES} items.` }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: album, error: albumError } = await supabase
    .from('gallery_albums').select('id, slug, title, allow_download').eq('id', albumId).single();
  if (albumError || !album) return NextResponse.json({ success: false, error: 'Album not found.' }, { status: 404 });

  // Revalidate every declared entry: path inside this album's prefix, MIME
  // and size within policy. Nothing from the browser is trusted as-is.
  const rejected: Array<{ path: string; reason: string }> = [];
  const candidates: Array<FinalizeEntry & { path: string }> = [];
  const seenPaths = new Set<string>();
  for (const entry of entries as FinalizeEntry[]) {
    const path = typeof entry.path === 'string' ? entry.path : '';
    if (!isPathWithinAlbum(path, albumId)) {
      rejected.push({ path: path.slice(0, 300), reason: 'Path is outside this album\'s storage prefix.' });
      continue;
    }
    if (seenPaths.has(path)) {
      rejected.push({ path, reason: 'Duplicate path in request.' });
      continue;
    }
    seenPaths.add(path);
    const metaError = validateGalleryFileMeta(entry);
    if (metaError) {
      rejected.push({ path, reason: metaError });
      continue;
    }
    candidates.push({ ...entry, path });
  }

  if (candidates.length === 0) {
    return NextResponse.json({ success: false, error: 'No valid entries to finalise.', rejected }, { status: 400 });
  }

  // Skip paths that were already finalised (retry idempotency).
  const { data: existingRows, error: existingError } = await supabase
    .from('gallery_images')
    .select('storage_path, content_hash')
    .eq('album_id', albumId);
  if (existingError) return NextResponse.json({ success: false, error: existingError.message }, { status: 500 });
  const existingPaths = new Set((existingRows ?? []).map((r) => r.storage_path).filter(Boolean));
  const existingHashes = new Set((existingRows ?? []).map((r) => r.content_hash).filter(Boolean));

  const duplicates: string[] = [];
  const failed: Array<{ path: string; reason: string }> = [];
  const toInsert: Array<Record<string, unknown>> = [];
  const publishImages = defaults.publishImages === true;
  const allowDownload = typeof defaults.allowDownload === 'boolean' ? defaults.allowDownload : album.allow_download;
  const defaultCaption = optionalText(defaults.caption, 300) ?? '';
  const altPrefix = optionalText(defaults.altPrefix, 200);
  const existingCount = existingRows?.length ?? 0;
  const declaredTotal = Number.isInteger(totalCount) && (totalCount as number) > 0
    ? (totalCount as number)
    : existingCount + candidates.length;

  let position = existingCount;
  for (const entry of candidates) {
    if (existingPaths.has(entry.path)) {
      duplicates.push(entry.path);
      continue;
    }
    const hash = typeof entry.contentHash === 'string' ? entry.contentHash : null;
    if (hash && existingHashes.has(hash)) {
      duplicates.push(entry.path);
      continue;
    }

    // The object must genuinely exist in Storage before a row is inserted.
    // createSignedUrl fails with "Object not found" for missing paths.
    const { error: existsError } = await supabase.storage
      .from(GALLERY_MEDIA_BUCKET)
      .createSignedUrl(entry.path, 60);
    if (existsError) {
      failed.push({ path: entry.path, reason: 'Object was not found in Storage. Retry the upload for this file.' });
      continue;
    }

    position += 1;
    const { data: urlData } = supabase.storage.from(GALLERY_MEDIA_BUCKET).getPublicUrl(entry.path);
    const publicUrl = urlData.publicUrl;
    const fallbackAlt = altPrefix
      ? `${altPrefix} ${position} of ${declaredTotal}`
      : galleryFallbackAltText(album.title, position, declaredTotal);

    toInsert.push({
      title: optionalText(entry.title, 200) ?? album.title,
      caption: optionalText(entry.caption, 300) ?? defaultCaption,
      image_url: publicUrl,
      original_url: publicUrl,
      // Raw filenames are kept for downloads but never used as public alt text.
      alt_text: optionalText(entry.altText, 300) ?? fallbackAlt,
      sort_order: (existingCount + toInsert.length + 1) * 10,
      allow_download: allowDownload,
      published: publishImages,
      album_id: albumId,
      storage_path: entry.path,
      original_filename: (entry.filename as string).slice(0, 200),
      mime_type: entry.mimeType as string,
      file_size_bytes: entry.sizeBytes as number,
      width: typeof entry.width === 'number' ? entry.width : null,
      height: typeof entry.height === 'number' ? entry.height : null,
      content_hash: hash,
      uploaded_at: new Date().toISOString(),
    });
    if (hash) existingHashes.add(hash);
  }

  let inserted: number = 0;
  if (toInsert.length > 0) {
    const { data: insertedRows, error: insertError } = await supabase
      .from('gallery_images')
      .insert(toInsert)
      .select('id');
    if (insertError) {
      return NextResponse.json({
        success: false,
        error: `Database insert failed: ${insertError.message}. The uploaded files are intact in Storage — retry finalisation, or run cleanup for orphaned paths.`,
        rejected,
        duplicates,
        failed: failed.concat(toInsert.map((row) => ({ path: String(row.storage_path), reason: 'Insert failed; retry finalisation.' }))),
      }, { status: 500 });
    }
    inserted = insertedRows?.length ?? 0;
  }

  // The ALBUM's published flag is never touched here: publishing is an
  // explicit separate action with its own confirmation, and never automatic
  // while any file in the batch has failed.
  try { revalidatePath('/gallery'); } catch { /* best-effort */ }
  try { revalidatePath(`/gallery/${album.slug}`); } catch { /* best-effort */ }

  return NextResponse.json({
    success: true,
    inserted,
    duplicates,
    rejected,
    failed,
    albumSlug: album.slug,
  });
}
