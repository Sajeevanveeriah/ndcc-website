import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/auth/guard';
import {
  GALLERY_MEDIA_BUCKET,
  MAX_GALLERY_BATCH_FILES,
  isPathWithinAlbum,
  isUuid,
} from '@/lib/gallery/shared';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await requirePermission('gallery');
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const raw = await request.json().catch(() => null);
  if (!raw || typeof raw !== 'object') return NextResponse.json({ success: false, error: 'Invalid request body.' }, { status: 400 });
  const { albumId, orphanPaths, imageIds, confirmCount } = raw as {
    albumId?: unknown; orphanPaths?: unknown; imageIds?: unknown; confirmCount?: unknown;
  };

  const supabase = createServerClient();

  if (Array.isArray(orphanPaths)) {
    if (!isUuid(albumId)) return NextResponse.json({ success: false, error: 'A valid album id is required.' }, { status: 400 });
    if (orphanPaths.length === 0 || orphanPaths.length > MAX_GALLERY_BATCH_FILES) {
      return NextResponse.json({ success: false, error: `orphanPaths must contain between 1 and ${MAX_GALLERY_BATCH_FILES} paths.` }, { status: 400 });
    }
    const { data: album } = await supabase.from('gallery_albums').select('id').eq('id', albumId).single();
    if (!album) return NextResponse.json({ success: false, error: 'Album not found.' }, { status: 404 });

    const invalid = (orphanPaths as unknown[]).filter((p) => !isPathWithinAlbum(p, albumId));
    if (invalid.length > 0) {
      return NextResponse.json({ success: false, error: 'One or more paths are outside this album\'s storage prefix.' }, { status: 400 });
    }
    const paths = orphanPaths as string[];

    const { data: referenced, error: refError } = await supabase
      .from('gallery_images').select('storage_path').in('storage_path', paths);
    if (refError) return NextResponse.json({ success: false, error: refError.message }, { status: 500 });
    const referencedSet = new Set((referenced ?? []).map((r) => r.storage_path));
    const deletable = paths.filter((p) => !referencedSet.has(p));
    const skipped = paths.filter((p) => referencedSet.has(p));

    let removed: string[] = [];
    if (deletable.length > 0) {
      const { data: removedObjects, error: removeError } = await supabase.storage
        .from(GALLERY_MEDIA_BUCKET).remove(deletable);
      if (removeError) return NextResponse.json({ success: false, error: removeError.message }, { status: 502 });
      removed = (removedObjects ?? []).map((o) => o.name);
    }
    return NextResponse.json({ success: true, removed, skipped });
  }

  if (Array.isArray(imageIds)) {
    if (imageIds.length === 0 || imageIds.length > MAX_GALLERY_BATCH_FILES) {
      return NextResponse.json({ success: false, error: `imageIds must contain between 1 and ${MAX_GALLERY_BATCH_FILES} ids.` }, { status: 400 });
    }
    if (!imageIds.every((id) => isUuid(id))) {
      return NextResponse.json({ success: false, error: 'imageIds must be valid ids.' }, { status: 400 });
    }
    if (confirmCount !== imageIds.length) {
      return NextResponse.json({
        success: false,
        error: `Permanent deletion requires confirmCount to equal the number of selected images (${imageIds.length}).`,
      }, { status: 400 });
    }

    const { data: rows, error: rowsError } = await supabase
      .from('gallery_images').select('id, storage_path').in('id', imageIds as string[]);
    if (rowsError) return NextResponse.json({ success: false, error: rowsError.message }, { status: 500 });
    if (!rows || rows.length === 0) return NextResponse.json({ success: false, error: 'No matching images found.' }, { status: 404 });

    const { error: deleteError } = await supabase
      .from('gallery_images').delete().in('id', rows.map((r) => r.id));
    if (deleteError) return NextResponse.json({ success: false, error: deleteError.message }, { status: 500 });

    const paths = rows.map((r) => r.storage_path).filter((p): p is string => Boolean(p));
    let removed: string[] = [];
    if (paths.length > 0) {
      const { data: stillReferenced } = await supabase
        .from('gallery_images').select('storage_path').in('storage_path', paths);
      const keep = new Set((stillReferenced ?? []).map((r) => r.storage_path));
      const deletable = paths.filter((p) => !keep.has(p));
      if (deletable.length > 0) {
        const { data: removedObjects, error: removeError } = await supabase.storage
          .from(GALLERY_MEDIA_BUCKET).remove(deletable);
        if (removeError) {
          return NextResponse.json({
            success: true,
            deletedRows: rows.length,
            removed: [],
            warning: `Image records were deleted but Storage cleanup failed: ${removeError.message}`,
          });
        }
        removed = (removedObjects ?? []).map((o) => o.name);
      }
    }
    try { revalidatePath('/gallery'); } catch { /* best-effort */ }
    return NextResponse.json({ success: true, deletedRows: rows.length, removed });
  }

  return NextResponse.json({ success: false, error: 'Provide either orphanPaths with albumId, or imageIds with confirmCount.' }, { status: 400 });
}
