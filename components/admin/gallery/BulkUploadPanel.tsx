'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import Input, { Select, Textarea } from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { UploadCloud, RefreshCcw, X } from 'lucide-react';
import { parseApiResponse } from '@/lib/admin-client';
import { supabase as supabaseBrowserClient } from '@/lib/supabase';
import {
  GALLERY_MEDIA_BUCKET,
  MAX_GALLERY_BATCH_FILES,
  MAX_GALLERY_FILE_BYTES,
  isValidAlbumSlug,
  slugifyAlbumTitle,
  validateGalleryFileMeta,
} from '@/lib/gallery/shared';
import { PUBLISH_CONSENT_TEXT, type AdminAlbum } from './types';

type QueueStatus =
  | 'validating'
  | 'invalid'
  | 'queued'
  | 'preparing'
  | 'uploading'
  | 'uploaded'
  | 'finalising'
  | 'complete'
  | 'duplicate'
  | 'failed'
  | 'cancelled';

type QueueFile = {
  clientId: string;
  file: File;
  previewUrl: string;
  status: QueueStatus;
  error: string | null;
  path: string | null;
  token: string | null;
  attempts: number;
  width: number | null;
  height: number | null;
  contentHash: string | null;
  title: string;
  altText: string;
};

const ACTIVE_STATUSES: QueueStatus[] = ['preparing', 'uploading', 'uploaded', 'finalising'];
const UPLOAD_CONCURRENCY = 3;
const MAX_UPLOAD_ATTEMPTS = 3;

const STATUS_LABELS: Record<QueueStatus, string> = {
  validating: 'Validating…',
  invalid: 'Invalid',
  queued: 'Queued',
  preparing: 'Preparing…',
  uploading: 'Uploading…',
  uploaded: 'Uploaded',
  finalising: 'Finalising…',
  complete: 'Complete',
  duplicate: 'Already in album',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function sha256Hex(file: File): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null; // hash is an optimisation; upload still proceeds without it
  }
}

function readImageDimensions(previewUrl: string): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || null, height: image.naturalHeight || null });
    image.onerror = () => resolve({ width: null, height: null });
    image.src = previewUrl;
  });
}

type NewAlbumForm = {
  title: string;
  slug: string;
  description: string;
  event_date: string;
  season_label: string;
  allow_download: boolean;
};

const emptyNewAlbum: NewAlbumForm = { title: '', slug: '', description: '', event_date: '', season_label: '', allow_download: true };

