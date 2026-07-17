import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';
import { requireSession } from '@/lib/auth/guard';
import { datetimeLocalToClubIso } from '@/lib/utils';
import { validateCalendarEventPayload } from '@/lib/calendar/format';
import { PUBLICATION_TYPES } from '@/lib/public-publications';
import type { AuthRole } from '@/lib/auth/config';

export const dynamic = 'force-dynamic';

type ResourceConfig = {
  table: string;
  readRoles: AuthRole[];
  writeRoles: AuthRole[];
  allowedFields: string[];
  defaultOrder?: { column: string; ascending: boolean };
  datetimeFields?: string[];
  allowDelete?: boolean;
  deleteRoles?: AuthRole[];
  // Optional server-side payload validation run after sanitizePayload (so
  // datetime-local values are already club-timezone ISO strings). Returns an
  // error message or null.
  validate?: (payload: Record<string, unknown>, isCreate: boolean) => string | null;
};

const resourceMap: Record<string, ResourceConfig> = {
  volunteers: { table: 'volunteers', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['name', 'email', 'phone', 'availability', 'notes'], defaultOrder: { column: 'created_at', ascending: false } },
  // payment_status is deliberately NOT writable here any more: it is derived
  // from the order_payments ledger by trigger. Manual money movements go
  // through /api/admin/orders/payments.
  orders: { table: 'orders', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], deleteRoles: ['admin'], allowedFields: ['processed', 'confirmed_by', 'confirmed_at', 'bank_reference_used', 'needs_review_reason'], defaultOrder: { column: 'created_at', ascending: false }, datetimeFields: ['confirmed_at'] },
  merchPaymentSettings: { table: 'merch_payment_settings', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowDelete: false, allowedFields: ['bank_transfer_enabled', 'card_checkout_enabled', 'partial_payments_enabled', 'minimum_partial_amount', 'required_deposit_percent'] },
  enquiries: { table: 'contacts', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], deleteRoles: ['admin'], allowedFields: ['name', 'email', 'phone', 'enquiry_type', 'message', 'responded'], defaultOrder: { column: 'created_at', ascending: false } },
  events: { table: 'events', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['title', 'description', 'date', 'location', 'capacity', 'ticket_price', 'stripe_link', 'image_url', 'published'], defaultOrder: { column: 'date', ascending: false }, datetimeFields: ['date'] },
  calendarEvents: { table: 'calendar_events', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['title', 'slug', 'description', 'start_at', 'end_at', 'all_day', 'location', 'venue_address', 'event_type', 'category', 'visibility', 'status', 'is_featured', 'show_on_home', 'show_on_contact', 'show_on_calendar', 'image_url', 'external_url', 'cta_label', 'cta_url', 'registration_required', 'ticket_price', 'capacity', 'colour', 'sort_order', 'recurrence_rule', 'recurrence_until'], defaultOrder: { column: 'start_at', ascending: true }, datetimeFields: ['start_at', 'end_at', 'recurrence_until'], validate: validateCalendarEventPayload },
  eventRegistrations: { table: 'event_registrations', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], deleteRoles: ['admin'], allowedFields: ['payment_status', 'processed'], defaultOrder: { column: 'created_at', ascending: false } },
  publications: { table: 'publications', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['publication_type', 'title', 'slug', 'summary', 'content', 'issue_date', 'season_label', 'round_label', 'cover_image_url', 'document_url', 'external_url', 'author', 'published', 'published_at', 'featured', 'display_order'], defaultOrder: { column: 'issue_date', ascending: false }, datetimeFields: ['published_at'], validate: validatePublicationPayload },
  news: { table: 'news', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['title', 'content', 'author', 'image_url', 'published', 'published_at', 'sort_order'], defaultOrder: { column: 'sort_order', ascending: true }, datetimeFields: ['published_at'] },
  seasonAppointments: { table: 'season_appointments', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['name', 'role', 'image_url', 'announcement_date', 'sort_order', 'is_active'], defaultOrder: { column: 'sort_order', ascending: true } },
  teams: { table: 'teams', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['name', 'grade', 'description', 'captain', 'playhq_url', 'image_url', 'sort_order', 'is_active'], defaultOrder: { column: 'sort_order', ascending: true } },
  fantasyPlayers: { table: 'fantasy_players', readRoles: ['admin', 'president', 'secretary', 'committee', 'fantasy_manager'], writeRoles: ['admin', 'president', 'secretary', 'committee', 'fantasy_manager'], allowedFields: ['display_name', 'playhq_player_id', 'role', 'team_label', 'active'], defaultOrder: { column: 'display_name', ascending: true }, allowDelete: false },
  fantasyRounds: { table: 'fantasy_rounds', readRoles: ['admin', 'president', 'secretary', 'committee', 'fantasy_manager'], writeRoles: ['admin', 'president', 'secretary', 'committee', 'fantasy_manager'], allowedFields: ['round_number', 'name', 'deadline_at', 'status', 'season_id'], defaultOrder: { column: 'round_number', ascending: true }, datetimeFields: ['deadline_at'], allowDelete: false },
  fantasyScoringRules: { table: 'fantasy_scoring_rules', readRoles: ['admin', 'president', 'secretary', 'committee', 'fantasy_manager'], writeRoles: ['admin', 'president', 'secretary', 'committee', 'fantasy_manager'], allowedFields: ['points', 'enabled'], defaultOrder: { column: 'key', ascending: true }, allowDelete: false },
  sponsors: { table: 'sponsors', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['name', 'tier', 'logo_url', 'website', 'placement_type', 'active', 'description', 'sort_order', 'source_url', 'logo_source_url', 'logo_surface_mode', 'logo_padding', 'logo_object_position'], defaultOrder: { column: 'sort_order', ascending: true } },
  membershipPlans: { table: 'social_membership_plans', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['name', 'description', 'price', 'is_active', 'sort_order'], defaultOrder: { column: 'sort_order', ascending: true } },
  membershipAddons: { table: 'social_membership_addons', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['name', 'description', 'price', 'usage_limit', 'is_active', 'sort_order'], defaultOrder: { column: 'sort_order', ascending: true } },
  membershipApplications: { table: 'member_applications', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], deleteRoles: ['admin'], allowedFields: ['full_name', 'email', 'status'], defaultOrder: { column: 'created_at', ascending: false } },
  volunteerPositions: { table: 'volunteer_positions', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['title', 'description', 'is_active', 'sort_order'], defaultOrder: { column: 'sort_order', ascending: true } },
  volunteerExpressions: { table: 'volunteer_expressions', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], deleteRoles: ['admin'], allowedFields: ['status', 'contacted_at'], defaultOrder: { column: 'created_at', ascending: false }, datetimeFields: ['contacted_at'] },
  galleryImages: { table: 'gallery_images', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['title', 'caption', 'image_url', 'alt_text', 'sort_order', 'allow_download', 'published'], defaultOrder: { column: 'sort_order', ascending: true } },
  apparelProducts: { table: 'apparel_products', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['slug', 'name', 'description', 'price', 'sizes', 'image_url', 'image_alt', 'customisable', 'category', 'display_order', 'order_guidance', 'size_guidance', 'active', 'payment_mode', 'payment_link_url', 'stripe_price_id', 'checkout_enabled', 'fulfilment_notes', 'order_email'], defaultOrder: { column: 'display_order', ascending: true } },
  apparelProductOptions: { table: 'apparel_product_options', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['product_id', 'option_group', 'option_value', 'option_label', 'price_delta', 'is_default', 'active', 'display_order'], defaultOrder: { column: 'display_order', ascending: true } },
  pageLinkCards: { table: 'page_link_cards', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['page_slug', 'section_key', 'title', 'description', 'href', 'icon', 'badge', 'is_external', 'sort_order', 'is_active'], defaultOrder: { column: 'sort_order', ascending: true } },
  facilityFeatures: { table: 'facility_features', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['title', 'description', 'icon_key', 'sort_order', 'is_active'], defaultOrder: { column: 'sort_order', ascending: true } },
  historyLineage: { table: 'history_lineage_entries', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['club_name', 'start_season', 'end_season', 'association_abbr', 'sort_order', 'is_active'], defaultOrder: { column: 'sort_order', ascending: true } },
  historyPremierships: { table: 'history_premierships', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['team_label', 'season_label', 'competition_abbr', 'grade_label', 'sort_order', 'is_active'], defaultOrder: { column: 'sort_order', ascending: true } },
  historyCompetitions: { table: 'history_competitions', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['abbreviation', 'name'], defaultOrder: { column: 'abbreviation', ascending: true } },
  committeeMembers: { table: 'committee_members', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['name', 'role', 'email', 'phone', 'bio', 'image_url', 'sort_order', 'is_active'], defaultOrder: { column: 'sort_order', ascending: true } },
  merchWindows: { table: 'merch_order_windows', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['label', 'open_date', 'close_date', 'active', 'allow_queue_after_close'], defaultOrder: { column: 'open_date', ascending: false }, datetimeFields: ['open_date', 'close_date'] },
  kitchenMenus: { table: 'kitchen_menus', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['name', 'is_active'], defaultOrder: { column: 'created_at', ascending: false } },
  kitchenItems: { table: 'kitchen_items', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['menu_id', 'name', 'description', 'image_url', 'price', 'is_available', 'is_hidden', 'sort_order'], defaultOrder: { column: 'sort_order', ascending: true } },
  kitchenOrders: { table: 'kitchen_orders', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], deleteRoles: ['admin'], allowedFields: ['status', 'payment_status', 'processed'], defaultOrder: { column: 'created_at', ascending: false } },
  contentBlocks: { table: 'content_blocks', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['block_key', 'page_slug', 'section_label', 'title', 'body', 'image_url', 'cta_label', 'cta_url', 'is_active'], defaultOrder: { column: 'page_slug', ascending: true } },
  clubSettings: { table: 'club_settings', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['club_name', 'club_short', 'club_nickname', 'established_year', 'email', 'phone', 'ground_name', 'address', 'association_name', 'association_short', 'facebook_url', 'instagram_url', 'instagram_handle', 'playhq_url', 'google_maps_embed_url'] },
};

