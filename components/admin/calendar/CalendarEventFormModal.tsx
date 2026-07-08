'use client';

import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input, { Textarea, Select } from '@/components/ui/Input';
import ImageUploadField from '@/components/admin/ImageUploadField';
import {
  CALENDAR_EVENT_TYPES,
  CALENDAR_EVENT_TYPE_LABELS,
  CALENDAR_STATUSES,
  CALENDAR_VISIBILITIES,
} from '@/lib/calendar/types';

export type CalendarEventForm = {
  title: string;
  description: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location: string;
  venue_address: string;
  event_type: string;
  category: string;
  status: string;
  visibility: string;
  is_featured: boolean;
  show_on_home: boolean;
  show_on_contact: boolean;
  show_on_calendar: boolean;
  image_url: string;
  external_url: string;
  cta_label: string;
  cta_url: string;
  registration_required: boolean;
  ticket_price: string;
  capacity: string;
  colour: string;
};

export const emptyCalendarEventForm: CalendarEventForm = {
  title: '',
  description: '',
  start_at: '',
  end_at: '',
  all_day: false,
  location: 'Grinter Reserve',
  venue_address: '',
  event_type: 'club',
  category: '',
  status: 'draft',
  visibility: 'public',
  is_featured: false,
  show_on_home: true,
  show_on_contact: true,
  show_on_calendar: true,
  image_url: '',
  external_url: '',
  cta_label: '',
  cta_url: '',
  registration_required: false,
  ticket_price: '',
  capacity: '',
  colour: '',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  published: 'Published',
  cancelled: 'Cancelled',
  postponed: 'Postponed',
  archived: 'Archived',
};

const VISIBILITY_LABELS: Record<string, string> = {
  public: 'Public',
  members: 'Members',
  committee: 'Committee only',
  draft: 'Draft (hidden)',
};

type CalendarEventFormModalProps = {
  isOpen: boolean;
  editing: boolean;
  form: CalendarEventForm;
  errors: Record<string, string>;
  saving: boolean;
  onChange: (form: CalendarEventForm) => void;
  onClose: () => void;
  onSave: () => void;
};

function CheckboxField({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 cursor-pointer">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-maroon-700 focus:ring-maroon-500"
      />
      <span className="text-sm font-body text-gray-700">{label}</span>
    </label>
  );
}

export default function CalendarEventFormModal({
  isOpen,
  editing,
  form,
  errors,
  saving,
  onChange,
  onClose,
  onSave,
}: CalendarEventFormModalProps) {
  const set = (patch: Partial<CalendarEventForm>) => onChange({ ...form, ...patch });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editing ? 'Edit Calendar Event' : 'New Calendar Event'} size="xl">
      <div className="space-y-4">
        <Input
          id="calendar-title"
          label="Title"
          value={form.title}
          onChange={(e) => set({ title: e.target.value })}
          error={errors.title}
          required
        />
        <Textarea
          id="calendar-description"
          label="Description"
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
          rows={4}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            id="calendar-start"
            label="Starts (Australia/Melbourne)"
            type="datetime-local"
            value={form.start_at}
            onChange={(e) => set({ start_at: e.target.value })}
            error={errors.start_at}
            required
          />
          <Input
            id="calendar-end"
            label="Ends (Australia/Melbourne, optional)"
            type="datetime-local"
            value={form.end_at}
            onChange={(e) => set({ end_at: e.target.value })}
            error={errors.end_at}
          />
        </div>
        <CheckboxField id="calendar-all-day" label="All-day event" checked={form.all_day} onChange={(all_day) => set({ all_day })} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            id="calendar-location"
            label="Location"
            value={form.location}
            onChange={(e) => set({ location: e.target.value })}
            placeholder="Grinter Reserve"
          />
          <Input
            id="calendar-venue-address"
            label="Venue address (optional)"
            value={form.venue_address}
            onChange={(e) => set({ venue_address: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Select
            id="calendar-type"
            label="Event type"
            value={form.event_type}
            onChange={(e) => set({ event_type: e.target.value })}
            options={CALENDAR_EVENT_TYPES.map((type) => ({ value: type, label: CALENDAR_EVENT_TYPE_LABELS[type] }))}
          />
          <Select
            id="calendar-status"
            label="Status"
            value={form.status}
            onChange={(e) => set({ status: e.target.value })}
            options={CALENDAR_STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] }))}
          />
          <Select
            id="calendar-visibility"
            label="Visibility"
            value={form.visibility}
            onChange={(e) => set({ visibility: e.target.value })}
            options={CALENDAR_VISIBILITIES.map((visibility) => ({ value: visibility, label: VISIBILITY_LABELS[visibility] }))}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            id="calendar-category"
            label="Category (optional)"
            value={form.category}
            onChange={(e) => set({ category: e.target.value })}
            placeholder="e.g. Seniors, Round 4"
          />
          <Input
            id="calendar-colour"
            label="Colour override (optional hex)"
            value={form.colour}
            onChange={(e) => set({ colour: e.target.value })}
            placeholder="#800000"
            error={errors.colour}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg border border-gray-100 bg-sky-50/60 p-3">
          <CheckboxField id="calendar-featured" label="Featured" checked={form.is_featured} onChange={(is_featured) => set({ is_featured })} />
          <CheckboxField id="calendar-show-home" label="Show on home" checked={form.show_on_home} onChange={(show_on_home) => set({ show_on_home })} />
          <CheckboxField id="calendar-show-contact" label="Show on contact" checked={form.show_on_contact} onChange={(show_on_contact) => set({ show_on_contact })} />
          <CheckboxField id="calendar-show-calendar" label="Show on calendar" checked={form.show_on_calendar} onChange={(show_on_calendar) => set({ show_on_calendar })} />
        </div>

        <ImageUploadField
          id="calendar-image-url"
          label="Image URL (optional)"
          value={form.image_url}
          onChange={(value) => set({ image_url: value })}
          placeholder="https://example.com/event.jpg"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            id="calendar-external-url"
            label="External link (optional)"
            value={form.external_url}
            onChange={(e) => set({ external_url: e.target.value })}
            placeholder="https://..."
            error={errors.external_url}
          />
          <Input
            id="calendar-cta-url"
            label="CTA link (optional, e.g. /events/...)"
            value={form.cta_url}
            onChange={(e) => set({ cta_url: e.target.value })}
            placeholder="/events/1234 or https://..."
            error={errors.cta_url}
          />
        </div>
        <Input
          id="calendar-cta-label"
          label="CTA label (optional)"
          value={form.cta_label}
          onChange={(e) => set({ cta_label: e.target.value })}
          placeholder="Register now"
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-end pb-2">
            <CheckboxField
              id="calendar-registration-required"
              label="Registration required"
              checked={form.registration_required}
              onChange={(registration_required) => set({ registration_required })}
            />
          </div>
          <Input
            id="calendar-ticket-price"
            label="Ticket price $ (optional)"
            type="number"
            min="0"
            step="0.01"
            value={form.ticket_price}
            onChange={(e) => set({ ticket_price: e.target.value })}
            error={errors.ticket_price}
          />
          <Input
            id="calendar-capacity"
            label="Capacity (optional)"
            type="number"
            min="1"
            step="1"
            value={form.capacity}
            onChange={(e) => set({ capacity: e.target.value })}
            error={errors.capacity}
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={onSave} isLoading={saving}>
            {editing ? 'Update Event' : 'Create Event'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
