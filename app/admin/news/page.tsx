'use client';

import { useEffect, useState } from 'react';
import { formatDate, truncateText } from '@/lib/utils';
import type { NewsPost } from '@/lib/types';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Input, { Textarea } from '@/components/ui/Input';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import { Newspaper, Plus, Pencil, Trash2 } from 'lucide-react';

const emptyNewsPost: Omit<NewsPost, 'id' | 'created_at'> = {
  title: '',
  content: '',
  author: 'NDCC',
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

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const response = await fetch('/api/admin/resources/news', { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to load data');
        setNews(result.data || []);
      } catch (err) {
        console.error('Failed to fetch news:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchNews();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyNewsPost);
    setFormErrors({});
    setModalOpen(true);
  };

  const openEdit = (post: NewsPost) => {
    setEditingId(post.id);
    setForm({
      title: post.title,
      content: post.content,
      author: post.author,
      published: post.published,
      published_at: post.published_at,
    });
    setFormErrors({});
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
      published: form.published,
      published_at: form.published ? (form.published_at || new Date().toISOString()) : null,
    };

    try {
      if (editingId) {
        const response = await fetch('/api/admin/resources/news', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingId, ...payload }),
        });
        if (!response.ok) throw new Error('Failed to save');

        setNews((prev) =>
          prev.map((n) => (n.id === editingId ? { ...n, ...payload } : n))
        );
      } else {
        const response = await fetch('/api/admin/resources/news', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to save');
        if (result.data) setNews((prev) => [result.data, ...prev]);
      }
      setModalOpen(false);
    } catch (err) {
      console.error('Failed to save news post:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/resources/news?id=${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete');
      setNews((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error('Failed to delete news post:', err);
    } finally {
      setDeleteConfirm(null);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
            <Newspaper className="h-6 w-6 text-maroon-700" />
            News
          </h1>
          <p className="text-gray-500 font-body mt-1">
            {news.length} article{news.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button variant="primary" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Write Article
        </Button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-full mb-4" />
          <div className="h-4 bg-gray-200 rounded w-full mb-4" />
          <div className="h-4 bg-gray-200 rounded w-3/4" />
        </div>
      ) : news.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <Newspaper className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-body">No news articles yet. Write your first article.</p>
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Title</TableHeader>
              <TableHeader>Author</TableHeader>
              <TableHeader>Content</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Published</TableHeader>
              <TableHeader>Created</TableHeader>
              <TableHeader>Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {news.map((post) => (
              <TableRow key={post.id}>
                <TableCell className="font-medium">{post.title}</TableCell>
                <TableCell>{post.author}</TableCell>
                <TableCell>
                  <p className="max-w-xs">{truncateText(post.content, 60)}</p>
                </TableCell>
                <TableCell>
                  {post.published ? (
                    <Badge variant="success">Published</Badge>
                  ) : (
                    <Badge variant="warning">Draft</Badge>
                  )}
                </TableCell>
                <TableCell>{post.published_at ? formatDate(post.published_at) : '—'}</TableCell>
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
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) => {
                const published = e.target.checked;
                setForm({
                  ...form,
                  published,
                  published_at: published && !form.published_at ? new Date().toISOString() : form.published_at,
                });
              }}
              className="h-4 w-4 rounded border-gray-300 text-maroon-700 focus:ring-maroon-500"
            />
            <span className="text-sm font-body text-gray-700">Publish this article</span>
          </label>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
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
        <p className="text-sm text-gray-600 font-body">
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
