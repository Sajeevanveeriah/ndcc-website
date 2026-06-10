import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/guard';
import { getGitHubMediaEnv } from '@/lib/server/media-env';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_FILE_BYTES = 4 * 1024 * 1024;

function sanitizeName(name: string) {
  return name
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'image';
}

function extFromType(mimeType: string) {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return '';
  }
}

export async function POST(request: Request) {
  const user = await requireSession(['admin', 'president', 'secretary', 'committee']);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });
  }

  const env = getGitHubMediaEnv();
  if ('error' in env) {
    return NextResponse.json({ success: false, error: env.error }, { status: 500 });
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: 'Upload failed: image file is required.' }, { status: 400 });
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ success: false, error: 'Invalid file type. Allowed types: JPEG, PNG, WebP, GIF.' }, { status: 400 });
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ success: false, error: 'File is too large. Maximum size is 4 MB.' }, { status: 400 });
  }

  const extension = extFromType(file.type);
  if (!extension) {
    return NextResponse.json({ success: false, error: 'Invalid file type.' }, { status: 400 });
  }

  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const safeBase = sanitizeName(file.name);
  const timestamp = now.getTime();
  const fileName = `${safeBase}-${timestamp}.${extension}`;

  const repoPath = `${env.basePath}/${year}/${month}/${fileName}`;
  const publicPath = `${env.browserBasePath}/${year}/${month}/${fileName}`;

  const arrayBuffer = await file.arrayBuffer();
  const contentBase64 = Buffer.from(arrayBuffer).toString('base64');

  const encodedRepoPath = repoPath.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  const response = await fetch(`https://api.github.com/repos/${env.owner}/${env.repo}/contents/${encodedRepoPath}`, {
    method: 'PUT',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      message: `cms: upload ${fileName}`,
      content: contentBase64,
      branch: env.branch,
      committer: {
        name: env.committerName,
        email: env.committerEmail,
      },
    }),
  });

  if (!response.ok) {
    const details = await response.json().catch(() => null);
    const githubMessage = typeof details?.message === 'string' ? details.message : 'Unknown GitHub API error.';
    const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
    const rateLimited = response.status === 429 || (response.status === 403 && rateLimitRemaining === '0');

    let error: string;
    if (rateLimited) {
      error = 'GitHub API rate limit reached. Wait a few minutes and try the upload again.';
    } else if (response.status === 401 || response.status === 403) {
      error = 'GitHub authentication failed. Check that GITHUB_CONTENTS_TOKEN is valid and has Contents read/write permission on the repository.';
    } else if (response.status === 404) {
      error = 'GitHub repository or branch not found. Check GITHUB_REPO_OWNER, GITHUB_REPO_NAME and GITHUB_CONTENTS_BRANCH, and that the token can access the repository.';
    } else if (response.status === 409) {
      error = 'GitHub reported a conflict saving the file (branch moved during upload). Try the upload again.';
    } else if (response.status === 422) {
      error = `GitHub rejected the upload request (${githubMessage}). Check the branch name and media base path configuration.`;
    } else {
      error = `GitHub upload failed: ${githubMessage}`;
    }
    return NextResponse.json({ success: false, error }, { status: 502 });
  }

  const commitDetails = await response.json().catch(() => null);
  const commitSha = typeof commitDetails?.commit?.sha === 'string' ? commitDetails.commit.sha : null;
  const commitUrl = typeof commitDetails?.commit?.html_url === 'string' ? commitDetails.commit.html_url : null;

  let warning = env.basePathWarning;
  const deployHookUrl = process.env.VERCEL_DEPLOY_HOOK_URL;

  let deployTriggered = false;
  let deployStatus: 'success' | 'skipped' | 'failed' = 'skipped';
  let deployMessage: string;

  if (!deployHookUrl) {
    deployMessage = 'Image uploaded to GitHub, but no deploy hook is configured. It may not appear on the live site until production is redeployed.';
    warning = [warning, deployMessage].filter(Boolean).join(' ');
  } else {
    try {
      const deployResponse = await fetch(deployHookUrl, { method: 'POST' });
      if (deployResponse.ok) {
        deployTriggered = true;
        deployStatus = 'success';
        deployMessage = 'Vercel deployment triggered. The image will appear on the live site once the deployment completes.';
      } else {
        deployStatus = 'failed';
        deployMessage = `Image uploaded to GitHub, but the Vercel deploy hook returned ${deployResponse.status}. The image may not appear publicly until a deployment is triggered manually.`;
        warning = [warning, deployMessage].filter(Boolean).join(' ');
      }
    } catch {
      deployStatus = 'failed';
      deployMessage = 'Image uploaded to GitHub, but the Vercel deploy hook could not be reached. The image may not appear publicly until a deployment is triggered manually.';
      warning = [warning, deployMessage].filter(Boolean).join(' ');
    }
  }

  return NextResponse.json({
    success: true,
    path: publicPath,
    ...(warning ? { warning } : {}),
    deployTriggered,
    deployStatus,
    deployMessage,
    metadata: {
      publicPath,
      repoPath,
      ...(commitSha ? { commitSha } : {}),
      ...(commitUrl ? { commitUrl } : {}),
      deployment: !deployHookUrl ? 'not_configured' : deployStatus === 'failed' ? 'failed' : 'triggered',
    },
  });
}
