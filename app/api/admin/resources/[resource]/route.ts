import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';
import { requireSession } from '@/lib/auth/guard';
import { datetimeLocalToClubIso } from '@/lib/utils';
import type { AuthRole } from '@/lib/auth/config';

type ResourceConfig = {
  table: string;
  readRoles: Array<'admin' | 'president' | 'secretary' | 'committee'>;
  writeRoles: Array<'admin'>;
  allowedFields: string[];
  defaultOrder?: { column: string; ascending: boolean };
  datetimeFields?: string[];
};

const resourceMap: Record<string, ResourceConfig> = {
  volunteers: { table: 'volunteers', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['name', 'email', 'phone', 'availability', 'notes'], defaultOrder: { column: 'created_at', ascending: false } },
  orders: { table: 'orders', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['processed', 'payment_status', 'confirmed_by', 'confirmed_at', 'bank_reference_used', 'needs_review_reason'], defaultOrder: { column: 'created_at', ascending: false }, datetimeFields: ['confirmed_at'] },
  enquiries: { table: 'contacts', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['name', 'email', 'phone', 'enquiry_type', 'message', 'responded'], defaultOrder: { column: 'created_at', ascending: false } },
  events: { table: 'events', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['title', 'description', 'date', 'location', 'capacity', 'ticket_price', 'stripe_link', 'published'], defaultOrder: { column: 'date', ascending: false }, datetimeFields: ['date'] },
  news: { table: 'news', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['title', 'content', 'author', 'image_url', 'published', 'published_at'], defaultOrder: { column: 'created_at', ascending: false }, datetimeFields: ['published_at'] },
  sponsors: { table: 'sponsors', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['name', 'tier', 'logo_url', 'website', 'placement_type', 'active'], defaultOrder: { column: 'created_at', ascending: false } },
  membershipPlans: { table: 'social_membership_plans', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['name', 'description', 'price', 'is_active', 'sort_order'], defaultOrder: { column: 'sort_order', ascending: true } },
  membershipAddons: { table: 'social_membership_addons', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['name', 'description', 'price', 'usage_limit', 'is_active', 'sort_order'], defaultOrder: { column: 'sort_order', ascending: true } },
  membershipApplications: { table: 'member_applications', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['full_name', 'email', 'status'], defaultOrder: { column: 'created_at', ascending: false } },
  volunteerPositions: { table: 'volunteer_positions', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['title', 'description', 'is_active', 'sort_order'], defaultOrder: { column: 'sort_order', ascending: true } },
  volunteerExpressions: { table: 'volunteer_expressions', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['status', 'contacted_at'], defaultOrder: { column: 'created_at', ascending: false }, datetimeFields: ['contacted_at'] },
  galleryImages: { table: 'gallery_images', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['title', 'caption', 'image_url', 'alt_text', 'sort_order', 'allow_download', 'published'], defaultOrder: { column: 'sort_order', ascending: true } },
  apparelProducts: { table: 'apparel_products', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['slug', 'name', 'description', 'price', 'sizes', 'image_url', 'customisable', 'active'], defaultOrder: { column: 'created_at', ascending: false } },
  merchWindows: { table: 'merch_order_windows', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['label', 'open_date', 'close_date', 'active', 'allow_queue_after_close'], defaultOrder: { column: 'open_date', ascending: false }, datetimeFields: ['open_date', 'close_date'] },
  kitchenMenus: { table: 'kitchen_menus', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['name', 'is_active'], defaultOrder: { column: 'created_at', ascending: false } },
  kitchenItems: { table: 'kitchen_items', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['menu_id', 'name', 'description', 'image_url', 'price', 'is_available', 'is_hidden', 'sort_order'], defaultOrder: { column: 'sort_order', ascending: true } },
  kitchenOrders: { table: 'kitchen_orders', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['status', 'payment_status'], defaultOrder: { column: 'created_at', ascending: false } },
  contentBlocks: { table: 'content_blocks', readRoles: ['admin', 'president', 'secretary', 'committee'], writeRoles: ['admin'], allowedFields: ['title', 'body', 'image_url', 'cta_label', 'cta_url', 'is_active'], defaultOrder: { column: 'page_slug', ascending: true } },
};

