'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { Event } from '@/lib/types';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Input, { Textarea } from '@/components/ui/Input';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import { Calendar, Plus, Pencil, Trash2 } from 'lucide-react';

const emptyEvent: Omit<Event, 'id' | 'created_at'> = {
  title: '',
  description: '',
  date: '',
  location: '',
  capacity: null,
  ticket_price: 0,
  stripe_link: '',
  published: false,
};

const placeholderEvents: Event[] = [
  {
    id: '1',
    title: 'Season Launch BBQ',
    description: 'Kick off the 2026/27 season with a community BBQ at Grinter Reserve.',
    date: '2026-10-01T17:00:00Z',
    location: 'Grinter Reserve',
    capacity: 150,
    ticket_price: 0,
    stripe_link: '',
    published: true,
    created_at: '2026-03-01T10:00:00Z',
  },
  {
    id: '2',
    title: 'Presentation Night',
    description: 'Annual awards and presentation evening celebrating the season.',
    date: '2027-03-28T18:30:00Z',
    location: 'Grinter Reserve Clubrooms',
    capacity: 100,
    ticket_price: 35,
    stripe_link: 'https://buy.stripe.com/example',
    published: false,
    created_at: '2026-02-15T08:00:00Z',
  },
];

export default function AdminEventsPage() {
  const [events, setEvents] = useState<Event[]>(placeholderEvents);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyEvent);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchEvents = async () => {
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('events')
          .select('*')
          .order('date', { ascending: false });

        if (error) throw error;
        if (data) setEvents(data);
      } catch (err) {
        console.error('Failed to fetch events:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyEvent);
    setFormErrors({});
    setModalOpen(true);
  };

  const openEdit = (event: Event) => {
    setEditingId(event.id);
    setForm({
      title: event.title,
      description: event.description,
      date: event.date ? event.date.slice(0, 16) : '',
      location: event.location,
      capacity: event.capacity,
      ticket_price: event.ticket_price,
      stripe_link: event.stripe_link,
      published: event.published,
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!form.title.trim()) errors.title = 'Title is required.';
    if (!form.date) errors.date = 'Date is required.';
    if (!form.location.trim()) errors.location = 'Location is required.';
    if (form.ticket_price < 0) errors.ticket_price = 'Price cannot be negative.';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      date: form.date,
      location: form.location.trim(),
      capacity: form.capacity,
      ticket_price: form.ticket_price,
      stripe_link: form.stripe_link.trim(),
      published: form.published,
    };

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      if (editingId) {
        setEvents((prev) =>
          prev.map((e) => (e.id === editingId ? { ...e, ...payload } : e))
        );
      } else {
        const newEvent: Event = {
          ...payload,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
        };
        setEvents((prev) => [newEvent, ...prev]);
      }
      setModalOpen(false);
      setSaving(false);
      return;
    }

    try {
      if (editingId) {
        const { error } = await supabase
          .from('events')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;

        setEvents((prev) =>
          prev.map((e) => (e.id === editingId ? { ...e, ...payload } : e))
        );
      } else {
        const { data, error } = await supabase
          .from('events')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        if (data) setEvents((prev) => [data, ...prev]);
      }
      setModalOpen(false);
    } catch (err) {
      console.error('Failed to save event:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setEvents((prev) => prev.filter((e) => e.id !== id));
      setDeleteConfirm(null);
      return;
    }

    try {
      const { error } = await supabase.from('events').delete().eq('id', id);
      if (error) throw error;
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      console.error('Failed to delete event:', err);
    } finally {
      setDeleteConfirm(null);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="h-6 w-6 text-maroon-700" />
            Events
          </h1>
          <p className="text-gray-500 font-body mt-1">
            {events.length} event{events.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button variant="primary" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Create Event
        </Button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-full mb-4" />
          <div className="h-4 bg-gray-200 rounded w-full mb-4" />
          <div className="h-4 bg-gray-200 rounded w-3/4" />
        </div>
      ) : events.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-body">No events yet. Create your first event.</p>
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Title</TableHeader>
              <TableHeader>Date</TableHeader>
              <TableHeader>Location</TableHeader>
              <TableHeader>Capacity</TableHeader>
              <TableHeader>Price</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {events.map((event) => (
              <TableRow key={event.id}>
                <TableCell className="font-medium">{event.title}</TableCell>
                <TableCell>{formatDate(event.date)}</TableCell>
                <TableCell>{event.location}</TableCell>
                <TableCell>{event.capacity ?? 'Unlimited'}</TableCell>
                <TableCell>{event.ticket_price > 0 ? formatCurrency(event.ticket_price) : 'Free'}</TableCell>
                <TableCell>
                  {event.published ? (
                    <Badge variant="success">Published</Badge>
                  ) : (
                    <Badge variant="warning">Draft</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(event)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirm(event.id)}
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
        title={editingId ? 'Edit Event' : 'Create Event'}
        size="lg"
      >
        <div className="space-y-4">
          <Input
            id="event-title"
            label="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            error={formErrors.title}
            required
          />
          <Textarea
            id="event-description"
            label="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="event-date"
              label="Date & Time"
              type="datetime-local"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              error={formErrors.date}
              required
            />
            <Input
              id="event-location"
              label="Location"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              error={formErrors.location}
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="event-capacity"
              label="Capacity (leave empty for unlimited)"
              type="number"
              value={form.capacity ?? ''}
              onChange={(e) =>
                setForm({ ...form, capacity: e.target.value ? parseInt(e.target.value) : null })
              }
            />
            <Input
              id="event-price"
              label="Ticket Price ($)"
              type="number"
              min="0"
              step="0.01"
              value={form.ticket_price}
              onChange={(e) =>
                setForm({ ...form, ticket_price: parseFloat(e.target.value) || 0 })
              }
              error={formErrors.ticket_price}
            />
          </div>
          <Input
            id="event-stripe"
            label="Stripe Payment Link (optional)"
            value={form.stripe_link}
            onChange={(e) => setForm({ ...form, stripe_link: e.target.value })}
            placeholder="https://buy.stripe.com/..."
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) => setForm({ ...form, published: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-maroon-700 focus:ring-maroon-500"
            />
            <span className="text-sm font-body text-gray-700">Published</span>
          </label>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave} isLoading={saving}>
              {editingId ? 'Update Event' : 'Create Event'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Event"
        size="sm"
      >
        <p className="text-sm text-gray-600 font-body">
          Are you sure you want to delete this event? This action cannot be undone.
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
