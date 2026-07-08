'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DateClickArg } from '@fullcalendar/interaction';
import type { EventClickArg } from '@fullcalendar/core';
import { toDatetimeLocalInClubTimezone } from '@/lib/utils';
import { parseApiResponse, adminFetch } from '@/lib/admin-client';
import type { CalendarEvent } from '@/lib/calendar/types';
import {
  CALENDAR_EVENT_TYPES,
  CALENDAR_EVENT_TYPE_LABELS,
  CALENDAR_STATUSES,
  CALENDAR_VISIBILITIES,
} from '@/lib/calendar/types';
import { eventColour, formatEventDateRange, utcToMelbourneFloating } from '@/lib/calendar/format';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import BatchActionsBar from '@/components/admin/BatchActionsBar';
import Input, { Select } from '@/components/ui/Input';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import CalendarEventFormModal, {
  emptyCalendarEventForm,
  type CalendarEventForm,
} from '@/components/admin/calendar/CalendarEventFormModal';
import { CalendarDays, Plus, Pencil, Trash2, Copy, ExternalLink } from 'lucide-react';
import '@/components/calendar/calendar-theme.css';

const RESOURCE_URL = '/api/admin/resources/calendarEvents';

const STATUS_BADGES: Record<string, 'success' | 'warning' | 'danger' | 'default' | 'info'> = {
  published: 'success',
  draft: 'warning',
  cancelled: 'danger',
  postponed: 'warning',
  archived: 'default',
};

function isValidUrlOrPath(value: string) {
  if (!value) return true;
  if (value.startsWith('/')) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function formToPayload(form: CalendarEventForm) {
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    start_at: form.start_at,
    end_at: form.end_at || null,
    all_day: form.all_day,
    location: form.location.trim() || null,
    venue_address: form.venue_address.trim() || null,
    event_type: form.event_type,
    category: form.category.trim() || null,
    status: form.status,
    visibility: form.visibility,
    is_featured: form.is_featured,
    show_on_home: form.show_on_home,
    show_on_contact: form.show_on_contact,
    show_on_calendar: form.show_on_calendar,
    image_url: form.image_url.trim() || null,
    external_url: form.external_url.trim() || null,
    cta_label: form.cta_label.trim() || null,
    cta_url: form.cta_url.trim() || null,
    registration_required: form.registration_required,
    ticket_price: form.ticket_price === '' ? null : Number(form.ticket_price),
    capacity: form.capacity === '' ? null : Number(form.capacity),
    colour: form.colour.trim() || null,
  };
}

function eventToForm(event: CalendarEvent): CalendarEventForm {
  return {
    title: event.title ?? '',
    description: event.description ?? '',
    start_at: event.start_at ? toDatetimeLocalInClubTimezone(event.start_at) : '',
    end_at: event.end_at ? toDatetimeLocalInClubTimezone(event.end_at) : '',
    all_day: !!event.all_day,
    location: event.location ?? '',
    venue_address: event.venue_address ?? '',
    event_type: event.event_type ?? 'club',
    category: event.category ?? '',
    status: event.status ?? 'draft',
    visibility: event.visibility ?? 'public',
    is_featured: !!event.is_featured,
    show_on_home: !!event.show_on_home,
    show_on_contact: !!event.show_on_contact,
    show_on_calendar: !!event.show_on_calendar,
    image_url: event.image_url ?? '',
    external_url: event.external_url ?? '',
    cta_label: event.cta_label ?? '',
    cta_url: event.cta_url ?? '',
    registration_required: !!event.registration_required,
    ticket_price: event.ticket_price === null || event.ticket_price === undefined ? '' : String(event.ticket_price),
    capacity: event.capacity === null || event.capacity === undefined ? '' : String(event.capacity),
    colour: event.colour ?? '',
  };
}

