import { NextResponse } from 'next/server';
import { isRafflePublic } from '@/lib/raffle-visibility';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [enabled, reverseEnabled] = await Promise.all([isRafflePublic(), isRafflePublic('NDCCRRO')]);
  return NextResponse.json({ enabled, reverseEnabled }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
