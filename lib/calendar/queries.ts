import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';
import type { CalendarEvent, CalendarEventType } from './types';
import { CALENDAR_EVENT_TYPES } from './types';
import { normalisePublicLinkUrl } from '@/lib/public-link-url';

// Production cold starts can spend more than five seconds establishing the
// first PostgREST connection even though the database query itself completes
// in under a millisecond. Keep a bounded timeout, but allow that connection
// setup to complete instead of turning healthy data into an AbortError.
const CALENDAR_QUERY_TIMEOUT_MS = 15_000;

export const CALENDAR_SELECT_COLUMNS =
  'id,title,slug,description,start_at,end_at,all_day,location,venue_address,event_type,category,visibility,status,is_featured,show_on_home,show_on_contact,show_on_calendar,image_url,external_url,cta_label,cta_url,registration_required,ticket_price,capacity,colour,sort_order,recurrence_rule,recurrence_until,source,created_at,updated_at';

export type PublicCalendarQuery = {
  from?: string | null;
  to?: string | null;
  limit?: number | null;
  types?: CalendarEventType[] | null;
  featured?: boolean;
  home?: boolean;
  contact?: boolean;
};

export type PublicCalendarResult = {
  data: CalendarEvent[];
  error: string | null;
  degraded: boolean;
};

export function parseCalendarTypes(raw: string | null): CalendarEventType[] | null {
  if (!raw) return null;
  const parsed = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is CalendarEventType => CALENDAR_EVENT_TYPES.includes(value as CalendarEventType));
  return parsed.length > 0 ? parsed : null;
}

function normaliseCalendarEventLinks(event: CalendarEvent): CalendarEvent {
  return {
    ...event,
    external_url: normalisePublicLinkUrl(event.external_url),
    cta_url: normalisePublicLinkUrl(event.cta_url),
  };
}

/**
 * Live, uncached read of public calendar events. Cancelled/postponed events are
 * included (their status is public information and the UI styles them clearly);
 * draft and archived entries never leave the CMS. No static fallback content is
 * ever served — on failure the result is an empty list flagged as degraded.
 */
export async function getPublicCalendarEvents(query: PublicCalendarQuery = {}): Promise<PublicCalendarResult> {
  if (!isServerSupabaseConfigured()) {
    return { data: [], error: 'Calendar data source is not configured.', degraded: true };
  }

  try {
    const supabase = createServerClient({ fetchTimeoutMs: CALENDAR_QUERY_TIMEOUT_MS });
    let request = supabase
      .from('calendar_events')
      .select(CALENDAR_SELECT_COLUMNS)
      .in('status', ['published', 'cancelled', 'postponed'])
      .eq('visibility', 'public')
      .order('start_at', { ascending: true })
      .order('sort_order', { ascending: true });

    if (query.home) request = request.eq('show_on_home', true);
    else if (query.contact) request = request.eq('show_on_contact', true);
    else request = request.eq('show_on_calendar', true);

    if (query.from && !Number.isNaN(Date.parse(query.from))) {
      // Events overlapping the window still count: filter on end_at when present.
      request = request.or(`end_at.gte.${new Date(query.from).toISOString()},and(end_at.is.null,start_at.gte.${new Date(query.from).toISOString()})`);
    }
    if (query.to && !Number.isNaN(Date.parse(query.to))) {
      request = request.lte('start_at', new Date(query.to).toISOString());
    }
    if (query.types && query.types.length > 0) {
      request = request.in('event_type', query.types);
    }
    if (query.featured) request = request.eq('is_featured', true);
    if (query.limit && Number.isInteger(query.limit) && query.limit > 0) {
      request = request.limit(Math.min(query.limit, 500));
    }

    const { data, error } = await request;
    if (error) {
      console.error('[calendar] Public calendar query failed:', error.message);
      return { data: [], error: error.message, degraded: true };
    }
    return {
      data: ((data ?? []) as unknown as CalendarEvent[]).map(normaliseCalendarEventLinks),
      error: null,
      degraded: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load calendar events';
    console.error('[calendar] Public calendar query threw:', message);
    return { data: [], error: message, degraded: true };
  }
}

/** Next upcoming public events (Melbourne "now" is just UTC now — timestamps are absolute). */
export async function getUpcomingCalendarEvents(options: {
  limit?: number;
  home?: boolean;
  contact?: boolean;
} = {}): Promise<PublicCalendarResult> {
  const nowIso = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // include events started within the last hour
  const result = await getPublicCalendarEvents({
    home: options.home,
    contact: options.contact,
    limit: (options.limit ?? 5) * 3,
  });
  if (result.degraded) return result;
  const now = Date.parse(nowIso);
  const upcoming = result.data
    .filter((event) => {
      const end = event.end_at ? Date.parse(event.end_at) : Date.parse(event.start_at);
      return Number.isFinite(end) && end >= now;
    })
    .slice(0, options.limit ?? 5);
  return { ...result, data: upcoming };
}
