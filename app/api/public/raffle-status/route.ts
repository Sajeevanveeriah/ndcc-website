import { NextResponse } from 'next/server';
import { isRafflePublic } from '@/lib/raffle-visibility';
import { REVERSE_RAFFLE_CAMPAIGN_CODE } from '@/lib/raffle-constants';
import { isPrizeWheelPublic } from '@/lib/prize-wheel/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [enabled, reverseEnabled, wheelEnabled] = await Promise.all([isRafflePublic(), isRafflePublic(REVERSE_RAFFLE_CAMPAIGN_CODE), isPrizeWheelPublic()]);
  return NextResponse.json({ enabled, reverseEnabled, wheelEnabled }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
