import { NextResponse } from 'next/server';
import { requirePermissionResult } from '@/lib/auth/guard';
import { isFullAccessRole } from '@/lib/auth/permissions';
import { createServerClient } from '@/lib/supabase-server';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
import { revalidatePublicContent } from '@/lib/server/revalidate-public';
import { GALLERY_MEDIA_BUCKET } from '@/lib/gallery/shared';
import { REVISION_TABLES, describeSnapshot, revisionTable, trashCutoffIso, TRASH_RETENTION_DAYS } from '@/lib/revisions/tables';
import { buildRestorePayload, classifyRestoreError, isRevisionUuid, latestDeletionPerRecord, withoutMissingColumn } from '@/lib/revisions/restore';
import { fetchActorNames, scheduleAdminAudit } from '@/lib/revisions/server';

export const dynamic = 'force-dynamic';
const LIST_LIMIT = 300;
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

// Snapshot fields needed for labels, selected as JSON paths so large bodies
// (news content, page sections) are never transferred for the list.
const TITLE_FIELDS = Array.from(new Set(REVISION_TABLES.flatMap((entry) => entry.titleFields)));
const LIST_SELECT = ['id', 'resource_table', 'record_id', 'changed_at', 'changed_by', ...TITLE_FIELDS.map((field) => `t_${field}:snapshot->>${field}`)].join(',');

type TrashRow = { id: string; resource_table: string; record_id: string; changed_at: string; changed_by: string | null } & Record<string, unknown>;

async function requireFullAccess() {
  const access = await requirePermissionResult('dashboard');
  if (!access.user) return { user: null, response: reply({ success: false, error: access.error }, access.status) };
  if (!isFullAccessRole(access.user.role)) return { user: null, response: reply({ success: false, error: 'Trash is limited to office bearers and administrators.' }, 403) };
  return { user: access.user, response: null };
}

export async function GET(request: Request) {
  const guard = await requireFullAccess();
  if (!guard.user) return guard.response;

  const requestedTable = new URL(request.url).searchParams.get('table') || '';
  const tables = requestedTable && revisionTable(requestedTable) ? [requestedTable] : REVISION_TABLES.map((entry) => entry.table);
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.from('editorial_revisions').select(LIST_SELECT)
      .eq('action', 'DELETE').gte('changed_at', trashCutoffIso()).in('resource_table', tables)
      .order('changed_at', { ascending: false }).limit(LIST_LIMIT);
    if (error) return reply({ success: false, error: 'Trash is temporarily unavailable.' }, 503);
    const latest = latestDeletionPerRecord((data ?? []) as unknown as TrashRow[]);

    // Hide records that exist again (already restored or re-created).
    const existing = new Set<string>();
    const byTable = new Map<string, string[]>();
    for (const row of latest) byTable.set(row.resource_table, [...(byTable.get(row.resource_table) ?? []), row.record_id]);
    const lookups: Array<[string, string[]]> = [];
    for (const [table, ids] of byTable) {
      for (let index = 0; index < ids.length; index += 100) lookups.push([table, ids.slice(index, index + 100)]);
    }
    await Promise.all(lookups.map(async ([table, ids]) => {
      const result = await supabase.from(table).select('id').in('id', ids);
      // If a section cannot be checked, hide its entries rather than offer a
      // restore that might clash with a live record.
      if (result.error) { for (const id of ids) existing.add(`${table}:${id}`); return; }
      for (const row of (result.data ?? []) as Array<{ id: string }>) existing.add(`${table}:${row.id}`);
    }));
    const visible = latest.filter((row) => !existing.has(`${row.resource_table}:${row.record_id}`));
    const names = await fetchActorNames(supabase, visible.map((row) => row.changed_by));

    const items = visible.map((row) => {
      const config = revisionTable(row.resource_table);
      const labelSource: Record<string, unknown> = {};
      for (const field of TITLE_FIELDS) labelSource[field] = row[`t_${field}`];
      return {
        revision_id: row.id,
        table: row.resource_table,
        section: config?.label ?? row.resource_table,
        href: config?.href ?? '/admin',
        record_id: row.record_id,
        title: describeSnapshot(row.resource_table, labelSource),
        deleted_at: row.changed_at,
        deleted_by: row.changed_by ? names[row.changed_by]?.name || null : null,
      };
    });
    return reply({ success: true, items, retentionDays: TRASH_RETENTION_DAYS, sections: REVISION_TABLES.map(({ table, label }) => ({ table, label })) });
  } catch {
    return reply({ success: false, error: 'Trash is temporarily unavailable.' }, 503);
  }
}

