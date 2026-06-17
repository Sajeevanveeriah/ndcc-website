const LOCAL_IMAGE_OR_DOWNLOAD = /^\/(images|downloads)\/[A-Za-z0-9][A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/;
const CMS_DATE_PATH = /^\/images\/cms\/(\d{4})\/(\d{2})\/(.+)$/;

export function normalizeImageSrc(value?: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return url.protocol === 'http:' || url.protocol === 'https:' ? trimmed : null;
    } catch {
      return null;
    }
  }

  let localPath = trimmed
    .replace(/^\/public\/images\//i, '/images/')
    .replace(/^public\/images\//i, '/images/')
    .replace(/^images\//i, '/images/')
    .replace(/^\/public\/downloads\//i, '/downloads/')
    .replace(/^public\/downloads\//i, '/downloads/')
    .replace(/^downloads\//i, '/downloads/');

  localPath = localPath.replace(CMS_DATE_PATH, '/images/$1/$2/$3');

  if (!localPath.startsWith('/')) return null;
  if (localPath.includes('..') || /[\s<>"`{}|\\^]/.test(localPath)) return null;
  if (!LOCAL_IMAGE_OR_DOWNLOAD.test(localPath)) return null;

  return localPath;
}
