'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import { adminFetch, parseApiResponse } from '@/lib/admin-client';

type MediaStatus = {
  githubTokenPresent: boolean;
  repoOwnerPresent: boolean;
  repoOwnerPreview: string | null;
  repoNamePresent: boolean;
  repoNamePreview: string | null;
  branchPresent: boolean;
  branchPreview: string | null;
  basePathPresent: boolean;
  basePathPreview: string | null;
  basePathResolvesUnderPublicImages: boolean;
  basePathError: string | null;
  committerNamePresent: boolean;
  committerEmailPresent: boolean;
  ready: boolean;
};

type Feedback = { type: 'success' | 'error'; message: string };

export default function AdminMediaDiagnosticsPage() {
  const [status, setStatus] = useState<MediaStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [githubFeedback, setGithubFeedback] = useState<Feedback | null>(null);
  const [testingGithub, setTestingGithub] = useState(false);

  useEffect(() => {
    adminFetch('/api/admin/media-diagnostics', { cache: 'no-store' })
      .then((res) => parseApiResponse<{ data: MediaStatus }>(res))
      .then((data) => setStatus(data.data))
      .catch((error) => setStatusError(error instanceof Error ? error.message : 'Failed to load media diagnostics.'));
  }, []);

  async function runTest(action: 'test-github') {
    setTestingGithub(true);
    setGithubFeedback(null);
    try {
      const res = await adminFetch('/api/admin/media-diagnostics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await parseApiResponse<{ message: string }>(res);
      setGithubFeedback({ type: 'success', message: data.message });
    } catch (error) {
      setGithubFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Test failed.' });
    } finally {
      setTestingGithub(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-content-primary">Media Diagnostics</h1>
        <p className="text-content-muted font-body mt-1">
          Check the CMS image upload pipeline (GitHub commit + Vercel git auto-deploy) without exposing secret values.
        </p>
      </div>

      {statusError && <p className="text-sm text-red-600">{statusError}</p>}

      <section className="bg-surface-card border rounded-xl p-5 space-y-3">
        <h2 className="text-lg font-semibold">Media upload configuration</h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div><dt className="text-content-muted">GITHUB_CONTENTS_TOKEN</dt><dd className="font-semibold">{status?.githubTokenPresent ? 'Present' : 'Missing'}</dd></div>
          <div><dt className="text-content-muted">GITHUB_REPO_OWNER</dt><dd className="font-semibold">{status?.repoOwnerPresent ? status.repoOwnerPreview ?? 'Present' : 'Missing'}</dd></div>
          <div><dt className="text-content-muted">GITHUB_REPO_NAME</dt><dd className="font-semibold">{status?.repoNamePresent ? status.repoNamePreview ?? 'Present' : 'Missing'}</dd></div>
          <div><dt className="text-content-muted">GITHUB_CONTENTS_BRANCH</dt><dd className="font-semibold">{status?.branchPresent ? status.branchPreview ?? 'Present' : 'Missing'}</dd></div>
          <div><dt className="text-content-muted">GITHUB_MEDIA_BASE_PATH</dt><dd className="font-semibold">{status?.basePathPresent ? status.basePathPreview ?? 'Present' : 'Missing'}</dd></div>
          <div><dt className="text-content-muted">Base path under public/images</dt><dd className="font-semibold">{status?.basePathResolvesUnderPublicImages ? 'Yes' : 'No'}</dd></div>
          <div><dt className="text-content-muted">GITHUB_COMMITTER_NAME</dt><dd className="font-semibold">{status?.committerNamePresent ? 'Present' : 'Missing'}</dd></div>
          <div><dt className="text-content-muted">GITHUB_COMMITTER_EMAIL</dt><dd className="font-semibold">{status?.committerEmailPresent ? 'Present' : 'Missing'}</dd></div>
          <div><dt className="text-content-muted">Uploads ready</dt><dd className="font-semibold">{status?.ready ? 'Yes' : 'No — uploads will fail with a configuration error'}</dd></div>
        </dl>
        {status?.basePathError && <p className="text-sm text-amber-700">{status.basePathError}</p>}
      </section>

      <section className="bg-surface-card border rounded-xl p-5 space-y-3">
        <h2 className="text-lg font-semibold">Test GitHub access</h2>
        <p className="text-sm text-content-muted">
          Checks that the token can reach the configured repository and branch. Nothing is uploaded or committed.
        </p>
        <Button type="button" isLoading={testingGithub} onClick={() => runTest('test-github')}>Test GitHub access</Button>
        {githubFeedback && (
          <p className={`text-sm ${githubFeedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>{githubFeedback.message}</p>
        )}
      </section>

      <section className="bg-surface-card border rounded-xl p-5 space-y-2">
        <h2 className="text-lg font-semibold">Expected upload sequence</h2>
        <ol className="list-decimal pl-5 text-sm text-content-muted space-y-1">
          <li>Admin uploads an image in a CMS form — the file is committed to GitHub under <code>public/images</code>.</li>
          <li>Vercel detects the new commit and automatically starts a production deployment. No deploy hook is used — a second deployment for the same commit would race the automatic one and Vercel would cancel both.</li>
          <li>The image URL is saved with the CMS item, but the image only becomes publicly visible after the deployment completes (about a minute).</li>
        </ol>
      </section>
    </div>
  );
}
