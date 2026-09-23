import { NextResponse } from 'next/server';
import { isRafflePublic } from '@/lib/raffle-visibility';
import { REVERSE_RAFFLE_CAMPAIGN_CODE } from '@/lib/raffle-constants';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [enabled, reverseEnabled] = await Promise.all([isRafflePublic(), isRafflePublic(REVERSE_RAFFLE_CAMPAIGN_CODE)]);
  return NextResponse.json({ enabled, reverseEnabled }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
