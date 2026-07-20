import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';
import { requireSession } from '@/lib/auth/guard';
import { GALLERY_ADMIN_ROLES } from '@/lib/gallery/roles';
import { isValidAlbumSlug, isUuid, MAX_ALBUM_SLUG_LENGTH } from '@/lib/gallery/shared';

export const dynamic = 'force-dynamic';

const ALBUM_WRITABLE_FIELDS = [
  'title', 'slug', 'description', 'event_date', 'season_label',
  'cover_image_url', 'sort_order', 'allow_download', 'published',
] as const;

function revalidateGallery(slug?: string | null) {
  try { revalidatePath('/gallery'); } catch { /* best-effort */ }
  try { revalidatePath('/'); } catch { /* best-effort */ }
  if (slug) {
    try { revalidatePath(`/gallery/${slug}`); } catch { /* best-effort */ }
  }
}

function validateAlbumPayload(payload: Record<string, unknown>, isCreate: boolean): string | null {
  if (isCreate || 'title' in payload) {
    if (typeof payload.title !== 'string' || !payload.title.trim()) return 'Title is required.';
    if (payload.title.length > 200) return 'Title is too long (max 200 characters).';
  }
  if (isCreate || 'slug' in payload) {
    if (!isValidAlbumSlug(payload.slug)) {
      return `Slug must be lowercase letters, numbers and single hyphens (max ${MAX_ALBUM_SLUG_LENGTH} characters).`;
    }
  }
  if ('description' in payload && payload.description != null && typeof payload.description !== 'string') {
    return 'Description must be text.';
  }
  if ('season_label' in payload && payload.season_label != null && typeof payload.season_label !== 'string') {
    return 'Season label must be text.';
  }
  if ('event_date' in payload && payload.event_date != null && payload.event_date !== '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(payload.event_date))) return 'Event date must be YYYY-MM-DD.';
  }
  if ('cover_image_url' in payload && payload.cover_image_url != null && payload.cover_image_url !== '') {
    if (typeof payload.cover_image_url !== 'string' || !/^(https:\/\/|\/)/.test(payload.cover_image_url)) {
      return 'Cover image must be an https URL or a local path.';
    }
  }
  if ('sort_order' in payload && payload.sort_order !== undefined && !Number.isInteger(payload.sort_order)) {
    return 'Sort order must be a whole number.';
  }
  for (const field of ['allow_download', 'published'] as const) {
    if (field in payload && typeof payload[field] !== 'boolean') return `${field} must be true or false.`;
  }
  return null;
}

function sanitizeAlbumPayload(raw: Record<string, unknown>) {
  const payload: Record<string, unknown> = {};
  for (const field of ALBUM_WRITABLE_FIELDS) {
    if (!(field in raw)) continue;
    payload[field] = field === 'event_date' && raw[field] === '' ? null : raw[field];
  }
  return payload;
}

export async function GET() {
  const user = await requireSession(GALLERY_ADMIN_ROLES);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const supabase = createServerClient();
  const [{ data: albums, error }, { data: imageRows, error: countError }] = await Promise.all([
    supabase.from('gallery_albums').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false }),
    supabase.from('gallery_images').select('album_id').not('album_id', 'is', null),
  ]);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  if (countError) return NextResponse.json({ success: false, error: countError.message }, { status: 500 });

  const counts = new Map<string, number>();
  for (const row of imageRows ?? []) {
    if (row.album_id) counts.set(row.album_id, (counts.get(row.album_id) ?? 0) + 1);
  }
  const data = (albums ?? []).map((album) => ({ ...album, image_count: counts.get(album.id) ?? 0 }));
  return NextResponse.json({ success: true, data });
}

export async function POST(request: Request) {
  const user = await requireSession(GALLERY_ADMIN_ROLES);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const raw = await request.json().catch(() => null);
  if (!raw || typeof raw !== 'object') return NextResponse.json({ success: false, error: 'Invalid request body.' }, { status: 400 });
  const payload = sanitizeAlbumPayload(raw as Record<string, unknown>);
  const validationError = validateAlbumPayload(payload, true);
  if (validationError) return NextResponse.json({ success: false, error: validationError }, { status: 400 });

  // New albums always start as drafts; publishing is an explicit separate act
  // that carries the consent acknowledgement.
  payload.published = false;

  const supabase = createServerClient();
  const { data, error } = await supabase.from('gallery_albums').insert(payload).select().single();
  if (error) {
    if (/duplicate key|unique/i.test(error.message)) {
      return NextResponse.json({ success: false, error: 'An album with this slug already exists.' }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  revalidateGallery(data?.slug);
  return NextResponse.json({ success: true, data });
}

export async function PATCH(request: Request) {
  const user = await requireSession(GALLERY_ADMIN_ROLES);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const raw = await request.json().catch(() => null);
  if (!raw || typeof raw !== 'object') return NextResponse.json({ success: false, error: 'Invalid request body.' }, { status: 400 });
  const { id, confirmPublication, ...rest } = raw as Record<string, unknown>;
  if (!isUuid(id)) return NextResponse.json({ success: false, error: 'A valid album id is required.' }, { status: 400 });

  const payload = sanitizeAlbumPayload(rest);
  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ success: false, error: 'No writable fields provided.' }, { status: 400 });
  }
  const validationError = validateAlbumPayload(payload, false);
  if (validationError) return NextResponse.json({ success: false, error: validationError }, { status: 400 });

  const supabase = createServerClient();
  const { data: existing, error: fetchError } = await supabase
    .from('gallery_albums').select('id, slug, published').eq('id', id).single();
  if (fetchError || !existing) return NextResponse.json({ success: false, error: 'Album not found.' }, { status: 404 });

  // Publishing (false -> true) requires the explicit consent acknowledgement
  // and stamps the audit fields. Unpublishing keeps the historical audit.
  if (payload.published === true && existing.published !== true) {
    if (confirmPublication !== true) {
      return NextResponse.json({
        success: false,
        error: 'Publishing requires confirmation that the club has authority to publish these photographs and that any required consent has been obtained.',
      }, { status: 400 });
    }
    payload.publish_confirmed_at = new Date().toISOString();
    payload.publish_confirmed_by = user.email;
  }

  const { data, error } = await supabase.from('gallery_albums').update(payload).eq('id', id).select().single();
  if (error) {
    if (/duplicate key|unique/i.test(error.message)) {
      return NextResponse.json({ success: false, error: 'An album with this slug already exists.' }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  revalidateGallery(existing.slug);
  if (data?.slug && data.slug !== existing.slug) revalidateGallery(data.slug);
  return NextResponse.json({ success: true, data });
}

export async function DELETE(request: Request) {
  const user = await requireSession(GALLERY_ADMIN_ROLES);
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!isUuid(id)) return NextResponse.json({ success: false, error: 'A valid album id is required.' }, { status: 400 });

  const supabase = createServerClient();
  const { data: existing } = await supabase.from('gallery_albums').select('id, slug').eq('id', id).single();
  if (!existing) return NextResponse.json({ success: false, error: 'Album not found.' }, { status: 404 });

  // Preservation-first delete: removes only album metadata. The FK is
  // ON DELETE SET NULL so image rows survive as ungrouped images, and every
  // Storage object is left untouched. Permanent media deletion is a separate
  // explicit action in /api/admin/gallery/uploads/cleanup.
  const { error } = await supabase.from('gallery_albums').delete().eq('id', id);
  if (error) return NextResponse.json({ success: false, error: 'Delete failed. Please try again.' }, { status: 500 });
  revalidateGallery(existing.slug);
  return NextResponse.json({ success: true, data: { id } });
}
