// Server-only catalogue loading + order-item pricing.
//
// Both order endpoints (bank transfer and Stripe checkout) go through
// priceOrderItems so every accepted order stores server-verified unit
// prices, applied option surcharges and a server-computed total.

import { computeUnitPrice, fromCents, type CatalogueOption } from '@/lib/apparel/pricing';
import { validatePersonalisation } from '@/lib/apparel/personalisation';

export type PostedOrderItem = {
  slug?: string;
  name?: string;
  size?: string;
  quantity?: number;
  price?: number;
  options?: Record<string, string>;
  custom_name?: string;
  custom_number?: number;
  alternate_number?: number;
  number_request_status?: 'subject_to_availability';
  personalisation_confirmed?: boolean;
};

export type ServerCatalogueProduct = {
  id: string;
  slug: string;
  name: string;
  price: number;
  active: boolean;
  sizes: string[];
  customisable: boolean;
  options: CatalogueOption[];
};

// Minimal structural type covering the supabase-js query-builder calls used
// below. The caller passes the real service-role client; it is accepted as
// unknown and narrowed here so TypeScript does not try to unify the full
// SupabaseClient generics with this reduced shape (which blows the
// instantiation depth limit).
type QueryResult = PromiseLike<{ data: unknown; error: { message: string } | null }>;
type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => QueryResult;
    };
  };
};

export async function loadPricedCatalogue(client: unknown): Promise<
  { ok: true; products: ServerCatalogueProduct[] } | { ok: false; error: string }
> {
  const supabase = client as SupabaseLike;
  const { data: products, error } = await supabase
    .from('apparel_products')
    .select('id,slug,name,price,active,sizes,customisable')
    .eq('active', true);
  if (error || !products) {
    return { ok: false, error: error?.message || 'catalogue unavailable' };
  }

  let optionRows: Array<CatalogueOption & { product_id: string }> = [];
  const { data: options, error: optionsError } = await supabase
    .from('apparel_product_options')
    .select('product_id,option_group,option_value,option_label,price_delta,is_default,active,display_order')
    .eq('active', true);
  // A missing options table (migration not yet applied) degrades to
  // option-less pricing rather than blocking orders.
  if (!optionsError && Array.isArray(options)) {
    optionRows = options as Array<CatalogueOption & { product_id: string }>;
  }

  const byProduct = new Map<string, CatalogueOption[]>();
  for (const row of optionRows) {
    const list = byProduct.get(row.product_id) || [];
    list.push(row);
    byProduct.set(row.product_id, list);
  }

  return {
    ok: true,
    products: (products as Array<{
      id: string; slug: string; name: string; price: number; active: boolean;
      sizes: string[] | null; customisable: boolean;
    }>).map((p) => ({
      ...p,
      price: Number(p.price),
      sizes: Array.isArray(p.sizes) ? p.sizes : [],
      customisable: Boolean(p.customisable),
      options: byProduct.get(p.id) || [],
    })),
  };
}

export type PricedItemsResult =
  | {
      ok: true;
      items: Array<PostedOrderItem & {
        name: string;
        quantity: number;
        price: number;
        base_price: number;
        applied_options?: Array<{ group: string; value: string; label: string; price_delta: number }>;
      }>;
      totalAmount: number;
      clientPriceMismatches: string[];
    }
  | { ok: false; error: string };

export function priceOrderItems(
  products: ServerCatalogueProduct[],
  items: PostedOrderItem[],
  { maxQuantity = 50 }: { maxQuantity?: number } = {}
): PricedItemsResult {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'Order must contain at least one item.' };
  }

  const mismatches: string[] = [];
  const pricedItems: Array<PostedOrderItem & {
    name: string; quantity: number; price: number; base_price: number;
    applied_options?: Array<{ group: string; value: string; label: string; price_delta: number }>;
  }> = [];
  let totalCents = 0;

  for (const rawItem of items) {
    const bySlug = rawItem.slug ? products.find((p) => p.slug === rawItem.slug) : undefined;
    const match = bySlug || products.find((p) => p.name === rawItem.name);
    if (!match) {
      return { ok: false, error: `Unknown product in order: ${String(rawItem.name || rawItem.slug || 'unnamed item')}` };
    }

    const quantity = Number(rawItem.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > maxQuantity) {
      return { ok: false, error: `Invalid quantity for ${match.name}.` };
    }

    const size = typeof rawItem.size === 'string' ? rawItem.size.trim() : '';
    const allowedSizes = match.sizes.length > 0 ? match.sizes : ['One Size'];
    if (!size || !allowedSizes.includes(size)) {
      return { ok: false, error: `Choose a valid size for ${match.name}.` };
    }

    const hasPostedPersonalisation = Boolean(
      rawItem.custom_name || rawItem.custom_number !== undefined || rawItem.alternate_number !== undefined
      || rawItem.personalisation_confirmed
    );
    if (!match.customisable && hasPostedPersonalisation) {
      return { ok: false, error: `Personalisation is not available for ${match.name}.` };
    }
    const personalisation = validatePersonalisation(match.customisable ? rawItem : {});
    if (!personalisation.ok) {
      return { ok: false, error: `${match.name}: ${personalisation.error}` };
    }

    const priced = computeUnitPrice(match, rawItem.options);
    if (!priced.ok) {
      return { ok: false, error: priced.error };
    }

    if (typeof rawItem.price === 'number' && Math.abs(rawItem.price - priced.unitPrice) > 0.005) {
      mismatches.push(
        `"${match.name}": client $${Number(rawItem.price).toFixed(2)}, server $${priced.unitPrice.toFixed(2)}`
      );
    }

    totalCents += priced.unitPriceCents * quantity;
    const safeRawItem = { ...rawItem };
    delete safeRawItem.custom_name;
    delete safeRawItem.custom_number;
    delete safeRawItem.alternate_number;
    delete safeRawItem.number_request_status;
    delete safeRawItem.personalisation_confirmed;
    pricedItems.push({
      ...safeRawItem,
      name: match.name,
      slug: match.slug,
      size,
      quantity,
      price: priced.unitPrice,
      base_price: Number(match.price),
      ...personalisation.value,
      ...(priced.applied.length > 0 ? { applied_options: priced.applied } : {}),
    });
  }

  const totalAmount = fromCents(totalCents);
  if (totalAmount <= 0) {
    return { ok: false, error: 'Order total must be greater than zero.' };
  }

  return { ok: true, items: pricedItems, totalAmount, clientPriceMismatches: mismatches };
}