// Public CMS helpers now read Supabase uncached at request time, so these tag/path
// invalidations are belt-and-braces rather than the freshness mechanism: they purge
// any residual ISR/Data Cache entries (e.g. the remaining revalidate-based fantasy
// pages) so a CMS save can never sit behind a cached render until a redeploy.
const revalidationTags: Record<string, string[]> = {
  events: ['events'],
  calendarEvents: ['calendar'],
  news: ['news'],
  publications: ['publications'],
  sponsors: ['sponsors'],
  galleryImages: ['gallery'],
  seasonAppointments: ['season-appointments'],
  teams: ['teams'],
  pageLinkCards: ['page-link-cards'],
  facilityFeatures: ['facility-features'],
  historyLineage: ['history'],
  historyPremierships: ['history'],
  historyCompetitions: ['history'],
  committeeMembers: ['committee-members'],
  contentBlocks: ['content-blocks'],
  clubSettings: ['club-settings'],
};

const revalidationPaths: Record<string, string[]> = {
  events: ['/', '/events'],
  calendarEvents: ['/', '/calendar', '/contact'],
  news: ['/', '/news'],
  publications: ['/', '/publications', '/newsletters', '/match-reports'],
  sponsors: ['/', '/sponsors'],
  galleryImages: ['/', '/gallery'],
  kitchenMenus: ['/kitchen'],
  kitchenItems: ['/kitchen'],
  contentBlocks: ['/', '/about', '/contact', '/join', '/facilities', '/fixtures', '/news', '/events', '/sponsors', '/gallery', '/teams', '/kitchen', '/merchandise', '/volunteer', '/fantasy', '/fantasy/rules', '/fantasy/register', '/fantasy/login', '/fantasy/account', '/fantasy/leaderboard', '/fantasy/manager-leaderboard'],
  seasonAppointments: ['/'],
  teams: ['/teams'],
  pageLinkCards: ['/', '/about', '/contact', '/join', '/facilities', '/fixtures', '/news', '/events', '/sponsors', '/gallery', '/teams', '/kitchen', '/merchandise', '/volunteer', '/fantasy', '/fantasy/rules', '/fantasy/register', '/fantasy/login', '/fantasy/account', '/fantasy/leaderboard', '/fantasy/manager-leaderboard'],
  facilityFeatures: ['/facilities'],
  historyLineage: ['/about'],
  historyPremierships: ['/about'],
  historyCompetitions: ['/about'],
  committeeMembers: ['/about'],
  clubSettings: ['/', '/about', '/contact', '/join', '/facilities', '/fixtures', '/sponsors', '/fantasy'],
};

