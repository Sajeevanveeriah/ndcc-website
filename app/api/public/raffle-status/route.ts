import { NextResponse } from 'next/server';
import { isRafflePublic } from '@/lib/raffle-visibility';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ enabled: await isRafflePublic() }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
