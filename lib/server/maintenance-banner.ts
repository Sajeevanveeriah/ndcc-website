import 'server-only';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';
import { isMissingSchemaError } from '@/lib/supabase-schema-errors';
import { publicMaintenanceBanner, type MaintenanceBanner, type MaintenanceSettingsRow } from '@/lib/maintenance-banner';

export const MAINTENANCE_COLUMNS = 'maintenance_banner_enabled,maintenance_starts_at,maintenance_ends_at,maintenance_message';

/**
 * The maintenance banner for the site chrome. Before the migration is applied
 * (missing columns) there is simply no banner; any other failure is reported
 * so the shared snapshot is not cached without it.
 */
export async function getPublicMaintenanceBanner(now: number = Date.now()): Promise<{ banner: MaintenanceBanner | null; failed: boolean }> {
  if (!isServerSupabaseConfigured()) return { banner: null, failed: false };
  try {
    const { data, error } = await createServerClient({ fetchTimeoutMs: 8_000 })
      .from('club_settings').select(MAINTENANCE_COLUMNS).eq('id', 'default').maybeSingle();
    if (error) return { banner: null, failed: !isMissingSchemaError(error) };
    return { banner: publicMaintenanceBanner(data as MaintenanceSettingsRow | null, now), failed: false };
  } catch {
    return { banner: null, failed: true };
  }
}
