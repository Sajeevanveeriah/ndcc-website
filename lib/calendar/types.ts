export const CALENDAR_EVENT_TYPES = [
  'club',
  'training',
  'match',
  'junior',
  'women',
  'social',
  'committee',
  'fundraiser',
  'sponsor',
  'kitchen',
  'registration',
  'other',
] as const;

export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];

export const CALENDAR_VISIBILITIES = ['public', 'members', 'committee', 'draft'] as const;
export type CalendarVisibility = (typeof CALENDAR_VISIBILITIES)[number];

export const CALENDAR_STATUSES = ['draft', 'published', 'cancelled', 'postponed', 'archived'] as const;
export type CalendarStatus = (typeof CALENDAR_STATUSES)[number];

export interface CalendarEvent {
  id: string;
  title: string;
  slug: string | null;
  description: string | null;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  location: string | null;
  venue_address: string | null;
  event_type: CalendarEventType;
  category: string | null;
  visibility: CalendarVisibility;
  status: CalendarStatus;
  is_featured: boolean;
  show_on_home: boolean;
  show_on_contact: boolean;
  show_on_calendar: boolean;
  image_url: string | null;
  external_url: string | null;
  cta_label: string | null;
  cta_url: string | null;
  registration_required: boolean;
  ticket_price: number | null;
  capacity: number | null;
  colour: string | null;
  sort_order: number;
  recurrence_rule: string | null;
  recurrence_until: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

export const CALENDAR_EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  club: 'Club',
  training: 'Training',
  match: 'Match',
  junior: 'Juniors',
  women: 'Women',
  social: 'Social',
  committee: 'Committee',
  fundraiser: 'Fundraiser',
  sponsor: 'Sponsor',
  kitchen: 'Kitchen',
  registration: 'Registration',
  other: 'Other',
};

// NDCC palette: maroon/blue primary, gold reserved for emphasis (featured/current day).
export const CALENDAR_EVENT_TYPE_COLOURS: Record<CalendarEventType, string> = {
  club: '#800000',
  training: '#1e3a5f',
  match: '#600000',
  junior: '#2563eb',
  women: '#7c2d5e',
  social: '#a0522d',
  committee: '#475569',
  fundraiser: '#b45309',
  sponsor: '#0f766e',
  kitchen: '#9a3412',
  registration: '#1d4ed8',
  other: '#64748b',
};

/** FullCalendar-compatible event object served by the public calendar API. */
export interface CalendarFeedEvent {
  id: string;
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  url: string | null;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  extendedProps: {
    description: string | null;
    location: string | null;
    venueAddress: string | null;
    eventType: CalendarEventType;
    category: string | null;
    status: CalendarStatus;
    isFeatured: boolean;
    imageUrl: string | null;
    ctaLabel: string | null;
    ctaUrl: string | null;
    registrationRequired: boolean;
    ticketPrice: number | null;
    capacity: number | null;
    source: string;
  };
}
