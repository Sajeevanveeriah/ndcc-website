'use client';

import { useEffect, useState } from 'react';
import { datetimeLocalToClubIso, formatDate, toDatetimeLocalInClubTimezone, truncateText } from '@/lib/utils';
import { parseApiResponse, adminFetch } from '@/lib/admin-client';
import type { NewsPost } from '@/lib/types';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import ImageUploadField from '@/components/admin/ImageUploadField';
import BatchActionsBar from '@/components/admin/BatchActionsBar';
import Input, { Textarea } from '@/components/ui/Input';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import { Newspaper, Plus, Pencil, Trash2 } from 'lucide-react';

const emptyNewsPost: Omit<NewsPost, 'id' | 'created_at'> = {
  title: '',
  content: '',
  author: 'NDCC',
  image_url: '',
  sort_order: 0,
  published: false,
  published_at: null,
};

export default function AdminNewsPage() {
  const [news, setNews] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyNewsPost);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);

  const fetchNews = async () => {
    try {
      const response = await fetch('/api/admin/resources/news', { cache: 'no-store' });
      const result = await parseApiResponse<{ data?: NewsPost[] }>(response);
      const ordered = (result.data || []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      setNews(ordered);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to fetch news.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyNewsPost);
    setFormErrors({});
    setFeedback(null);
    setModalOpen(true);
  };

  const openEdit = (post: NewsPost) => {
    setEditingId(post.id);
    setForm({
      title: post.title,
      content: post.content,
      author: post.author,
      image_url: post.image_url || post.image || '',
      sort_order: post.sort_order ?? 0,
      published: post.published,
      published_at: post.published_at,
    });
    setFormErrors({});
    setFeedback(null);
    setModalOpen(true);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!form.title.trim()) errors.title = 'Title is required.';
    if (!form.content.trim()) errors.content = 'Content is required.';
    if (!form.author.trim()) errors.author = 'Author is required.';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);

    const payload = {
      title: form.title.trim(),
      content: form.content.trim(),
      author: form.author.trim(),
      image_url: form.image_url?.trim() || null,
      sort_order: Number(form.sort_order || 0),
      published: form.published,
      published_at: form.published ? (form.published_at || new Date().toISOString()) : null,
    };

    try {
      if (editingId) {
        const response = await adminFetch('/api/admin/resources/news', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingId, ...payload }),
        });
        const result = await parseApiResponse<{ data: NewsPost }>(response);
        setNews((prev) => prev.map((n) => (n.id === editingId ? result.data : n)));
      } else {
        const response = await adminFetch('/api/admin/resources/news', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await parseApiResponse<{ data: NewsPost }>(response);
        if (result.data) setNews((prev) => [result.data, ...prev]);
      }
      setFeedback({ type: 'success', message: editingId ? 'Article updated.' : 'Article created.' });
      setModalOpen(false);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save article.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/resources/news?id=${id}`, { method: 'DELETE' });
      await parseApiResponse(response);
      setNews((prev) => prev.filter((n) => n.id !== id));
      setSelectedIds((prev) => prev.filter((v) => v !== id));
      setFeedback({ type: 'success', message: 'Article deleted.' });
      setDeleteConfirm(null);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to delete article.' });
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => (prev.length === news.length ? [] : news.map((n) => n.id)));
  };

  const runBatch = async (run: () => Promise<Response>, successMessage: string) => {
    setBatchBusy(true);
    try {
      await parseApiResponse(await run());
      await fetchNews();
      setSelectedIds([]);
      setFeedback({ type: 'success', message: successMessage });
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Batch action failed.' });
    } finally {
      setBatchBusy(false);
    }
  };

  const batchSetPublished = (published: boolean) => runBatch(
    () => adminFetch('/api/admin/resources/news', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: selectedIds, published }),
    }),
    published ? 'Selected articles published.' : 'Selected articles unpublished.'
  );

  const batchDelete = () => runBatch(
    () => fetch(`/api/admin/resources/news?ids=${selectedIds.join(',')}`, { method: 'DELETE' }),
    'Selected articles deleted.'
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-content-primary flex items-center gap-2">
            <Newspaper className="h-6 w-6 text-maroon-700 dark:text-maroon-200" />
            News
          </h1>
          <p className="text-content-muted font-body mt-1">
            {news.length} article{news.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button variant="primary" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Write Article
        </Button>
      </div>
      {feedback && (
        <p className={`mb-4 text-sm ${feedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>{feedback.message}</p>
      )}

      <BatchActionsBar
        selectedCount={selectedIds.length}
        itemLabel="article"
        busy={batchBusy}
        onClearSelection={() => setSelectedIds([])}
        actions={[
          { key: 'publish', label: 'Batch Publish', onAction: () => batchSetPublished(true) },
          { key: 'unpublish', label: 'Batch Unpublish', onAction: () => batchSetPublished(false) },
          { key: 'delete', label: 'Batch Delete', variant: 'danger', confirm: true, confirmLabel: 'Delete the selected articles? This cannot be undone.', onAction: batchDelete },
        ]}
      />

      {loading ? (
        <div className="bg-surface-card rounded-xl border border-edge-subtle p-8 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-full mb-4" />
          <div className="h-4 bg-gray-200 rounded w-full mb-4" />
          <div className="h-4 bg-gray-200 rounded w-3/4" />
        </div>
      ) : news.length === 0 ? (
        <div className="bg-surface-card rounded-xl border border-edge-subtle p-8 text-center">
          <Newspaper className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-content-muted font-body">No news articles yet. Write your first article.</p>
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader className="w-10">
                <input
                  type="checkbox"
                  aria-label="Select all articles"
                  checked={news.length > 0 && selectedIds.length === news.length}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-edge-strong text-maroon-700 dark:text-maroon-200 focus:ring-maroon-500"
                />
              </TableHeader>
              <TableHeader>Title</TableHeader>
              <TableHeader>Author</TableHeader>
              <TableHeader>Content</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Order</TableHeader>
              <TableHeader>Published</TableHeader>
              <TableHeader>Created</TableHeader>
              <TableHeader>Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {news.map((post) => (
              <TableRow key={post.id}>
                <TableCell className="w-10">
                  <input
                    type="checkbox"
                    aria-label={`Select ${post.title}`}
                    checked={selectedIds.includes(post.id)}
                    onChange={() => toggleSelected(post.id)}
                    className="h-4 w-4 rounded border-edge-strong text-maroon-700 dark:text-maroon-200 focus:ring-maroon-500"
                  />
                </TableCell>
                <TableCell className="font-medium">{post.title}</TableCell>
                <TableCell>{post.author}</TableCell>
                <TableCell>
                  <p className="max-w-xs">{truncateText(post.content, 60)}</p>
                </TableCell>
                <TableCell>
                  {!post.published ? <Badge variant="warning">Draft</Badge> : post.published_at && Date.parse(post.published_at) > Date.now() ? <Badge variant="info">Scheduled for {new Date(post.published_at).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })}</Badge> : <Badge variant="success">Published</Badge>}
                </TableCell>
                <TableCell>{post.sort_order ?? 0}</TableCell>
                <TableCell>{post.published_at ? formatDate(post.published_at) : '-'}</TableCell>
                <TableCell>{formatDate(post.created_at)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(post)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirm(post.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit Article' : 'Write Article'}
        size="lg"
      >
        <div className="space-y-4">
          <Input
            id="news-title"
            label="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            error={formErrors.title}
            required
          />
          <Textarea
            id="news-content"
            label="Content"
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            error={formErrors.content}
            required
          />
          <Input
            id="news-author"
            label="Author"
            value={form.author}
            onChange={(e) => setForm({ ...form, author: e.target.value })}
            error={formErrors.author}
            required
          />
          <ImageUploadField
            id="news-image-url"
            label="Image URL (optional)"
            value={form.image_url || ''}
            onChange={(value) => setForm({ ...form, image_url: value })}
            placeholder="https://example.com/news-image.jpg"
          />
          <Input
            id="news-sort-order"
            label="Display order (lower appears first)"
            type="number"
            value={form.sort_order ?? 0}
            onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value || 0) })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-sm font-body text-content-secondary">Publication state
              <select className="mt-1 w-full rounded-lg border border-edge-strong bg-surface-card px-3 py-2" value={!form.published ? 'draft' : form.published_at && Date.parse(form.published_at) > Date.now() ? 'scheduled' : 'published'} onChange={(event) => {
                const state = event.target.value;
                setForm({ ...form, published: state !== 'draft', published_at: state === 'draft' ? null : state === 'published' ? new Date().toISOString() : (form.published_at && Date.parse(form.published_at) > Date.now() ? form.published_at : new Date(Date.now() + 60 * 60 * 1000).toISOString()) });
              }}>
                <option value="draft">Draft</option><option value="published">Publish now</option><option value="scheduled">Schedule</option>
              </select>
            </label>
            {form.published && form.published_at && Date.parse(form.published_at) > Date.now() && <Input id="news-schedule" label="Scheduled time - Australia/Melbourne" type="datetime-local" value={toDatetimeLocalInClubTimezone(form.published_at)} onChange={(e) => setForm({ ...form, published_at: datetimeLocalToClubIso(e.target.value) })} required />}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-edge-subtle">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave} isLoading={saving}>
              {editingId ? 'Update Article' : 'Publish Article'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Article"
        size="sm"
      >
        <p className="text-sm text-content-muted font-body">
          Are you sure you want to delete this article? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
