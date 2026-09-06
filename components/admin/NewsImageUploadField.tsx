'use client';

import { useRef, useState } from 'react';
import type { NewsGalleryImage } from '@/lib/news-gallery';

interface NewsImageUploadFieldProps {
  id: string;
  value: NewsGalleryImage[];
  onChange: (value: NewsGalleryImage[]) => void;
  articleTitle?: string;
}

const MAX_GALLERY_IMAGES = 20;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function defaultAltText(fileName: string, articleTitle: string, index: number) {
  const readableName = fileName
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/^\d{8}[-_ ]*/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\brev\d+\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (readableName) return readableName;
  if (articleTitle.trim()) return `${articleTitle.trim()} image ${index + 1}`;
  return `News article image ${index + 1}`;
}

export default function NewsImageUploadField({ id, value, onChange, articleTitle = '' }: NewsImageUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const moveImage = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= value.length) return;

    const next = value.slice();
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    onChange(next);
  };

  const removeImage = (index: number) => {
    onChange(value.filter((_, imageIndex) => imageIndex !== index));
  };

  const updateAlt = (index: number, alt: string) => {
    onChange(value.map((image, imageIndex) => (imageIndex === index ? { ...image, alt } : image)));
  };

  async function uploadImages(files: File[]) {
    setError(null);
    setProgressText('');

    if (!files.length) return;
    if (value.length + files.length > MAX_GALLERY_IMAGES) {
      setError(`A news article can contain up to ${MAX_GALLERY_IMAGES} additional images.`);
      return;
    }

    for (const file of files) {
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        setError(`${file.name}: unsupported file type. Use JPEG, PNG, WebP or GIF.`);
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setError(`${file.name}: file is larger than 4 MB. Compress it and try again.`);
        return;
      }
    }

    setUploading(true);
    const nextImages = value.slice();

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setProgressText(`Uploading image ${index + 1} of ${files.length}...`);

        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/admin/media/upload', {
          method: 'POST',
          headers: { 'X-NDCC-CSRF': '1' },
          body: formData,
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error || `${file.name}: upload failed (${response.status}).`);
        }
        if (!payload?.path || typeof payload.path !== 'string') {
          throw new Error(`${file.name}: upload returned an invalid path.`);
        }

        if (!nextImages.some((image) => image.src === payload.path)) {
          nextImages.push({
            src: payload.path,
            alt: defaultAltText(file.name, articleTitle, nextImages.length),
          });
          onChange(nextImages.slice());
        }
      }

      setProgressText(`${files.length} image${files.length === 1 ? '' : 's'} uploaded. Review the order and alt text, then save the article.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Image upload failed.');
      setProgressText(nextImages.length > value.length ? 'Successfully uploaded images have been kept in the gallery.' : '');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <fieldset className="space-y-3 rounded-lg border border-edge-subtle p-4">
      <legend className="px-1 text-sm font-body font-medium text-content-secondary">Additional article images</legend>
      <p className="text-xs text-content-muted">
        Select several images at once. They appear after the cover image in the order shown below.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded border border-edge-strong px-3 py-1.5 text-xs hover:bg-surface-page disabled:opacity-60"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || value.length >= MAX_GALLERY_IMAGES}
        >
          {uploading ? 'Uploading...' : 'Upload multiple images'}
        </button>
        <span className="text-xs text-content-muted">JPEG, PNG, WebP, GIF - max 4 MB each - up to {MAX_GALLERY_IMAGES}</span>
      </div>

      <input
        ref={fileInputRef}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          void uploadImages(files);
        }}
      />

      {progressText && <p className="text-xs text-green-700">{progressText}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {value.length > 0 && (
        <ol className="space-y-3" aria-label="Additional article images">
          {value.map((image, index) => (
            <li key={`${image.src}-${index}`} className="grid gap-3 rounded-lg border border-edge-subtle p-3 sm:grid-cols-[88px_1fr]">
              <div className="h-[88px] w-[88px] overflow-hidden rounded border border-edge-subtle bg-surface-page">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.src} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0 space-y-2">
                <p className="break-all text-xs text-content-muted">{image.src}</p>
                <label className="block text-xs font-body text-content-secondary">
                  Alt text
                  <input
                    type="text"
                    value={image.alt}
                    maxLength={240}
                    onChange={(event) => updateAlt(index, event.target.value)}
                    className="mt-1 w-full rounded-lg border border-edge-strong bg-surface-card px-3 py-2 text-sm"
                    aria-label={`Alt text for additional image ${index + 1}`}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => moveImage(index, -1)}
                    disabled={index === 0}
                    className="rounded border border-edge-strong px-2.5 py-1 text-xs hover:bg-surface-page disabled:opacity-40"
                    aria-label={`Move image ${index + 1} up`}
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    onClick={() => moveImage(index, 1)}
                    disabled={index === value.length - 1}
                    className="rounded border border-edge-strong px-2.5 py-1 text-xs hover:bg-surface-page disabled:opacity-40"
                    aria-label={`Move image ${index + 1} down`}
                  >
                    Move down
                  </button>
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="rounded border border-red-300 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50"
                    aria-label={`Remove image ${index + 1}`}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </fieldset>
  );
}