const CHROME_SCOPED_RESOURCES = new Set(['contentBlocks', 'pageLinkCards', 'clubSettings']);

function affectsSiteChrome(resource: string, record?: Record<string, unknown> | null) {
  if (!CHROME_SCOPED_RESOURCES.has(resource)) return false;
  if (resource === 'clubSettings') return true;
  if (!record) return true; // deletes only return the id, so assume the chrome may be affected
  const key = record.block_key ?? record.section_key;
  return typeof key === 'string' && key.startsWith('footer');
}

const MAX_BATCH_IDS = 100;

function parseBatchIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_BATCH_IDS) return null;
  const ids = value.map((entry) => (typeof entry === 'string' ? entry.trim() : ''));
  return ids.every((entry) => entry.length > 0) ? ids : null;
}

// News is the only resource with id-specific revalidation paths (/news/${id}),
// so batch writes revalidate per id there and once at resource level elsewhere.
const PUBLICATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validatePublicationPayload(payload: Record<string, unknown>, isCreate: boolean): string | null {
  if (isCreate || 'title' in payload) {
    if (typeof payload.title !== 'string' || !payload.title.trim()) return 'Title is required.';
  }
  if (isCreate || 'slug' in payload) {
    const slug = typeof payload.slug === 'string' ? payload.slug : '';
    if (!PUBLICATION_SLUG_PATTERN.test(slug) || slug.length > 120) {
      return 'Slug must be lowercase letters, numbers and hyphens (max 120 characters).';
    }
  }
  if (isCreate || 'publication_type' in payload) {
    if (!(PUBLICATION_TYPES as readonly string[]).includes(String(payload.publication_type ?? ''))) {
      return 'Publication type must be monthly_newsletter, weekly_newsletter or weekly_match_report.';
    }
  }
  if ('issue_date' in payload && payload.issue_date != null && payload.issue_date !== '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(payload.issue_date))) return 'Issue date must be YYYY-MM-DD.';
  }
  for (const field of ['document_url', 'external_url', 'cover_image_url'] as const) {
    const value = payload[field];
    if (value != null && value !== '' && typeof value === 'string') {
      if (!/^(https:\/\/|\/)/.test(value)) return `${field} must be an https URL or a local path.`;
    }
  }
  return null;
}

