import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requirePermission } from '@/lib/auth/guard';
import { FULL_ACCESS_ROLES } from '@/lib/auth/config';
import { createServerClient } from '@/lib/supabase-server';
import { NOTIFICATION_RECIPIENTS_TAG } from '@/lib/notification-recipients';
import { normaliseRecipientEmail, normaliseRecipientName } from '@/lib/notification-recipients-core';
import {
  NOTIFICATION_EVENT_LABELS,
  NOTIFICATION_EVENT_TYPES,
  isNotificationEventType,
} from '@/lib/notification-recipients-fallback';

// Full-access roles only. CSRF for POST/PATCH/DELETE is enforced by middleware
// (lib/auth/csrf.ts) for every /api/admin route.
export const dynamic = 'force-dynamic';

const COLUMNS = 'id,event_type,email,name,active,sort_order,created_at,updated_at';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNAVAILABLE = 'Notification recipients are not available yet. The website is still using the built-in recipient lists.';

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });
}

async function authorise() {
  return requirePermission('dashboard', FULL_ACCESS_ROLES);
}

function isMissingTable(error: { code?: string; message?: string }) {
  const message = error.message || '';
  return error.code === '42P01' || error.code === 'PGRST205'
    || (/notification_recipients/.test(message) && /schema cache|does not exist/i.test(message));
}

function failure(context: string, error: { code?: string; message?: string }) {
  console.error(`[admin/notifications] ${context} failed`, { code: error.code, message: error.message });
  if (isMissingTable(error)) return json({ success: false, error: UNAVAILABLE }, 503);
  if (error.code === '23505') return json({ success: false, error: 'That email address is already listed for this notification.' }, 409);
  if (error.code === '23514') return json({ success: false, error: 'Enter a valid email address.' }, 400);
  return json({ success: false, error: 'Notification recipients could not be updated. Please try again.' }, 500);
}

function revalidate() {
  try { revalidateTag(NOTIFICATION_RECIPIENTS_TAG); } catch { /* best-effort; cache expires within 60 seconds */ }
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** Contact enquiries must always keep one active recipient. */
async function wouldRemoveLastContact(supabase: ReturnType<typeof createServerClient>, id: string) {
  const { data: row, error } = await supabase.from('notification_recipients').select('event_type,active').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!row || row.event_type !== 'contact' || !row.active) return false;
  const { count, error: countError } = await supabase.from('notification_recipients')
    .select('id', { count: 'exact', head: true }).eq('event_type', 'contact').eq('active', true);
  if (countError) throw countError;
  return (count ?? 0) <= 1;
}

export async function GET() {
  if (!await authorise()) return json({ success: false, error: 'Forbidden.' }, 403);
  const events = NOTIFICATION_EVENT_TYPES.map((type) => ({ type, ...NOTIFICATION_EVENT_LABELS[type] }));
  const contactOverride = Boolean(process.env.CONTACT_TO_EMAIL?.trim());
  try {
    const { data, error } = await createServerClient().from('notification_recipients').select(COLUMNS)
      .order('event_type', { ascending: true }).order('sort_order', { ascending: true }).order('created_at', { ascending: true });
    if (error) {
      console.error('[admin/notifications] list failed', { code: error.code, message: error.message });
      return json({ success: true, available: false, message: UNAVAILABLE, events, recipients: [], contactOverride });
    }
    return json({ success: true, available: true, events, recipients: data ?? [], contactOverride });
  } catch {
    return json({ success: true, available: false, message: UNAVAILABLE, events, recipients: [], contactOverride });
  }
}

export async function POST(request: Request) {
  if (!await authorise()) return json({ success: false, error: 'Forbidden.' }, 403);
  const body = await readBody(request);
  if (!body) return json({ success: false, error: 'Invalid request.' }, 400);
  if (!isNotificationEventType(body.event_type)) return json({ success: false, error: 'Choose which notification this address should receive.' }, 400);
  const email = normaliseRecipientEmail(body.email);
  if (!email) return json({ success: false, error: 'Enter a valid email address.' }, 400);
  const name = normaliseRecipientName(body.name);
  try {
    const supabase = createServerClient();
    const { data: last } = await supabase.from('notification_recipients').select('sort_order')
      .eq('event_type', body.event_type).order('sort_order', { ascending: false }).limit(1).maybeSingle();
    const sortOrder = (Number(last?.sort_order) || 0) + 10;
    const { data, error } = await supabase.from('notification_recipients')
      .insert({ event_type: body.event_type, email, name, active: true, sort_order: sortOrder }).select(COLUMNS).single();
    if (error) return failure('insert', error);
    revalidate();
    return json({ success: true, data });
  } catch (error) {
    return failure('insert', error as { code?: string; message?: string });
  }
}

export async function PATCH(request: Request) {
  if (!await authorise()) return json({ success: false, error: 'Forbidden.' }, 403);
  const body = await readBody(request);
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!body || !UUID_PATTERN.test(id)) return json({ success: false, error: 'Recipient id is required.' }, 400);
  const update: Record<string, unknown> = {};
  if ('active' in body) {
    if (typeof body.active !== 'boolean') return json({ success: false, error: 'Active must be on or off.' }, 400);
    update.active = body.active;
  }
  if ('name' in body) update.name = normaliseRecipientName(body.name);
  if (Object.keys(update).length === 0) return json({ success: false, error: 'Nothing to update.' }, 400);
  try {
    const supabase = createServerClient();
    if (update.active === false && await wouldRemoveLastContact(supabase, id)) {
      return json({ success: false, error: 'Website enquiries need at least one active recipient. Add another address first.' }, 409);
    }
    const { data, error } = await supabase.from('notification_recipients').update(update).eq('id', id).select(COLUMNS).maybeSingle();
    if (error) return failure('update', error);
    if (!data) return json({ success: false, error: 'Recipient not found. Refresh the page.' }, 404);
    revalidate();
    return json({ success: true, data });
  } catch (error) {
    return failure('update', error as { code?: string; message?: string });
  }
}

export async function DELETE(request: Request) {
  if (!await authorise()) return json({ success: false, error: 'Forbidden.' }, 403);
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!UUID_PATTERN.test(id)) return json({ success: false, error: 'Recipient id is required.' }, 400);
  try {
    const supabase = createServerClient();
    if (await wouldRemoveLastContact(supabase, id)) {
      return json({ success: false, error: 'Website enquiries need at least one active recipient. Add another address first.' }, 409);
    }
    const { data, error } = await supabase.from('notification_recipients').delete().eq('id', id).select('id');
    if (error) return failure('delete', error);
    if (!data?.[0]) return json({ success: false, error: 'Recipient not found. Refresh the page.' }, 404);
    revalidate();
    return json({ success: true, data: { id } });
  } catch (error) {
    return failure('delete', error as { code?: string; message?: string });
  }
}
