import 'server-only';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';
import { DEFAULT_POT_CLUB_PRODUCT_CODE, resolvePotClubProductCode } from '@/lib/pot-club';

/** The admin-selected Pot Club product code, or the original code when unset or unavailable. */
export async function getPotClubProductCode(): Promise<string> {
  if (!isServerSupabaseConfigured()) return DEFAULT_POT_CLUB_PRODUCT_CODE;
  try {
    const { data, error } = await createServerClient({ publicReadCache: true, fetchTimeoutMs: 8_000 })
      .from('club_settings')
      .select('pot_club_product_code')
      .eq('id', 'default')
      .maybeSingle();
    if (error) return DEFAULT_POT_CLUB_PRODUCT_CODE;
    return resolvePotClubProductCode((data as { pot_club_product_code?: unknown } | null)?.pot_club_product_code);
  } catch {
    return DEFAULT_POT_CLUB_PRODUCT_CODE;
  }
}
