import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getPublicRaffleCampaign } from '@/lib/raffle-visibility';

export const dynamic = 'force-dynamic';

export async function GET() {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const campaign = await getPublicRaffleCampaign('NDCCRRO');
    if (!campaign) return NextResponse.json({ error: 'The raffle is not currently available.' }, { status: 503, headers });
    const { data, error } = await createServerClient().rpc('reverse_raffle_unavailable_numbers');
    if (error || !Array.isArray(data)) throw new Error('Number availability unavailable');
    // Expose numbers only, never purchaser details or order identifiers.
    return NextResponse.json({ unavailable: data.map(row => row.ticket_number) }, { headers });
  } catch {
    return NextResponse.json({ error: 'Ticket availability could not be loaded. Please try again.' }, { status: 503, headers });
  }
}
