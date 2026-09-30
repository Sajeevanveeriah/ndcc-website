import { NextResponse } from 'next/server';
import { requirePermissionResult } from '@/lib/auth/guard';
import { createServerClient } from '@/lib/supabase-server';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
import { revalidatePublicContent } from '@/lib/server/revalidate-public';
import { scheduleAdminAudit } from '@/lib/revisions/server';
import { isMissingSchemaError } from '@/lib/supabase-schema-errors';
import { MAINTENANCE_COLUMNS } from '@/lib/server/maintenance-banner';
import { cleanMessage, validateMaintenanceInput, type MaintenanceSettings, type MaintenanceSettingsRow } from '@/lib/maintenance-banner';

export const dynamic = 'force-dynamic';

// CMS setting for the site-wide maintenance banner (club_settings columns).
// Saving refreshes every cached page, because the banner sits in the header.

const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const MIGRATION_NEEDED = 'The maintenance banner needs the latest database update before it can be used. Nothing was saved.';

function toSettings(row: MaintenanceSettingsRow | null): MaintenanceSettings {
  const text = (value: unknown) => (typeof value === 'string' && value ? value : null);
  return {
    enabled: row?.maintenance_banner_enabled === true,
    starts_at: text(row?.maintenance_starts_at),
    ends_at: text(row?.maintenance_ends_at),
    message: cleanMessage(row?.maintenance_message),
  };
}

export async function GET() {
  const auth = await requirePermissionResult('club.details');
  if (!auth.user) return reply({ success: false, error: auth.error }, auth.status);
  try {
    const { data, error } = await createServerClient().from('club_settings').select(MAINTENANCE_COLUMNS).eq('id', 'default').maybeSingle();
    if (error && isMissingSchemaError(error)) return reply({ success: true, available: false, settings: toSettings(null) });
    if (error) return reply({ success: false, error: 'The maintenance banner setting could not be loaded.' }, 503);
    return reply({ success: true, available: true, settings: toSettings(data as MaintenanceSettingsRow | null) });
  } catch {
    return reply({ success: false, error: 'The maintenance banner setting could not be loaded.' }, 503);
  }
}

export async function PUT(request: Request) {
  const auth = await requirePermissionResult('club.details');
  if (!auth.user) return reply({ success: false, error: auth.error }, auth.status);
  const body = await readLimitedJsonObject(request, 4096);
  if (!body.ok) return reply({ success: false, error: body.error }, 400);
  const parsed = validateMaintenanceInput(body.value, Date.now());
  if (!parsed.ok) return reply({ success: false, error: parsed.error }, 400);
  const settings = parsed.value;
  try {
    const { data, error } = await createServerClient({ actorId: auth.user.id }).from('club_settings')
      .update({
        maintenance_banner_enabled: settings.enabled,
        maintenance_starts_at: settings.starts_at,
        maintenance_ends_at: settings.ends_at,
        maintenance_message: settings.message,
      })
      .eq('id', 'default').select(MAINTENANCE_COLUMNS).maybeSingle();
    if (error && isMissingSchemaError(error)) return reply({ success: false, error: MIGRATION_NEEDED }, 409);
    if (error) return reply({ success: false, error: 'The maintenance banner could not be saved.' }, 503);
    if (!data) return reply({ success: false, error: 'Club settings were not found.' }, 404);
    scheduleAdminAudit({
      actor: auth.user, action: 'update', resource: 'club_settings', recordId: 'default',
      summary: settings.enabled ? `Maintenance banner switched on (${settings.starts_at} to ${settings.ends_at ?? 'further notice'})` : 'Maintenance banner switched off',
    });
    revalidatePublicContent('clubSettings');
    return reply({ success: true, available: true, settings: toSettings(data as MaintenanceSettingsRow) });
  } catch {
    return reply({ success: false, error: 'The maintenance banner could not be saved.' }, 503);
  }
}
