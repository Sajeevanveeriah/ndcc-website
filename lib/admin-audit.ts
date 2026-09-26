// General admin audit log (public.admin_audit_log). Every write is
// best-effort: a missing table, network fault or bad input is swallowed and
// reported as `false`, so auditing can never fail or delay the main action.
// Server routes normally call scheduleAdminAudit() from lib/revisions/server.ts,
// which runs this after the response is sent.
//
// No runtime imports so the pure parts can be unit tested directly.

export type AdminAuditActor = { id?: string | null; email?: string | null } | null | undefined;

export type AdminAuditInput = {
  actor: AdminAuditActor;
  action: string;
  resource: string;
  recordId?: string | number | null;
  summary?: string | null;
};

export type AdminAuditRow = {
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  resource: string;
  record_id: string | null;
  summary: string;
};

export const ADMIN_AUDIT_TABLE = 'admin_audit_log';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clean(value: unknown, max: number): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  // Strip control characters so log rows stay single-line and printable.
  const printable = Array.from(String(value), (ch) => {
    const code = ch.charCodeAt(0);
    return code < 32 || code === 127 ? ' ' : ch;
  }).join('');
  return printable.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Normalise an audit entry, or null when it lacks an action or resource. */
export function buildAuditRow(input: AdminAuditInput): AdminAuditRow | null {
  if (!input || typeof input !== 'object') return null;
  const action = clean(input.action, 40).toLowerCase();
  const resource = clean(input.resource, 80);
  if (!action || !resource) return null;
  const actorId = typeof input.actor?.id === 'string' && UUID_PATTERN.test(input.actor.id) ? input.actor.id : null;
  const actorEmail = clean(input.actor?.email, 320) || null;
  const recordId = clean(input.recordId, 200) || null;
  return { actor_id: actorId, actor_email: actorEmail, action, resource, record_id: recordId, summary: clean(input.summary, 1000) };
}

/** Summary naming changed fields without copying their (possibly personal) values. */
export function summariseFields(prefix: string, payload: Record<string, unknown> | null | undefined, max = 12): string {
  const fields = payload && typeof payload === 'object' ? Object.keys(payload) : [];
  if (fields.length === 0) return prefix;
  const shown = fields.slice(0, max).join(', ');
  return `${prefix}: ${shown}${fields.length > max ? ` and ${fields.length - max} more` : ''}`;
}

type InsertResult = PromiseLike<{ error: unknown }>;
export type AuditClient = { from: (table: string) => { insert: (row: AdminAuditRow) => InsertResult } };

/** Insert an audit row. Never throws; resolves true only when the row was stored. */
export async function writeAdminAudit(client: AuditClient | null | undefined, input: AdminAuditInput): Promise<boolean> {
  try {
    const row = buildAuditRow(input);
    if (!row || !client) return false;
    const result = await client.from(ADMIN_AUDIT_TABLE).insert(row);
    if (result?.error) {
      const message = (result.error as { message?: string }).message || 'unknown error';
      console.warn(`[admin-audit] Skipped ${row.action} ${row.resource}: ${message}`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[admin-audit] Skipped audit entry:', error instanceof Error ? error.message : error);
    return false;
  }
}
