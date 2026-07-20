'use client';

import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input, { Textarea } from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import ImageUploadField from '@/components/admin/ImageUploadField';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { FolderOpen, Pencil, Plus, Trash2, ExternalLink } from 'lucide-react';
import { parseApiResponse } from '@/lib/admin-client';
import { slugifyAlbumTitle, isValidAlbumSlug } from '@/lib/gallery/shared';
import { PUBLISH_CONSENT_TEXT, type AdminAlbum } from './types';

type AlbumForm = {
  title: string;
  slug: string;
  description: string;
  event_date: string;
  season_label: string;
  cover_image_url: string;
  sort_order: number;
  allow_download: boolean;
};

const emptyForm: AlbumForm = {
  title: '',
  slug: '',
  description: '',
  event_date: '',
  season_label: '',
  cover_image_url: '',
  sort_order: 0,
  allow_download: true,
};

function formFromAlbum(album: AdminAlbum): AlbumForm {
  return {
    title: album.title,
    slug: album.slug,
    description: album.description,
    event_date: album.event_date ?? '',
    season_label: album.season_label,
    cover_image_url: album.cover_image_url ?? '',
    sort_order: album.sort_order,
    allow_download: album.allow_download,
  };
}

export default function AlbumsPanel({ onAlbumsChanged }: { onAlbumsChanged?: () => void }) {
  const [albums, setAlbums] = useState<AdminAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AlbumForm>(emptyForm);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const [publishTarget, setPublishTarget] = useState<AdminAlbum | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AdminAlbum | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadAlbums = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/gallery/albums', { cache: 'no-store' });
      const result = await parseApiResponse<{ data?: AdminAlbum[] }>(response);
      setAlbums(result.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load albums.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAlbums();
  }, [loadAlbums]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setSlugTouched(false);
    setError('');
    setSuccess('');
    setModalOpen(true);
  }

  function openEdit(album: AdminAlbum) {
    setEditingId(album.id);
    setForm(formFromAlbum(album));
    setSlugTouched(true);
    setError('');
    setSuccess('');
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidAlbumSlug(form.slug)) {
      setError('Slug must be lowercase letters, numbers and single hyphens.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = { ...form, event_date: form.event_date || null, cover_image_url: form.cover_image_url || null };
      const response = await fetch('/api/admin/gallery/albums', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      });
      await parseApiResponse(response);
      setSuccess(editingId ? 'Album updated.' : 'Album created as a draft.');
      setModalOpen(false);
      await loadAlbums();
      onAlbumsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save album.');
    } finally {
      setSaving(false);
    }
  }

  async function handlePublishToggle() {
    if (!publishTarget) return;
    const publishing = !publishTarget.published;
    setPublishBusy(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/admin/gallery/albums', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: publishTarget.id,
          published: publishing,
          ...(publishing ? { confirmPublication: true } : {}),
        }),
      });
      await parseApiResponse(response);
      setSuccess(publishing ? 'Album published.' : 'Album unpublished. Note: this removes website visibility but does not erase copies people have already downloaded.');
      setPublishTarget(null);
      setConsentChecked(false);
      await loadAlbums();
      onAlbumsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update album.');
    } finally {
      setPublishBusy(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`/api/admin/gallery/albums?id=${deleteTarget.id}`, { method: 'DELETE' });
      await parseApiResponse(response);
      setSuccess('Album deleted. Its images were kept and are now ungrouped; Storage files were not removed.');
      setDeleteTarget(null);
      await loadAlbums();
      onAlbumsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete album.');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-maroon-700 dark:text-maroon-200" aria-hidden="true" />
            Albums
          </h2>
          <p className="text-sm text-content-muted">Group event photos into albums. Albums start as drafts and only appear on the public gallery once published.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
          New Album
        </Button>
      </div>

      {error && <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
      {success && <p role="status" className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{success}</p>}

      <div className="bg-surface-card border border-edge-subtle rounded-xl overflow-hidden">
        {loading ? (
          <p className="p-6 text-content-muted">Loading albums...</p>
        ) : albums.length === 0 ? (
          <p className="p-6 text-content-muted">No albums yet. Create one to start a bulk upload.</p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Album</TableHeader>
                <TableHeader>Event date</TableHeader>
                <TableHeader>Season</TableHeader>
                <TableHeader>Images</TableHeader>
                <TableHeader>Downloads</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {albums.map((album) => (
                <TableRow key={album.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {album.cover_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={album.cover_image_url} alt="" className="h-10 w-10 rounded object-cover border border-edge-subtle" />
                      ) : (
                        <div className="h-10 w-10 rounded bg-surface-page border border-edge-subtle" aria-hidden="true" />
                      )}
                      <div>
                        <p className="font-medium">{album.title}</p>
                        <p className="text-xs text-content-muted">/gallery/{album.slug}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{album.event_date || '—'}</TableCell>
                  <TableCell>{album.season_label || '—'}</TableCell>
                  <TableCell>{album.image_count}</TableCell>
                  <TableCell>{album.allow_download ? 'Allowed' : 'Off'}</TableCell>
                  <TableCell>
                    <span className={album.published
                      ? 'inline-flex rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-xs font-semibold dark:bg-green-900/40 dark:text-green-300'
                      : 'inline-flex rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-semibold dark:bg-amber-900/40 dark:text-amber-300'}>
                      {album.published ? 'Published' : 'Draft'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(album)} aria-label={`Edit ${album.title}`}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setPublishTarget(album); setConsentChecked(false); }}>
                        {album.published ? 'Unpublish' : 'Publish'}
                      </Button>
                      <a
                        href={`/gallery/${album.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center p-2 text-content-muted hover:text-content-primary"
                        aria-label={`Open public preview of ${album.title}`}
                      >
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      </a>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(album)} aria-label={`Delete ${album.title}`}>
                        <Trash2 className="h-4 w-4 text-red-500" aria-hidden="true" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Create / edit modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Album' : 'New Album'} size="lg">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              id="album_title"
              label="Title"
              required
              value={form.title}
              onChange={(e) => {
                const title = e.target.value;
                setForm((prev) => ({
                  ...prev,
                  title,
                  slug: slugTouched ? prev.slug : slugifyAlbumTitle(title),
                }));
              }}
            />
            <Input
              id="album_slug"
              label="Slug (public URL)"
              required
              value={form.slug}
              onChange={(e) => { setSlugTouched(true); setForm((prev) => ({ ...prev, slug: e.target.value })); }}
              error={form.slug && !isValidAlbumSlug(form.slug) ? 'Lowercase letters, numbers and single hyphens only.' : undefined}
            />
            <Input id="album_event_date" label="Event date" type="date" value={form.event_date} onChange={(e) => setForm((prev) => ({ ...prev, event_date: e.target.value }))} />
            <Input id="album_season" label="Season label" placeholder="e.g. 2026/27" value={form.season_label} onChange={(e) => setForm((prev) => ({ ...prev, season_label: e.target.value }))} />
            <ImageUploadField id="album_cover" label="Cover image (optional)" value={form.cover_image_url} onChange={(value) => setForm((prev) => ({ ...prev, cover_image_url: value }))} helpText="Leave blank to use the first published image in the album." />
            <Input id="album_sort" label="Sort order" type="number" value={String(form.sort_order)} onChange={(e) => setForm((prev) => ({ ...prev, sort_order: Number(e.target.value) || 0 }))} />
          </div>
          <Textarea id="album_description" label="Description" value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} />
          <label className="text-sm text-content-secondary inline-flex items-center gap-2">
            <input type="checkbox" checked={form.allow_download} onChange={(e) => setForm((prev) => ({ ...prev, allow_download: e.target.checked }))} />
            Allow public download of originals by default
          </label>
          {form.slug && (
            <p className="text-xs text-content-muted">Public address: <span className="font-mono">/gallery/{form.slug}</span></p>
          )}
          <div className="flex justify-end gap-3 pt-4 border-t border-edge-subtle">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" isLoading={saving}>{editingId ? 'Save Changes' : 'Create Draft Album'}</Button>
          </div>
        </form>
      </Modal>

      {/* Publish / unpublish confirmation */}
      <Modal
        isOpen={!!publishTarget}
        onClose={() => { setPublishTarget(null); setConsentChecked(false); }}
        title={publishTarget?.published ? 'Unpublish Album' : 'Publish Album'}
        size="md"
      >
        {publishTarget?.published ? (
          <div className="space-y-4">
            <p className="text-sm text-content-muted font-body">
              Unpublishing “{publishTarget.title}” removes it from the public website. It does not automatically erase
              copies that visitors have already downloaded.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setPublishTarget(null)}>Cancel</Button>
              <Button isLoading={publishBusy} onClick={handlePublishToggle}>Unpublish</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-content-muted font-body">
              “{publishTarget?.title}” and its published images will become visible to everyone at
              {' '}<span className="font-mono">/gallery/{publishTarget?.slug}</span>.
            </p>
            <label className="flex items-start gap-2 text-sm text-content-secondary">
              <input
                type="checkbox"
                className="mt-1"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
              />
              <span>{PUBLISH_CONSENT_TEXT}</span>
            </label>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => { setPublishTarget(null); setConsentChecked(false); }}>Cancel</Button>
              <Button isLoading={publishBusy} disabled={!consentChecked} onClick={handlePublishToggle}>Publish Album</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete confirmation */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Album" size="sm">
        <p className="text-sm text-content-muted font-body">
          Delete “{deleteTarget?.title}”? Its {deleteTarget?.image_count ?? 0} image record{(deleteTarget?.image_count ?? 0) === 1 ? '' : 's'} will be
          kept as ungrouped gallery images, and uploaded files stay safely in Storage. Only the album grouping is removed.
        </p>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" isLoading={deleteBusy} onClick={handleDelete}>Delete Album</Button>
        </div>
      </Modal>
    </div>
  );
}