function revalidateForResourceBatch(resource: string, ids: string[]) {
  if (resource === 'news' || resource === 'publications') {
    for (const id of ids) revalidateForResource(resource, id);
    return;
  }
  revalidateForResource(resource);
}

function revalidateForResource(resource: string, id?: string, record?: Record<string, unknown> | null) {
  const paths = revalidationPaths[resource] ? [...revalidationPaths[resource]] : [];
  if (resource === 'news' && id) paths.push(`/news/${id}`);
  if (resource === 'publications' && record && typeof record.slug === 'string' && record.slug) {
    paths.push(`/publications/${record.slug}`);
  }
  for (const p of paths) {
    try { revalidatePath(p); } catch { /* best-effort */ }
  }
  for (const tag of revalidationTags[resource] || []) {
    try { revalidateTag(tag); } catch { /* best-effort */ }
  }
  // Footer content renders on every page via the root layout, so a footer-scoped
  // write must refresh the layout, not just the paths listed above.
  if (affectsSiteChrome(resource, record)) {
    try { revalidatePath('/', 'layout'); } catch { /* best-effort */ }
  }
}

function pickResource(resource: string) {
  return resourceMap[resource];
}

function canRead(role: AuthRole, allowed: AuthRole[]) {
  return allowed.includes(role);
}

