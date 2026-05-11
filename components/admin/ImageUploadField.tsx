'use client';

import { useEffect, useRef, useState } from 'react';
import Input from '@/components/ui/Input';

interface ImageUploadFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helpText?: string;
}

type UploadMetadata = {
  publicPath?: string;
  repoPath?: string;
  deployment?: 'triggered' | 'not_configured' | 'failed';
};

function isValidBrowserImagePath(value: string) {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) || trimmed.startsWith('/images/');
}

export default function ImageUploadField({ id, label, value, onChange, placeholder, helpText }: ImageUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<UploadMetadata | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    setPreviewFailed(false);
  }, [value]);

  async function uploadFile(file: File) {
    setError(null);
    setWarning(null);
    setMetadata(null);
    setUploading(true);
    setProgressText('Uploading image...');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/admin/media/upload', {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || `Upload failed (${response.status})`);
      }

      if (!payload?.path || typeof payload.path !== 'string') {
        throw new Error('Upload failed: invalid API response.');
      }

      onChange(payload.path);
      setProgressText('Upload complete. Save this form after confirming the preview.');
      setWarning(typeof payload?.warning === 'string' ? payload.warning : null);
      setMetadata(payload?.metadata && typeof payload.metadata === 'object' ? payload.metadata : null);
    } catch (uploadError) {
      setProgressText('');
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const trimmedValue = value.trim();
  const invalidPathWarning = trimmedValue && !isValidBrowserImagePath(trimmedValue)
    ? 'Image path should be a full https:// URL or a browser path beginning with /images/.'
    : null;
  const deploymentWarning = metadata?.deployment === 'triggered'
    ? 'A Vercel deployment was triggered. The image may not appear on the live site until that deployment completes.'
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
          setWarning(null);
          setMetadata(null);
          setProgressText('');
          onChange(event.target.value);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-60"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Uploading...' : 'Upload image'}
        </button>
        <p className="text-xs text-gray-500">JPEG, PNG, WebP, GIF · max 4 MB</p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void uploadFile(file);
          }
        }}
      />
      {helpText && <p className="text-xs text-gray-500">{helpText}</p>}
      {progressText && <p className="text-xs text-green-700">{progressText}</p>}
      {metadata?.publicPath && <p className="text-xs text-gray-500">Saved as {metadata.publicPath}</p>}
      {deploymentWarning && <p className="text-xs text-amber-700">{deploymentWarning}</p>}
      {invalidPathWarning && <p className="text-xs text-amber-700">{invalidPathWarning}</p>}
      {warning && <p className="text-xs text-amber-700">{warning}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {value && (
        <div className="space-y-1">
          <div className="relative h-20 w-20 rounded border border-gray-200 overflow-hidden bg-gray-50">
            {!previewFailed && isValidBrowserImagePath(trimmedValue) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={trimmedValue}
                alt="Preview"
                className="h-full w-full object-cover"
                onError={() => setPreviewFailed(true)}
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center px-2 text-center text-[10px] text-gray-500">
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
