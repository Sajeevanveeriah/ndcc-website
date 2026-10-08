import 'server-only';
import { NextResponse } from 'next/server';
import type { requirePermissionResult } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { friendlyDatabaseError } from '@/lib/admin-resource-validation';
import { scheduleAdminAudit } from '@/lib/revisions/server';
import { revalidatePublicContent } from '@/lib/server/revalidate-public';
import { MAX_BULK_ROWS } from '@/lib/match-day';

const noStore = { 'Cache-Control': 'no-store', Vary: 'Cookie' };
export const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: noStore });

type Normalised = Record<string, unknown> & { published: boolean };
export type MatchDayResource = {
  resource: 'teamSheets' | 'clubWinners';
  table: 'team_sheets' | 'club_winners';
  columns: string;
  order: Array<{ column: string; ascending: boolean }>;
  normalise: (input: Record<string, unknown>) => Normalised;
  validate: (row: Normalised) => string | null;
  /** Bulk import: the existing row this one replaces (team + date for team sheets), or null to always insert. */
  findExisting?: (db: ReturnType<typeof createServerClient>, row: Normalised) => Promise<{ id: string } | null>;
  label: (row: Record<string, unknown>) => string;
};

type Access = Awaited<ReturnType<typeof requirePermissionResult>>;
export type MatchDayUser = NonNullable<Access['user']>;

/** Each route checks requirePermissionResult('publications') itself; this turns a refusal into the reply. */
export function denied(access: Access) {
  return reply({ success: false, error: access.error }, access.status);
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const raw = await request.text();
  if (raw.length > 1_000_000) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

function dbError(error: { message?: string; code?: string } | null, fallback: string) {
  if (!error) return fallback;
  if (error.code === '23505') return 'A team sheet for that team and date already exists. Edit the existing one instead.';
  return friendlyDatabaseError(error).error || fallback;
}

export async function listRows(config: MatchDayResource) {
  const db = createServerClient();
  let query = db.from(config.table).select(config.columns);
  for (const order of config.order) query = query.order(order.column, { ascending: order.ascending });
  const { data, error } = await query.limit(1000);
  if (error) return reply({ success: false, error: 'Unable to load records. Please retry.' }, 503);
  return reply({ success: true, data: data ?? [] });
}

/** POST { row } creates one; POST { rows, publish } imports many (team sheets replace the same team and date). */
export async function createRows(request: Request, config: MatchDayResource, user: MatchDayUser) {
  const body = await readBody(request);
  if (!body) return reply({ success: false, error: 'Invalid request.' }, 400);
  const db = createServerClient({ actorId: user.id });

  if (Array.isArray(body.rows)) {
    if (body.rows.length === 0) return reply({ success: false, error: 'Nothing to import.' }, 400);
    if (body.rows.length > MAX_BULK_ROWS) return reply({ success: false, error: `Import up to ${MAX_BULK_ROWS} rows at a time.` }, 400);
    const rows = body.rows.map((row) => config.normalise({ ...(row as Record<string, unknown>), published: body.publish === true }));
    for (const [index, row] of rows.entries()) {
      const error = config.validate(row);
      if (error) return reply({ success: false, error: `Row ${index + 1}: ${error}` }, 400);
    }
    let created = 0; let updated = 0;
    const saved: unknown[] = [];
    for (const row of rows) {
      const existing = config.findExisting ? await config.findExisting(db, row) : null;
      const result = existing
        // An import row with no images (a player-list CSV) keeps the sheet's uploaded images.
        ? await db.from(config.table).update(Array.isArray(row.images) && row.images.length === 0 ? Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'images')) : row).eq('id', existing.id).select(config.columns).single()
        : await db.from(config.table).insert(row).select(config.columns).single();
      if (result.error) return reply({ success: false, error: `${config.label(row)}: ${dbError(result.error, 'Could not be saved.')}`, created, updated }, 400);
      if (existing) updated++; else created++;
      saved.push(result.data);
    }
    scheduleAdminAudit({ actor: user, action: 'bulk_import', resource: config.resource, recordId: null, summary: `Imported ${created} new and updated ${updated} (${body.publish === true ? 'published' : 'drafts'})` });
    revalidatePublicContent(config.resource);
    return reply({ success: true, created, updated, data: saved });
  }

  const row = config.normalise((body.row && typeof body.row === 'object' ? body.row : body) as Record<string, unknown>);
  const error = config.validate(row);
  if (error) return reply({ success: false, error }, 400);
  const { data, error: insertError } = await db.from(config.table).insert(row).select(config.columns).single();
  if (insertError) return reply({ success: false, error: dbError(insertError, 'Could not be saved. Please retry.') }, 400);
  scheduleAdminAudit({ actor: user, action: 'create', resource: config.resource, recordId: (data as unknown as { id: string }).id, summary: `Created ${config.label(row)}` });
  revalidatePublicContent(config.resource);
  return reply({ success: true, data });
}

