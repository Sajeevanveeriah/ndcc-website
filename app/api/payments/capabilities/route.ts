import { NextResponse } from 'next/server';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';
import { bankTransferProduct, deriveCapabilities, DEFAULT_SETTINGS, loadMerchPaymentSettings } from '@/lib/payments/capabilities';

export const dynamic = 'force-dynamic';

// Public, secret-free payment capability data. An optional ?product= (raffle,
// reverse_raffle, dino, donation) applies that product's bank deposit switch;
// without it the general (merchandise) capability is returned as before.
export async function GET(request: Request) {
  let product: ReturnType<typeof bankTransferProduct>;
  try { product = bankTransferProduct(new URL(request.url).searchParams.get('product')); } catch { product = undefined; }
  if (!isServerSupabaseConfigured()) {
    return NextResponse.json({ success: true, data: deriveCapabilities({ ...DEFAULT_SETTINGS, bank_transfer_enabled: false }, product) });
  }
  const settings = await loadMerchPaymentSettings(createServerClient());
  return NextResponse.json(
    { success: true, data: deriveCapabilities(settings, product) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
