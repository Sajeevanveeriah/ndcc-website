import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getPublicWheelCampaign, loadWheelUnavailableNumbers } from '@/lib/prize-wheel/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const campaign = await getPublicWheelCampaign();
    if (!campaign) return NextResponse.json({ error: 'The prize wheel is not currently available.' }, { status: 503, headers });
    const unavailable = await loadWheelUnavailableNumbers(createServerClient(), campaign.id);
    if (!unavailable) throw new Error('Number availability unavailable');
    // Expose numbers only, never purchaser details or order identifiers.
    return NextResponse.json({ code: campaign.code, divisions: campaign.wheel_divisions, unavailable }, { headers });
  } catch {
    return NextResponse.json({ error: 'Ticket availability could not be loaded. Please try again.' }, { status: 503, headers });
  }
}
