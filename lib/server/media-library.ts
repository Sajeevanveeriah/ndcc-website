import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MEDIA_BUCKET } from '@/lib/server/cms-media';
import { checkMediaReferences, type MediaReferenceReport } from '@/lib/media-references';

export type MediaAsset = {
  id: string;
  bucket: string;
  path: string;
  public_url: string;
  alt_text: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  content_type: string | null;
  usage_hint: string | null;
  created_at: string;
};

type MediaAssetRow = Omit<MediaAsset, 'public_url'> & { public_url: string | null };

const COLUMNS = 'id,bucket,path,public_url,alt_text,width,height,bytes,content_type,usage_hint,created_at';

export function isMissingMediaTable(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return ['42P01', 'PGRST205'].includes(error.code || '') || /media_assets/.test(error.message || '');
}

/** Backfilled rows have no stored URL; derive it from the public bucket path. */
function withPublicUrl(client: SupabaseClient, row: MediaAssetRow): MediaAsset {
  const public_url = row.public_url || client.storage.from(row.bucket || MEDIA_BUCKET).getPublicUrl(row.path).data.publicUrl;
  return { ...row, alt_text: row.alt_text || '', public_url };
}

/** Best-effort record of a freshly published file; never fails the upload. */
export async function recordMediaAsset(client: SupabaseClient, asset: {
  path: string; publicUrl: string; width: number | null; height: number | null; bytes: number; contentType: string;
  uploadedBy: string; usageHint: string | null;
}) {
  try {
    const { error } = await client.from('media_assets').upsert({
      bucket: MEDIA_BUCKET,
      path: asset.path,
      public_url: asset.publicUrl,
      width: asset.width,
      height: asset.height,
      bytes: asset.bytes,
      content_type: asset.contentType,
      uploaded_by: asset.uploadedBy,
      usage_hint: asset.usageHint,
    }, { onConflict: 'bucket,path', ignoreDuplicates: true });
    if (error && !isMissingMediaTable(error)) console.warn(JSON.stringify({ event: 'cms_media_library_record_failed' }));
  } catch {
    console.warn(JSON.stringify({ event: 'cms_media_library_record_failed' }));
  }
}

export async function listMediaAssets(client: SupabaseClient, options: { search?: string; kind?: 'image' | 'pdf' | 'all'; limit?: number; offset?: number }) {
  const limit = Math.min(Math.max(options.limit ?? 48, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);
  let query = client.from('media_assets').select(COLUMNS, { count: 'exact' })
    .eq('bucket', MEDIA_BUCKET)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1);
  if (options.kind === 'image') query = query.not('path', 'ilike', '%.pdf');
  if (options.kind === 'pdf') query = query.ilike('path', '%.pdf');
  const search = (options.search || '').trim().slice(0, 80).replace(/[,()*%_\\]/g, ' ').trim();
  if (search) query = query.or(`alt_text.ilike.*${search}*,path.ilike.*${search}*,usage_hint.ilike.*${search}*`);
  const { data, error, count } = await query;
  if (error) return { ok: false as const, missingTable: isMissingMediaTable(error) };
  return { ok: true as const, assets: ((data || []) as MediaAssetRow[]).map((row) => withPublicUrl(client, row)), total: count ?? 0 };
}

export async function getMediaAsset(client: SupabaseClient, id: string) {
  const { data, error } = await client.from('media_assets').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) return { ok: false as const, missingTable: isMissingMediaTable(error) };
  return { ok: true as const, asset: data ? withPublicUrl(client, data as MediaAssetRow) : null };
}

export async function findMediaReferences(client: SupabaseClient, path: string): Promise<MediaReferenceReport> {
  return checkMediaReferences(path, async (table, column, pattern) => {
    const { count, error } = await client.from(table).select('*', { count: 'exact', head: true }).ilike(column, pattern);
    return { count: count ?? null, error: error ? { code: error.code, message: error.message } : null };
  });
}
