import { NextResponse } from 'next/server';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const LEGACY_COLUMNS = 'id,slug,name,description,price,sizes,image_url,customisable,category,display_order,order_guidance,size_guidance';
const PAYMENT_COLUMNS = ['payment_mode', 'payment_link_url', 'stripe_price_id', 'checkout_enabled', 'fulfilment_notes', 'order_email'] as const;
const COLUMNS_WITH_PAYMENT = `${LEGACY_COLUMNS},${PAYMENT_COLUMNS.join(',')}`;

// The payment columns ship in migration 20260706_apparel_payment_readiness.sql.
// Until it is applied the select above fails with a missing-column message, so
// fall back to the legacy column list (pattern: lib/public-news.ts
// isMissingImageUrlColumn) rather than 500ing the public merch page.
function isMissingPaymentColumn(message?: string) {
  if (!message) return false;
  return message.includes('column') && PAYMENT_COLUMNS.some((column) => message.includes(column));
}

export async function GET() {
  if (!isServerSupabaseConfigured()) return NextResponse.json({ success: true, data: [] });
  const supabase = createServerClient();

  const initial = await supabase
    .from('apparel_products')
    .select(COLUMNS_WITH_PAYMENT)
    .eq('active', true)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  if (initial.error && isMissingPaymentColumn(initial.error.message)) {
    const fallback = await supabase
      .from('apparel_products')
      .select(LEGACY_COLUMNS)
      .eq('active', true)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (fallback.error) return NextResponse.json({ success: false, error: fallback.error.message }, { status: 500 });
    return NextResponse.json({ success: true, data: fallback.data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (initial.error) return NextResponse.json({ success: false, error: initial.error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: initial.data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}
