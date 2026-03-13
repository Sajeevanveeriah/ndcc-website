'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
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

const placeholderNews: NewsPost[] = [
  {
    id: '1',
    title: 'Season 2026/27 Registration Now Open',
    content: 'Registrations are now open for the upcoming 2026/27 cricket season. Head to PlayHQ to register for senior or junior teams. Early bird pricing available until September.',
    author: 'NDCC',
    published: true,
    published_at: '2026-03-10T09:00:00Z',
    created_at: '2026-03-10T08:30:00Z',
  },
  {
    id: '2',
    title: 'New Practice Nets Installed',
    content: 'The club is pleased to announce the installation of two new practice nets at Grinter Reserve. Thanks to a grant from Cricket Victoria, the nets are now available for use.',
    author: 'NDCC',
    published: true,
    published_at: '2026-03-05T12:00:00Z',
    created_at: '2026-03-05T11:00:00Z',
  },
  {
    id: '3',
    title: 'Annual General Meeting Notice',
    content: 'Draft article about the upcoming AGM.',
    author: 'NDCC',
    published: false,
    published_at: null,
    created_at: '2026-03-01T15:00:00Z',
  },
];

export default function AdminNewsPage() {
  const [news, setNews] = useState<NewsPost[]>(placeholderNews);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyNewsPost);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchNews = async () => {
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('news')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (data) setNews(data);
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

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      if (editingId) {
        setNews((prev) =>
          prev.map((n) => (n.id === editingId ? { ...n, ...payload } : n))
        );
      } else {
        const newPost: NewsPost = {
          ...payload,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
        };
        setNews((prev) => [newPost, ...prev]);
      }
      setModalOpen(false);
      setSaving(false);
      return;
    }

    try {
      if (editingId) {
        const { error } = await supabase
          .from('news')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;

        setNews((prev) =>
          prev.map((n) => (n.id === editingId ? { ...n, ...payload } : n))
        );
      } else {
        const { data, error } = await supabase
          .from('news')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        if (data) setNews((prev) => [data, ...prev]);
      }
      setModalOpen(false);
    } catch (err) {
      console.error('Failed to save news post:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setNews((prev) => prev.filter((n) => n.id !== id));
      setDeleteConfirm(null);
      return;
    }

    try {
      const { error } = await supabase.from('news').delete().eq('id', id);
      if (error) throw error;
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
