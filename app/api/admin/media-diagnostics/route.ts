import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { getGitHubMediaEnv, getMediaConfigStatus } from '@/lib/server/media-env';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requirePermission('diagnostics.media');
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  return NextResponse.json({ success: true, data: getMediaConfigStatus() });
}

async function testGitHubAccess() {
  const env = getGitHubMediaEnv();
  if ('error' in env) {
    return { ok: false, message: env.error };
  }

  const response = await fetch(
    `https://api.github.com/repos/${env.owner}/${env.repo}/branches/${encodeURIComponent(env.branch)}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${env.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    }
  ).catch(() => null);

  if (!response) {
    return { ok: false, message: 'Could not reach the GitHub API. Check network access from the server.' };
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, message: 'GitHub authentication failed. Check that GITHUB_CONTENTS_TOKEN is valid and has Contents read/write permission on the repository.' };
  }
  if (response.status === 404) {
    return { ok: false, message: 'Repository or branch not found. Check GITHUB_REPO_OWNER, GITHUB_REPO_NAME and GITHUB_CONTENTS_BRANCH, and that the token can access the repository.' };
  }
  if (!response.ok) {
    return { ok: false, message: `GitHub API returned status ${response.status}.` };
  }
  return { ok: true, message: 'GitHub token, repository and branch are reachable. Uploads should be able to commit.' };
}

// Uploads publish via Vercel's git auto-deploy of the CMS commit. A deploy-hook test
// action used to live here; it was removed because firing the hook alongside an
// in-flight git deployment makes Vercel cancel both, leaving production stale.
export async function POST(request: Request) {
  const user = await requirePermission('diagnostics.media');
  if (!user) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const action = typeof body?.action === 'string' ? body.action : '';

  if (action === 'test-github') {
    const result = await testGitHubAccess();
    return NextResponse.json(
      { success: result.ok, message: result.message, ...(result.ok ? {} : { error: result.message }) },
      { status: result.ok ? 200 : 502 }
    );
  }

  return NextResponse.json({ success: false, error: 'Unknown diagnostics action.' }, { status: 400 });
}
