'use client';

import { useEffect, useState } from 'react';
import { formatDate, formatCurrency, toDatetimeLocalInClubTimezone } from '@/lib/utils';
import { parseApiResponse, adminFetch } from '@/lib/admin-client';
import type { Event, EventRegistration } from '@/lib/types';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import DeleteRecordButton from '@/components/admin/DeleteRecordButton';
import ImageUploadField from '@/components/admin/ImageUploadField';
import BatchActionsBar from '@/components/admin/BatchActionsBar';
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
  image_url: '',
  published: false,
};

function asSafeString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [registrationsLoading, setRegistrationsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyEvent);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);

  const fetchEvents = async () => {
    try {
      const response = await fetch('/api/admin/resources/events', { cache: 'no-store' });
      const result = await parseApiResponse<{ data?: Event[] }>(response);
      setEvents(result.data || []);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to fetch events.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchRegistrations = async () => {
      try {
        const response = await fetch('/api/admin/resources/eventRegistrations', { cache: 'no-store' });
        const result = await parseApiResponse<{ data?: EventRegistration[] }>(response);
        setRegistrations(result.data || []);
      } catch (err) {
        setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to fetch event registrations.' });
      } finally {
        setRegistrationsLoading(false);
      }
    };

    fetchEvents();
    fetchRegistrations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyEvent);
    setFormErrors({});
    setFeedback(null);
    setModalOpen(true);
  };

  const openEdit = (event: Event) => {
    setEditingId(event.id);
    setForm({
      title: asSafeString(event.title),
      description: asSafeString(event.description),
      date: typeof event.date === 'string' ? toDatetimeLocalInClubTimezone(event.date) : '',
      location: asSafeString(event.location),
      capacity: typeof event.capacity === 'number' ? event.capacity : null,
      ticket_price: typeof event.ticket_price === 'number' ? event.ticket_price : 0,
      stripe_link: asSafeString(event.stripe_link),
      image_url: asSafeString(event.image_url),
      published: !!event.published,
    });
    setFormErrors({});
    setFeedback(null);
    setModalOpen(true);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!asSafeString(form.title).trim()) errors.title = 'Title is required.';
    if (!form.date) errors.date = 'Date is required.';
    if (!asSafeString(form.location).trim()) errors.location = 'Location is required.';
    if (form.ticket_price < 0) errors.ticket_price = 'Price cannot be negative.';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);

    try {
      const payload = {
        title: asSafeString(form.title).trim(),
        description: asSafeString(form.description).trim(),
        date: form.date,
        location: asSafeString(form.location).trim(),
        capacity: form.capacity,
        ticket_price: form.ticket_price,
        stripe_link: asSafeString(form.stripe_link).trim(),
        image_url: asSafeString(form.image_url).trim() || null,
        published: form.published,
      };

      if (editingId) {
        const response = await adminFetch('/api/admin/resources/events', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingId, ...payload }),
        });
        const result = await parseApiResponse<{ data: Event }>(response);
        setEvents((prev) => prev.map((e) => (e.id === editingId ? result.data : e)));
      } else {
        const response = await adminFetch('/api/admin/resources/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await parseApiResponse<{ data: Event }>(response);
        if (result.data) setEvents((prev) => [result.data, ...prev]);
      }
      setFeedback({ type: 'success', message: editingId ? 'Event updated.' : 'Event created.' });
      setModalOpen(false);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save event.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/resources/events?id=${id}`, { method: 'DELETE' });
      await parseApiResponse(response);
      setEvents((prev) => prev.filter((e) => e.id !== id));
      setSelectedIds((prev) => prev.filter((v) => v !== id));
      setFeedback({ type: 'success', message: 'Event deleted.' });
      setDeleteConfirm(null);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to delete event.' });
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => (prev.length === events.length ? [] : events.map((e) => e.id)));
  };

  const runBatch = async (run: () => Promise<Response>, successMessage: string) => {
    setBatchBusy(true);
    try {
      await parseApiResponse(await run());
      await fetchEvents();
      setSelectedIds([]);
      setFeedback({ type: 'success', message: successMessage });
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Batch action failed.' });
    } finally {
      setBatchBusy(false);
    }
  };

  const batchSetPublished = (published: boolean) => runBatch(
    () => adminFetch('/api/admin/resources/events', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: selectedIds, published }),
    }),
    published ? 'Selected events published.' : 'Selected events unpublished.'
  );

  const batchDelete = () => runBatch(
    () => fetch(`/api/admin/resources/events?ids=${selectedIds.join(',')}`, { method: 'DELETE' }),
    'Selected events deleted.'
  );

  const handleRegistrationUpdate = async (id: string, patch: Partial<EventRegistration>) => {
    try {
      const response = await adminFetch('/api/admin/resources/eventRegistrations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      await parseApiResponse(response);
      setRegistrations((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
      );
      setFeedback({ type: 'success', message: 'Event registration updated.' });
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update event registration.' });
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
      {feedback && (
        <p className={`mb-4 text-sm ${feedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>{feedback.message}</p>
      )}

      <BatchActionsBar
        selectedCount={selectedIds.length}
        itemLabel="event"
        busy={batchBusy}
        onClearSelection={() => setSelectedIds([])}
        actions={[
          { key: 'publish', label: 'Batch Publish', onAction: () => batchSetPublished(true) },
          { key: 'unpublish', label: 'Batch Unpublish', onAction: () => batchSetPublished(false) },
          { key: 'delete', label: 'Batch Delete', variant: 'danger', confirm: true, confirmLabel: 'Delete the selected events? This cannot be undone.', onAction: batchDelete },
        ]}
      />

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
              <TableHeader className="w-10">
                <input
                  type="checkbox"
                  aria-label="Select all events"
                  checked={events.length > 0 && selectedIds.length === events.length}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-gray-300 text-maroon-700 focus:ring-maroon-500"
                />
              </TableHeader>
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
                <TableCell className="w-10">
                  <input
                    type="checkbox"
                    aria-label={`Select ${event.title}`}
                    checked={selectedIds.includes(event.id)}
                    onChange={() => toggleSelected(event.id)}
                    className="h-4 w-4 rounded border-gray-300 text-maroon-700 focus:ring-maroon-500"
                  />
                </TableCell>
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

      <div className="mt-10">
        <h2 className="text-xl font-display font-bold text-gray-900 mb-3">Event Registrations</h2>
        {registrationsLoading ? (
          <div className="bg-white rounded-xl border border-gray-100 p-6 text-sm text-gray-500">Loading registrations...</div>
        ) : registrations.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-6 text-sm text-gray-500">No registrations yet.</div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Name</TableHeader>
                <TableHeader>Email</TableHeader>
                <TableHeader>Phone</TableHeader>
                <TableHeader>Qty</TableHeader>
                <TableHeader>Payment Ref</TableHeader>
                <TableHeader>Payment</TableHeader>
                <TableHeader>Processed</TableHeader>
                <TableHeader>Created</TableHeader>
                <TableHeader>Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {registrations.map((registration) => (
                <TableRow key={registration.id}>
                  <TableCell className="font-medium">{registration.name}</TableCell>
                  <TableCell>{registration.email}</TableCell>
                  <TableCell>{registration.phone || '-'}</TableCell>
                  <TableCell>{registration.quantity}</TableCell>
                  <TableCell className="font-mono text-xs">{registration.payment_reference || '-'}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRegistrationUpdate(
                        registration.id,
                        { payment_status: registration.payment_status === 'paid' ? 'pending_bank_transfer' : 'paid' }
                      )}
                    >
                      {registration.payment_status === 'paid' ? 'Mark Unpaid' : 'Mark Paid'}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <label className="inline-flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={Boolean(registration.processed)}
                        onChange={(e) => handleRegistrationUpdate(registration.id, { processed: e.target.checked })}
                      />
                      Processed
                    </label>
                  </TableCell>
                  <TableCell>{formatDate(registration.created_at)}</TableCell>
                  <TableCell>
                    <DeleteRecordButton
                      resource="eventRegistrations"
                      recordId={registration.id}
                      recordLabel={`event registration from ${registration.name}`}
                      recordDetails={[
                        { label: 'Name', value: registration.name },
                        { label: 'Email', value: registration.email },
                        { label: 'Date', value: formatDate(registration.created_at) },
                      ]}
                      onDeleted={(id) => setRegistrations((prev) => prev.filter((item) => item.id !== id))}
                      onSuccessMessage={(message) => setFeedback({ type: 'success', message })}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

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
          <ImageUploadField
            id="event-image-url"
            label="Image URL (optional)"
            value={asSafeString(form.image_url)}
            onChange={(value) => setForm({ ...form, image_url: value })}
            placeholder="https://example.com/event-image.jpg"
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