export async function POST(request: Request) {
  const guard = await requireFullAccess();
  if (!guard.user) return guard.response;
  const user = guard.user;

  const body = await readLimitedJsonObject(request, 4096);
  const revisionId = body.ok ? body.value.revision_id : null;
  if (!isRevisionUuid(revisionId)) return reply({ success: false, error: 'Choose a deleted record to restore.' }, 400);

  try {
    const supabase = createServerClient({ actorId: user.id });
    const { data: archived, error: archiveError } = await supabase.from('editorial_revisions')
      .select('id,resource_table,record_id,snapshot,action,changed_at').eq('id', revisionId).maybeSingle();
    if (archiveError) return reply({ success: false, error: 'Trash is temporarily unavailable.' }, 503);
    const config = archived ? revisionTable(String(archived.resource_table)) : undefined;
    if (!archived || archived.action !== 'DELETE' || !config) return reply({ success: false, error: 'This deleted record could not be found.' }, 404);

    // Only the most recent deletion of a record may be restored.
    const newer = await supabase.from('editorial_revisions').select('id')
      .eq('resource_table', config.table).eq('record_id', archived.record_id).eq('action', 'DELETE')
      .gt('changed_at', archived.changed_at).limit(1);
    if (newer.error) return reply({ success: false, error: 'Trash is temporarily unavailable.' }, 503);
    if ((newer.data ?? []).length > 0) return reply({ success: false, error: 'A more recent deleted copy of this record exists. Refresh the list and restore that one.' }, 409);

    const present = await supabase.from(config.table).select('id').eq('id', archived.record_id).maybeSingle();
    if (present.error) {
      const failure = classifyRestoreError(present.error);
      return reply({ success: false, error: failure.error }, failure.status);
    }
    if (present.data) return reply({ success: false, error: 'This record already exists, so it has probably been restored already. Refresh the list.' }, 409);

    const built = buildRestorePayload(archived.snapshot, archived.record_id);
    if (!built.ok) return reply({ success: false, error: built.error }, 409);
    let payload = built.payload;

    if (config.table === 'gallery_images' && typeof payload.storage_path === 'string' && payload.storage_path) {
      const path = payload.storage_path;
      const slash = path.lastIndexOf('/');
      const folder = slash >= 0 ? path.slice(0, slash) : '';
      const file = slash >= 0 ? path.slice(slash + 1) : path;
      const listed = await supabase.storage.from(GALLERY_MEDIA_BUCKET).list(folder, { search: file, limit: 10 });
      if (listed.error) return reply({ success: false, error: 'The gallery file could not be checked. Please try again.' }, 503);
      if (!(listed.data ?? []).some((object) => object.name === file)) {
        return reply({ success: false, error: 'The image file for this gallery record was permanently removed, so it cannot be restored. Upload the photo again instead.' }, 409);
      }
    }

    const droppedColumns: string[] = [];
    let inserted: { data: unknown; error: { code?: string; message?: string } | null } = { data: null, error: null };
    for (let attempt = 0; attempt < 6; attempt += 1) {
      inserted = await supabase.from(config.table).insert(payload).select('id').maybeSingle();
      if (!inserted.error) break;
      const next = withoutMissingColumn(payload, inserted.error);
      if (!next) break;
      droppedColumns.push(...Object.keys(payload).filter((key) => !(key in next)));
      payload = next;
    }
    if (inserted.error) {
      const failure = classifyRestoreError(inserted.error);
      return reply({ success: false, error: failure.error }, failure.status);
    }

    const title = describeSnapshot(config.table, built.payload);
    revalidatePublicContent(config.resource, { id: archived.record_id, slug: typeof payload.slug === 'string' ? payload.slug : null });
    scheduleAdminAudit({
      actor: user,
      action: 'restore',
      resource: config.resource,
      recordId: archived.record_id,
      summary: `Restored deleted ${config.label.toLowerCase()} record "${title}" from Trash${droppedColumns.length ? ` (retired fields skipped: ${droppedColumns.join(', ')})` : ''}`,
    });
    return reply({ success: true, data: { id: archived.record_id, table: config.table, href: config.href, title }, droppedColumns });
  } catch {
    return reply({ success: false, error: 'Restore failed. Please try again.' }, 500);
  }
}
