import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/guard';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_FILE_BYTES = 4 * 1024 * 1024;

type GitHubEnv = {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  basePath: string;
  committerName: string;
  committerEmail: string;
};

function requiredEnv(): GitHubEnv | { error: string } {
  const token = process.env.GITHUB_CONTENTS_TOKEN;
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;
  const branch = process.env.GITHUB_CONTENTS_BRANCH;
  const basePath = process.env.GITHUB_MEDIA_BASE_PATH;
  const committerName = process.env.GITHUB_COMMITTER_NAME;
  const committerEmail = process.env.GITHUB_COMMITTER_EMAIL;

  if (!token || !owner || !repo || !branch || !basePath || !committerName || !committerEmail) {
    return { error: 'GitHub media upload is not configured. Ask an admin to set required server environment variables.' };
  }

  return {
    token,
    owner,
    repo,
    branch,
    basePath: basePath.replace(/^\/+|\/+$/g, ''),
    committerName,
    committerEmail,
  };
}

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

  const env = requiredEnv();
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
  const publicPath = `/${repoPath.replace(/^public\//, '')}`;

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

  if (response.status === 401 || response.status === 403) {
    return NextResponse.json({ success: false, error: 'GitHub authentication failed. Check GITHUB_CONTENTS_TOKEN permissions.' }, { status: 502 });
  }

  if (!response.ok) {
    const details = await response.json().catch(() => null);
    const errorMessage = typeof details?.message === 'string' ? details.message : 'Unknown GitHub API error.';
    return NextResponse.json({ success: false, error: `GitHub upload failed: ${errorMessage}` }, { status: 502 });
  }

  let warning: string | undefined;
  const deployHookUrl = process.env.VERCEL_DEPLOY_HOOK_URL;

  if (!deployHookUrl) {
    warning = 'Image uploaded, but deployment was not triggered because VERCEL_DEPLOY_HOOK_URL is not configured.';
  } else {
    try {
      const deployResponse = await fetch(deployHookUrl, { method: 'POST' });
      if (!deployResponse.ok) {
        warning = 'Image uploaded, but Vercel deployment trigger failed. Manually deploy the latest main branch.';
      }
    } catch {
      warning = 'Image uploaded, but Vercel deployment trigger failed. Manually deploy the latest main branch.';
    }
  }

  return NextResponse.json({ success: true, path: publicPath, ...(warning ? { warning } : {}) });
}
