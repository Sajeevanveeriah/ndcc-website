import { cache } from 'react';
import { createServerClient } from '@/lib/supabase-server';
import { isRaffleVisibleAt, type RaffleVisibilityRow } from '@/lib/raffle-visibility-rules';
import { RAFFLE_CAMPAIGN_CODE } from '@/lib/raffle-constants';

async function getPublicRaffleCampaignUncached(code: string = RAFFLE_CAMPAIGN_CODE) {
  try {
    const { data, error } = await createServerClient().from('raffle_campaigns').select('*').eq('active', true).eq('code', code).limit(1).maybeSingle();
    if (error || !data || !isRaffleVisibleAt(data as RaffleVisibilityRow)) return null;
    return data;
  } catch {
    return null;
  }
}

export async function isRafflePublic(code: string = RAFFLE_CAMPAIGN_CODE): Promise<boolean> {
  return Boolean(await getPublicRaffleCampaign(code));
}

// Request-scoped deduplication for navigation, footer and page sections.
export const getPublicRaffleCampaign = cache(getPublicRaffleCampaignUncached);
