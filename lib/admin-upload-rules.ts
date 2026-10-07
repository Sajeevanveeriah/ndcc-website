// Client-side checks shared by every CMS uploader (editor fields, drag and
// drop, Media Library). The server (lib/server/cms-media.ts) stays the
// authority: images are resized in the browser before its 4 MB image limit,
// GIFs are not resized, and PDFs keep the 10 MB limit. No imports, so tests
// can load it directly.

export const CMS_IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const CMS_PDF_TYPES: readonly string[] = ['application/pdf'];
export const CMS_MEDIA_TYPES: readonly string[] = [...CMS_IMAGE_TYPES, ...CMS_PDF_TYPES];

/** Largest file accepted before upload, in bytes. */
export function cmsClientUploadLimit(type: string): number {
  if (type === 'application/pdf') return 10 * 1024 * 1024;
  if (type === 'image/gif') return 4 * 1024 * 1024;
  return 20 * 1024 * 1024;
}

/** A plain-English reason the file cannot be uploaded, or null when it can. */
export function cmsUploadProblem(file: { type: string; size: number }, allowedTypes: readonly string[] = CMS_MEDIA_TYPES): string | null {
  if (!allowedTypes.includes(file.type)) {
    if (allowedTypes.every((type) => type === 'application/pdf')) return 'That file is not a PDF. Drop or choose a PDF file.';
    if (allowedTypes.every((type) => type.startsWith('image/'))) return 'That file type is not supported. Use a JPEG, PNG, WebP or GIF image.';
    return 'That file type is not supported. Use a JPEG, PNG, WebP or GIF image, or a PDF.';
  }
  const limit = cmsClientUploadLimit(file.type);
  if (file.size > limit) {
    const sizeMb = (file.size / 1024 / 1024).toFixed(1);
    return `File is too large (${sizeMb} MB). Maximum is ${limit / 1024 / 1024} MB. Please export a smaller file and try again.`;
  }
  return null;
}

/** Turns upload errors into the same friendly wording everywhere. */
export function cmsUploadErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'Upload failed.';
  return raw.includes('413') ? 'File is too large for the server. Compress the image to under 4 MB and try again.' : raw;
}
