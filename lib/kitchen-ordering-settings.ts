import { createServerClient } from '@/lib/supabase-server';
import { DEFAULT_KITCHEN_SETTINGS, getKitchenOrderWindow, validKitchenSettings } from '@/lib/kitchen-order-window';
export async function readKitchenOrderingSettings() {
  const { data, error } = await createServerClient().from('kitchen_ordering_settings').select('enabled,open_day,open_time,close_day,close_time').eq('id', true).single();
  if (error || !validKitchenSettings(data)) throw new Error('Could not load kitchen ordering settings.');
  return data;
}
export async function getLiveKitchenOrderWindow() {
  try { return getKitchenOrderWindow(new Date(), await readKitchenOrderingSettings()); }
  catch { return getKitchenOrderWindow(new Date(), DEFAULT_KITCHEN_SETTINGS); }
}
