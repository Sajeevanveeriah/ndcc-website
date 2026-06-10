export type GitHubMediaEnv = {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  basePath: string;
  browserBasePath: string;
  basePathWarning?: string;
  committerName: string;
  committerEmail: string;
};

export type NormalizedMediaBasePath = {
  repoBasePath: string;
  browserBasePath: string;
  warning?: string;
};

export function normalizeMediaBasePath(basePath: string): NormalizedMediaBasePath | { error: string } {
  const trimmedBasePath = basePath.trim().replace(/^\/+|\/+$/g, '');
  if (!trimmedBasePath) {
    return { error: 'GitHub media upload base path is empty. Set GITHUB_MEDIA_BASE_PATH to public/images or a public/images subfolder.' };
  }

  const pathSegments = trimmedBasePath.split('/').filter(Boolean);
  if (pathSegments.includes('..') || pathSegments.includes('.')) {
    return { error: 'GitHub media upload base path is invalid. Use public/images or a public/images subfolder.' };
  }

  const repoBasePath = trimmedBasePath.startsWith('public/images')
    ? trimmedBasePath
    : trimmedBasePath === 'images' || trimmedBasePath.startsWith('images/')
      ? `public/${trimmedBasePath}`
      : '';

  if (!repoBasePath || (repoBasePath !== 'public/images' && !repoBasePath.startsWith('public/images/'))) {
    return { error: 'GitHub media upload base path must resolve under public/images. Set GITHUB_MEDIA_BASE_PATH to public/images or a public/images subfolder.' };
  }

  return {
    repoBasePath,
    browserBasePath: `/${repoBasePath.replace(/^public\//, '')}`,
    ...(trimmedBasePath !== repoBasePath ? { warning: 'GITHUB_MEDIA_BASE_PATH was interpreted under public/ so uploads are web-accessible.' } : {}),
  };
}

export function getGitHubMediaEnv(): GitHubMediaEnv | { error: string } {
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

  const normalizedBasePath = normalizeMediaBasePath(basePath);
  if ('error' in normalizedBasePath) {
    return { error: normalizedBasePath.error };
  }

  return {
    token,
    owner,
    repo,
    branch,
    basePath: normalizedBasePath.repoBasePath,
    browserBasePath: normalizedBasePath.browserBasePath,
    basePathWarning: normalizedBasePath.warning,
    committerName,
    committerEmail,
  };
}

function safePreview(value: string | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length <= 24 ? trimmed : `${trimmed.slice(0, 21)}...`;
}

export function getMediaConfigStatus() {
  const basePathRaw = process.env.GITHUB_MEDIA_BASE_PATH;
  const normalized = basePathRaw ? normalizeMediaBasePath(basePathRaw) : null;
  const basePathValid = Boolean(normalized && !('error' in normalized));

  return {
    githubTokenPresent: Boolean(process.env.GITHUB_CONTENTS_TOKEN),
    repoOwnerPresent: Boolean(process.env.GITHUB_REPO_OWNER),
    repoOwnerPreview: safePreview(process.env.GITHUB_REPO_OWNER),
    repoNamePresent: Boolean(process.env.GITHUB_REPO_NAME),
    repoNamePreview: safePreview(process.env.GITHUB_REPO_NAME),
    branchPresent: Boolean(process.env.GITHUB_CONTENTS_BRANCH),
    branchPreview: safePreview(process.env.GITHUB_CONTENTS_BRANCH),
    basePathPresent: Boolean(basePathRaw),
    basePathPreview: safePreview(basePathRaw),
    basePathResolvesUnderPublicImages: basePathValid,
    basePathError: normalized && 'error' in normalized ? normalized.error : null,
    committerNamePresent: Boolean(process.env.GITHUB_COMMITTER_NAME),
    committerEmailPresent: Boolean(process.env.GITHUB_COMMITTER_EMAIL),
    deployHookPresent: Boolean(process.env.VERCEL_DEPLOY_HOOK_URL),
    ready:
      Boolean(process.env.GITHUB_CONTENTS_TOKEN)
      && Boolean(process.env.GITHUB_REPO_OWNER)
      && Boolean(process.env.GITHUB_REPO_NAME)
      && Boolean(process.env.GITHUB_CONTENTS_BRANCH)
      && Boolean(process.env.GITHUB_COMMITTER_NAME)
      && Boolean(process.env.GITHUB_COMMITTER_EMAIL)
      && basePathValid,
  };
}

export type MediaConfigStatus = ReturnType<typeof getMediaConfigStatus>;