/** PATCH { id, ...fields } edits one (merged and re-validated); PATCH { ids, published } publishes or hides many. */
export async function updateRows(request: Request, config: MatchDayResource, user: MatchDayUser) {
  const body = await readBody(request);
  if (!body) return reply({ success: false, error: 'Invalid request.' }, 400);
  const db = createServerClient({ actorId: user.id });

  if (Array.isArray(body.ids)) {
    const ids = body.ids.filter((id): id is string => typeof id === 'string').slice(0, 200);
    if (!ids.length || typeof body.published !== 'boolean') return reply({ success: false, error: 'Choose records and an action.' }, 400);
    if (body.published) {
      const { data: rows, error } = await db.from(config.table).select(config.columns).in('id', ids);
      if (error) return reply({ success: false, error: 'Unable to load records. Please retry.' }, 503);
      for (const row of (rows ?? []) as unknown as Record<string, unknown>[]) {
        const problem = config.validate(config.normalise({ ...row, published: true }));
        if (problem) return reply({ success: false, error: `${config.label(row)}: ${problem}` }, 400);
      }
    }
    const { data, error } = await db.from(config.table).update({ published: body.published }).in('id', ids).select('id');
    if (error) return reply({ success: false, error: dbError(error, 'Could not update. Please retry.') }, 400);
    scheduleAdminAudit({ actor: user, action: 'batch_update', resource: config.resource, recordId: null, summary: `${body.published ? 'Published' : 'Hid'} ${data?.length ?? 0} records` });
    revalidatePublicContent(config.resource);
    return reply({ success: true, updated: data?.length ?? 0 });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return reply({ success: false, error: 'Missing record.' }, 400);
  const { data: existing, error: readError } = await db.from(config.table).select(config.columns).eq('id', id).maybeSingle();
  if (readError) return reply({ success: false, error: 'Unable to load the record. Please retry.' }, 503);
  if (!existing) return reply({ success: false, error: 'This record no longer exists.' }, 404);
  const row = config.normalise({ ...(existing as unknown as Record<string, unknown>), ...body });
  const error = config.validate(row);
  if (error) return reply({ success: false, error }, 400);
  const { data, error: updateError } = await db.from(config.table).update(row).eq('id', id).select(config.columns).single();
  if (updateError) return reply({ success: false, error: dbError(updateError, 'Could not be saved. Please retry.') }, 400);
  scheduleAdminAudit({ actor: user, action: 'update', resource: config.resource, recordId: id, summary: `Updated ${config.label(row)}` });
  revalidatePublicContent(config.resource);
  return reply({ success: true, data });
}

export async function deleteRow(request: Request, config: MatchDayResource, user: MatchDayUser) {
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return reply({ success: false, error: 'Missing record.' }, 400);
  const db = createServerClient({ actorId: user.id });
  const { data, error } = await db.from(config.table).delete().eq('id', id).select('id').maybeSingle();
  if (error) return reply({ success: false, error: 'Could not delete. Please retry.' }, 400);
  if (!data) return reply({ success: false, error: 'This record no longer exists.' }, 404);
  scheduleAdminAudit({ actor: user, action: 'delete', resource: config.resource, recordId: id, summary: 'Deleted record' });
  revalidatePublicContent(config.resource);
  return reply({ success: true });
}
