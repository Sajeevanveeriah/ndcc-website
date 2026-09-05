import { NextResponse } from 'next/server';
import { getClubSettings } from '@/lib/club-settings';
import { createServerClient } from '@/lib/supabase-server';
import { generateUniquePaymentReference } from '@/lib/payments/reference';
import { deriveCapabilities, loadMerchPaymentSettings } from '@/lib/payments/capabilities';
import { enforceHoneypotAndTiming, enforceRateLimit, getClientIp } from '@/lib/server/request-guards';
import { readLimitedJsonObject } from '@/lib/order-input-validation';
import { validateDonationInput } from '@/lib/donation-input';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!enforceRateLimit(`donation:${getClientIp(request)}`, 6, 60_000)) {
      return NextResponse.json({ error: 'Please wait a minute before trying again.' }, { status: 429 });
    }
    if (!(await getClubSettings()).donations_enabled) {
      return NextResponse.json({ error: 'Donations are currently unavailable.' }, { status: 404 });
    }
    const parsed = await readLimitedJsonObject(request, 4096);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const input = validateDonationInput(parsed.value);
    if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });
    if (!enforceHoneypotAndTiming(parsed.value.hp_field as string, parsed.value.submitted_at as number)) {
      return NextResponse.json({ error: 'Please refresh the page and try again.' }, { status: 400 });
    }
    const supabase = createServerClient();
    const settings = await loadMerchPaymentSettings(supabase);
    if (!deriveCapabilities(settings).card) return NextResponse.json({ error: 'Online payments are currently unavailable.' }, { status: 503 });
    // Keep the established general-payment reference contract; the dedicated
    // order category identifies donations in Stripe metadata and ledger exports.
    const reference = await generateUniquePaymentReference('general');
    const { data, error } = await supabase.from('orders').insert({
      customer_name: input.name, customer_email: input.email, customer_phone: '',
      items: [{ name: 'Club donation', quantity: 1, price: input.amount }],
      total_amount: input.amount, order_category: 'donation', order_status: 'submitted',
      payment_status: 'pending_bank_transfer', payment_reference: reference, processed: false,
    }).select('id').single();
    if (error || !data) throw new Error('Donation order could not be created.');
    return NextResponse.json({ success: true, order_id: data.id }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Unable to start your donation. Please try again shortly.' }, { status: 503 });
  }
}
