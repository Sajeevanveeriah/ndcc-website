import { cache } from 'react';
import { createServerClient } from '@/lib/supabase-server';
import { isRaffleVisibleAt, type RaffleVisibilityRow } from '@/lib/raffle-visibility-rules';

async function getPublicRaffleCampaignUncached(code = 'NDCCRAF') {
  try {
    const { data, error } = await createServerClient().from('raffle_campaigns').select('*').eq('active', true).eq('code', code).limit(1).maybeSingle();
    if (error || !data || !isRaffleVisibleAt(data as RaffleVisibilityRow)) return null;
    return data;
  } catch {
    return null;
  }
}

export async function isRafflePublic(code = 'NDCCRAF'): Promise<boolean> {
  return Boolean(await getPublicRaffleCampaign(code));
}

// Request-scoped deduplication for navigation, footer and page sections.
export const getPublicRaffleCampaign = cache(getPublicRaffleCampaignUncached);
