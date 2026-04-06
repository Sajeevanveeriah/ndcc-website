'use client';

import { useEffect, useState } from 'react';
import { formatDate } from '@/lib/utils';
import { parseApiResponse, adminFetch } from '@/lib/admin-client';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import { Users, Plus, Pencil, Trash2 } from 'lucide-react';

type SeasonAppointment = {
  id: string;
  name: string;
  role: string;
  image_url: string | null;
  announcement_date: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

type AppointmentForm = Omit<SeasonAppointment, 'id' | 'created_at'>;

const emptyAppointment: AppointmentForm = {
  name: '',
  role: '',
  image_url: '',
  announcement_date: new Date().toISOString().slice(0, 10),
  sort_order: 0,
  is_active: true,
};

export default function AdminSeasonAppointmentsPage() {
  const [appointments, setAppointments] = useState<SeasonAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AppointmentForm>(emptyAppointment);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  useEffect(() => {
    const fetchAppointments = async () => {
      try {
        const response = await fetch('/api/admin/resources/seasonAppointments', { cache: 'no-store' });
        const result = await parseApiResponse<{ data?: SeasonAppointment[] }>(response);
        setAppointments(result.data || []);
      } catch (err) {
        setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to fetch season appointments.' });
      } finally {
        setLoading(false);
      }
    };

    fetchAppointments();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyAppointment);
    setFormErrors({});
    setFeedback(null);
    setModalOpen(true);
  };

  const openEdit = (appointment: SeasonAppointment) => {
    setEditingId(appointment.id);
    setForm({
      name: appointment.name,
      role: appointment.role,
      image_url: appointment.image_url || '',
      announcement_date: appointment.announcement_date,
      sort_order: appointment.sort_order,
      is_active: appointment.is_active,
    });
    setFormErrors({});
    setFeedback(null);
    setModalOpen(true);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'Name is required.';
    if (!form.role.trim()) errors.role = 'Role is required.';
    if (!form.announcement_date) errors.announcement_date = 'Announcement date is required.';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);

    const payload = {
      name: form.name.trim(),
      role: form.role.trim(),
      image_url: form.image_url?.trim() || null,
      announcement_date: form.announcement_date,
      sort_order: Number.isNaN(Number(form.sort_order)) ? 0 : Number(form.sort_order),
      is_active: form.is_active,
    };

    try {
      if (editingId) {
        const response = await adminFetch('/api/admin/resources/seasonAppointments', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingId, ...payload }),
        });
        const result = await parseApiResponse<{ data: SeasonAppointment }>(response);
        setAppointments((prev) => prev.map((item) => (item.id === editingId ? result.data : item)));
      } else {
        const response = await adminFetch('/api/admin/resources/seasonAppointments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await parseApiResponse<{ data: SeasonAppointment }>(response);
        if (result.data) {
          setAppointments((prev) => [...prev, result.data].sort((a, b) => a.sort_order - b.sort_order));
        }
      }
      setFeedback({ type: 'success', message: editingId ? 'Appointment updated.' : 'Appointment created.' });
      setModalOpen(false);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save appointment.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/resources/seasonAppointments?id=${id}`, { method: 'DELETE' });
      await parseApiResponse(response);
      setAppointments((prev) => prev.filter((item) => item.id !== id));
      setFeedback({ type: 'success', message: 'Appointment deleted.' });
      setDeleteConfirm(null);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to delete appointment.' });
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-6 w-6 text-maroon-700" />
            Season Appointments
          </h1>
          <p className="text-gray-500 font-body mt-1">
            Cards shown on homepage section: 2026/27 Season Appointments.
          </p>
        </div>
        <Button variant="primary" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Add Appointment
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
      ) : appointments.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-body">No appointments yet. Add your first card.</p>
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Name</TableHeader>
              <TableHeader>Role</TableHeader>
              <TableHeader>Announcement</TableHeader>
              <TableHeader>Order</TableHeader>
              <TableHeader>Image</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Created</TableHeader>
              <TableHeader>Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {appointments.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>{item.role}</TableCell>
                <TableCell>{formatDate(item.announcement_date)}</TableCell>
                <TableCell>{item.sort_order}</TableCell>
                <TableCell>{item.image_url ? 'Set' : 'None'}</TableCell>
                <TableCell>
                  {item.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="default">Hidden</Badge>}
                </TableCell>
                <TableCell>{formatDate(item.created_at)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(item.id)}>
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
        title={editingId ? 'Edit Appointment' : 'Add Appointment'}
      >
        <div className="space-y-4">
          <Input
            id="appointment-name"
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            error={formErrors.name}
            required
          />
          <Input
            id="appointment-role"
            label="Role"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            error={formErrors.role}
            required
          />
          <Input
            id="appointment-date"
            label="Announcement date"
            type="date"
            value={form.announcement_date}
            onChange={(e) => setForm({ ...form, announcement_date: e.target.value })}
            error={formErrors.announcement_date}
            required
          />
          <Input
            id="appointment-image"
            label="Image URL (optional)"
            value={form.image_url || ''}
            onChange={(e) => setForm({ ...form, image_url: e.target.value })}
          />
          <Input
            id="appointment-order"
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
            Show this card on homepage
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} isLoading={saving}>Save Appointment</Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Appointment"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Are you sure you want to delete this appointment card?</p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Delete</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
