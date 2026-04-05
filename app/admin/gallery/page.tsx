'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Image as ImageIcon } from 'lucide-react';
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

      <form onSubmit={handleCreate} className="bg-white border border-gray-100 rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold">Add Gallery Image</h2>
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
        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-700">{success}</p>}
        <Button type="submit" isLoading={saving}>Add image</Button>
      </form>

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        {loading ? (
          <p className="p-6 text-gray-500">Loading gallery images...</p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Title</TableHeader>
                <TableHeader>Image URL</TableHeader>
                <TableHeader>Sort</TableHeader>
                <TableHeader>Download</TableHeader>
                <TableHeader>Published</TableHeader>
                <TableHeader>Action</TableHeader>
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
                    <Button size="sm" variant="ghost" onClick={() => togglePublished(item)}>
                      {item.published ? 'Unpublish' : 'Publish'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
