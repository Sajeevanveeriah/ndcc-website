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
import BatchActionsBar from '@/components/admin/BatchActionsBar';
import Input, { Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Input';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import { Handshake, Plus, Pencil, Trash2, ExternalLink } from 'lucide-react';
import { analyseSponsorLogoPixels, type SponsorLogoAnalysis } from '@/lib/sponsor-logo-analysis';

// Draw the (same-origin or CORS-permitted) logo into an offscreen canvas and
// classify its pixels so the plate select can suggest a verified mode for new
// uploads. Fails silently — analysis is a hint, never a gate.
async function analyseLogoUrl(url: string): Promise<SponsorLogoAnalysis | null> {
  try {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('logo load failed'));
      image.src = url;
    });
    const scale = Math.min(1, 160 / Math.max(image.naturalWidth, image.naturalHeight, 1));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    return analyseSponsorLogoPixels({ width, height, data: pixels.data });
  } catch {
    return null;
  }
}

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
  logo_surface_mode: 'auto',
};

const asString = (value: unknown) => (typeof value === 'string' ? value : '');

export default function AdminSponsorsPage() {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptySponsor);
  const [logoAnalysis, setLogoAnalysis] = useState<SponsorLogoAnalysis | null>(null);

  // Suggest a plate mode from the actual artwork pixels whenever the logo URL
  // changes. When the stored mode is still 'auto' the suggestion is applied
  // as an explicit resolved mode; an admin can always override the select.
  useEffect(() => {
    let cancelled = false;
    const url = asString(form.logo_url).trim();
    if (!url) { setLogoAnalysis(null); return; }
    analyseLogoUrl(url).then((analysis) => {
      if (cancelled || !analysis) return;
      setLogoAnalysis(analysis);
      setForm((prev) => (
        (asString(prev.logo_surface_mode) || 'auto') === 'auto' && asString(prev.logo_url).trim() === url
          ? { ...prev, logo_surface_mode: analysis.suggestedMode }
          : prev
      ));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.logo_url]);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);

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

  useEffect(() => {
    fetchSponsors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      logo_surface_mode: asString(sponsor.logo_surface_mode) || 'auto',
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
      logo_surface_mode: asString(form.logo_surface_mode) || 'auto',
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
      setSelectedIds((prev) => prev.filter((v) => v !== id));
      setFeedback({ type: 'success', message: 'Sponsor deleted.' });
      setDeleteConfirm(null);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to delete sponsor.' });
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => (prev.length === sponsors.length ? [] : sponsors.map((s) => s.id)));
  };

  const runBatch = async (run: () => Promise<Response>, successMessage: string) => {
    setBatchBusy(true);
    try {
      await parseApiResponse(await run());
      await fetchSponsors();
      setSelectedIds([]);
      setFeedback({ type: 'success', message: successMessage });
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Batch action failed.' });
    } finally {
      setBatchBusy(false);
    }
  };

  const batchSetActive = (active: boolean) => runBatch(
    () => adminFetch('/api/admin/resources/sponsors', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: selectedIds, active }),
    }),
    active ? 'Selected sponsors activated.' : 'Selected sponsors deactivated.'
  );

  const batchDelete = () => runBatch(
    () => fetch(`/api/admin/resources/sponsors?ids=${selectedIds.join(',')}`, { method: 'DELETE' }),
    'Selected sponsors deleted.'
  );

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
          <h1 className="text-2xl font-display font-bold text-content-primary flex items-center gap-2">
            <Handshake className="h-6 w-6 text-maroon-700 dark:text-maroon-200" />
            Sponsors
          </h1>
          <p className="text-content-muted font-body mt-1">
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

      <BatchActionsBar
        selectedCount={selectedIds.length}
        itemLabel="sponsor"
        busy={batchBusy}
        onClearSelection={() => setSelectedIds([])}
        actions={[
          { key: 'activate', label: 'Batch Activate', onAction: () => batchSetActive(true) },
          { key: 'deactivate', label: 'Batch Deactivate', onAction: () => batchSetActive(false) },
          { key: 'delete', label: 'Batch Delete', variant: 'danger', confirm: true, confirmLabel: 'Delete the selected sponsors? This cannot be undone.', onAction: batchDelete },
        ]}
      />

      {loading ? (
        <div className="bg-surface-card rounded-xl border border-edge-subtle p-8 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-full mb-4" />
          <div className="h-4 bg-gray-200 rounded w-full mb-4" />
          <div className="h-4 bg-gray-200 rounded w-3/4" />
        </div>
      ) : sponsors.length === 0 ? (
        <div className="bg-surface-card rounded-xl border border-edge-subtle p-8 text-center">
          <Handshake className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-content-muted font-body">No sponsors yet. Add your first sponsor.</p>
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader className="w-10">
                <input
                  type="checkbox"
                  aria-label="Select all sponsors"
                  checked={sponsors.length > 0 && selectedIds.length === sponsors.length}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-edge-strong text-maroon-700 dark:text-maroon-200 focus:ring-maroon-500"
                />
              </TableHeader>
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
                <TableCell className="w-10">
                  <input
                    type="checkbox"
                    aria-label={`Select ${sponsor.name}`}
                    checked={selectedIds.includes(sponsor.id)}
                    onChange={() => toggleSelected(sponsor.id)}
                    className="h-4 w-4 rounded border-edge-strong text-maroon-700 dark:text-maroon-200 focus:ring-maroon-500"
                  />
                </TableCell>
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
                      className="text-maroon-700 dark:text-maroon-200 hover:underline inline-flex items-center gap-1"
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
          <Select
            id="sponsor-logo-surface"
            label="Logo plate"
            options={[
              { value: 'auto', label: 'Auto (recommended)' },
              { value: 'light', label: 'Light plate (dark artwork)' },
              { value: 'dark', label: 'Dark plate (white artwork)' },
              { value: 'neutral', label: 'Neutral (logo has its own background)' },
              { value: 'transparent', label: 'Transparent (no plate)' },
            ]}
            value={asString(form.logo_surface_mode) || 'auto'}
            onChange={(e) => setForm({ ...form, logo_surface_mode: e.target.value })}
          />
          {logoAnalysis && (
            <p className="text-xs font-body text-content-muted -mt-2">
              Artwork analysis suggests the <span className="font-semibold">{logoAnalysis.suggestedMode}</span> plate — {logoAnalysis.reason}
            </p>
          )}
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
              className="h-4 w-4 rounded border-edge-strong text-maroon-700 dark:text-maroon-200 focus:ring-maroon-500"
            />
            <span className="text-sm font-body text-content-secondary">Active sponsor</span>
          </label>

          <div className="flex justify-end gap-3 pt-4 border-t border-edge-subtle">
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
        <p className="text-sm text-content-muted font-body">
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
