'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import ImageUploadField from '@/components/admin/ImageUploadField';
import BatchActionsBar from '@/components/admin/BatchActionsBar';
import Input, { Select } from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Pencil, Trash2, Plus, ExternalLink } from 'lucide-react';
import { parseApiResponse } from '@/lib/admin-client';
import type { AdminAlbum, AdminGalleryImage } from './types';

const defaultForm = {
  title: '',
  caption: '',
  image_url: '',
  alt_text: '',
  sort_order: 0,
  allow_download: false,
  published: true,
};

export default function ImagesPanel({ refreshToken, onImagesChanged }: { refreshToken?: number; onImagesChanged?: () => void }) {
  const [items, setItems] = useState<AdminGalleryImage[]>([]);
  const [albums, setAlbums] = useState<AdminAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [albumFilter, setAlbumFilter] = useState('all');

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ ...defaultForm, album_id: '' });
  const [editSaving, setEditSaving] = useState(false);

  // Delete confirm modal
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [assignAlbumId, setAssignAlbumId] = useState('');

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const [imagesResponse, albumsResponse] = await Promise.all([
        fetch('/api/admin/resources/galleryImages', { cache: 'no-store' }),
        fetch('/api/admin/gallery/albums', { cache: 'no-store' }),
      ]);
      const imagesResult = await parseApiResponse<{ data?: AdminGalleryImage[] }>(imagesResponse);
      setItems((imagesResult.data ?? []).sort((a, b) => a.sort_order - b.sort_order));
      try {
        const albumsResult = await parseApiResponse<{ data?: AdminAlbum[] }>(albumsResponse);
        setAlbums(albumsResult.data ?? []);
      } catch {
        setAlbums([]); // albums API unavailable (e.g. migration not applied) — panel still works
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load gallery images');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems, refreshToken]);

  const albumsById = useMemo(() => new Map(albums.map((album) => [album.id, album])), [albums]);
  const visibleItems = useMemo(() => {
    if (albumFilter === 'all') return items;
    if (albumFilter === 'ungrouped') return items.filter((item) => !item.album_id);
    return items.filter((item) => item.album_id === albumFilter);
  }, [items, albumFilter]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/admin/resources/galleryImages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      await parseApiResponse(response);
      setForm(defaultForm);
      setSuccess('Image added.');
      await loadItems();
      onImagesChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add image');
    } finally {
      setSaving(false);
    }
  }

  function openEdit(item: AdminGalleryImage) {
    setEditingId(item.id);
    setEditForm({
      title: item.title,
      caption: item.caption,
      image_url: item.image_url,
      alt_text: item.alt_text,
      sort_order: item.sort_order,
      allow_download: item.allow_download,
      published: item.published,
      album_id: item.album_id ?? '',
    });
    setError('');
    setSuccess('');
    setEditModalOpen(true);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setEditSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/admin/resources/galleryImages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, ...editForm, album_id: editForm.album_id || null }),
      });
      await parseApiResponse(response);
      setSuccess('Image updated.');
      setEditModalOpen(false);
      await loadItems();
      onImagesChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update image.');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const response = await fetch(`/api/admin/resources/galleryImages?id=${id}`, { method: 'DELETE' });
      await parseApiResponse(response);
      setSelectedIds((prev) => prev.filter((v) => v !== id));
      setSuccess('Image record deleted. (Files in club Storage are kept; use permanent media deletion to remove them.)');
      setDeleteConfirm(null);
      await loadItems();
      onImagesChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete image.');
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.length === visibleItems.length ? [] : visibleItems.map((item) => item.id)));
  }

  async function runBatch(run: () => Promise<Response>, successMessage: string) {
    setBatchBusy(true);
    setError('');
    setSuccess('');
    try {
      await parseApiResponse(await run());
      await loadItems();
      setSelectedIds([]);
      setSuccess(successMessage);
      onImagesChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch action failed.');
    } finally {
      setBatchBusy(false);
    }
  }

  const batchSetPublished = (published: boolean) => runBatch(
    () => fetch('/api/admin/resources/galleryImages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: selectedIds, published }),
    }),
    published ? 'Selected images published.' : 'Selected images unpublished.'
  );

  const batchDelete = () => runBatch(
    () => fetch(`/api/admin/resources/galleryImages?ids=${selectedIds.join(',')}`, { method: 'DELETE' }),
    'Selected images deleted.'
  );

  const batchAssignAlbum = (albumId: string | null) => runBatch(
    () => fetch('/api/admin/resources/galleryImages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: selectedIds, album_id: albumId }),
    }),
    albumId ? 'Selected images assigned to the album.' : 'Selected images removed from their album.'
  );

  async function togglePublished(item: AdminGalleryImage) {
    try {
      const response = await fetch('/api/admin/resources/galleryImages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, published: !item.published }),
      });
      await parseApiResponse(response);
      setSuccess('Image status updated.');
      await loadItems();
      onImagesChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update image.');
    }
  }

  const albumOptions = albums.map((album) => ({ value: album.id, label: album.title }));

  return (
    <div className="space-y-8">
      {error && <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
      {success && <p role="status" className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{success}</p>}

      {/* Add New Image (single, GitHub-backed uploader — unchanged behaviour) */}
      <form onSubmit={handleCreate} className="bg-surface-card border border-edge-subtle rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Gallery Image
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input id="title" label="Title" required value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} />
          <Input id="caption" label="Caption" value={form.caption} onChange={(e) => setForm((prev) => ({ ...prev, caption: e.target.value }))} />
          <ImageUploadField id="image_url" label="Image URL" value={form.image_url} onChange={(value) => setForm((prev) => ({ ...prev, image_url: value }))} />
          <Input id="alt_text" label="Alt Text" value={form.alt_text} onChange={(e) => setForm((prev) => ({ ...prev, alt_text: e.target.value }))} />
          <Input id="sort_order" label="Sort Order" type="number" value={String(form.sort_order)} onChange={(e) => setForm((prev) => ({ ...prev, sort_order: Number(e.target.value) || 0 }))} />
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="text-sm text-content-secondary inline-flex items-center gap-2">
            <input type="checkbox" checked={form.allow_download} onChange={(e) => setForm((prev) => ({ ...prev, allow_download: e.target.checked }))} />
            Allow download
          </label>
          <label className="text-sm text-content-secondary inline-flex items-center gap-2">
            <input type="checkbox" checked={form.published} onChange={(e) => setForm((prev) => ({ ...prev, published: e.target.checked }))} />
            Published
          </label>
        </div>
        <Button type="submit" isLoading={saving}>Add Image</Button>
      </form>

      {/* Album filter */}
      {albums.length > 0 && (
        <div className="max-w-sm">
          <Select
            id="album_filter"
            label="Filter by album"
            value={albumFilter}
            onChange={(e) => { setAlbumFilter(e.target.value); setSelectedIds([]); }}
            options={[
              { value: 'all', label: 'All images' },
              { value: 'ungrouped', label: 'Ungrouped / legacy images' },
              ...albumOptions,
            ]}
          />
        </div>
      )}

      <BatchActionsBar
        selectedCount={selectedIds.length}
        itemLabel="image"
        busy={batchBusy}
        onClearSelection={() => setSelectedIds([])}
        actions={[
          { key: 'publish', label: 'Batch Publish', onAction: () => batchSetPublished(true) },
          { key: 'unpublish', label: 'Batch Unpublish', onAction: () => batchSetPublished(false) },
          ...(albums.length > 0 && assignAlbumId
            ? [{ key: 'assign', label: 'Assign to selected album', onAction: () => batchAssignAlbum(assignAlbumId) }]
            : []),
          ...(albums.length > 0
            ? [{ key: 'unassign', label: 'Remove from album', onAction: () => batchAssignAlbum(null) }]
            : []),
          { key: 'delete', label: 'Batch Delete', variant: 'danger' as const, confirm: true, confirmLabel: 'Delete the selected images? This cannot be undone.', onAction: batchDelete },
        ]}
      />
      {selectedIds.length > 0 && albums.length > 0 && (
        <div className="max-w-sm">
          <Select
            id="assign_album"
            label="Album for “Assign to selected album”"
            value={assignAlbumId}
            onChange={(e) => setAssignAlbumId(e.target.value)}
            options={albumOptions}
          />
        </div>
      )}

      {/* Images Table */}
      <div className="bg-surface-card border border-edge-subtle rounded-xl overflow-hidden">
        {loading ? (
          <p className="p-6 text-content-muted">Loading gallery images...</p>
        ) : visibleItems.length === 0 ? (
          <p className="p-6 text-content-muted">
            {items.length === 0 ? 'No images yet. Add one above or use Bulk Upload.' : 'No images match this filter.'}
          </p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all images"
                    checked={visibleItems.length > 0 && selectedIds.length === visibleItems.length}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-edge-strong text-maroon-700 dark:text-maroon-200 focus:ring-maroon-500"
                  />
                </TableHeader>
                <TableHeader>Title</TableHeader>
                <TableHeader>Source</TableHeader>
                <TableHeader>Album</TableHeader>
                <TableHeader>Sort</TableHeader>
                <TableHeader>Download</TableHeader>
                <TableHeader>Published</TableHeader>
                <TableHeader>Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="w-10">
                    <input
                      type="checkbox"
                      aria-label={`Select ${item.title}`}
                      checked={selectedIds.includes(item.id)}
                      onChange={() => toggleSelected(item.id)}
                      className="h-4 w-4 rounded border-edge-strong text-maroon-700 dark:text-maroon-200 focus:ring-maroon-500"
                    />
                  </TableCell>
                  <TableCell>
                    <p>{item.title}</p>
                    {item.original_filename && (
                      <p className="text-xs text-content-muted">{item.original_filename}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs">
                      {item.storage_path ? 'Club Storage' : 'Legacy URL'}
                    </span>
                    <p className="max-w-[16rem] truncate text-xs text-content-muted" title={item.image_url}>{item.image_url}</p>
                  </TableCell>
                  <TableCell>{item.album_id ? (albumsById.get(item.album_id)?.title ?? 'Unknown album') : '—'}</TableCell>
                  <TableCell>{item.sort_order}</TableCell>
                  <TableCell>{item.allow_download ? 'Yes' : 'No'}</TableCell>
                  <TableCell>{item.published ? 'Yes' : 'No'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(item)} aria-label={`Edit ${item.title}`}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => togglePublished(item)}>
                        {item.published ? 'Unpublish' : 'Publish'}
                      </Button>
                      {item.album_id && albumsById.get(item.album_id) && (
                        <a
                          href={`/gallery/${albumsById.get(item.album_id)!.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center p-2 text-content-muted hover:text-content-primary"
                          aria-label={`Open public preview of the album containing ${item.title}`}
                        >
                          <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        </a>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(item.id)} aria-label={`Delete ${item.title}`}>
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

      {/* Edit Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Gallery Image"
        size="lg"
      >
        <form onSubmit={handleEdit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input id="edit_title" label="Title" required value={editForm.title} onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))} />
            <Input id="edit_caption" label="Caption" value={editForm.caption} onChange={(e) => setEditForm((prev) => ({ ...prev, caption: e.target.value }))} />
            <ImageUploadField id="edit_image_url" label="Image URL" value={editForm.image_url} onChange={(value) => setEditForm((prev) => ({ ...prev, image_url: value }))} />
            <Input id="edit_alt_text" label="Alt Text" value={editForm.alt_text} onChange={(e) => setEditForm((prev) => ({ ...prev, alt_text: e.target.value }))} />
            <Input id="edit_sort_order" label="Sort Order" type="number" value={String(editForm.sort_order)} onChange={(e) => setEditForm((prev) => ({ ...prev, sort_order: Number(e.target.value) || 0 }))} />
            {albums.length > 0 && (
              <Select
                id="edit_album"
                label="Album"
                value={editForm.album_id}
                onChange={(e) => setEditForm((prev) => ({ ...prev, album_id: e.target.value }))}
                options={albumOptions}
              />
            )}
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="text-sm text-content-secondary inline-flex items-center gap-2">
              <input type="checkbox" checked={editForm.allow_download} onChange={(e) => setEditForm((prev) => ({ ...prev, allow_download: e.target.checked }))} />
              Allow download
            </label>
            <label className="text-sm text-content-secondary inline-flex items-center gap-2">
              <input type="checkbox" checked={editForm.published} onChange={(e) => setEditForm((prev) => ({ ...prev, published: e.target.checked }))} />
              Published
            </label>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3 pt-4 border-t border-edge-subtle">
            <Button type="button" variant="secondary" onClick={() => setEditModalOpen(false)}>Cancel</Button>
            <Button type="submit" isLoading={editSaving}>Save Changes</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Image"
        size="sm"
      >
        <p className="text-sm text-content-muted font-body">
          Are you sure you want to delete this image? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
