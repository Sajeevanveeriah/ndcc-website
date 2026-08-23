import { notFound } from 'next/navigation';
import { isRafflePublic } from '@/lib/raffle-visibility';
import RaffleClient from './RaffleClient';

export const dynamic = 'force-dynamic';

export default async function RafflePage() {
  if (!(await isRafflePublic())) notFound();
  return <RaffleClient />;
}