const revalidationPaths: Record<string, string[]> = {
  events: ['/', '/events'],
  news: ['/', '/news'],
  sponsors: ['/', '/sponsors'],
  galleryImages: ['/', '/gallery'],
  kitchenMenus: ['/kitchen'],
  kitchenItems: ['/kitchen'],
  contentBlocks: ['/'],
};

function revalidateForResource(resource: string) {
  const paths = revalidationPaths[resource];
  if (paths) {
    for (const p of paths) {
      try { revalidatePath(p); } catch { /* best-effort */ }
    }
  }
}

function pickResource(resource: string) {
  return resourceMap[resource];
}

function canRead(role: AuthRole, allowed: AuthRole[]) {
  return allowed.includes(role);
}

function canWrite(role: AuthRole) {
  return role === 'admin';
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
    payload[field] = value;
  }
  return payload;
}

export async function GET(_request: Request, { params }: { params: { resource: string } }) {
  const config = pickResource(params.resource);
  if (!config) return NextResponse.json({ success: false, error: 'Unknown resource.' }, { status: 404 });

  const user = await requireSession(['admin', 'president', 'secretary', 'committee']);
  if (!user || !canRead(user.role, config.readRoles)) {
    return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });
  }

  const supabase = createServerClient();
  let query = supabase.from(config.table).select('*');
  if (config.defaultOrder) {
    query = query.order(config.defaultOrder.column, { ascending: config.defaultOrder.ascending });
  }
  const { data, error } = await query;

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}

export async function POST(request: Request, { params }: { params: { resource: string } }) {
  const config = pickResource(params.resource);
  if (!config) return NextResponse.json({ success: false, error: 'Unknown resource.' }, { status: 404 });

  const user = await requireSession(['admin', 'president', 'secretary', 'committee']);
  if (!user || !canWrite(user.role)) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const rawPayload = await request.json();
  const payload = sanitizePayload(config, rawPayload);
  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ success: false, error: 'No writable fields provided.' }, { status: 400 });
  }
  const supabase = createServerClient();
  const { data, error } = await supabase.from(config.table).insert(payload).select().single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  revalidateForResource(params.resource);
  return NextResponse.json({ success: true, data });
}

export async function PATCH(request: Request, { params }: { params: { resource: string } }) {
  const config = pickResource(params.resource);
  if (!config) return NextResponse.json({ success: false, error: 'Unknown resource.' }, { status: 404 });

  const user = await requireSession(['admin', 'president', 'secretary', 'committee']);
  if (!user || !canWrite(user.role)) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const { id, ...rawPayload } = await request.json();
  if (!id) return NextResponse.json({ success: false, error: 'id is required.' }, { status: 400 });
  const payload = sanitizePayload(config, rawPayload);
  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ success: false, error: 'No writable fields provided.' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase.from(config.table).update(payload).eq('id', id).select().single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  revalidateForResource(params.resource);
  return NextResponse.json({ success: true, data });
}

export async function DELETE(request: Request, { params }: { params: { resource: string } }) {
  const config = pickResource(params.resource);
  if (!config) return NextResponse.json({ success: false, error: 'Unknown resource.' }, { status: 404 });

  const user = await requireSession(['admin', 'president', 'secretary', 'committee']);
  if (!user || !canWrite(user.role)) return NextResponse.json({ success: false, error: 'Forbidden.' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, error: 'id query param is required.' }, { status: 400 });

  const supabase = createServerClient();
  const { error } = await supabase.from(config.table).delete().eq('id', id);

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  revalidateForResource(params.resource);
  return NextResponse.json({ success: true });
}