export default function BulkUploadPanel({ onUploadsChanged }: { onUploadsChanged?: () => void }) {
  const [albums, setAlbums] = useState<AdminAlbum[]>([]);
  const [albumId, setAlbumId] = useState('');
  const [albumMode, setAlbumMode] = useState<'existing' | 'new'>('existing');
  const [newAlbum, setNewAlbum] = useState<NewAlbumForm>(emptyNewAlbum);
  const [newAlbumSlugTouched, setNewAlbumSlugTouched] = useState(false);
  const [creatingAlbum, setCreatingAlbum] = useState(false);

  const [queue, setQueue] = useState<QueueFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cancelRef = useRef(false);
  const queueRef = useRef<QueueFile[]>([]);
  queueRef.current = queue;

  const [defaults, setDefaults] = useState({
    caption: '',
    altPrefix: '',
    allowDownload: true,
    publishImages: true,
  });

  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);

  const loadAlbums = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/gallery/albums', { cache: 'no-store' });
      const result = await parseApiResponse<{ data?: AdminAlbum[] }>(response);
      setAlbums(result.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load albums.');
    }
  }, []);

  useEffect(() => {
    loadAlbums();
  }, [loadAlbums]);

  // Leaving mid-upload loses in-flight files; warn like unsaved-changes forms.
  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running]);

  // Revoke object URLs when the component unmounts.
  useEffect(() => () => {
    for (const item of queueRef.current) URL.revokeObjectURL(item.previewUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedAlbum = albums.find((album) => album.id === albumId) ?? null;
  const counts = useMemo(() => ({
    total: queue.length,
    complete: queue.filter((f) => f.status === 'complete' || f.status === 'duplicate').length,
    failed: queue.filter((f) => f.status === 'failed' || f.status === 'invalid').length,
    active: queue.filter((f) => ACTIVE_STATUSES.includes(f.status)).length,
    ready: queue.filter((f) => f.status === 'queued').length,
  }), [queue]);
  const finalisationIncomplete = running || counts.active > 0 || counts.ready > 0;

  function patchFile(clientId: string, patch: Partial<QueueFile>) {
    setQueue((prev) => prev.map((item) => (item.clientId === clientId ? { ...item, ...patch } : item)));
  }

  async function addFiles(list: FileList | File[]) {
    setError('');
    const incoming = Array.from(list);
    if (incoming.length === 0) return;
    if (queue.length + incoming.length > MAX_GALLERY_BATCH_FILES) {
      setError(`A batch can contain at most ${MAX_GALLERY_BATCH_FILES} files. Remove some files or upload in smaller batches.`);
      return;
    }
    const added: QueueFile[] = incoming.map((file, index) => ({
      clientId: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 10)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'validating',
      error: null,
      path: null,
      token: null,
      attempts: 0,
      width: null,
      height: null,
      contentHash: null,
      title: '',
      altText: '',
    }));
    setQueue((prev) => [...prev, ...added]);

    for (const item of added) {
      const validationError = validateGalleryFileMeta({
        filename: item.file.name,
        mimeType: item.file.type,
        sizeBytes: item.file.size,
      });
      if (validationError) {
        patchFile(item.clientId, { status: 'invalid', error: validationError });
        continue;
      }
      const [dimensions, contentHash] = await Promise.all([
        readImageDimensions(item.previewUrl),
        sha256Hex(item.file),
      ]);
      patchFile(item.clientId, { status: 'queued', ...dimensions, contentHash });
    }
    setAnnouncement(`${incoming.length} file${incoming.length === 1 ? '' : 's'} added to the queue.`);
  }

  function removeFile(clientId: string) {
    setQueue((prev) => {
      const target = prev.find((item) => item.clientId === clientId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.clientId !== clientId);
    });
  }

  function clearInvalid() {
    setQueue((prev) => {
      for (const item of prev) if (item.status === 'invalid') URL.revokeObjectURL(item.previewUrl);
      return prev.filter((item) => item.status !== 'invalid');
    });
  }

  function clearCompleted() {
    setQueue((prev) => {
      for (const item of prev) if (item.status === 'complete' || item.status === 'duplicate') URL.revokeObjectURL(item.previewUrl);
      return prev.filter((item) => item.status !== 'complete' && item.status !== 'duplicate');
    });
  }

  async function createDraftAlbum(): Promise<string | null> {
    if (!newAlbum.title.trim() || !isValidAlbumSlug(newAlbum.slug)) {
      setError('New album needs a title and a valid slug (lowercase letters, numbers and single hyphens).');
      return null;
    }
    setCreatingAlbum(true);
    try {
      const response = await fetch('/api/admin/gallery/albums', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newAlbum, event_date: newAlbum.event_date || null }),
      });
      const result = await parseApiResponse<{ data?: AdminAlbum }>(response);
      await loadAlbums();
      const created = result.data ?? null;
      if (created) {
        setAlbumMode('existing');
        setAlbumId(created.id);
        setNewAlbum(emptyNewAlbum);
        setNewAlbumSlugTouched(false);
        setAnnouncement(`Draft album “${created.title}” created.`);
        onUploadsChanged?.();
      }
      return created?.id ?? null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create album.');
      return null;
    } finally {
      setCreatingAlbum(false);
    }
  }

  async function uploadOne(item: QueueFile): Promise<'complete' | 'failed' | 'cancelled'> {
    if (!supabaseBrowserClient) {
      patchFile(item.clientId, { status: 'failed', error: 'Supabase is not configured in this environment.' });
      return 'failed';
    }
    for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
      if (cancelRef.current) {
        patchFile(item.clientId, { status: 'cancelled', error: null });
        return 'cancelled';
      }
      patchFile(item.clientId, { status: 'uploading', attempts: attempt });
      const { error: uploadError } = await supabaseBrowserClient.storage
        .from(GALLERY_MEDIA_BUCKET)
        .uploadToSignedUrl(item.path as string, item.token as string, item.file, { contentType: item.file.type });
      if (!uploadError) {
        patchFile(item.clientId, { status: 'uploaded', error: null });
        return 'complete';
      }
      const message = uploadError.message || 'Upload failed.';
      // Authentication / permission / policy errors never resolve by retrying.
      const permanent = /token|jwt|signature|policy|unauthorized|forbidden|exceeded|invalid|mime|duplicate/i.test(message);
      if (permanent || attempt === MAX_UPLOAD_ATTEMPTS) {
        patchFile(item.clientId, { status: 'failed', error: message });
        return 'failed';
      }
      // Bounded backoff for transient network failures: 1s, 2s.
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
    return 'failed';
  }

  async function startUpload() {
    if (running) return; // duplicate-press protection
    setError('');
    cancelRef.current = false;

    let targetAlbumId = albumId;
    if (albumMode === 'new') {
      const createdId = await createDraftAlbum();
      if (!createdId) return;
      targetAlbumId = createdId;
    }
    if (!targetAlbumId) {
      setError('Select an album (or create a new draft album) before uploading.');
      return;
    }
    const pending = queueRef.current.filter((item) => item.status === 'queued' || item.status === 'failed' || item.status === 'cancelled');
    if (pending.length === 0) {
      setError('Add at least one valid file to upload.');
      return;
    }

    setRunning(true);
    setAnnouncement(`Starting upload of ${pending.length} file${pending.length === 1 ? '' : 's'}.`);
    try {
      // 1) Prepare: metadata only; the server generates paths + signed tokens.
      for (const item of pending) patchFile(item.clientId, { status: 'preparing', error: null });
      const prepareResponse = await fetch('/api/admin/gallery/uploads/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          albumId: targetAlbumId,
          files: pending.map((item) => ({
            clientId: item.clientId,
            filename: item.file.name,
            mimeType: item.file.type,
            sizeBytes: item.file.size,
            width: item.width ?? undefined,
            height: item.height ?? undefined,
            contentHash: item.contentHash ?? undefined,
          })),
        }),
      });
      const prepared = await parseApiResponse<{ entries: Array<{ clientId: string | null; path: string; token: string }> }>(prepareResponse);
      const slots = new Map((prepared.entries ?? []).map((entry) => [entry.clientId, entry]));
      const uploadable: QueueFile[] = [];
      for (const item of pending) {
        const slot = slots.get(item.clientId);
        if (!slot) {
          patchFile(item.clientId, { status: 'failed', error: 'No upload slot was prepared for this file.' });
          continue;
        }
        patchFile(item.clientId, { path: slot.path, token: slot.token });
        uploadable.push({ ...item, path: slot.path, token: slot.token });
      }

      // 2) Direct-to-Storage uploads with bounded concurrency.
      let cursor = 0;
      const uploadedIds: string[] = [];
      const workers = Array.from({ length: Math.min(UPLOAD_CONCURRENCY, uploadable.length) }, async () => {
        while (cursor < uploadable.length && !cancelRef.current) {
          const item = uploadable[cursor];
          cursor += 1;
          const outcome = await uploadOne(item);
          if (outcome === 'complete') uploadedIds.push(item.clientId);
        }
      });
      await Promise.all(workers);
      if (cancelRef.current) {
        setQueue((prev) => prev.map((item) => (
          item.status === 'preparing' || item.status === 'queued'
            ? { ...item, status: 'cancelled' }
            : item
        )));
      }

      // 3) Finalise only the files that genuinely uploaded.
      const uploaded = queueRef.current.filter((item) => uploadedIds.includes(item.clientId));
      if (uploaded.length > 0) {
        for (const item of uploaded) patchFile(item.clientId, { status: 'finalising' });
        const finalizeResponse = await fetch('/api/admin/gallery/uploads/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            albumId: targetAlbumId,
            totalCount: queueRef.current.filter((f) => f.status !== 'invalid').length,
            defaults,
            entries: uploaded.map((item) => ({
              path: item.path,
              filename: item.file.name,
              mimeType: item.file.type,
              sizeBytes: item.file.size,
              width: item.width ?? undefined,
              height: item.height ?? undefined,
              contentHash: item.contentHash ?? undefined,
              title: item.title || undefined,
              altText: item.altText || undefined,
              caption: undefined,
            })),
          }),
        });
        const result = await parseApiResponse<{
          inserted: number;
          duplicates: string[];
          failed: Array<{ path: string; reason: string }>;
          rejected: Array<{ path: string; reason: string }>;
        }>(finalizeResponse);
        const duplicateSet = new Set(result.duplicates ?? []);
        const failedMap = new Map((result.failed ?? []).concat(result.rejected ?? []).map((f) => [f.path, f.reason]));
        for (const item of uploaded) {
          if (item.path && duplicateSet.has(item.path)) patchFile(item.clientId, { status: 'duplicate', error: null });
          else if (item.path && failedMap.has(item.path)) patchFile(item.clientId, { status: 'failed', error: failedMap.get(item.path) ?? 'Finalisation failed.' });
          else patchFile(item.clientId, { status: 'complete', error: null });
        }
        setAnnouncement(`Upload finished: ${result.inserted} added${(result.duplicates?.length ?? 0) > 0 ? `, ${result.duplicates.length} already in the album` : ''}${(result.failed?.length ?? 0) > 0 ? `, ${result.failed.length} failed` : ''}.`);
      } else if (!cancelRef.current) {
        setAnnouncement('No files were uploaded.');
      }
      await loadAlbums();
      onUploadsChanged?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed.';
      setError(message);
      setQueue((prev) => prev.map((item) => (
        ACTIVE_STATUSES.includes(item.status) ? { ...item, status: 'failed', error: item.error ?? message } : item
      )));
    } finally {
      setRunning(false);
    }
  }

  async function publishAlbum() {
    if (!selectedAlbum) return;
    setPublishBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/gallery/albums', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedAlbum.id, published: true, confirmPublication: true }),
      });
      await parseApiResponse(response);
      setPublishModalOpen(false);
      setConsentChecked(false);
      setAnnouncement(`Album “${selectedAlbum.title}” published.`);
      await loadAlbums();
      onUploadsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish album.');
    } finally {
      setPublishBusy(false);
    }
  }

  const albumOptions = albums.map((album) => ({
    value: album.id,
    label: `${album.title}${album.published ? '' : ' (draft)'} — ${album.image_count} image${album.image_count === 1 ? '' : 's'}`,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <UploadCloud className="h-5 w-5 text-maroon-700 dark:text-maroon-200" aria-hidden="true" />
          Bulk Upload
        </h2>
        <p className="text-sm text-content-muted">
          Upload many event photos straight from your device to secure club storage. JPEG, PNG or WebP, up to 20 MB each,
          {' '}{MAX_GALLERY_BATCH_FILES} files per batch.
        </p>
      </div>

      {error && <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>

      {/* Step 1: album */}
      <section aria-labelledby="bulk-step-album" className="bg-surface-card border border-edge-subtle rounded-xl p-5 space-y-4">
        <h3 id="bulk-step-album" className="font-semibold">1. Choose an album</h3>
        <div className="flex flex-wrap gap-4" role="radiogroup" aria-label="Album selection mode">
          <label className="text-sm text-content-secondary inline-flex items-center gap-2">
            <input type="radio" name="album-mode" checked={albumMode === 'existing'} onChange={() => setAlbumMode('existing')} />
            Use an existing album
          </label>
          <label className="text-sm text-content-secondary inline-flex items-center gap-2">
            <input type="radio" name="album-mode" checked={albumMode === 'new'} onChange={() => setAlbumMode('new')} />
            Create a new draft album
          </label>
        </div>
        {albumMode === 'existing' ? (
          <div className="max-w-xl">
            <Select
              id="bulk_album"
              label="Album"
              value={albumId}
              onChange={(e) => setAlbumId(e.target.value)}
              options={albumOptions}
            />
            {selectedAlbum && !selectedAlbum.published && (
              <p className="text-xs text-amber-700 mt-1">This album is a draft — the public cannot see it until you publish it.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              id="bulk_new_title"
              label="Title"
              required
              value={newAlbum.title}
              onChange={(e) => {
                const title = e.target.value;
                setNewAlbum((prev) => ({ ...prev, title, slug: newAlbumSlugTouched ? prev.slug : slugifyAlbumTitle(title) }));
              }}
            />
            <Input
              id="bulk_new_slug"
              label="Slug (public URL)"
              required
              value={newAlbum.slug}
              onChange={(e) => { setNewAlbumSlugTouched(true); setNewAlbum((prev) => ({ ...prev, slug: e.target.value })); }}
              error={newAlbum.slug && !isValidAlbumSlug(newAlbum.slug) ? 'Lowercase letters, numbers and single hyphens only.' : undefined}
            />
            <Input id="bulk_new_event_date" label="Event date" type="date" value={newAlbum.event_date} onChange={(e) => setNewAlbum((prev) => ({ ...prev, event_date: e.target.value }))} />
            <Input id="bulk_new_season" label="Season label" placeholder="e.g. 2026/27" value={newAlbum.season_label} onChange={(e) => setNewAlbum((prev) => ({ ...prev, season_label: e.target.value }))} />
            <div className="md:col-span-2">
              <Textarea id="bulk_new_description" label="Description" value={newAlbum.description} onChange={(e) => setNewAlbum((prev) => ({ ...prev, description: e.target.value }))} />
            </div>
            <label className="text-sm text-content-secondary inline-flex items-center gap-2 md:col-span-2">
              <input type="checkbox" checked={newAlbum.allow_download} onChange={(e) => setNewAlbum((prev) => ({ ...prev, allow_download: e.target.checked }))} />
              Allow public download of originals by default
            </label>
            {newAlbum.slug && isValidAlbumSlug(newAlbum.slug) && (
              <p className="text-xs text-content-muted md:col-span-2">Public address preview: <span className="font-mono">/gallery/{newAlbum.slug}</span></p>
            )}
          </div>
        )}
      </section>

      {/* Step 2: files */}
      <section aria-labelledby="bulk-step-files" className="bg-surface-card border border-edge-subtle rounded-xl p-5 space-y-4">
        <h3 id="bulk-step-files" className="font-semibold">2. Add photos</h3>
        <div
          role="button"
          tabIndex={0}
          aria-label="Add photos: drop files here or press Enter to browse"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            void addFiles(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-maroon-500 ${dragActive ? 'border-maroon-600 bg-maroon-50 dark:bg-maroon-950/30' : 'border-edge-strong hover:border-maroon-500'}`}
        >
          <UploadCloud className="h-8 w-8 text-maroon-700 dark:text-maroon-200" aria-hidden="true" />
          <p className="font-medium">Drag and drop photos here, or click to browse</p>
          <p className="text-xs text-content-muted">JPEG, PNG or WebP · max {Math.round(MAX_GALLERY_FILE_BYTES / (1024 * 1024))} MB each · max {MAX_GALLERY_BATCH_FILES} files per batch</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = '';
          }}
        />

        {queue.length > 0 && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-content-secondary" role="status">
                {counts.complete} of {counts.total} complete{counts.failed > 0 ? ` · ${counts.failed} failed or invalid` : ''}{counts.active > 0 ? ` · ${counts.active} in progress` : ''}
              </p>
              <div className="flex gap-2">
                {queue.some((f) => f.status === 'invalid') && (
                  <Button size="sm" variant="secondary" onClick={clearInvalid}>Clear invalid files</Button>
                )}
                {queue.some((f) => f.status === 'complete' || f.status === 'duplicate') && (
                  <Button size="sm" variant="secondary" onClick={clearCompleted}>Clear completed</Button>
                )}
              </div>
            </div>
            <ul className="divide-y divide-edge-subtle border border-edge-subtle rounded-lg overflow-hidden" aria-label="Upload queue">
              {queue.map((item) => (
                <li key={item.clientId} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-surface-page/40">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.previewUrl} alt="" className="h-12 w-12 rounded object-cover border border-edge-subtle shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" title={item.file.name}>{item.file.name}</p>
                      <p className="text-xs text-content-muted">
                        {formatBytes(item.file.size)} · {item.file.type.replace('image/', '').toUpperCase()}
                        {item.width && item.height ? ` · ${item.width}×${item.height}` : ''}
                      </p>
                      {item.error && <p className="text-xs text-red-600">{item.error}</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {(item.status === 'queued' || item.status === 'failed') && !running && (
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) => patchFile(item.clientId, { title: e.target.value })}
                        placeholder="Title (optional)"
                        aria-label={`Title for ${item.file.name}`}
                        className="form-input !py-1 text-xs w-36"
                      />
                    )}
                    {(item.status === 'queued' || item.status === 'failed') && !running && (
                      <input
                        type="text"
                        value={item.altText}
                        onChange={(e) => patchFile(item.clientId, { altText: e.target.value })}
                        placeholder="Alt text (optional)"
                        aria-label={`Alt text for ${item.file.name}`}
                        className="form-input !py-1 text-xs w-40"
                      />
                    )}
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                        item.status === 'complete' || item.status === 'duplicate'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                          : item.status === 'failed' || item.status === 'invalid'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                            : ACTIVE_STATUSES.includes(item.status)
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                              : 'bg-surface-page text-content-secondary border border-edge-subtle'
                      }`}
                    >
                      {STATUS_LABELS[item.status]}
                    </span>
                    {!running && item.status !== 'complete' && item.status !== 'duplicate' && (
                      <button
                        type="button"
                        onClick={() => removeFile(item.clientId)}
                        aria-label={`Remove ${item.file.name} from the queue`}
                        className="p-1.5 rounded text-content-muted hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-maroon-500"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Step 3: defaults */}
      <section aria-labelledby="bulk-step-defaults" className="bg-surface-card border border-edge-subtle rounded-xl p-5 space-y-4">
        <h3 id="bulk-step-defaults" className="font-semibold">3. Defaults for this batch</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            id="bulk_default_caption"
            label="Default caption (optional)"
            value={defaults.caption}
            onChange={(e) => setDefaults((prev) => ({ ...prev, caption: e.target.value }))}
            placeholder="Leave blank for no caption"
          />
          <Input
            id="bulk_alt_prefix"
            label="Alt-text prefix (optional)"
            value={defaults.altPrefix}
            onChange={(e) => setDefaults((prev) => ({ ...prev, altPrefix: e.target.value }))}
            placeholder="e.g. Finals day photograph"
          />
        </div>
        <p className="text-xs text-content-muted">
          Photos without their own alt text get an accessible fallback like “Finals day photograph 3 of 42”. Raw filenames are never used as public alt text.
        </p>
        <div className="flex flex-wrap gap-4">
          <label className="text-sm text-content-secondary inline-flex items-center gap-2">
            <input type="checkbox" checked={defaults.allowDownload} onChange={(e) => setDefaults((prev) => ({ ...prev, allowDownload: e.target.checked }))} />
            Allow public download of originals
          </label>
          <label className="text-sm text-content-secondary inline-flex items-center gap-2">
            <input type="checkbox" checked={defaults.publishImages} onChange={(e) => setDefaults((prev) => ({ ...prev, publishImages: e.target.checked }))} />
            Mark photos as published once uploaded (album itself stays draft until you publish it)
          </label>
        </div>
      </section>

      {/* Step 4: upload */}
      <section aria-labelledby="bulk-step-upload" className="bg-surface-card border border-edge-subtle rounded-xl p-5 space-y-4">
        <h3 id="bulk-step-upload" className="font-semibold">4. Upload</h3>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void startUpload()} isLoading={running} disabled={running || creatingAlbum || (counts.ready === 0 && counts.failed === 0)}>
            {counts.failed > 0 && counts.ready === 0 ? (
              <span className="inline-flex items-center gap-1"><RefreshCcw className="h-4 w-4" aria-hidden="true" /> Retry failed files</span>
            ) : 'Start upload'}
          </Button>
          {running && (
            <Button variant="secondary" onClick={() => { cancelRef.current = true; setAnnouncement('Cancelling — files already uploading will finish, queued files will stop.'); }}>
              Cancel remaining
            </Button>
          )}
          <p className="text-xs text-amber-700">Keep this page open while uploading — leaving the page interrupts files that have not finished.</p>
        </div>
        <p className="text-xs text-content-muted">
          Files upload directly from your browser to club storage in small groups. Failed files can be retried without re-uploading the ones that succeeded.
        </p>
      </section>

      {/* Step 5: completion / publish */}
      <section aria-labelledby="bulk-step-finish" className="bg-surface-card border border-edge-subtle rounded-xl p-5 space-y-4">
        <h3 id="bulk-step-finish" className="font-semibold">5. Finish</h3>
        {counts.total === 0 ? (
          <p className="text-sm text-content-muted">Once an upload completes, you can review the results and publish the album here.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-content-secondary" role="status">
              {counts.complete} finalised · {counts.failed} failed or invalid · {counts.total} total
            </p>
            {counts.failed > 0 && (
              <p className="text-sm text-amber-700">
                Some files did not finish. The album will not be published automatically — retry the failed files, or publish the successful photos only.
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              {selectedAlbum && (
                <a href={`/gallery/${selectedAlbum.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex">
                  <Button variant="secondary" size="sm">Open album preview</Button>
                </a>
              )}
              {selectedAlbum && !selectedAlbum.published && (
                <Button
                  size="sm"
                  disabled={finalisationIncomplete || counts.complete === 0}
                  onClick={() => { setConsentChecked(false); setPublishModalOpen(true); }}
                >
                  {counts.failed > 0 ? 'Publish successful photos only…' : 'Publish album…'}
                </Button>
              )}
              {selectedAlbum && !selectedAlbum.published && (
                <p className="text-xs text-content-muted self-center">Or keep it as a draft and publish later from the Albums tab.</p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Publish confirmation with consent acknowledgement */}
      <Modal isOpen={publishModalOpen} onClose={() => setPublishModalOpen(false)} title="Publish Album" size="md">
        <div className="space-y-4">
          {counts.failed > 0 && (
            <p className="text-sm text-amber-700">
              {counts.failed} file{counts.failed === 1 ? '' : 's'} failed or {counts.failed === 1 ? 'was' : 'were'} invalid. Publishing now makes only the successfully uploaded photos public.
            </p>
          )}
          <p className="text-sm text-content-muted font-body">
            “{selectedAlbum?.title}” will become visible to everyone at <span className="font-mono">/gallery/{selectedAlbum?.slug}</span>.
          </p>
          <label className="flex items-start gap-2 text-sm text-content-secondary">
            <input type="checkbox" className="mt-1" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} />
            <span>{PUBLISH_CONSENT_TEXT}</span>
          </label>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setPublishModalOpen(false)}>Keep as draft</Button>
            <Button isLoading={publishBusy} disabled={!consentChecked} onClick={() => void publishAlbum()}>Publish Album</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
