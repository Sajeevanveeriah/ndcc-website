'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import Input from '@/components/ui/Input';

interface ImageUploadFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helpText?: string;
}

export default function ImageUploadField({ id, label, value, onChange, placeholder, helpText }: ImageUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  async function uploadFile(file: File) {
    setError(null);
    setWarning(null);
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
      setProgressText('Upload complete.');
      setWarning(typeof payload?.warning === 'string' ? payload.warning : null);
    } catch (uploadError) {
      setProgressText('');
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

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
      {warning && <p className="text-xs text-amber-700">{warning}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {value && (
        <div className="relative h-20 w-20 rounded border border-gray-200 overflow-hidden">
          <Image src={value} alt="Preview" fill className="object-cover" sizes="80px" />
        </div>
      )}
    </div>
  );
}
