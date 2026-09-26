import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requirePermissionResult } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { datetimeLocalToClubIso } from '@/lib/utils';
import { normalisePublicLinkUrl } from '@/lib/public-link-url';
import { normaliseMediaUrl } from '@/lib/media-url';
import { SITE_PROMOTION_COLUMNS } from '@/lib/server/site-promotions';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DETAIL_KEY = /^[A-Za-z][A-Za-z0-9]{0,39}$/;
const KINDS = new Set(['home_banner', 'fundraiser']);
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: noStore });

function isMissingTable(error: { code?: string; message?: string } | null) {
  return Boolean(error && (['42P01', 'PGRST205'].includes(error.code || '') || /site_promotions/.test(error.message || '')));
}

function toInstant(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === null || value === undefined || value === '') return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false };
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? datetimeLocalToClubIso(value) : value;
  return Number.isFinite(Date.parse(iso)) ? { ok: true, value: new Date(iso).toISOString() } : { ok: false };
}

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > max) throw new Error(`Text must be ${max} characters or fewer.`);
  return value.trim() || null;
}

/** Validate and normalise an admin payload. Returns the row fields or an error message. */
function parsePromotion(raw: Record<string, unknown>, isCreate: boolean): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  const row: Record<string, unknown> = {};
  try {
    if (isCreate || 'slug' in raw) {
      if (typeof raw.slug !== 'string' || !SLUG.test(raw.slug) || raw.slug.length > 80) return { ok: false, error: 'Slug must be lowercase letters, numbers and hyphens.' };
      row.slug = raw.slug;
    }
    if (isCreate || 'kind' in raw) {
      if (typeof raw.kind !== 'string' || !KINDS.has(raw.kind)) return { ok: false, error: 'Choose a home banner or fundraiser.' };
      row.kind = raw.kind;
    }
    for (const [field, max] of [['title', 200], ['body', 4000]] as const) {
      if (field in raw) row[field] = optionalText(raw[field], max) ?? '';
    }
    if (isCreate && !(typeof row.title === 'string' && row.title)) return { ok: false, error: 'Title is required.' };
    if ('link_label' in raw) row.link_label = optionalText(raw.link_label, 120) ?? null;
    if ('placement' in raw) row.placement = optionalText(raw.placement, 80) ?? 'home';
    if ('link_url' in raw) {
      const text = optionalText(raw.link_url, 2048);
      if (text) {
        const safe = normalisePublicLinkUrl(text);
        if (!safe) return { ok: false, error: 'Link must be a site path (starting with /) or an https:// URL.' };
        row.link_url = safe;
      } else row.link_url = null;
    }
    if ('image_url' in raw) {
      const text = optionalText(raw.image_url, 2048);
      if (text) {
        const image = normaliseMediaUrl(text);
        if (!/^(https:\/\/|\/)/.test(image) || image.startsWith('//')) return { ok: false, error: 'Image must be an https:// URL or a site path.' };
        row.image_url = image;
      } else row.image_url = null;
    }
    for (const field of ['starts_at', 'ends_at'] as const) {
      if (!(field in raw)) continue;
      const parsed = toInstant(raw[field]);
      if (!parsed.ok) return { ok: false, error: 'Enter valid start and end times.' };
      row[field] = parsed.value;
    }
    if (typeof row.starts_at === 'string' && typeof row.ends_at === 'string' && Date.parse(row.starts_at) >= Date.parse(row.ends_at)) {
      return { ok: false, error: 'The end time must be after the start time.' };
    }
    if ('active' in raw) {
      if (typeof raw.active !== 'boolean') return { ok: false, error: 'Choose whether the promotion is shown.' };
      row.active = raw.active;
    }
    if ('sort_order' in raw) {
      const order = Number(raw.sort_order);
      if (!Number.isInteger(order) || Math.abs(order) > 100000) return { ok: false, error: 'Display order must be a whole number.' };
      row.sort_order = order;
    }
    if ('details' in raw) {
      const details = raw.details;
      if (!details || typeof details !== 'object' || Array.isArray(details)) return { ok: false, error: 'Extra details must be a list of labels.' };
      const entries = Object.entries(details as Record<string, unknown>);
      if (entries.length > 20) return { ok: false, error: 'Use 20 extra details or fewer.' };
      const clean: Record<string, string> = {};
      for (const [key, value] of entries) {
        if (!DETAIL_KEY.test(key) || typeof value !== 'string' || value.length > 500) return { ok: false, error: 'Each extra detail needs a simple name and a value of 500 characters or fewer.' };
        if (value.trim()) clean[key] = value.trim();
      }
      row.details = clean;
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid promotion.' };
  }
  return { ok: true, row };
}

