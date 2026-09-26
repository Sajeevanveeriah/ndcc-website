import { NextResponse } from 'next/server';
import { requirePermissionResult } from '@/lib/auth/guard';
import { isFullAccessRole } from '@/lib/auth/permissions';
import { createServerClient } from '@/lib/supabase-server';
import { datetimeLocalToClubIso } from '@/lib/utils';
import { ADMIN_AUDIT_TABLE } from '@/lib/admin-audit';

export const dynamic = 'force-dynamic';
const PAGE_SIZE = 50;
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function nextDay(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const access = await requirePermissionResult('dashboard');
  if (!access.user) return reply({ success: false, error: access.error }, access.status);
  if (!isFullAccessRole(access.user.role)) return reply({ success: false, error: 'The audit log is limited to office bearers and administrators.' }, 403);

  const params = new URL(request.url).searchParams;
  const page = Math.max(0, Math.min(10_000, Math.floor(Number(params.get('page')) || 0)));
  const resource = (params.get('resource') || '').trim().replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 80);
  const actor = (params.get('actor') || '').trim().replace(/[^\p{L}\p{N} @.+_-]/gu, '').slice(0, 120);
  const from = params.get('from') || '';
  const to = params.get('to') || '';

  try {
    let query = createServerClient().from(ADMIN_AUDIT_TABLE)
      .select('id,actor_id,actor_email,action,resource,record_id,summary,created_at', { count: 'exact' })
      .order('created_at', { ascending: false }).order('id', { ascending: false });
    if (resource) query = query.eq('resource', resource);
    if (actor) query = query.ilike('actor_email', `%${actor}%`);
    if (DATE_PATTERN.test(from)) query = query.gte('created_at', datetimeLocalToClubIso(`${from}T00:00`));
    if (DATE_PATTERN.test(to)) query = query.lt('created_at', datetimeLocalToClubIso(`${nextDay(to)}T00:00`));
    const { data, error, count } = await query.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) {
      const missing = error.code === 'PGRST205' || error.code === '42P01' || /schema cache|does not exist/i.test(error.message || '');
      return reply({ success: false, error: missing ? 'The audit log is not set up yet. It starts recording once the latest database update is applied.' : 'The audit log could not be loaded.' }, 503);
    }
    return reply({ success: true, entries: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE });
  } catch {
    return reply({ success: false, error: 'The audit log could not be loaded.' }, 503);
  }
}
