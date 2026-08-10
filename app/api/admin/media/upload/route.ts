import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/guard';
import { hasPermission, MEDIA_UPLOAD_PERMISSIONS } from '@/lib/auth/permissions';
import { getGitHubMediaEnv } from '@/lib/server/media-env';

export const dynamic = 'force-dynamic';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']);
const MAX_FILE_BYTES = 4 * 1024 * 1024;
// Publication PDFs (newsletters, match reports) are allowed a larger budget
// than page images because they never block page rendering.
const MAX_PDF_BYTES = 10 * 1024 * 1024;

function sanitizeName(name: string) {
  return name
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'file';
}

function extFromType(mimeType: string) {
  switch (mimeType) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'image/webp': return 'webp';
    case 'image/gif': return 'gif';
    case 'application/pdf': return 'pdf';
    default: return '';
  }
}

export async function POST(request: Request) {
  const user = await requireSession();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });
  }
  if (!MEDIA_UPLOAD_PERMISSIONS.some((permission) => hasPermission(user, permission))) {
    return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });
  }

  const env = getGitHubMediaEnv();
  if ('error' in env) {
    return NextResponse.json({ success: false, error: env.error }, { status: 500 });
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: 'Upload failed: a file is required.' }, { status: 400 });
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ success: false, error: 'Invalid file type. Allowed types: JPEG, PNG, WebP, GIF, PDF.' }, { status: 400 });
  }

  const isPdf = file.type === 'application/pdf';
  const maxBytes = isPdf ? MAX_PDF_BYTES : MAX_FILE_BYTES;
  if (file.size > maxBytes) {
    return NextResponse.json({ success: false, error: `File is too large. Maximum size is ${isPdf ? '10' : '4'} MB.` }, { status: 400 });
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
  const bytes = Buffer.from(arrayBuffer);
  if (isPdf && !bytes.subarray(0, 5).toString('latin1').startsWith('%PDF-')) {
    return NextResponse.json({ success: false, error: 'File is not a valid PDF document.' }, { status: 400 });
  }
  const contentBase64 = bytes.toString('base64');

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
  const warning = env.basePathWarning;

  return NextResponse.json({
    success: true,
    path: publicPath,
    ...(warning ? { warning } : {}),
    deployStatus: 'success',
    deployMessage: 'File uploaded. The site will update automatically in about a minute.',
    metadata: {
      publicPath,
      repoPath,
      ...(commitSha ? { commitSha } : {}),
      ...(commitUrl ? { commitUrl } : {}),
      deployment: 'triggered',
    },
  });
}