export default function AdminCalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'month'>('list');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CalendarEventForm>(emptyCalendarEventForm);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState('');
  const [search, setSearch] = useState('');

  const fetchEvents = async () => {
    try {
      const response = await fetch(RESOURCE_URL, { cache: 'no-store' });
      const result = await parseApiResponse<{ data?: CalendarEvent[] }>(response);
      setEvents(result.data || []);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to fetch calendar events.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return events.filter((event) => {
      if (statusFilter && event.status !== statusFilter) return false;
      if (typeFilter && event.event_type !== typeFilter) return false;
      if (visibilityFilter && event.visibility !== visibilityFilter) return false;
      if (!term) return true;
      return [event.title, event.location ?? '', event.description ?? '', event.category ?? '']
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [events, statusFilter, typeFilter, visibilityFilter, search]);

  const openCreate = (startLocal?: string) => {
    setEditingId(null);
    setForm({ ...emptyCalendarEventForm, start_at: startLocal ?? '' });
    setFormErrors({});
    setFeedback(null);
    setModalOpen(true);
  };

  const openEdit = (event: CalendarEvent) => {
    setEditingId(event.id);
    setForm(eventToForm(event));
    setFormErrors({});
    setFeedback(null);
    setModalOpen(true);
  };

  const openDuplicate = (event: CalendarEvent) => {
    setEditingId(null);
    setForm({ ...eventToForm(event), title: `${event.title} (copy)`, status: 'draft' });
    setFormErrors({});
    setFeedback(null);
    setModalOpen(true);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!form.title.trim()) errors.title = 'Title is required.';
    if (!form.start_at) errors.start_at = 'Start date and time are required.';
    if (form.end_at && form.start_at && form.end_at < form.start_at) errors.end_at = 'End must be after the start.';
    if (!isValidUrlOrPath(form.external_url.trim())) errors.external_url = 'Must be a valid URL.';
    if (!isValidUrlOrPath(form.cta_url.trim())) errors.cta_url = 'Must be a valid URL or site path.';
    if (form.ticket_price !== '' && (!Number.isFinite(Number(form.ticket_price)) || Number(form.ticket_price) < 0)) {
      errors.ticket_price = 'Price must be zero or more.';
    }
    if (form.capacity !== '' && (!Number.isInteger(Number(form.capacity)) || Number(form.capacity) <= 0)) {
      errors.capacity = 'Capacity must be a positive whole number.';
    }
    if (form.colour.trim() && !/^#[0-9a-fA-F]{3,8}$/.test(form.colour.trim())) {
      errors.colour = 'Use a hex colour like #800000.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    setSaving(true);
    try {
      const payload = formToPayload(form);
      if (editingId) {
        const response = await adminFetch(RESOURCE_URL, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingId, ...payload }),
        });
        const result = await parseApiResponse<{ data: CalendarEvent }>(response);
        setEvents((prev) => prev.map((e) => (e.id === editingId ? result.data : e)));
      } else {
        const response = await adminFetch(RESOURCE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await parseApiResponse<{ data: CalendarEvent }>(response);
        if (result.data) setEvents((prev) => [...prev, result.data].sort((a, b) => a.start_at.localeCompare(b.start_at)));
      }
      setFeedback({ type: 'success', message: editingId ? 'Calendar event updated.' : 'Calendar event created.' });
      setModalOpen(false);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save calendar event.' });
    } finally {
      setSaving(false);
    }
  };

  const quickPatch = async (id: string, patch: Record<string, unknown>, message: string) => {
    try {
      const response = await adminFetch(RESOURCE_URL, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      const result = await parseApiResponse<{ data: CalendarEvent }>(response);
      setEvents((prev) => prev.map((e) => (e.id === id ? result.data : e)));
      setFeedback({ type: 'success', message });
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Update failed.' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`${RESOURCE_URL}?id=${id}`, { method: 'DELETE' });
      await parseApiResponse(response);
      setEvents((prev) => prev.filter((e) => e.id !== id));
      setSelectedIds((prev) => prev.filter((v) => v !== id));
      setFeedback({ type: 'success', message: 'Calendar event deleted.' });
      setDeleteConfirm(null);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to delete calendar event.' });
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => (prev.length === filtered.length ? [] : filtered.map((e) => e.id)));
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

  const batchSetStatus = (status: string, successMessage: string) => runBatch(
    () => adminFetch(RESOURCE_URL, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: selectedIds, status }),
    }),
    successMessage
  );

  const batchDelete = () => runBatch(
    () => fetch(`${RESOURCE_URL}?ids=${selectedIds.join(',')}`, { method: 'DELETE' }),
    'Selected calendar events deleted.'
  );

  const monthEvents = useMemo(
    () =>
      filtered.map((event) => ({
        id: event.id,
        title: event.status === 'draft' ? `[Draft] ${event.title}` : event.title,
        start: event.all_day ? utcToMelbourneFloating(event.start_at).slice(0, 10) : utcToMelbourneFloating(event.start_at),
        end: event.end_at
          ? event.all_day
            ? utcToMelbourneFloating(event.end_at).slice(0, 10)
            : utcToMelbourneFloating(event.end_at)
          : undefined,
        allDay: event.all_day,
        backgroundColor: event.status === 'published' ? eventColour(event) : '#9ca3af',
        borderColor: event.status === 'published' ? eventColour(event) : '#9ca3af',
        textColor: '#ffffff',
      })),
    [filtered]
  );

  const handleMonthDateClick = (arg: DateClickArg) => {
    openCreate(`${arg.dateStr}T18:00`);
  };

  const handleMonthEventClick = (arg: EventClickArg) => {
    const match = events.find((event) => event.id === arg.event.id);
    if (match) openEdit(match);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-maroon-700" />
            Club Calendar
          </h1>
          <p className="text-gray-500 font-body mt-1">
            {events.length} entr{events.length !== 1 ? 'ies' : 'y'} · times in Australia/Melbourne ·{' '}
            <Link href="/calendar" target="_blank" className="text-maroon-700 hover:text-maroon-500 inline-flex items-center gap-1">
              Preview public calendar <ExternalLink className="h-3 w-3" />
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden" role="group" aria-label="View">
            <button
              type="button"
              onClick={() => setView('list')}
              className={`px-3 py-2 text-sm font-body font-semibold ${view === 'list' ? 'bg-maroon-800 text-white' : 'bg-white text-gray-600'}`}
              aria-pressed={view === 'list'}
            >
              List
            </button>
            <button
              type="button"
              onClick={() => setView('month')}
              className={`px-3 py-2 text-sm font-body font-semibold ${view === 'month' ? 'bg-maroon-800 text-white' : 'bg-white text-gray-600'}`}
              aria-pressed={view === 'month'}
            >
              Month
            </button>
          </div>
          <Button variant="primary" onClick={() => openCreate()}>
            <Plus className="h-4 w-4 mr-1" />
            New Event
          </Button>
        </div>
      </div>

      {feedback && (
        <p className={`mb-4 text-sm ${feedback.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>{feedback.message}</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Select
          id="calendar-filter-status"
          label="Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[{ value: '', label: 'All statuses' }, ...CALENDAR_STATUSES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))]}
        />
        <Select
          id="calendar-filter-type"
          label="Type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={[{ value: '', label: 'All types' }, ...CALENDAR_EVENT_TYPES.map((t) => ({ value: t, label: CALENDAR_EVENT_TYPE_LABELS[t] }))]}
        />
        <Select
          id="calendar-filter-visibility"
          label="Visibility"
          value={visibilityFilter}
          onChange={(e) => setVisibilityFilter(e.target.value)}
          options={[{ value: '', label: 'All visibility' }, ...CALENDAR_VISIBILITIES.map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }))]}
        />
        <Input
          id="calendar-filter-search"
          label="Search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Title, location, details"
        />
      </div>

      <BatchActionsBar
        selectedCount={selectedIds.length}
        itemLabel="calendar event"
        busy={batchBusy}
        onClearSelection={() => setSelectedIds([])}
        actions={[
          { key: 'publish', label: 'Publish', onAction: () => batchSetStatus('published', 'Selected events published.') },
          { key: 'unpublish', label: 'Unpublish', onAction: () => batchSetStatus('draft', 'Selected events moved to draft.') },
          { key: 'archive', label: 'Archive', onAction: () => batchSetStatus('archived', 'Selected events archived.') },
          { key: 'restore', label: 'Restore to Draft', onAction: () => batchSetStatus('draft', 'Selected events restored to draft.') },
          { key: 'delete', label: 'Delete', variant: 'danger', confirm: true, confirmLabel: 'Delete the selected calendar events? This cannot be undone. Archiving is usually safer.', onAction: batchDelete },
        ]}
      />

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-full mb-4" />
          <div className="h-4 bg-gray-200 rounded w-full mb-4" />
          <div className="h-4 bg-gray-200 rounded w-3/4" />
        </div>
      ) : view === 'month' ? (
        <div className="ndcc-calendar bg-white rounded-xl border border-gray-100 p-3 sm:p-5">
          <p className="text-xs text-gray-500 font-body mb-2">Click a day to add an event, or click an event to edit. Grey entries are not published.</p>
          <FullCalendar
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
            buttonText={{ today: 'Today' }}
            events={monthEvents}
            dateClick={handleMonthDateClick}
            eventClick={handleMonthEventClick}
            height="auto"
            dayMaxEventRows={4}
            firstDay={1}
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <CalendarDays className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-body">
            {events.length === 0 ? 'No calendar events yet. Create your first entry.' : 'No events match the current filters.'}
          </p>
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader className="w-10">
                <input
                  type="checkbox"
                  aria-label="Select all calendar events"
                  checked={filtered.length > 0 && selectedIds.length === filtered.length}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-gray-300 text-maroon-700 focus:ring-maroon-500"
                />
              </TableHeader>
              <TableHeader>Title</TableHeader>
              <TableHeader>When (Melbourne)</TableHeader>
              <TableHeader>Type</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Visibility</TableHeader>
              <TableHeader>Shown on</TableHeader>
              <TableHeader>Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((event) => (
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
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: eventColour(event) }} aria-hidden="true" />
                    {event.title}
                    {event.is_featured && <Badge variant="warning" className="!text-[10px]">Featured</Badge>}
                  </span>
                </TableCell>
                <TableCell className="text-sm">{formatEventDateRange(event)}</TableCell>
                <TableCell>{CALENDAR_EVENT_TYPE_LABELS[event.event_type] ?? event.event_type}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGES[event.status] ?? 'default'}>
                    {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm capitalize">{event.visibility}</TableCell>
                <TableCell className="text-xs text-gray-500">
                  {[
                    event.show_on_calendar ? 'Calendar' : null,
                    event.show_on_home ? 'Home' : null,
                    event.show_on_contact ? 'Contact' : null,
                  ].filter(Boolean).join(', ') || '—'}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {event.status === 'published' ? (
                      <Button variant="ghost" size="sm" onClick={() => quickPatch(event.id, { status: 'draft' }, 'Event unpublished.')}>
                        Unpublish
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => quickPatch(event.id, { status: 'published' }, 'Event published.')}>
                        Publish
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => openEdit(event)} aria-label={`Edit ${event.title}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openDuplicate(event)} aria-label={`Duplicate ${event.title}`}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(event.id)} aria-label={`Delete ${event.title}`}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <CalendarEventFormModal
        isOpen={modalOpen}
        editing={!!editingId}
        form={form}
        errors={formErrors}
        saving={saving}
        onChange={setForm}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
      />

      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Calendar Event" size="sm">
        <p className="text-sm text-gray-600 font-body">
          Are you sure you want to delete this calendar event? This cannot be undone — archiving keeps it hidden but recoverable.
        </p>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button
            variant="ghost"
            onClick={() => {
              if (deleteConfirm) quickPatch(deleteConfirm, { status: 'archived' }, 'Event archived.');
              setDeleteConfirm(null);
            }}
          >
            Archive instead
          </Button>
          <Button variant="danger" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
