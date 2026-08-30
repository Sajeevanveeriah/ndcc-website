import { NextResponse } from 'next/server';
import { createServerClient, isServerSupabaseConfigured } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const LEGACY_COLUMNS = 'id,slug,name,description,price,sizes,image_url,customisable,category,display_order,order_guidance,size_guidance';
const PAYMENT_COLUMNS = ['payment_mode', 'stripe_price_id', 'checkout_enabled', 'fulfilment_notes', 'order_email'] as const;
const COLUMNS_WITH_PAYMENT = `${LEGACY_COLUMNS},image_alt,${PAYMENT_COLUMNS.join(',')}`;

// The payment columns ship in migration 20260706_apparel_payment_readiness.sql
// and image_alt in 20260716040000_apparel_product_options.sql. Until they are
// applied the select above fails with a missing-column message, so fall back
// to the legacy column list (pattern: lib/public-news.ts
// isMissingImageUrlColumn) rather than 500ing the public merch page.
function isMissingKnownColumn(message?: string) {
  if (!message) return false;
  return message.includes('column')
    && (PAYMENT_COLUMNS.some((column) => message.includes(column)) || message.includes('image_alt'));
}

type ProductRow = { id: string } & Record<string, unknown>;

async function attachOptions(supabase: ReturnType<typeof createServerClient>, products: ProductRow[]) {
  if (products.length === 0) return products;
  const { data: options, error } = await supabase
    .from('apparel_product_options')
    .select('product_id,option_group,option_value,option_label,price_delta,is_default,active,display_order')
    .eq('active', true)
    .in('product_id', products.map((p) => p.id))
    .order('option_group', { ascending: true })
    .order('display_order', { ascending: true });

  // Options table may not exist until 20260716040000 is applied; the page
  // degrades to option-less products rather than failing.
  if (error) return products.map((p) => ({ ...p, options: [] }));

  const byProduct = new Map<string, unknown[]>();
  for (const option of options || []) {
    const list = byProduct.get(option.product_id) || [];
    const optionFields: Record<string, unknown> = { ...option };
    delete optionFields.product_id;
    list.push(optionFields);
    byProduct.set(option.product_id, list);
  }
  return products.map((p) => ({ ...p, options: byProduct.get(p.id) || [] }));
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

  if (initial.error && isMissingKnownColumn(initial.error.message)) {
    const fallback = await supabase
      .from('apparel_products')
      .select(LEGACY_COLUMNS)
      .eq('active', true)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (fallback.error) return NextResponse.json({ success: false, error: fallback.error.message }, { status: 500 });
    const withOptions = await attachOptions(supabase, (fallback.data ?? []) as ProductRow[]);
    return NextResponse.json({ success: true, data: withOptions }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (initial.error) return NextResponse.json({ success: false, error: initial.error.message }, { status: 500 });
  const withOptions = await attachOptions(supabase, (initial.data ?? []) as unknown as ProductRow[]);
  return NextResponse.json({ success: true, data: withOptions }, { headers: { 'Cache-Control': 'no-store' } });
}
