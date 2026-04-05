'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Image as ImageIcon, Pencil, Trash2, Plus } from 'lucide-react';
import { parseApiResponse } from '@/lib/admin-client';

type GalleryImage = {
  id: string;
  title: string;
  caption: string;
  image_url: string;
  alt_text: string;
  sort_order: number;
  allow_download: boolean;
  published: boolean;
};

const defaultForm = {
  title: '',
  caption: '',
  image_url: '',
  alt_text: '',
  sort_order: 0,
  allow_download: false,
  published: true,
};

export default function AdminGalleryPage() {
  const [items, setItems] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(defaultForm);
  const [editSaving, setEditSaving] = useState(false);

  // Delete confirm modal
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  async function loadItems() {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/resources/galleryImages', { cache: 'no-store' });
      const result = await parseApiResponse<{ data?: GalleryImage[] }>(response);
      setItems((result.data ?? []).sort((a: GalleryImage, b: GalleryImage) => a.sort_order - b.sort_order));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load gallery images');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadItems();
  }, []);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add image');
    } finally {
      setSaving(false);
    }
  }

  function openEdit(item: GalleryImage) {
    setEditingId(item.id);
    setEditForm({
      title: item.title,
      caption: item.caption,
      image_url: item.image_url,
      alt_text: item.alt_text,
      sort_order: item.sort_order,
      allow_download: item.allow_download,
      published: item.published,
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
        body: JSON.stringify({ id: editingId, ...editForm }),
      });
      await parseApiResponse(response);
      setSuccess('Image updated.');
      setEditModalOpen(false);
      await loadItems();
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
      setSuccess('Image deleted.');
      setDeleteConfirm(null);
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete image.');
    }
  }

  async function togglePublished(item: GalleryImage) {
    try {
      const response = await fetch('/api/admin/resources/galleryImages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, published: !item.published }),
      });
      await parseApiResponse(response);
      setSuccess('Image status updated.');
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update image.');
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
          <ImageIcon className="h-6 w-6 text-maroon-700" />
          Gallery Manager
        </h1>
        <p className="text-gray-500 font-body mt-1">Manage public gallery tiles and per-image download permissions.</p>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
      {success && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{success}</p>}

      {/* Add New Image */}
      <form onSubmit={handleCreate} className="bg-white border border-gray-100 rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Gallery Image
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input id="title" label="Title" required value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} />
          <Input id="caption" label="Caption" value={form.caption} onChange={(e) => setForm((prev) => ({ ...prev, caption: e.target.value }))} />
          <Input id="image_url" label="Image URL" required value={form.image_url} onChange={(e) => setForm((prev) => ({ ...prev, image_url: e.target.value }))} />
          <Input id="alt_text" label="Alt Text" value={form.alt_text} onChange={(e) => setForm((prev) => ({ ...prev, alt_text: e.target.value }))} />
          <Input id="sort_order" label="Sort Order" type="number" value={String(form.sort_order)} onChange={(e) => setForm((prev) => ({ ...prev, sort_order: Number(e.target.value) || 0 }))} />
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="text-sm text-gray-700 inline-flex items-center gap-2">
            <input type="checkbox" checked={form.allow_download} onChange={(e) => setForm((prev) => ({ ...prev, allow_download: e.target.checked }))} />
            Allow download
          </label>
          <label className="text-sm text-gray-700 inline-flex items-center gap-2">
            <input type="checkbox" checked={form.published} onChange={(e) => setForm((prev) => ({ ...prev, published: e.target.checked }))} />
            Published
          </label>
        </div>
        <Button type="submit" isLoading={saving}>Add Image</Button>
      </form>

      {/* Images Table */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        {loading ? (
          <p className="p-6 text-gray-500">Loading gallery images...</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-gray-500">No images yet. Add one above.</p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Title</TableHeader>
                <TableHeader>Image URL</TableHeader>
                <TableHeader>Sort</TableHeader>
                <TableHeader>Download</TableHeader>
                <TableHeader>Published</TableHeader>
                <TableHeader>Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.title}</TableCell>
                  <TableCell className="max-w-xs truncate">{item.image_url}</TableCell>
                  <TableCell>{item.sort_order}</TableCell>
                  <TableCell>{item.allow_download ? 'Yes' : 'No'}</TableCell>
                  <TableCell>{item.published ? 'Yes' : 'No'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(item)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => togglePublished(item)}>
                        {item.published ? 'Unpublish' : 'Publish'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(item.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
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
            <Input id="edit_image_url" label="Image URL" required value={editForm.image_url} onChange={(e) => setEditForm((prev) => ({ ...prev, image_url: e.target.value }))} />
            <Input id="edit_alt_text" label="Alt Text" value={editForm.alt_text} onChange={(e) => setEditForm((prev) => ({ ...prev, alt_text: e.target.value }))} />
            <Input id="edit_sort_order" label="Sort Order" type="number" value={String(editForm.sort_order)} onChange={(e) => setEditForm((prev) => ({ ...prev, sort_order: Number(e.target.value) || 0 }))} />
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="text-sm text-gray-700 inline-flex items-center gap-2">
              <input type="checkbox" checked={editForm.allow_download} onChange={(e) => setEditForm((prev) => ({ ...prev, allow_download: e.target.checked }))} />
              Allow download
            </label>
            <label className="text-sm text-gray-700 inline-flex items-center gap-2">
              <input type="checkbox" checked={editForm.published} onChange={(e) => setEditForm((prev) => ({ ...prev, published: e.target.checked }))} />
              Published
            </label>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
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
        <p className="text-sm text-gray-600 font-body">
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
