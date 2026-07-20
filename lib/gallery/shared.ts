// Shared, dependency-free gallery bulk-upload rules used by the admin client,
// the protected upload APIs and the deterministic test suite. Everything here
// must stay pure (no supabase / next imports) so it can run under
// node --experimental-strip-types in scripts/test-gallery-bulk-upload.mjs.

export const GALLERY_MEDIA_BUCKET = 'gallery-media';

export const MAX_GALLERY_FILE_BYTES = 20 * 1024 * 1024; // 20 MB per original
export const MAX_GALLERY_BATCH_FILES = 100;
// Total declared bytes for one prepare/finalize batch (guards a single request
// claiming 100 x 20 MB while still allowing a realistic finals-day batch).
export const MAX_GALLERY_BATCH_BYTES = 800 * 1024 * 1024;
export const MAX_GALLERY_FILENAME_LENGTH = 200;
export const MAX_GALLERY_IMAGE_DIMENSION = 20000;

export const GALLERY_ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const ALBUM_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_ALBUM_SLUG_LENGTH = 120;

export function isValidAlbumSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && slug.length <= MAX_ALBUM_SLUG_LENGTH && ALBUM_SLUG_PATTERN.test(slug);
}

export function slugifyAlbumTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_ALBUM_SLUG_LENGTH)
    .replace(/-$/, '');
}

/** Lowercased base name with only [a-z0-9-_], extension stripped; never empty. */
export function sanitizeGalleryFilenameBase(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'photo';
}

/**
 * Safe filename for the public download attribute, derived from the original
 * filename with the real extension preserved (from the stored MIME type, not
 * the user-supplied name).
 */
export function galleryDownloadFilename(originalFilename: string | null | undefined, mimeType: string | null | undefined): string {
  const ext = mimeType ? GALLERY_ALLOWED_MIME_TYPES[mimeType] : undefined;
  const base = sanitizeGalleryFilenameBase(originalFilename || 'photo');
  return ext ? `${base}.${ext}` : base;
}

export type GalleryUploadFileMeta = {
  clientId?: unknown;
  filename?: unknown;
  mimeType?: unknown;
  sizeBytes?: unknown;
  width?: unknown;
  height?: unknown;
  contentHash?: unknown;
};

/** Returns an error message for one declared file, or null when acceptable. */
export function validateGalleryFileMeta(meta: GalleryUploadFileMeta): string | null {
  if (typeof meta.filename !== 'string' || meta.filename.trim().length === 0) {
    return 'A filename is required.';
  }
  if (meta.filename.length > MAX_GALLERY_FILENAME_LENGTH) {
    return `Filename is too long (max ${MAX_GALLERY_FILENAME_LENGTH} characters).`;
  }
  if (/[\u0000-\u001f\\/]/.test(meta.filename) || meta.filename.startsWith('.')) {
    return 'Filename contains invalid characters.';
  }
  if (typeof meta.mimeType !== 'string' || !(meta.mimeType in GALLERY_ALLOWED_MIME_TYPES)) {
    return 'Only JPEG, PNG and WebP images are supported. Please export HEIC/HEIF or other formats as JPEG, PNG or WebP first.';
  }
  if (typeof meta.sizeBytes !== 'number' || !Number.isFinite(meta.sizeBytes) || meta.sizeBytes <= 0) {
    return 'File size must be greater than zero.';
  }
  if (meta.sizeBytes > MAX_GALLERY_FILE_BYTES) {
    return 'File is larger than the 20 MB limit. Export a smaller version and try again.';
  }
  for (const key of ['width', 'height'] as const) {
    const value = meta[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > MAX_GALLERY_IMAGE_DIMENSION) {
      return `Image ${key} must be a positive number of pixels (max ${MAX_GALLERY_IMAGE_DIMENSION}).`;
    }
  }
  if (meta.contentHash !== undefined && meta.contentHash !== null) {
    if (typeof meta.contentHash !== 'string' || !/^[a-f0-9]{16,128}$/.test(meta.contentHash)) {
      return 'Content hash must be a lowercase hex digest.';
    }
  }
  return null;
}

