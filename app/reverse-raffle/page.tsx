import { notFound } from 'next/navigation';
import { getPublicRaffleCampaign } from '@/lib/raffle-visibility';
import { REVERSE_RAFFLE_CAMPAIGN_CODE } from '@/lib/raffle-constants';
import ReverseRaffleClient from './ReverseRaffleClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reverse Raffle | Newcomb & District Cricket Club' };

export default async function ReverseRafflePage() {
  const campaign = await getPublicRaffleCampaign(REVERSE_RAFFLE_CAMPAIGN_CODE);
  if (!campaign) notFound();
  return <ReverseRaffleClient priceCents={campaign.price_cents} drawLabel={campaign.draw_label} />;
}
