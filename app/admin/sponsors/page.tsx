'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { SPONSOR_TIERS } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import type { Sponsor } from '@/lib/types';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
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
};

const placeholderSponsors: Sponsor[] = [
  {
    id: '1',
    name: 'Geelong Building Supplies',
    tier: 'major',
    logo_url: '/images/sponsors/gbs.png',
    website: 'https://example.com',
    placement_type: 'website',
    active: true,
    created_at: '2026-01-15T10:00:00Z',
  },
  {
    id: '2',
    name: 'Bellarine Brewery',
    tier: 'gold',
    logo_url: '/images/sponsors/bb.png',
    website: 'https://example.com',
    placement_type: 'website',
    active: true,
    created_at: '2026-01-10T10:00:00Z',
  },
  {
    id: '3',
    name: 'Moolap Meats',
    tier: 'community',
    logo_url: '',
    website: '',
    placement_type: 'website',
    active: false,
    created_at: '2025-11-20T10:00:00Z',
  },
];

export default function AdminSponsorsPage() {
  const [sponsors, setSponsors] = useState<Sponsor[]>(placeholderSponsors);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptySponsor);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchSponsors = async () => {
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('sponsors')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (data) setSponsors(data);
      } catch (err) {
        console.error('Failed to fetch sponsors:', err);
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
    setModalOpen(true);
  };

  const openEdit = (sponsor: Sponsor) => {
    setEditingId(sponsor.id);
    setForm({
      name: sponsor.name,
      tier: sponsor.tier,
      logo_url: sponsor.logo_url,
      website: sponsor.website,
      placement_type: sponsor.placement_type,
      active: sponsor.active,
    });
    setFormErrors({});
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
    };

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      if (editingId) {
        setSponsors((prev) =>
          prev.map((s) => (s.id === editingId ? { ...s, ...payload } : s))
        );
      } else {
        const newSponsor: Sponsor = {
          ...payload,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
        };
        setSponsors((prev) => [newSponsor, ...prev]);
      }
      setModalOpen(false);
      setSaving(false);
      return;
    }

    try {
      if (editingId) {
        const { error } = await supabase
          .from('sponsors')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;

        setSponsors((prev) =>
          prev.map((s) => (s.id === editingId ? { ...s, ...payload } : s))
        );
      } else {
        const { data, error } = await supabase
          .from('sponsors')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        if (data) setSponsors((prev) => [data, ...prev]);
      }
      setModalOpen(false);
    } catch (err) {
      console.error('Failed to save sponsor:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setSponsors((prev) => prev.filter((s) => s.id !== id));
      setDeleteConfirm(null);
      return;
    }

    try {
      const { error } = await supabase.from('sponsors').delete().eq('id', id);
      if (error) throw error;
      setSponsors((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error('Failed to delete sponsor:', err);
    } finally {
      setDeleteConfirm(null);
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
          <Input
            id="sponsor-logo"
            label="Logo URL (optional)"
            value={form.logo_url}
            onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
            placeholder="/images/sponsors/logo.png"
          />
          <Input
            id="sponsor-website"
            label="Website (optional)"
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
            placeholder="https://example.com"
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
