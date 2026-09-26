import 'server-only';
import { after } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { writeAdminAudit, type AdminAuditInput } from '@/lib/admin-audit';

type ServerClient = ReturnType<typeof createServerClient>;

/**
 * Record an admin action after the response has been sent. Scheduling and
 * writing are both best-effort: nothing here can fail or slow the caller.
 */
export function scheduleAdminAudit(input: AdminAuditInput) {
  const run = async () => {
    try {
      await writeAdminAudit(createServerClient(), input);
    } catch { /* best-effort */ }
  };
  try {
    after(run);
  } catch {
    // Outside a request scope (e.g. scripts): write without blocking.
    void run();
  }
}

export type ActorNames = Record<string, { name: string; email: string }>;

/** Committee user names for revision/audit display. Empty on any failure. */
export async function fetchActorNames(supabase: ServerClient, ids: Array<string | null | undefined>): Promise<ActorNames> {
  const unique = Array.from(new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))).slice(0, 200);
  if (unique.length === 0) return {};
  try {
    const { data, error } = await supabase.from('committee_users').select('id,full_name,email').in('id', unique);
    if (error || !data) return {};
    const names: ActorNames = {};
    for (const row of data as Array<{ id: string; full_name?: string | null; email?: string | null }>) {
      names[row.id] = { name: row.full_name || row.email || '', email: row.email || '' };
    }
    return names;
  } catch {
    return {};
  }
}

type HistoryRow = { changed_by?: string | null } & Record<string, unknown>;

/**
 * Adds optional `changed_by_name` to history rows and loads the current saved
 * record so the history panel can show a field-level diff. Degrades to the
 * original rows (and no current record) on any failure.
 */
export async function enrichRevisionHistory(supabase: ServerClient, table: string, recordId: string, rows: HistoryRow[] | null) {
  const data = rows ?? [];
  let current: Record<string, unknown> | null = null;
  try {
    const names = await fetchActorNames(supabase, data.map((row) => row.changed_by));
    for (const row of data) {
      const actor = row.changed_by ? names[row.changed_by] : undefined;
      if (actor?.name) row.changed_by_name = actor.name;
    }
    const result = await supabase.from(table).select('*').eq('id', recordId).maybeSingle();
    if (!result.error && result.data) current = result.data as Record<string, unknown>;
  } catch { /* best-effort */ }
  return { data, current };
}
