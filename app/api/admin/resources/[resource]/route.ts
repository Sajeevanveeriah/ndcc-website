import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';
import { requireSession } from '@/lib/auth/guard';
import { datetimeLocalToClubIso } from '@/lib/utils';
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
};

const resourceMap: Record<string, ResourceConfig> = {
  volunteers: { table: 'volunteers', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['name', 'email', 'phone', 'availability', 'notes'], defaultOrder: { column: 'created_at', ascending: false } },
  orders: { table: 'orders', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['processed', 'payment_status', 'confirmed_by', 'confirmed_at', 'bank_reference_used', 'needs_review_reason'], defaultOrder: { column: 'created_at', ascending: false }, datetimeFields: ['confirmed_at'] },
  enquiries: { table: 'contacts', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['name', 'email', 'phone', 'enquiry_type', 'message', 'responded'], defaultOrder: { column: 'created_at', ascending: false } },
  events: { table: 'events', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['title', 'description', 'date', 'location', 'capacity', 'ticket_price', 'stripe_link', 'published'], defaultOrder: { column: 'date', ascending: false }, datetimeFields: ['date'] },
  eventRegistrations: { table: 'event_registrations', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['payment_status', 'processed'], defaultOrder: { column: 'created_at', ascending: false } },
  news: { table: 'news', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['title', 'content', 'author', 'image_url', 'published', 'published_at', 'sort_order'], defaultOrder: { column: 'sort_order', ascending: true }, datetimeFields: ['published_at'] },
  seasonAppointments: { table: 'season_appointments', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['name', 'role', 'image_url', 'announcement_date', 'sort_order', 'is_active'], defaultOrder: { column: 'sort_order', ascending: true } },
  teams: { table: 'teams', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['name', 'grade', 'description', 'captain', 'playhq_url', 'image_url', 'sort_order', 'is_active'], defaultOrder: { column: 'sort_order', ascending: true } },
  fantasyPlayers: { table: 'fantasy_players', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['display_name', 'playhq_player_id', 'role', 'team_label', 'active'], defaultOrder: { column: 'display_name', ascending: true }, allowDelete: false },
  fantasyRounds: { table: 'fantasy_rounds', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['round_number', 'name', 'deadline_at', 'status'], defaultOrder: { column: 'round_number', ascending: true }, datetimeFields: ['deadline_at'], allowDelete: false },
  fantasyScoringRules: { table: 'fantasy_scoring_rules', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['points', 'enabled'], defaultOrder: { column: 'key', ascending: true }, allowDelete: false },
  sponsors: { table: 'sponsors', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['name', 'tier', 'logo_url', 'website', 'placement_type', 'active'], defaultOrder: { column: 'created_at', ascending: false } },
  membershipPlans: { table: 'social_membership_plans', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['name', 'description', 'price', 'is_active', 'sort_order'], defaultOrder: { column: 'sort_order', ascending: true } },
  membershipAddons: { table: 'social_membership_addons', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['name', 'description', 'price', 'usage_limit', 'is_active', 'sort_order'], defaultOrder: { column: 'sort_order', ascending: true } },
  membershipApplications: { table: 'member_applications', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['full_name', 'email', 'status'], defaultOrder: { column: 'created_at', ascending: false } },
  volunteerPositions: { table: 'volunteer_positions', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['title', 'description', 'is_active', 'sort_order'], defaultOrder: { column: 'sort_order', ascending: true } },
  volunteerExpressions: { table: 'volunteer_expressions', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['status', 'contacted_at'], defaultOrder: { column: 'created_at', ascending: false }, datetimeFields: ['contacted_at'] },
  galleryImages: { table: 'gallery_images', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['title', 'caption', 'image_url', 'alt_text', 'sort_order', 'allow_download', 'published'], defaultOrder: { column: 'sort_order', ascending: true } },
  apparelProducts: { table: 'apparel_products', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['slug', 'name', 'description', 'price', 'sizes', 'image_url', 'customisable', 'category', 'display_order', 'order_guidance', 'size_guidance', 'active'], defaultOrder: { column: 'display_order', ascending: true } },
  pageLinkCards: { table: 'page_link_cards', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['page_slug', 'section_key', 'title', 'description', 'href', 'icon', 'badge', 'is_external', 'sort_order', 'is_active'], defaultOrder: { column: 'sort_order', ascending: true } },
  facilityFeatures: { table: 'facility_features', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['title', 'description', 'icon_key', 'sort_order', 'is_active'], defaultOrder: { column: 'sort_order', ascending: true } },
  historyLineage: { table: 'history_lineage_entries', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['club_name', 'start_season', 'end_season', 'association_abbr', 'sort_order', 'is_active'], defaultOrder: { column: 'sort_order', ascending: true } },
  historyPremierships: { table: 'history_premierships', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['team_label', 'season_label', 'competition_abbr', 'grade_label', 'sort_order', 'is_active'], defaultOrder: { column: 'sort_order', ascending: true } },
  historyCompetitions: { table: 'history_competitions', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['abbreviation', 'name'], defaultOrder: { column: 'abbreviation', ascending: true } },
  committeeMembers: { table: 'committee_members', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['name', 'role', 'sort_order', 'is_active'], defaultOrder: { column: 'sort_order', ascending: true } },
  merchWindows: { table: 'merch_order_windows', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['label', 'open_date', 'close_date', 'active', 'allow_queue_after_close'], defaultOrder: { column: 'open_date', ascending: false }, datetimeFields: ['open_date', 'close_date'] },
  kitchenMenus: { table: 'kitchen_menus', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['name', 'is_active'], defaultOrder: { column: 'created_at', ascending: false } },
  kitchenItems: { table: 'kitchen_items', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['menu_id', 'name', 'description', 'image_url', 'price', 'is_available', 'is_hidden', 'sort_order'], defaultOrder: { column: 'sort_order', ascending: true } },
  kitchenOrders: { table: 'kitchen_orders', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['status', 'payment_status', 'processed'], defaultOrder: { column: 'created_at', ascending: false } },
  contentBlocks: { table: 'content_blocks', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['block_key', 'page_slug', 'section_label', 'title', 'body', 'image_url', 'cta_label', 'cta_url', 'is_active'], defaultOrder: { column: 'page_slug', ascending: true } },
  clubSettings: { table: 'club_settings', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin', 'president', 'secretary', 'committee'], allowedFields: ['club_name', 'club_short', 'club_nickname', 'established_year', 'email', 'phone', 'ground_name', 'address', 'association_name', 'association_short', 'facebook_url', 'instagram_url', 'instagram_handle', 'playhq_url', 'google_maps_embed_url'] },
};

const revalidationPaths: Record<string, string[]> = {
  events: ['/', '/events'],
  news: ['/', '/news'],
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

function revalidateForResource(resource: string, id?: string) {
  const paths = revalidationPaths[resource] ? [...revalidationPaths[resource]] : [];
  if (resource === 'news' && id) paths.push(`/news/${id}`);
  for (const p of paths) {
    try { revalidatePath(p); } catch { /* best-effort */ }
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
    error: "Season appointments table is unavailable. Apply migrations 20260406_safe_cms_images_and_merch.sql and 20260406_season_appointments.sql, then run NOTIFY pgrst, 'reload schema';",
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

  const user = await requireSession(['admin', 'president', 'secretary', 'committee']);
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

  const user = await requireSession(['admin', 'president', 'secretary', 'committee']);
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
  revalidateForResource(params.resource, data?.id);
  return NextResponse.json({ success: true, data });
}

export async function PATCH(request: Request, { params }: { params: { resource: string } }) {
  const config = pickResource(params.resource);
  if (!config) return NextResponse.json({ success: false, error: 'Unknown resource.' }, { status: 404 });

  const user = await requireSession(['admin', 'president', 'secretary', 'committee']);
  if (!user || !canWrite(user.role, config)) {
    return NextResponse.json({ success: false, error: 'Your role cannot edit this section.' }, { status: 403 });
  }

  const { id, ...rawPayload } = await request.json();
  if (!id) return NextResponse.json({ success: false, error: 'id is required.' }, { status: 400 });
  const payload = sanitizePayload(config, rawPayload);
  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ success: false, error: 'No writable fields provided.' }, { status: 400 });
  }
  if (config.table === 'club_settings' && !hasRequiredClubSettingsFields(payload)) {
    return NextResponse.json({ success: false, error: 'Club name, short name, and nickname are required.' }, { status: 400 });
  }

  const supabase = createServerClient();
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
  revalidateForResource(params.resource, id);
  return NextResponse.json({ success: true, data });
}

export async function DELETE(request: Request, { params }: { params: { resource: string } }) {
  const config = pickResource(params.resource);
  if (!config) return NextResponse.json({ success: false, error: 'Unknown resource.' }, { status: 404 });

  const user = await requireSession(['admin', 'president', 'secretary', 'committee']);
  if (!user || !canWrite(user.role, config)) {
    return NextResponse.json({ success: false, error: 'Your role cannot edit this section.' }, { status: 403 });
  }
  if (config.allowDelete === false) {
    return NextResponse.json({ success: false, error: 'Delete is disabled for this resource.' }, { status: 405 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, error: 'id query param is required.' }, { status: 400 });

  const supabase = createServerClient();
  const { error } = await supabase.from(config.table).delete().eq('id', id);

  if (error) {
    if (isMissingSeasonAppointmentsTableError(error.message, config.table)) {
      return seasonAppointmentsTableErrorResponse();
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  revalidateForResource(params.resource, id);
  return NextResponse.json({ success: true });
}