function canWrite(role: AuthRole, config: ResourceConfig) {
  return config.writeRoles.includes(role);
}

function canDelete(role: AuthRole, config: ResourceConfig) {
  return (config.deleteRoles || config.writeRoles).includes(role);
}

function safeDeleteErrorResponse(message: string) {
  if (/violates foreign key|23503|foreign key|constraint/i.test(message)) {
    return NextResponse.json({ success: false, error: 'This record cannot be deleted because related records still depend on it.' }, { status: 409 });
  }
  return NextResponse.json({ success: false, error: 'Delete failed. Please try again.' }, { status: 500 });
}

function toIsoIfNeeded(value: unknown): unknown {
  if (typeof value !== 'string' || !value) return value;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return datetimeLocalToClubIso(value);
  }
  return value;
}

function sanitizePayload(config: ResourceConfig, raw: Record<string, unknown>) {
  const payload: Record<string, unknown> = {};
  for (const field of config.allowedFields) {
    if (!(field in raw)) continue;
    const value = config.datetimeFields?.includes(field) ? toIsoIfNeeded(raw[field]) : raw[field];
    if (
      field === 'image_url'
      && config.table === 'season_appointments'
      && (value === null || value === '')
    ) continue;
    payload[field] = value;
  }
  return payload;
}



function hasRequiredClubSettingsFields(payload: Record<string, unknown>) {
  return ['club_name', 'club_short', 'club_nickname'].every((field) => (
    typeof payload[field] === 'string' && payload[field].trim().length > 0
  ));
}

function isMissingSeasonAppointmentsTableError(errorMessage: string, table: string) {
  return table === 'season_appointments'
    && errorMessage.includes("Could not find the table 'public.season_appointments' in the schema cache");
}

function seasonAppointmentsTableErrorResponse() {
  return NextResponse.json({
    success: false,
    error: "Season appointments table is unavailable. Apply migrations 20260406000100_safe_cms_images_and_merch.sql and 20260406000200_season_appointments.sql, then run NOTIFY pgrst, 'reload schema';",
  }, { status: 503 });
}

function isMissingImageUrlColumnError(errorMessage: string, table: string) {
  return table === 'news'
    && errorMessage.includes("Could not find the 'image_url' column")
    && errorMessage.includes(`'${table}'`);
}

function isMissingSortOrderColumnError(errorMessage: string, table: string) {
  return table === 'news'
    && errorMessage.includes('sort_order')
    && errorMessage.includes('news');
}

export async function GET(request: Request, { params }: { params: { resource: string } }) {
  const config = pickResource(params.resource);
  if (!config) return NextResponse.json({ success: false, error: 'Unknown resource.' }, { status: 404 });

  const user = await requireSession(['admin', 'president', 'secretary', 'committee', 'fantasy_manager']);
  if (!user || !canRead(user.role, config.readRoles)) {
    return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });
  }

  const supabase = createServerClient();
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? Number(limitParam) : null;
  let query = supabase.from(config.table).select('*');
  if (Number.isInteger(limit) && limit !== null && limit > 0 && limit <= 100) {
    query = query.limit(limit);
  }
  if (config.defaultOrder) {
    query = query.order(config.defaultOrder.column, { ascending: config.defaultOrder.ascending });
  }
  const { data, error } = await query;

  if (error) {
    if (isMissingSortOrderColumnError(error.message, config.table)) {
      const fallback = await supabase
        .from(config.table)
        .select('*')
        .order('published_at', { ascending: false })
        .order('created_at', { ascending: false });
      if (fallback.error) {
        return NextResponse.json({ success: false, error: fallback.error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, data: fallback.data ?? [] });
    }
    if (isMissingSeasonAppointmentsTableError(error.message, config.table)) {
      return seasonAppointmentsTableErrorResponse();
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, data });
}

