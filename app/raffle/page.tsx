import { notFound } from 'next/navigation';
import { isRafflePublic } from '@/lib/raffle-visibility';
import RaffleClient from './RaffleClient';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { RAFFLE_CAMPAIGN_CODE, RAFFLE_FALLBACK_DISPLAY } from '@/lib/raffle-constants';

export const dynamic = 'force-dynamic';

const RAFFLE_NAME = RAFFLE_FALLBACK_DISPLAY[RAFFLE_CAMPAIGN_CODE].name;
// Metadata only while the raffle is public, so a hidden raffle's 404 does not
// carry the raffle's title or canonical URL.
export async function generateMetadata(): Promise<Metadata> {
  if (!(await isRafflePublic())) return {};
  return pageMetadata('/raffle', RAFFLE_NAME, `Buy ${RAFFLE_NAME} tickets online. Support the Dinos and be in the draw.`);
}

export default async function RafflePage() {
  if (!(await isRafflePublic())) notFound();
  return <RaffleClient />;
}
