import { supabase } from '@/lib/supabase';
import { prepareCmsImage } from '@/lib/prepare-cms-image';

/** Bytes go directly to private storage, outside the hosting body-size limit. */
export async function uploadCmsMedia(file: File): Promise<{ path: string }> {
  file = await prepareCmsImage(file);
  async function request(body: Record<string, unknown>) {
    const response = await fetch('/api/admin/media/upload', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-NDCC-CSRF': '1' },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Upload could not be completed. Please try again.');
    return payload;
  }
  if (!supabase) throw new Error('Media storage is temporarily unavailable.');
  const prepared = await request({ action: 'prepare', type: file.type, size: file.size });
  const { error } = await supabase.storage.from(prepared.bucket).uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: file.type });
  if (error) throw new Error('The file could not be uploaded. Please try again.');
  const result = await request({ action: 'finalise', ticket: prepared.ticket });
  if (typeof result.path !== 'string') throw new Error('Upload returned an invalid path.');
  return { path: result.path };
}
