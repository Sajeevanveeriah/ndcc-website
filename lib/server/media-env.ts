import { MEDIA_BUCKET, STAGING_BUCKET } from '@/lib/server/cms-media';

// CMS media uploads go to Supabase Storage (public bucket `cms-media`, private
// staging bucket `cms-media-staging`) via /api/admin/media/upload. The legacy
// GitHub Contents API upload path and its GITHUB_* variables were retired.

/** Presence-only configuration status. Secret values are never returned. */
export function getMediaConfigStatus() {
  const supabaseUrlPresent = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKeyPresent = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return {
    supabaseUrlPresent,
    serviceRoleKeyPresent,
    mediaBucket: MEDIA_BUCKET,
    stagingBucket: STAGING_BUCKET,
    ready: supabaseUrlPresent && serviceRoleKeyPresent,
  };
}

export type MediaConfigStatus = ReturnType<typeof getMediaConfigStatus>;
