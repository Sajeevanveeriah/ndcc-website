import { NextResponse } from 'next/server';
import { isRafflePublic } from '@/lib/raffle-visibility';
import { REVERSE_RAFFLE_CAMPAIGN_CODE } from '@/lib/raffle-constants';
import { isPrizeWheelPublic } from '@/lib/prize-wheel/server';
import { isSpinWheelPublic } from '@/lib/spin-wheel/visibility';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [enabled, reverseEnabled, wheelEnabled, spinEnabled] = await Promise.all([isRafflePublic(), isRafflePublic(REVERSE_RAFFLE_CAMPAIGN_CODE), isPrizeWheelPublic(), isSpinWheelPublic()]);
  return NextResponse.json({ enabled, reverseEnabled, wheelEnabled, spinEnabled }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
