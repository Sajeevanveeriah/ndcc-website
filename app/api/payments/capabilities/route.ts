import { NextResponse } from 'next/server';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';
import { deriveCapabilities, DEFAULT_SETTINGS, loadMerchPaymentSettings } from '@/lib/payments/capabilities';

export const dynamic = 'force-dynamic';

// Public, secret-free payment capability data for the merchandise page.
export async function GET() {
  if (!isServerSupabaseConfigured()) {
    return NextResponse.json({ success: true, data: deriveCapabilities(DEFAULT_SETTINGS) });
  }
  const settings = await loadMerchPaymentSettings(createServerClient());
  return NextResponse.json(
    { success: true, data: deriveCapabilities(settings) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
