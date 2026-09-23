import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { getPublicRaffleCampaign } from '@/lib/raffle-visibility';
import { REVERSE_RAFFLE_CAMPAIGN_CODE } from '@/lib/raffle-constants';
import ReverseRaffleClient from './ReverseRaffleClient';

export const dynamic = 'force-dynamic';
// The root title template appends '| NDCC Dinos'.
export const metadata: Metadata = pageMetadata('/reverse-raffle', 'Reverse Raffle', 'Newcomb and District Cricket Club Reverse Raffle. Support your club.');

export default async function ReverseRafflePage() {
  const campaign = await getPublicRaffleCampaign(REVERSE_RAFFLE_CAMPAIGN_CODE);
  if (!campaign) notFound();
  return <ReverseRaffleClient priceCents={campaign.price_cents} drawLabel={campaign.draw_label} />;
}