function revalidatePromotionPages() {
  for (const path of ['/', '/fundraising/cookie-dough']) {
    try { revalidatePath(path); } catch { /* best-effort */ }
  }
}

async function authorise() {
  return requirePermissionResult('content');
}

export async function GET() {
  const access = await authorise();
  if (!access.user) return reply({ success: false, error: access.error }, access.status);
  const { data, error } = await createServerClient({ actorId: access.user.id }).from('site_promotions')
    .select(`${SITE_PROMOTION_COLUMNS},created_at,updated_at`).order('sort_order', { ascending: true }).order('slug', { ascending: true });
  if (error) {
    if (isMissingTable(error)) return reply({ success: true, data: [], available: false });
    return reply({ success: false, error: 'Promotions are temporarily unavailable. Please retry.' }, 503);
  }
  return reply({ success: true, data, available: true });
}

export async function POST(request: Request) {
  const access = await authorise();
  if (!access.user) return reply({ success: false, error: access.error }, access.status);
  const raw = await request.json().catch(() => null);
  if (!raw || typeof raw !== 'object') return reply({ success: false, error: 'Invalid request.' }, 400);
  const parsed = parsePromotion(raw as Record<string, unknown>, true);
  if (!parsed.ok) return reply({ success: false, error: parsed.error }, 400);
  const { data, error } = await createServerClient({ actorId: access.user.id }).from('site_promotions')
    .insert(parsed.row).select(`${SITE_PROMOTION_COLUMNS},created_at,updated_at`).single();
  if (error) {
    if (error.code === '23505') return reply({ success: false, error: 'A promotion with that slug already exists.' }, 409);
    if (isMissingTable(error)) return reply({ success: false, error: 'Promotions need the latest database update before they can be edited.' }, 503);
    return reply({ success: false, error: 'The promotion could not be saved. Please retry.' }, 500);
  }
  revalidatePromotionPages();
  return reply({ success: true, data });
}

export async function PATCH(request: Request) {
  const access = await authorise();
  if (!access.user) return reply({ success: false, error: access.error }, access.status);
  const raw = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = typeof raw?.id === 'string' ? raw.id : '';
  if (!raw || !UUID.test(id)) return reply({ success: false, error: 'Choose a promotion to update.' }, 400);
  const { id: _ignored, slug: _slug, ...changes } = raw;
  void _ignored; void _slug;
  const parsed = parsePromotion(changes, false);
  if (!parsed.ok) return reply({ success: false, error: parsed.error }, 400);
  if (!Object.keys(parsed.row).length) return reply({ success: false, error: 'Nothing to update.' }, 400);
  const client = createServerClient({ actorId: access.user.id });
  // Re-check the date order against the stored value when only one bound changes.
  if (('starts_at' in parsed.row) !== ('ends_at' in parsed.row)) {
    const current = await client.from('site_promotions').select('starts_at,ends_at').eq('id', id).maybeSingle();
    if (current.error) return reply({ success: false, error: 'Promotions are temporarily unavailable. Please retry.' }, 503);
    const starts = ('starts_at' in parsed.row ? parsed.row.starts_at : current.data?.starts_at) as string | null;
    const ends = ('ends_at' in parsed.row ? parsed.row.ends_at : current.data?.ends_at) as string | null;
    if (starts && ends && Date.parse(starts) >= Date.parse(ends)) return reply({ success: false, error: 'The end time must be after the start time.' }, 400);
  }
  const { data, error } = await client.from('site_promotions')
    .update({ ...parsed.row, updated_at: new Date().toISOString() }).eq('id', id)
    .select(`${SITE_PROMOTION_COLUMNS},created_at,updated_at`).maybeSingle();
  if (error) return reply({ success: false, error: 'The promotion could not be saved. Please retry.' }, isMissingTable(error) ? 503 : 500);
  if (!data) return reply({ success: false, error: 'Promotion not found.' }, 404);
  revalidatePromotionPages();
  return reply({ success: true, data });
}
