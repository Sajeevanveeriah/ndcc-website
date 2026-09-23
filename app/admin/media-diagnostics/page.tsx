'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';

type MediaStatus = {
  storageReady: boolean;
  supabaseUrlPresent: boolean;
  serviceRoleKeyPresent: boolean;
  mediaBucket: string;
  stagingBucket: string;
  mediaBucketFound: boolean;
  mediaBucketPublic: boolean;
  stagingBucketFound: boolean;
  stagingBucketPrivate: boolean;
  ready: boolean;
};

type Feedback = { type: 'success' | 'error'; message: string };

export default function AdminMediaDiagnosticsPage() {
  const [status, setStatus] = useState<MediaStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [storageFeedback, setStorageFeedback] = useState<Feedback | null>(null);
  const [testingStorage, setTestingStorage] = useState(false);

  useEffect(() => {
    adminFetch('/api/admin/media-diagnostics', { cache: 'no-store' })
      .then((res) => parseApiResponse<{ data: MediaStatus }>(res))
      .then((data) => setStatus(data.data))
      .catch((error) => setStatusError(error instanceof Error ? error.message : 'Failed to load media diagnostics.'));
  }, []);

  async function runTest(action: 'test-storage') {
    setTestingStorage(true);
    setStorageFeedback(null);
    try {
      const res = await adminFetch('/api/admin/media-diagnostics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await parseApiResponse<{ message: string }>(res);
      setStorageFeedback({ type: 'success', message: data.message });
    } catch (error) {
      setStorageFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Test failed.' });
    } finally {
      setTestingStorage(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-content-primary">Media Diagnostics</h1>
        <p className="text-content-muted font-body mt-1">
          Check Supabase Storage readiness for validated CMS uploads without exposing secret values.
        </p>
      </div>

      {statusError && <p className="text-sm text-red-600">{statusError}</p>}

      <section className="bg-surface-card border rounded-xl p-5 space-y-3">
        <h2 className="text-lg font-semibold">CMS storage</h2>
        <p>{status ? (status.storageReady ? 'Public media and private staging buckets are reachable with the expected access settings.' : 'Storage is not ready. Check the bucket configuration before uploading.') : 'Checking storage...'}</p>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div><dt className="text-content-muted">NEXT_PUBLIC_SUPABASE_URL</dt><dd className="font-semibold">{status?.supabaseUrlPresent ? 'Present' : 'Missing'}</dd></div>
          <div><dt className="text-content-muted">Server storage credential</dt><dd className="font-semibold">{status?.serviceRoleKeyPresent ? 'Present' : 'Missing'}</dd></div>
          <div><dt className="text-content-muted">Public media bucket ({status?.mediaBucket ?? 'cms-media'})</dt><dd className="font-semibold">{status?.mediaBucketFound ? (status.mediaBucketPublic ? 'Found, public' : 'Found, not public') : 'Missing'}</dd></div>
          <div><dt className="text-content-muted">Private staging bucket ({status?.stagingBucket ?? 'cms-media-staging'})</dt><dd className="font-semibold">{status?.stagingBucketFound ? (status.stagingBucketPrivate ? 'Found, private' : 'Found, not private') : 'Missing'}</dd></div>
        </dl>
      </section>

      <section className="bg-surface-card border rounded-xl p-5 space-y-3">
        <h2 className="text-lg font-semibold">Test storage access</h2>
        <p className="text-sm text-content-muted">
          Checks that the server can reach both storage buckets. Nothing is uploaded or changed.
        </p>
        <Button type="button" isLoading={testingStorage} onClick={() => runTest('test-storage')}>Test storage access</Button>
        {storageFeedback && (
          <p className={`text-sm ${storageFeedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>{storageFeedback.message}</p>
        )}
      </section>

      <section className="bg-surface-card border rounded-xl p-5 space-y-2">
        <h2 className="text-lg font-semibold">Expected upload sequence</h2>
        <ol className="list-decimal pl-5 text-sm text-content-muted space-y-1">
          <li>An authorised editor uploads directly to private staging storage.</li>
          <li>The server validates the file and publishes a content-addressed image or PDF. Images are optimised and duplicate files share one URL.</li>
          <li>Review the preview, then save the CMS record. No website deployment is required. Existing image URLs remain valid.</li>
        </ol>
      </section>
    </div>
  );
}