/**
 * Validates a whole declared batch: bounded count, bounded total bytes and no
 * duplicate entries (same content hash, or same filename + size when no hash
 * is available). Returns an error message or null.
 */
export function validateGalleryBatch(files: GalleryUploadFileMeta[]): string | null {
  if (!Array.isArray(files) || files.length === 0) return 'At least one file is required.';
  if (files.length > MAX_GALLERY_BATCH_FILES) {
    return `A maximum of ${MAX_GALLERY_BATCH_FILES} files can be uploaded in one batch.`;
  }
  let totalBytes = 0;
  const seen = new Set<string>();
  for (const file of files) {
    const error = validateGalleryFileMeta(file);
    if (error) return `${String(file.filename ?? 'file')}: ${error}`;
    totalBytes += file.sizeBytes as number;
    const key = typeof file.contentHash === 'string' && file.contentHash
      ? `hash:${file.contentHash}`
      : `name:${(file.filename as string).toLowerCase()}:${file.sizeBytes as number}`;
    if (seen.has(key)) return `Duplicate file in batch: ${String(file.filename)}.`;
    seen.add(key);
  }
  if (totalBytes > MAX_GALLERY_BATCH_BYTES) {
    return `Total batch size exceeds ${Math.round(MAX_GALLERY_BATCH_BYTES / (1024 * 1024))} MB. Upload in smaller batches.`;
  }
  return null;
}

const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && new RegExp(`^${UUID_PATTERN}$`).test(value.toLowerCase());
}

/**
 * Immutable, collision-resistant object path:
 *   albums/<album-uuid>/<year>/<uuid>-<sanitised-base>.<ext>
 * The random uuid comes from the SERVER (crypto.randomUUID), never the client.
 */
export function buildGalleryStoragePath(albumId: string, year: number, objectUuid: string, originalFilename: string, mimeType: string): string {
  const ext = GALLERY_ALLOWED_MIME_TYPES[mimeType];
  if (!ext) throw new Error(`Unsupported MIME type: ${mimeType}`);
  if (!isUuid(albumId) || !isUuid(objectUuid)) throw new Error('Invalid identifier for storage path.');
  return `albums/${albumId.toLowerCase()}/${year}/${objectUuid.toLowerCase()}-${sanitizeGalleryFilenameBase(originalFilename)}.${ext}`;
}

const STORAGE_PATH_PATTERN = new RegExp(
  `^albums/(${UUID_PATTERN})/\\d{4}/${UUID_PATTERN}-[a-z0-9-_]{1,60}\\.(?:jpg|png|webp)$`
);

/**
 * True only when the path is a well-formed gallery object path that sits
 * inside the given album's prefix. Rejects traversal, absolute paths, URL
 * tricks and every path outside `albums/<albumId>/`.
 */
export function isPathWithinAlbum(path: unknown, albumId: string): boolean {
  if (typeof path !== 'string' || !isUuid(albumId)) return false;
  if (path.includes('..') || path.includes('//') || path.startsWith('/') || /[\s%?#\\]/.test(path)) return false;
  const match = STORAGE_PATH_PATTERN.exec(path);
  return Boolean(match && match[1] === albumId.toLowerCase());
}

/**
 * Public Supabase object URL with the supported `download` query parameter so
 * the browser saves the ORIGINAL file under a safe filename.
 */
export function buildGalleryDownloadUrl(publicUrl: string, downloadFilename: string): string {
  const separator = publicUrl.includes('?') ? '&' : '?';
  return `${publicUrl}${separator}download=${encodeURIComponent(downloadFilename)}`;
}

/** Accessible fallback alt text when no factual alt was supplied. */
export function galleryFallbackAltText(albumTitle: string, position: number, total: number): string {
  const scope = albumTitle.trim() ? `${albumTitle.trim()} gallery photograph` : 'Gallery photograph';
  return `${scope} ${position} of ${total}`;
}
