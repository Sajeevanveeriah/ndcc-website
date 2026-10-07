'use client';

import { useEffect, useRef, useState } from 'react';
import Input from '@/components/ui/Input';
import { uploadCmsMedia } from '@/lib/admin-media-upload';
import { CMS_IMAGE_TYPES, CMS_PDF_TYPES, cmsUploadErrorMessage, cmsUploadProblem } from '@/lib/admin-upload-rules';
import { normaliseMediaUrl } from '@/lib/media-url';
import MediaLibraryPicker from '@/components/admin/MediaLibraryPicker';

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
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  // dragenter/dragleave fire for child elements too; count to avoid flicker.
  const dragDepth = useRef(0);
  const acceptedTypes = isPdf ? CMS_PDF_TYPES : CMS_IMAGE_TYPES;
  const dropHintId = `${id}-drop-hint`;

  const hasFiles = (event: React.DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files');
  const dropHandlers = {
    onDragEnter: (event: React.DragEvent) => {
      if (!hasFiles(event) || uploading) return;
      event.preventDefault();
      dragDepth.current += 1;
      setDragActive(true);
    },
    onDragOver: (event: React.DragEvent) => {
      if (!hasFiles(event) || uploading) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (event: React.DragEvent) => {
      if (!hasFiles(event)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragActive(false);
    },
    onDrop: (event: React.DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDragActive(false);
      if (uploading) return;
      const files = Array.from(event.dataTransfer.files);
      if (files.length === 0) return;
      void uploadFile(files[0]).then(() => {
        if (files.length > 1) setProgressText((text) => `${text} Only the first of the ${files.length} dropped files was used.`.trim());
      });
    },
  };

  useEffect(() => {
    setPreviewFailed(false);
  }, [value]);

  async function uploadFile(file: File) {
    setError(null);
    // Same type and size rules for picked and dropped files (the picker's
    // `accept` does not filter drops). Images are resized before the server's 4 MB limit.
    const problem = cmsUploadProblem(file, acceptedTypes);
    if (problem) {
      setProgressText('');
      setError(problem);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setUploading(true);
    onUploadingChange?.(true);
    setProgressText('Preparing, uploading and validating file...');

    try {
      const payload = await uploadCmsMedia(file);
      onChange(payload.path);
      setProgressText('File is ready. Review the preview, then save this form to publish your changes.');
    } catch (uploadError) {
      setProgressText('');
      setError(cmsUploadErrorMessage(uploadError));
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const trimmedValue = normaliseMediaUrl(value);
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
          onChange(normaliseMediaUrl(event.target.value));
        }}
      />
      {/* Drop zone: drag a file onto this area, or use the buttons (keyboard). */}
      <div
        data-drop-zone
        {...dropHandlers}
        className={`space-y-1 rounded-lg border-2 border-dashed p-3 transition-colors ${dragActive ? 'border-maroon-500 bg-surface-muted' : 'border-edge-subtle'}`}
      >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded-sm border border-edge-strong hover:bg-surface-page disabled:opacity-60"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          aria-describedby={dropHintId}
        >
          {uploading ? 'Uploading...' : isPdf ? 'Upload PDF' : 'Upload image'}
        </button>
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded-sm border border-edge-strong hover:bg-surface-page disabled:opacity-60"
          onClick={() => setLibraryOpen((open) => !open)}
          disabled={uploading}
          aria-expanded={libraryOpen}
        >
          Choose from library
        </button>
        <p className="text-xs text-content-muted">{isPdf ? 'PDF · max 10 MB' : 'JPEG, PNG, WebP up to 20 MB, resized automatically. GIF up to 4 MB.'}</p>
      </div>
      <p id={dropHintId} className="text-xs text-content-muted">
        {dragActive ? `Drop the ${isPdf ? 'PDF' : 'image'} to upload it.` : uploading ? 'Uploading, please wait...' : `Or drag and drop ${isPdf ? 'a PDF' : 'an image'} onto this box.`}
      </p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedTypes.join(',')}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void uploadFile(file);
          }
        }}
      />
      {libraryOpen && (
        <MediaLibraryPicker
          kind={isPdf ? 'pdf' : 'image'}
          onClose={() => setLibraryOpen(false)}
          onPick={(asset) => {
            setError(null);
            onChange(asset.public_url);
            setLibraryOpen(false);
            setProgressText('Library file selected. Review the preview, then save this form to publish your changes.');
          }}
        />
      )}
      {helpText && <p className="text-xs text-content-muted">{helpText}</p>}
      <div role="status" aria-live="polite" className="space-y-1">
        {progressText && <p className="text-xs text-status-success">{progressText}</p>}
        {error && <p className="text-xs text-status-error">{error}</p>}
      </div>
      {invalidPathWarning && <p className="text-xs text-status-warning">{invalidPathWarning}</p>}
      {value && !isPdf && (
        <div className="space-y-1">
          <div className="relative h-20 w-20 rounded-sm border border-edge-subtle overflow-hidden bg-surface-page">
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
            <p className="text-xs text-status-warning">
              Preview failed to load. Check that the image exists on the deployed site, or edit the URL before saving.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