export async function POST(request: Request, { params }: { params: { resource: string } }) {
  const config = pickResource(params.resource);
  if (!config) return NextResponse.json({ success: false, error: 'Unknown resource.' }, { status: 404 });

  const user = await requireSession(['admin', 'president', 'secretary', 'committee', 'fantasy_manager']);
  if (!user || !canWrite(user.role, config)) {
    return NextResponse.json({ success: false, error: 'Your role cannot edit this section.' }, { status: 403 });
  }

  const rawPayload = await request.json();
  const payload = sanitizePayload(config, rawPayload);
  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ success: false, error: 'No writable fields provided.' }, { status: 400 });
  }
  if (config.table === 'club_settings' && !hasRequiredClubSettingsFields(payload)) {
    return NextResponse.json({ success: false, error: 'Club name, short name, and nickname are required.' }, { status: 400 });
  }
  const validationError = config.validate?.(payload, true) ?? null;
  if (validationError) {
    return NextResponse.json({ success: false, error: validationError }, { status: 400 });
  }
  const supabase = createServerClient();
  let { data, error } = await supabase.from(config.table).insert(payload).select().single();
  if (error && isMissingImageUrlColumnError(error.message, config.table) && 'image_url' in payload) {
    const retryPayload = { ...payload };
    delete retryPayload.image_url;
    if (Object.keys(retryPayload).length > 0) {
      const retry = await supabase.from(config.table).insert(retryPayload).select().single();
      data = retry.data;
      error = retry.error;
    }
  }
  if (error && isMissingSortOrderColumnError(error.message, config.table) && 'sort_order' in payload) {
    const retryPayload = { ...payload };
    delete retryPayload.sort_order;
    if (Object.keys(retryPayload).length > 0) {
      const retry = await supabase.from(config.table).insert(retryPayload).select().single();
      data = retry.data;
      error = retry.error;
    }
  }

  if (error) {
    if (isMissingSeasonAppointmentsTableError(error.message, config.table)) {
      return seasonAppointmentsTableErrorResponse();
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  revalidateForResource(params.resource, data?.id, data);
  return NextResponse.json({ success: true, data });
}

export async function PATCH(request: Request, { params }: { params: { resource: string } }) {
  const config = pickResource(params.resource);
  if (!config) return NextResponse.json({ success: false, error: 'Unknown resource.' }, { status: 404 });

  const user = await requireSession(['admin', 'president', 'secretary', 'committee', 'fantasy_manager']);
  if (!user || !canWrite(user.role, config)) {
    return NextResponse.json({ success: false, error: 'Your role cannot edit this section.' }, { status: 403 });
  }

  const { id, ids, ...rawPayload } = await request.json();
  if (!id && ids === undefined) return NextResponse.json({ success: false, error: 'id is required.' }, { status: 400 });
  let batchIds: string[] | null = null;
  if (!id) {
    batchIds = parseBatchIds(ids);
    if (!batchIds) {
      return NextResponse.json({ success: false, error: `ids must be a non-empty array of up to ${MAX_BATCH_IDS} id strings.` }, { status: 400 });
    }
  }
  const payload = sanitizePayload(config, rawPayload);
  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ success: false, error: 'No writable fields provided.' }, { status: 400 });
  }
  if (config.table === 'club_settings' && !hasRequiredClubSettingsFields(payload)) {
    return NextResponse.json({ success: false, error: 'Club name, short name, and nickname are required.' }, { status: 400 });
  }
  const validationError = config.validate?.(payload, false) ?? null;
  if (validationError) {
    return NextResponse.json({ success: false, error: validationError }, { status: 400 });
  }

  const supabase = createServerClient();

  if (batchIds) {
    const { data: batchData, error: batchError } = await supabase.from(config.table).update(payload).in('id', batchIds).select('id');
    if (batchError) {
      if (isMissingSeasonAppointmentsTableError(batchError.message, config.table)) {
        return seasonAppointmentsTableErrorResponse();
      }
      return NextResponse.json({ success: false, error: batchError.message }, { status: 500 });
    }
    revalidateForResourceBatch(params.resource, batchIds);
    return NextResponse.json({ success: true, count: batchData?.length ?? 0 });
  }

  let { data, error } = await supabase.from(config.table).update(payload).eq('id', id).select().single();
  if (error && isMissingImageUrlColumnError(error.message, config.table) && 'image_url' in payload) {
    const retryPayload = { ...payload };
    delete retryPayload.image_url;
    if (Object.keys(retryPayload).length > 0) {
      const retry = await supabase.from(config.table).update(retryPayload).eq('id', id).select().single();
      data = retry.data;
      error = retry.error;
    }
  }
  if (error && isMissingSortOrderColumnError(error.message, config.table) && 'sort_order' in payload) {
    const retryPayload = { ...payload };
    delete retryPayload.sort_order;
    if (Object.keys(retryPayload).length > 0) {
      const retry = await supabase.from(config.table).update(retryPayload).eq('id', id).select().single();
      data = retry.data;
      error = retry.error;
    }
  }

  if (error) {
    if (isMissingSeasonAppointmentsTableError(error.message, config.table)) {
      return seasonAppointmentsTableErrorResponse();
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  revalidateForResource(params.resource, id, data);
  return NextResponse.json({ success: true, data });
}

export async function DELETE(request: Request, { params }: { params: { resource: string } }) {
  const config = pickResource(params.resource);
  if (!config) return NextResponse.json({ success: false, error: 'Unknown resource.' }, { status: 404 });

  const user = await requireSession(['admin', 'president', 'secretary', 'committee', 'fantasy_manager']);
  if (!user || !canDelete(user.role, config)) {
    return NextResponse.json({ success: false, error: 'Your role cannot delete this record.' }, { status: 403 });
  }
  if (config.allowDelete === false) {
    return NextResponse.json({ success: false, error: 'Delete is disabled for this resource.' }, { status: 405 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const idsParam = searchParams.get('ids');
  if (!id && idsParam === null) return NextResponse.json({ success: false, error: 'id query param is required.' }, { status: 400 });

  const supabase = createServerClient();

  if (!id) {
    const batchIds = parseBatchIds((idsParam ?? '').split(','));
    if (!batchIds) {
      return NextResponse.json({ success: false, error: `ids must be a comma-separated list of up to ${MAX_BATCH_IDS} non-empty ids.` }, { status: 400 });
    }
    const { data: batchData, error: batchError } = await supabase.from(config.table).delete().in('id', batchIds).select('id');
    if (batchError) {
      if (isMissingSeasonAppointmentsTableError(batchError.message, config.table)) {
        return seasonAppointmentsTableErrorResponse();
      }
      return safeDeleteErrorResponse(batchError.message);
    }
    revalidateForResourceBatch(params.resource, batchIds);
    return NextResponse.json({ success: true, count: batchData?.length ?? 0 });
  }

  const { data, error } = await supabase.from(config.table).delete().eq('id', id).select('id');

  if (error) {
    if (isMissingSeasonAppointmentsTableError(error.message, config.table)) {
      return seasonAppointmentsTableErrorResponse();
    }
    return safeDeleteErrorResponse(error.message);
  }
  const deleted = data?.[0];
  if (!deleted?.id) {
    return NextResponse.json({ success: false, error: 'Record not found.' }, { status: 404 });
  }
  revalidateForResource(params.resource, id);
  return NextResponse.json({ success: true, data: { id: deleted.id } });
}
