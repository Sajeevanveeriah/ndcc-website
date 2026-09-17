'use client';

import { useEffect, useRef, useState } from 'react';
import Input from '@/components/ui/Input';
import { uploadCmsMedia } from '@/lib/admin-media-upload';

interface ImageUploadFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helpText?: string;
  /** 'image' (default) or 'pdf' — switches accepted types, size limit and preview. */
  variant?: 'image' | 'pdf';
  onUploadingChange?: (uploading: boolean) => void;
}

function isValidBrowserImagePath(value: string) {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) || trimmed.startsWith('/images/');
}

export default function ImageUploadField({ id, label, value, onChange, placeholder, helpText, variant = 'image', onUploadingChange }: ImageUploadFieldProps) {
  const isPdf = variant === 'pdf';
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    setPreviewFailed(false);
  }, [value]);

  async function uploadFile(file: File) {
    setError(null);
    const MAX_CLIENT_BYTES = (isPdf ? 10 : 4) * 1024 * 1024; // matches server limits
    if (file.size > MAX_CLIENT_BYTES) {
      const sizeMb = (file.size / 1024 / 1024).toFixed(1);
      setError(`File is too large (${sizeMb} MB). Maximum is ${isPdf ? 10 : 4} MB. ${isPdf ? 'Compress the PDF and try again.' : 'Compress the image or export at a lower resolution and try again.'}`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setUploading(true);
    onUploadingChange?.(true);
    setProgressText('Uploading and validating file...');

    try {
      const payload = await uploadCmsMedia(file);
      onChange(payload.path);
      setProgressText('File is ready. Review the preview, then save this form to publish your changes.');
    } catch (uploadError) {
      setProgressText('');
      const raw = uploadError instanceof Error ? uploadError.message : 'Upload failed.';
      if (raw.includes('413')) {
        setError('File is too large for the server. Compress the image to under 4 MB and try again.');
      } else {
        setError(raw);
      }
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const trimmedValue = value.trim();
  const invalidPathWarning = trimmedValue && !isValidBrowserImagePath(trimmedValue)
    ? 'Image path should be a full https:// URL or a browser path beginning with /images/.'
    : null;

  return (
    <div className="space-y-2">
      <Input
        id={id}
        label={label}
        value={value}
        placeholder={placeholder || 'https://example.com/image.jpg or /images/cms/...'}
        onChange={(event) => {
          setError(null);
          setProgressText('');
          onChange(event.target.value);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded border border-edge-strong hover:bg-surface-page disabled:opacity-60"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Uploading...' : isPdf ? 'Upload PDF' : 'Upload image'}
        </button>
        <p className="text-xs text-content-muted">{isPdf ? 'PDF · max 10 MB' : 'JPEG, PNG, WebP, GIF · max 4 MB'}</p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={isPdf ? 'application/pdf' : 'image/jpeg,image/png,image/webp,image/gif'}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void uploadFile(file);
          }
        }}
      />
      {helpText && <p className="text-xs text-content-muted">{helpText}</p>}
      {progressText && <p className="text-xs text-green-700">{progressText}</p>}
      {invalidPathWarning && <p className="text-xs text-amber-700">{invalidPathWarning}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {value && !isPdf && (
        <div className="space-y-1">
          <div className="relative h-20 w-20 rounded border border-edge-subtle overflow-hidden bg-surface-page">
            {!previewFailed && isValidBrowserImagePath(trimmedValue) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={trimmedValue}
                alt="Preview"
                className="h-full w-full object-cover"
                onError={() => setPreviewFailed(true)}
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center px-2 text-center text-xs text-content-muted">
                Preview unavailable
              </div>
            )}
          </div>
          {previewFailed && (
            <p className="text-xs text-amber-700">
              Preview failed to load. Check that the image exists on the deployed site, or edit the URL before saving.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
