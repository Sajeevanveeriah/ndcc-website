import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { getMediaConfigStatus } from '@/lib/server/media-env';

import { createServerClient } from '@/lib/supabase-server';
import { MEDIA_BUCKET, STAGING_BUCKET } from '@/lib/server/cms-media';

export const dynamic = 'force-dynamic';

async function getStorageStatus() {
  const config = getMediaConfigStatus();
  if (!config.ready) {
    return { ...config, mediaBucketFound: false, mediaBucketPublic: false, stagingBucketFound: false, stagingBucketPrivate: false, storageReady: false };
  }
  const client = createServerClient();
  const [media, staging] = await Promise.all([client.storage.getBucket(MEDIA_BUCKET), client.storage.getBucket(STAGING_BUCKET)]);
  const mediaBucketFound = !media.error && Boolean(media.data);
  const stagingBucketFound = !staging.error && Boolean(staging.data);
  const mediaBucketPublic = mediaBucketFound && media.data?.public === true;
  const stagingBucketPrivate = stagingBucketFound && staging.data?.public === false;
  return {
    ...config,
    mediaBucketFound,
    mediaBucketPublic,
    stagingBucketFound,
    stagingBucketPrivate,
    storageReady: mediaBucketPublic && stagingBucketPrivate,
  };
}

export async function GET() {
  const user = await requirePermission('diagnostics.media');
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  return NextResponse.json({ success: true, data: await getStorageStatus() });
}

/** Read-only probe: lists at most one object in each bucket. Nothing is uploaded. */
async function testStorageAccess() {
  const status = await getStorageStatus();
  if (!status.ready) {
    return { ok: false, message: 'Supabase Storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.' };
  }
  if (!status.mediaBucketFound || !status.stagingBucketFound) {
    return { ok: false, message: `Storage bucket missing. Expected public "${MEDIA_BUCKET}" and private "${STAGING_BUCKET}" buckets.` };
  }
  if (!status.mediaBucketPublic || !status.stagingBucketPrivate) {
    return { ok: false, message: `Bucket access settings are wrong: "${MEDIA_BUCKET}" must be public and "${STAGING_BUCKET}" must be private.` };
  }
  const client = createServerClient();
  const [media, staging] = await Promise.all([
    client.storage.from(MEDIA_BUCKET).list('', { limit: 1 }),
    client.storage.from(STAGING_BUCKET).list('', { limit: 1 }),
  ]);
  if (media.error || staging.error) {
    return { ok: false, message: 'The server could not list the storage buckets. Check the service role key and storage policies.' };
  }
  return { ok: true, message: 'Supabase Storage media and staging buckets are reachable with the expected access settings.' };
}

export async function POST(request: Request) {
  const user = await requirePermission('diagnostics.media');
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const action = typeof body?.action === 'string' ? body.action : '';

  // `test-github` is accepted for older clients; GitHub uploads were retired,
  // so both actions now probe Supabase Storage.
  if (action === 'test-storage' || action === 'test-github') {
    const result = await testStorageAccess();
    return NextResponse.json(
      { success: result.ok, message: result.message, ...(result.ok ? {} : { error: result.message }) },
      { status: result.ok ? 200 : 502 }
    );
  }

  return NextResponse.json({ success: false, error: 'Unknown diagnostics action.' }, { status: 400 });
}
