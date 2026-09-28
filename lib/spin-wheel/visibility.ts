import 'server-only';
import { cache } from 'react';
import { createServerClient } from '@/lib/supabase-server';
import { isMissingSchemaError } from '@/lib/supabase-schema-errors';
import { choosePublicSpinWheel, type SpinWheelRow } from '@/lib/spin-wheel/rules';

// Public visibility for navigation, sitemap and the page. Kept light (no email
// or auth imports). Every read degrades to "no wheel" when the Spin the Wheel
// migration is not applied yet, so the rest of the site keeps working.

export const SPIN_WHEEL_COLUMNS = 'id,name,description,status,starts_at,ends_at,free_spins_per_account,spin_price_cents,max_spins_per_order,max_spins_per_day,claim_instructions,public_visibility_mode,public_opens_at,created_at,updated_at';

// The CMS show/hide switch (club_settings.spin_wheel_enabled). Only an
// explicit false hides the feature: a missing column (migration not applied
// yet) or missing row keeps the existing per-wheel visibility.
async function readSpinWheelSwitch(): Promise<{ enabled: boolean; error: boolean }> {
  const { data, error } = await createServerClient().from('club_settings').select('spin_wheel_enabled').eq('id', 'default').maybeSingle();
  if (error) return { enabled: true, error: !isMissingSchemaError(error) };
  return { enabled: (data as { spin_wheel_enabled?: unknown } | null)?.spin_wheel_enabled !== false, error: false };
}

async function getSpinWheelEnabledUncached(): Promise<boolean> {
  try {
    const setting = await readSpinWheelSwitch();
    // A failed read fails closed like the wheel query below.
    return setting.enabled && !setting.error;
  } catch {
    return false;
  }
}

// The CMS switch alone, request-scoped. Admin screens read it through their own API.
const isSpinWheelEnabled = cache(getSpinWheelEnabledUncached);

async function getPublicSpinWheelUncached(): Promise<SpinWheelRow | null> {
  try {
    const [enabled, { data, error }] = await Promise.all([
      isSpinWheelEnabled(),
      createServerClient().from('spin_wheels').select(SPIN_WHEEL_COLUMNS).in('status', ['live', 'paused']),
    ]);
    if (!enabled || error || !Array.isArray(data)) return null;
    return choosePublicSpinWheel(data as SpinWheelRow[]);
  } catch {
    return null;
  }
}

// Request-scoped deduplication for navigation, sitemap and the page itself.
export const getPublicSpinWheel = cache(getPublicSpinWheelUncached);

export async function isSpinWheelPublic(): Promise<boolean> {
  return Boolean(await getPublicSpinWheel());
}

/** Sitemap variant: throws on a failed read so an outage is never cached as "no wheel". */
export async function isSpinWheelPublicStrict(): Promise<boolean> {
  const setting = await readSpinWheelSwitch();
  if (setting.error) throw new Error('Spin the Wheel visibility unavailable');
  if (!setting.enabled) return false;
  const { data, error } = await createServerClient().from('spin_wheels').select(SPIN_WHEEL_COLUMNS).in('status', ['live', 'paused']);
  if (error && isMissingSchemaError(error)) return false;
  if (error || !Array.isArray(data)) throw new Error('Spin the Wheel visibility unavailable');
  return Boolean(choosePublicSpinWheel(data as SpinWheelRow[]));
}
