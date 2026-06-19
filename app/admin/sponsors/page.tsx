'use client';

import { useEffect, useState } from 'react';
import { SPONSOR_TIERS } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import { parseApiResponse, adminFetch } from '@/lib/admin-client';
import type { Sponsor } from '@/lib/types';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import ImageUploadField from '@/components/admin/ImageUploadField';
import Input, { Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Input';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import { Handshake, Plus, Pencil, Trash2, ExternalLink } from 'lucide-react';

const emptySponsor: Omit<Sponsor, 'id' | 'created_at'> = {
  name: '',
  tier: 'standard',
  logo_url: '',
  website: '',
  placement_type: 'website',
  active: true,
  description: '',
  sort_order: 0,
  source_url: '',
  logo_source_url: '',
};

const asString = (value: unknown) => (typeof value === 'string' ? value : '');

export default function AdminSponsorsPage() {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptySponsor);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  useEffect(() => {
    const fetchSponsors = async () => {
      try {
        const response = await fetch('/api/admin/resources/sponsors', { cache: 'no-store' });
        const result = await parseApiResponse<{ data?: Sponsor[] }>(response);
        setSponsors(result.data || []);
      } catch (err) {
        setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to fetch sponsors.' });
      } finally {
        setLoading(false);
      }
    };

    fetchSponsors();
  }, []);

  const getTierLabel = (value: string) => {
    const found = SPONSOR_TIERS.find((t) => t.value === value);
    return found ? found.label : value;
  };

  const getTierBadgeVariant = (tier: string): 'default' | 'success' | 'warning' | 'danger' | 'info' => {
    switch (tier) {
      case 'major':
        return 'danger';
      case 'gold':
        return 'warning';
      case 'silver':
        return 'info';
      case 'standard':
        return 'default';
      case 'community':
        return 'success';
      default:
        return 'default';
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptySponsor);
    setFormErrors({});
    setFeedback(null);
    setModalOpen(true);
  };

  const openEdit = (sponsor: Sponsor) => {
    setEditingId(sponsor.id);
    setForm({
      name: sponsor.name,
      tier: sponsor.tier,
      logo_url: asString(sponsor.logo_url),
      website: asString(sponsor.website),
      placement_type: asString(sponsor.placement_type) || 'website',
      active: sponsor.active,
      description: asString(sponsor.description),
      sort_order: sponsor.sort_order || 0,
      source_url: asString(sponsor.source_url),
      logo_source_url: asString(sponsor.logo_source_url),
    });
    setFormErrors({});
    setFeedback(null);
    setModalOpen(true);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'Name is required.';
    if (!form.tier) errors.tier = 'Tier is required.';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);

    const payload = {
      name: form.name.trim(),
      tier: form.tier,
      logo_url: form.logo_url.trim(),
      website: form.website.trim(),
      placement_type: form.placement_type.trim(),
      active: form.active,
      description: asString(form.description).trim(),
      sort_order: Number(form.sort_order) || 0,
      source_url: asString(form.source_url).trim(),
      logo_source_url: asString(form.logo_source_url).trim(),
    };

    try {
      if (editingId) {
        const response = await adminFetch('/api/admin/resources/sponsors', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingId, ...payload }),
        });
        const result = await parseApiResponse<{ data: Sponsor }>(response);
        setSponsors((prev) => prev.map((s) => (s.id === editingId ? result.data : s)));
      } else {
        const response = await adminFetch('/api/admin/resources/sponsors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await parseApiResponse<{ data: Sponsor }>(response);
        if (result.data) setSponsors((prev) => [result.data, ...prev]);
      }
      setFeedback({ type: 'success', message: editingId ? 'Sponsor updated.' : 'Sponsor created.' });
      setModalOpen(false);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save sponsor.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/resources/sponsors?id=${id}`, { method: 'DELETE' });
      await parseApiResponse(response);
      setSponsors((prev) => prev.filter((s) => s.id !== id));
      setFeedback({ type: 'success', message: 'Sponsor deleted.' });
      setDeleteConfirm(null);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to delete sponsor.' });
    }
  };

  const tierOptions = SPONSOR_TIERS.map((t) => ({ value: t.value, label: t.label }));
  const placementOptions = [
    { value: 'website', label: 'Website' },
    { value: 'ground', label: 'Ground Signage' },
    { value: 'shirt', label: 'Shirt Sponsor' },
    { value: 'both', label: 'Website + Ground' },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
            <Handshake className="h-6 w-6 text-maroon-700" />
            Sponsors
          </h1>
          <p className="text-gray-500 font-body mt-1">
            {sponsors.length} sponsor{sponsors.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button variant="primary" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Add Sponsor
        </Button>
      </div>
      {feedback && (
        <p className={`mb-4 text-sm ${feedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>{feedback.message}</p>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-full mb-4" />
          <div className="h-4 bg-gray-200 rounded w-full mb-4" />
          <div className="h-4 bg-gray-200 rounded w-3/4" />
        </div>
      ) : sponsors.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <Handshake className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-body">No sponsors yet. Add your first sponsor.</p>
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Name</TableHeader>
              <TableHeader>Tier</TableHeader>
              <TableHeader>Placement</TableHeader>
              <TableHeader>Website</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Added</TableHeader>
              <TableHeader>Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {sponsors.map((sponsor) => (
              <TableRow key={sponsor.id}>
                <TableCell className="font-medium">{sponsor.name}</TableCell>
                <TableCell>
                  <Badge variant={getTierBadgeVariant(sponsor.tier)}>
                    {getTierLabel(sponsor.tier)}
                  </Badge>
                </TableCell>
                <TableCell className="capitalize">{sponsor.placement_type}</TableCell>
                <TableCell>
                  {sponsor.website ? (
                    <a
                      href={sponsor.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-maroon-700 hover:underline inline-flex items-center gap-1"
                    >
                      Visit <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {sponsor.active ? (
                    <Badge variant="success">Active</Badge>
                  ) : (
                    <Badge variant="danger">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell>{formatDate(sponsor.created_at)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(sponsor)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirm(sponsor.id)}
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
        title={editingId ? 'Edit Sponsor' : 'Add Sponsor'}
        size="lg"
      >
        <div className="space-y-4">
          <Input
            id="sponsor-name"
            label="Sponsor Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            error={formErrors.name}
            required
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              id="sponsor-tier"
              label="Tier"
              options={tierOptions}
              value={form.tier}
              onChange={(e) => setForm({ ...form, tier: e.target.value })}
              error={formErrors.tier}
            />
            <Select
              id="sponsor-placement"
              label="Placement Type"
              options={placementOptions}
              value={form.placement_type}
              onChange={(e) => setForm({ ...form, placement_type: e.target.value })}
            />
          </div>
          <ImageUploadField
            id="sponsor-logo"
            label="Logo URL (optional)"
            value={form.logo_url}
            onChange={(value) => setForm({ ...form, logo_url: value })}
            placeholder="/images/sponsors/logo.png"
            helpText="Paste an external logo URL or upload a file to store under /images/cms."
          />
          <Textarea
            id="sponsor-description"
            label="Description (optional)"
            value={asString(form.description)}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            placeholder="Short public sponsor description"
          />
          <Input
            id="sponsor-website"
            label="Website (optional)"
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
            placeholder="https://example.com"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="sponsor-sort-order"
              label="Sort order"
              type="number"
              value={String(form.sort_order || 0)}
              onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
            />
            <Input
              id="sponsor-source-url"
              label="Source URL (optional)"
              value={asString(form.source_url)}
              onChange={(e) => setForm({ ...form, source_url: e.target.value })}
              placeholder="https://example.com"
            />
          </div>
          <Input
            id="sponsor-logo-source-url"
            label="Logo source URL (optional)"
            value={asString(form.logo_source_url)}
            onChange={(e) => setForm({ ...form, logo_source_url: e.target.value })}
            placeholder="https://example.com/logo.png"
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-maroon-700 focus:ring-maroon-500"
            />
            <span className="text-sm font-body text-gray-700">Active sponsor</span>
          </label>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave} isLoading={saving}>
              {editingId ? 'Update Sponsor' : 'Add Sponsor'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Sponsor"
        size="sm"
      >
        <p className="text-sm text-gray-600 font-body">
          Are you sure you want to delete this sponsor? This action cannot be undone.
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
