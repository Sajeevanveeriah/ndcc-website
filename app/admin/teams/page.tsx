'use client';

import { useEffect, useState } from 'react';
import { parseApiResponse, adminFetch } from '@/lib/admin-client';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import ImageUploadField from '@/components/admin/ImageUploadField';
import Input from '@/components/ui/Input';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import { Users, Plus, Pencil, Trash2 } from 'lucide-react';
import type { TeamInfo } from '@/lib/types';

type TeamRecord = Required<Pick<TeamInfo, 'id' | 'name' | 'grade' | 'description'>> & {
  captain: string | null;
  playhq_url: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

type TeamForm = Omit<TeamRecord, 'id' | 'created_at'>;

const emptyTeam: TeamForm = {
  name: '',
  grade: '',
  description: '',
  captain: '',
  playhq_url: '',
  image_url: '',
  sort_order: 0,
  is_active: true,
};

function sortTeams(teams: TeamRecord[]) {
  return teams.slice().sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

export default function AdminTeamsPage() {
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TeamForm>(emptyTeam);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const response = await fetch('/api/admin/resources/teams', { cache: 'no-store' });
        const result = await parseApiResponse<{ data?: TeamRecord[] }>(response);
        setTeams(sortTeams(result.data || []));
      } catch (err) {
        setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to fetch teams.' });
      } finally {
        setLoading(false);
      }
    };

    fetchTeams();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyTeam);
    setFormErrors({});
    setFeedback(null);
    setModalOpen(true);
  };

  const openEdit = (team: TeamRecord) => {
    setEditingId(team.id);
    setForm({
      name: team.name,
      grade: team.grade,
      description: team.description,
      captain: team.captain || '',
      playhq_url: team.playhq_url || '',
      image_url: team.image_url || '',
      sort_order: team.sort_order,
      is_active: team.is_active,
    });
    setFormErrors({});
    setFeedback(null);
    setModalOpen(true);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'Team name is required.';
    if (!form.grade.trim()) errors.grade = 'Grade is required.';
    if (!form.description.trim()) errors.description = 'Description is required.';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);

    const payload = {
      name: form.name.trim(),
      grade: form.grade.trim(),
      description: form.description.trim(),
      captain: form.captain?.trim() || null,
      playhq_url: form.playhq_url?.trim() || null,
      image_url: form.image_url?.trim() || null,
      sort_order: Number.isNaN(Number(form.sort_order)) ? 0 : Number(form.sort_order),
      is_active: form.is_active,
    };

    try {
      if (editingId) {
        const response = await adminFetch('/api/admin/resources/teams', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingId, ...payload }),
        });
        const result = await parseApiResponse<{ data: TeamRecord }>(response);
        setTeams((prev) => sortTeams(prev.map((item) => (item.id === editingId ? result.data : item))));
      } else {
        const response = await adminFetch('/api/admin/resources/teams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await parseApiResponse<{ data: TeamRecord }>(response);
        if (result.data) setTeams((prev) => sortTeams([...prev, result.data]));
      }
      setFeedback({ type: 'success', message: editingId ? 'Team updated.' : 'Team created.' });
      setModalOpen(false);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save team.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/resources/teams?id=${id}`, { method: 'DELETE' });
      await parseApiResponse(response);
      setTeams((prev) => prev.filter((item) => item.id !== id));
      setFeedback({ type: 'success', message: 'Team deleted.' });
      setDeleteConfirm(null);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to delete team.' });
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-6 w-6 text-maroon-700" />
            Teams
          </h1>
          <p className="text-gray-500 font-body mt-1">
            Manage the team cards shown on the public Teams page.
          </p>
        </div>
        <Button variant="primary" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Add Team
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
      ) : teams.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-body">No teams yet. Add your first team.</p>
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Name</TableHeader>
              <TableHeader>Grade</TableHeader>
              <TableHeader>Captain</TableHeader>
              <TableHeader>PlayHQ</TableHeader>
              <TableHeader>Image</TableHeader>
              <TableHeader>Order</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {teams.map((team) => (
              <TableRow key={team.id}>
                <TableCell className="font-medium">{team.name}</TableCell>
                <TableCell>{team.grade}</TableCell>
                <TableCell>{team.captain || '—'}</TableCell>
                <TableCell>{team.playhq_url ? 'Set' : 'None'}</TableCell>
                <TableCell>{team.image_url ? 'Set' : 'None'}</TableCell>
                <TableCell>{team.sort_order}</TableCell>
                <TableCell>
                  {team.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="default">Hidden</Badge>}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(team)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(team.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit Team' : 'Add Team'}
      >
        <div className="space-y-4">
          <Input
            id="team-name"
            label="Team name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            error={formErrors.name}
            required
          />
          <Input
            id="team-grade"
            label="Grade"
            value={form.grade}
            onChange={(e) => setForm({ ...form, grade: e.target.value })}
            error={formErrors.grade}
            required
          />
          <div>
            <label htmlFor="team-description" className="block text-sm font-medium text-gray-700 mb-1">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              id="team-description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={5}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-maroon-500 focus:border-transparent"
            />
            {formErrors.description && <p className="mt-1 text-sm text-red-600">{formErrors.description}</p>}
          </div>
          <Input
            id="team-captain"
            label="Captain (optional)"
            value={form.captain || ''}
            onChange={(e) => setForm({ ...form, captain: e.target.value })}
          />
          <Input
            id="team-playhq-url"
            label="PlayHQ URL (optional)"
            type="url"
            value={form.playhq_url || ''}
            onChange={(e) => setForm({ ...form, playhq_url: e.target.value })}
          />
          <ImageUploadField
            id="team-image"
            label="Image URL (optional)"
            value={form.image_url || ''}
            onChange={(value) => setForm({ ...form, image_url: value })}
            helpText="Use the upload button for club images, or leave blank to show the maroon team block."
          />
          <Input
            id="team-order"
            label="Display order (lower shows first)"
            type="number"
            value={String(form.sort_order)}
            onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
          />
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            Show this team on the public Teams page
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} isLoading={saving}>Save Team</Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Team"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Are you sure you want to delete this team? Hiding it is safer if it may be needed again later.</p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Delete</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
