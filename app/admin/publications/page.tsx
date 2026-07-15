'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatDate, truncateText } from '@/lib/utils';
import { parseApiResponse, adminFetch } from '@/lib/admin-client';
import type { Publication } from '@/lib/types';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import ImageUploadField from '@/components/admin/ImageUploadField';
import BatchActionsBar from '@/components/admin/BatchActionsBar';
import Input, { Select, Textarea } from '@/components/ui/Input';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import { BookOpen, Plus, Pencil, Trash2, Copy, Star, ExternalLink, Eye } from 'lucide-react';

const TYPE_OPTIONS = [
  { value: 'monthly_newsletter', label: 'Monthly Newsletter' },
  { value: 'weekly_newsletter', label: 'Weekly Newsletter' },
  { value: 'weekly_match_report', label: 'Match Report' },
] as const;

const TYPE_LABELS: Record<string, string> = Object.fromEntries(TYPE_OPTIONS.map((o) => [o.value, o.label]));

type PublicationForm = Omit<Publication, 'id' | 'created_at' | 'updated_at'>;

const emptyPublication: PublicationForm = {
  publication_type: 'weekly_match_report',
  title: '',
  slug: '',
  summary: '',
  content: '',
  issue_date: new Date().toISOString().slice(0, 10),
  season_label: '',
  round_label: '',
  cover_image_url: '',
  document_url: '',
  external_url: '',
  author: 'NDCC',
  published: false,
  published_at: null,
  featured: false,
  display_order: 0,
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

export default function AdminPublicationsPage() {
  const [publications, setPublications] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PublicationForm>(emptyPublication);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const fetchPublications = async () => {
    try {
      const response = await fetch('/api/admin/resources/publications', { cache: 'no-store' });
      const result = await parseApiResponse<{ data?: Publication[] }>(response);
      setPublications(result.data || []);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to fetch publications.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPublications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return publications.filter((p) => {
      if (typeFilter !== 'all' && p.publication_type !== typeFilter) return false;
      if (term && !`${p.title} ${p.summary ?? ''} ${p.round_label ?? ''} ${p.season_label ?? ''}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [publications, typeFilter, search]);

  const formToForm = (p: Publication): PublicationForm => ({
    publication_type: p.publication_type,
    title: p.title,
    slug: p.slug,
    summary: p.summary ?? '',
    content: p.content ?? '',
    issue_date: (p.issue_date || '').slice(0, 10),
    season_label: p.season_label ?? '',
    round_label: p.round_label ?? '',
    cover_image_url: p.cover_image_url ?? '',
    document_url: p.document_url ?? '',
    external_url: p.external_url ?? '',
    author: p.author ?? 'NDCC',
    published: p.published,
    published_at: p.published_at ?? null,
    featured: p.featured,
    display_order: p.display_order ?? 0,
  });

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyPublication, issue_date: new Date().toISOString().slice(0, 10) });
    setSlugTouched(false);
    setFormErrors({});
    setFeedback(null);
    setModalOpen(true);
  };

  const openEdit = (p: Publication) => {
    setEditingId(p.id);
    setForm(formToForm(p));
    setSlugTouched(true);
    setFormErrors({});
    setFeedback(null);
    setModalOpen(true);
  };

  const openDuplicate = (p: Publication) => {
    setEditingId(null);
    setForm({
      ...formToForm(p),
      title: `${p.title} (copy)`,
      slug: slugify(`${p.slug}-copy`),
      published: false,
      published_at: null,
      featured: false,
    });
    setSlugTouched(true);
    setFormErrors({});
    setFeedback(null);
    setModalOpen(true);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!form.title.trim()) errors.title = 'Title is required.';
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug)) errors.slug = 'Slug must be lowercase letters, numbers and hyphens.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.issue_date)) errors.issue_date = 'Issue date is required (YYYY-MM-DD).';
    if (!form.content.trim() && !form.document_url?.trim() && !form.external_url?.trim()) {
      errors.content = 'Add body content, a PDF, or an external link.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const buildPayload = (input: PublicationForm) => ({
    publication_type: input.publication_type,
    title: input.title.trim(),
    slug: input.slug.trim(),
    summary: input.summary?.trim() || null,
    content: input.content.trim(),
    issue_date: input.issue_date,
    season_label: input.season_label?.trim() || null,
    round_label: input.round_label?.trim() || null,
    cover_image_url: input.cover_image_url?.trim() || null,
    document_url: input.document_url?.trim() || null,
    external_url: input.external_url?.trim() || null,
    author: input.author?.trim() || 'NDCC',
    published: input.published,
    published_at: input.published ? (input.published_at || new Date().toISOString()) : null,
    featured: input.featured,
    display_order: Number(input.display_order || 0),
  });

  const handleSave = async () => {
    if (!validateForm()) return;
    setSaving(true);
    const payload = buildPayload(form);
    try {
      if (editingId) {
        const response = await adminFetch('/api/admin/resources/publications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingId, ...payload }),
        });
        const result = await parseApiResponse<{ data: Publication }>(response);
        setPublications((prev) => prev.map((n) => (n.id === editingId ? result.data : n)));
      } else {
        const response = await adminFetch('/api/admin/resources/publications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await parseApiResponse<{ data: Publication }>(response);
        if (result.data) setPublications((prev) => [result.data, ...prev]);
      }
      setFeedback({ type: 'success', message: editingId ? 'Publication updated.' : 'Publication created.' });
      setModalOpen(false);
    } catch (err) {
      // Entered data is preserved in the open modal on failure.
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save publication.' });
    } finally {
      setSaving(false);
    }
  };

  const setPublished = async (p: Publication, published: boolean) => {
    try {
      const response = await adminFetch('/api/admin/resources/publications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, published, published_at: published ? (p.published_at || new Date().toISOString()) : null }),
      });
      const result = await parseApiResponse<{ data: Publication }>(response);
      setPublications((prev) => prev.map((n) => (n.id === p.id ? result.data : n)));
      setFeedback({ type: 'success', message: published ? 'Publication published.' : 'Publication unpublished.' });
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update publication.' });
    }
  };

  const setFeatured = async (p: Publication, featured: boolean) => {
    try {
      const response = await adminFetch('/api/admin/resources/publications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, featured }),
      });
      const result = await parseApiResponse<{ data: Publication }>(response);
      setPublications((prev) => prev.map((n) => (n.id === p.id ? result.data : n)));
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update publication.' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/resources/publications?id=${id}`, { method: 'DELETE' });
      await parseApiResponse(response);
      setPublications((prev) => prev.filter((n) => n.id !== id));
      setSelectedIds((prev) => prev.filter((v) => v !== id));
      setFeedback({ type: 'success', message: 'Publication deleted.' });
      setDeleteConfirm(null);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to delete publication.' });
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => (prev.length === visible.length ? [] : visible.map((n) => n.id)));
  };

  const runBatch = async (run: () => Promise<Response>, successMessage: string) => {
    setBatchBusy(true);
    try {
      await parseApiResponse(await run());
      await fetchPublications();
      setSelectedIds([]);
      setFeedback({ type: 'success', message: successMessage });
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Batch action failed.' });
    } finally {
      setBatchBusy(false);
    }
  };

  const batchSetPublished = (published: boolean) => runBatch(
    () => adminFetch('/api/admin/resources/publications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: selectedIds, published }),
    }),
    published ? 'Selected publications published.' : 'Selected publications unpublished.'
  );

  const batchDelete = () => runBatch(
    () => fetch(`/api/admin/resources/publications?ids=${selectedIds.join(',')}`, { method: 'DELETE' }),
    'Selected publications deleted.'
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-content-primary flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-maroon-700 dark:text-maroon-200" />
            Publications
          </h1>
          <p className="text-content-muted font-body mt-1">
            Newsletters and match reports · {publications.length} item{publications.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button variant="primary" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          New Publication
        </Button>
      </div>
      {feedback && (
        <p className={`mb-4 text-sm ${feedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>{feedback.message}</p>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by publication type">
          {[{ value: 'all', label: 'All' }, ...TYPE_OPTIONS].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTypeFilter(option.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-body font-medium border transition-colors focus-ring ${
                typeFilter === option.value
                  ? 'bg-maroon-700 text-white border-maroon-700'
                  : 'bg-surface-card text-content-secondary border-edge-subtle hover:border-maroon-300'
              }`}
              aria-pressed={typeFilter === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="sm:ml-auto sm:w-64">
          <Input
            id="publication-search"
            label=""
            aria-label="Search publications"
            placeholder="Search publications..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <BatchActionsBar
        selectedCount={selectedIds.length}
        itemLabel="publication"
        busy={batchBusy}
        onClearSelection={() => setSelectedIds([])}
        actions={[
          { key: 'publish', label: 'Batch Publish', onAction: () => batchSetPublished(true) },
          { key: 'unpublish', label: 'Batch Unpublish', onAction: () => batchSetPublished(false) },
          { key: 'delete', label: 'Batch Delete', variant: 'danger', confirm: true, confirmLabel: 'Delete the selected publications? This cannot be undone.', onAction: batchDelete },
        ]}
      />

      {loading ? (
        <div className="bg-surface-card rounded-xl border border-edge-subtle p-8 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-full mb-4" />
          <div className="h-4 bg-gray-200 rounded w-full mb-4" />
          <div className="h-4 bg-gray-200 rounded w-3/4" />
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-surface-card rounded-xl border border-edge-subtle p-8 text-center">
          <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-content-muted font-body">
            {publications.length === 0 ? 'No publications yet. Create your first newsletter or match report.' : 'No publications match the current filter.'}
          </p>
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader className="w-10">
                <input
                  type="checkbox"
                  aria-label="Select all publications"
                  checked={visible.length > 0 && selectedIds.length === visible.length}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-edge-strong text-maroon-700 dark:text-maroon-200 focus:ring-maroon-500"
                />
              </TableHeader>
              <TableHeader>Title</TableHeader>
              <TableHeader>Type</TableHeader>
              <TableHeader>Issue date</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Featured</TableHeader>
              <TableHeader>Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="w-10">
                  <input
                    type="checkbox"
                    aria-label={`Select ${p.title}`}
                    checked={selectedIds.includes(p.id)}
                    onChange={() => toggleSelected(p.id)}
                    className="h-4 w-4 rounded border-edge-strong text-maroon-700 dark:text-maroon-200 focus:ring-maroon-500"
                  />
                </TableCell>
                <TableCell className="font-medium">
                  <span className="block">{p.title}</span>
                  <span className="block text-xs text-content-muted">{truncateText(p.summary || p.content, 60)}</span>
                </TableCell>
                <TableCell>{TYPE_LABELS[p.publication_type] || p.publication_type}</TableCell>
                <TableCell>{formatDate(p.issue_date)}</TableCell>
                <TableCell>
                  {p.published ? <Badge variant="success">Published</Badge> : <Badge variant="warning">Draft</Badge>}
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => setFeatured(p, !p.featured)}
                    className="p-1 rounded focus-ring"
                    aria-label={p.featured ? `Unfeature ${p.title}` : `Feature ${p.title}`}
                    title={p.featured ? 'Unfeature' : 'Feature'}
                  >
                    <Star className={`h-4 w-4 ${p.featured ? 'fill-gold-400 text-gold-500' : 'text-gray-400'}`} />
                  </button>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)} aria-label={`Edit ${p.title}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openDuplicate(p)} aria-label={`Duplicate ${p.title}`}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setPublished(p, !p.published)}>
                      {p.published ? 'Unpublish' : 'Publish'}
                    </Button>
                    {p.published && (
                      <a
                        href={`/publications/${p.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded focus-ring text-maroon-700 dark:text-maroon-200"
                        aria-label={`View ${p.title} on the public site (opens in new tab)`}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(p.id)} aria-label={`Delete ${p.title}`}>
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
        title={editingId ? 'Edit Publication' : 'New Publication'}
        size="xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              id="publication-type"
              label="Publication type"
              options={TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              value={form.publication_type}
              onChange={(e) => setForm({ ...form, publication_type: e.target.value as PublicationForm['publication_type'] })}
            />
            <Input
              id="publication-issue-date"
              label="Issue date"
              type="date"
              value={form.issue_date}
              onChange={(e) => setForm({ ...form, issue_date: e.target.value })}
              error={formErrors.issue_date}
              required
            />
          </div>
          <Input
            id="publication-title"
            label="Title"
            value={form.title}
            onChange={(e) => {
              const title = e.target.value;
              setForm((prev) => ({ ...prev, title, slug: slugTouched ? prev.slug : slugify(title) }));
            }}
            error={formErrors.title}
            required
          />
          <Input
            id="publication-slug"
            label="Slug (public URL: /publications/your-slug)"
            value={form.slug}
            onChange={(e) => {
              setSlugTouched(true);
              setForm({ ...form, slug: slugify(e.target.value) });
            }}
            error={formErrors.slug}
            required
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="publication-season"
              label="Season label (optional)"
              placeholder="2025/26"
              value={form.season_label || ''}
              onChange={(e) => setForm({ ...form, season_label: e.target.value })}
            />
            <Input
              id="publication-round"
              label="Round label (optional)"
              placeholder="Round 5"
              value={form.round_label || ''}
              onChange={(e) => setForm({ ...form, round_label: e.target.value })}
            />
          </div>
          <Textarea
            id="publication-summary"
            label="Summary (shown on listing cards)"
            value={form.summary || ''}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
            rows={2}
          />
          <Textarea
            id="publication-content"
            label="Body content"
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            error={formErrors.content}
            rows={8}
          />
          <ImageUploadField
            id="publication-cover"
            label="Cover image (optional)"
            value={form.cover_image_url || ''}
            onChange={(value) => setForm({ ...form, cover_image_url: value })}
          />
          <ImageUploadField
            id="publication-document"
            label="PDF document (optional)"
            variant="pdf"
            value={form.document_url || ''}
            onChange={(value) => setForm({ ...form, document_url: value })}
            helpText="Attach the full newsletter or report as a PDF. Keep key details in the body content too, so they stay accessible."
          />
          <Input
            id="publication-external"
            label="External link (optional)"
            placeholder="https://..."
            value={form.external_url || ''}
            onChange={(e) => setForm({ ...form, external_url: e.target.value })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="publication-author"
              label="Author"
              value={form.author || ''}
              onChange={(e) => setForm({ ...form, author: e.target.value })}
            />
            <Input
              id="publication-order"
              label="Display order (lower appears first within a day)"
              type="number"
              value={form.display_order ?? 0}
              onChange={(e) => setForm({ ...form, display_order: Number(e.target.value || 0) })}
            />
          </div>
          <div className="flex flex-wrap items-center gap-6">
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
                className="h-4 w-4 rounded border-edge-strong text-maroon-700 dark:text-maroon-200 focus:ring-maroon-500"
              />
              <span className="text-sm font-body text-content-secondary">Publish (visible to the public)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                className="h-4 w-4 rounded border-edge-strong text-maroon-700 dark:text-maroon-200 focus:ring-maroon-500"
              />
              <span className="text-sm font-body text-content-secondary">Feature on the publications page</span>
            </label>
          </div>

          <div className="flex flex-wrap justify-end gap-3 pt-4 border-t border-edge-subtle">
            <Button variant="ghost" onClick={() => setPreviewOpen(true)}>
              <Eye className="h-4 w-4 mr-1" />
              Preview
            </Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave} isLoading={saving}>
              {editingId ? 'Save Changes' : form.published ? 'Create & Publish' : 'Save Draft'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Preview Modal — mirrors the public detail rendering */}
      <Modal isOpen={previewOpen} onClose={() => setPreviewOpen(false)} title="Preview" size="lg">
        <article>
          <p className="text-xs font-semibold uppercase tracking-wide text-maroon-700 dark:text-maroon-200 mb-1">
            {TYPE_LABELS[form.publication_type]}
            {form.round_label ? ` · ${form.round_label}` : ''}
            {form.season_label ? ` · ${form.season_label}` : ''}
          </p>
          <h2 className="text-2xl font-display font-bold text-content-primary mb-1">{form.title || 'Untitled publication'}</h2>
          <p className="text-sm text-content-muted mb-4">{form.issue_date ? formatDate(form.issue_date) : ''}{form.author ? ` · ${form.author}` : ''}</p>
          {form.summary && <p className="text-content-secondary font-body font-medium mb-3">{form.summary}</p>}
          <div className="text-content-secondary font-body whitespace-pre-wrap">{form.content || 'No body content yet.'}</div>
          {form.document_url && (
            <p className="mt-4 text-sm text-maroon-700 dark:text-maroon-200">PDF attached: {form.document_url}</p>
          )}
        </article>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Publication"
        size="sm"
      >
        <p className="text-sm text-content-muted font-body">
          Are you sure you want to delete this publication? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
