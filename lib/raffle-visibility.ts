import { createServerClient } from '@/lib/supabase-server';
import { isRaffleVisibleAt, type RaffleVisibilityRow } from '@/lib/raffle-visibility-rules';

export async function getPublicRaffleCampaign() {
  try {
    const { data, error } = await createServerClient().from('raffle_campaigns').select('*').eq('active', true).limit(1).maybeSingle();
    if (error || !data || !isRaffleVisibleAt(data as RaffleVisibilityRow)) return null;
    return data;
  } catch {
    return null;
  }
}

export async function isRafflePublic(): Promise<boolean> {
  return Boolean(await getPublicRaffleCampaign());
}
