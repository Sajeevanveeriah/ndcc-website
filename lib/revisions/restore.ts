// Pure helpers for restoring an archived deletion from editorial_revisions.
// The server route (app/api/admin/trash/route.ts) re-inserts the archived row
// with its original id; these helpers build and adapt that payload and turn
// database errors into clear messages. No runtime imports: unit tested.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RestorePayloadResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string };

export function isRevisionUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/**
 * Copy the archived row for re-insertion. The id must match the archive's
 * record_id so a tampered or malformed snapshot can never overwrite a
 * different record.
 */
export function buildRestorePayload(snapshot: unknown, recordId: unknown): RestorePayloadResult {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return { ok: false, error: 'The archived copy of this record is unreadable.' };
  }
  const row = snapshot as Record<string, unknown>;
  if (!isRevisionUuid(recordId) || row.id !== recordId) {
    return { ok: false, error: 'The archived copy does not match the deleted record.' };
  }
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined) payload[key] = value;
  }
  return { ok: true, payload };
}

/**
 * When a column was dropped after the row was archived, PostgREST rejects the
 * insert with "Could not find the 'x' column of 't' in the schema cache".
 * Returns a copy without that column, or null when the error is something else
 * (or the column is the id, which must never be dropped).
 */
export function withoutMissingColumn(
  payload: Record<string, unknown>,
  error: { code?: string; message?: string } | null | undefined,
): Record<string, unknown> | null {
  const message = error?.message || '';
  const match = message.match(/Could not find the '([^']+)' column/);
  if (!match) return null;
  const column = match[1];
  if (column === 'id' || !(column in payload)) return null;
  const next = { ...payload };
  delete next[column];
  return next;
}

export type RestoreErrorResponse = { status: 409 | 500 | 503; error: string };

export function classifyRestoreError(error: { code?: string; message?: string } | null | undefined): RestoreErrorResponse {
  const code = error?.code || '';
  const message = error?.message || '';
  if (code === '23505' || /duplicate key|unique constraint/i.test(message)) {
    if (/_pkey\b/i.test(message)) {
      return { status: 409, error: 'This record already exists, so it has probably been restored already. Refresh the list.' };
    }
    return { status: 409, error: 'This record clashes with an existing one (for example the same slug or name). Rename or remove the existing record, then try again.' };
  }
  if (code === '23503' || /foreign key/i.test(message)) {
    return { status: 409, error: 'This record belongs to something that no longer exists (for example a deleted menu or album). Restore that first, then try again.' };
  }
  if (code === '23514' || code === '23502' || /check constraint|not-null|null value/i.test(message)) {
    return { status: 409, error: 'This archived copy no longer meets the current rules for this section, so it cannot be restored automatically.' };
  }
  if (code === 'PGRST205' || code === '42P01' || /schema cache|does not exist/i.test(message)) {
    return { status: 503, error: 'This section is not available for restore right now.' };
  }
  return { status: 500, error: 'Restore failed. Please try again.' };
}

/** Keep only the newest deletion per record; input must be newest first. */
export function latestDeletionPerRecord<T extends { resource_table: string; record_id: string }>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const row of rows) {
    const key = `${row.resource_table}:${row.record_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}
