// Server-side apparel pricing.
//
// Unit prices are always recomputed from the database catalogue: base price
// plus the price_delta of every selected (or defaulted) option. Client
// prices are never trusted. All arithmetic is done in integer cents.

export type CatalogueOption = {
  option_group: string;
  option_value: string;
  option_label: string;
  price_delta: number;
  is_default: boolean;
  active: boolean;
  display_order: number;
};

export type PricedProduct = {
  slug: string;
  name: string;
  price: number;
  options?: CatalogueOption[] | null;
};

export type SelectedOptions = Record<string, string>;

export type AppliedOption = {
  group: string;
  value: string;
  label: string;
  price_delta: number;
};

export type UnitPriceResult =
  | { ok: true; unitPriceCents: number; unitPrice: number; applied: AppliedOption[] }
  | { ok: false; error: string };

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

// Computes the unit price for a product given the buyer's selected options.
//
// - Every selected group must exist on the product and reference an active
//   value in that group; anything else is rejected.
// - Groups the buyer did not select fall back to that group's default value
//   (the zero-surcharge baseline seeded with the catalogue).
export function computeUnitPrice(
  product: PricedProduct,
  selected: SelectedOptions | null | undefined
): UnitPriceResult {
  const basePriceCents = toCents(Number(product.price));
  if (!Number.isFinite(basePriceCents) || basePriceCents < 0) {
    return { ok: false, error: `Product ${product.slug} has an invalid base price.` };
  }

  const options = (product.options || []).filter((o) => o.active !== false);
  const groups = new Map<string, CatalogueOption[]>();
  for (const option of options) {
    const list = groups.get(option.option_group) || [];
    list.push(option);
    groups.set(option.option_group, list);
  }

  const selections = selected || {};
  for (const group of Object.keys(selections)) {
    if (!groups.has(group)) {
      return { ok: false, error: `Unknown option "${group}" for ${product.name}.` };
    }
  }

  const applied: AppliedOption[] = [];
  let deltaCents = 0;
  const groupNames = Array.from(groups.keys()).sort();
  for (const group of groupNames) {
    const values = groups.get(group)!;
    const selectedValue = selections[group];
    let chosen: CatalogueOption | undefined;
    if (selectedValue !== undefined) {
      chosen = values.find((v) => v.option_value === selectedValue);
      if (!chosen) {
        return { ok: false, error: `Invalid choice "${selectedValue}" for ${product.name} ${group}.` };
      }
    } else {
      chosen = values.find((v) => v.is_default) || undefined;
      // A group with no default and no selection contributes nothing.
      if (!chosen) continue;
    }
    const delta = toCents(Number(chosen.price_delta));
    if (!Number.isFinite(delta)) {
      return { ok: false, error: `Option ${group}/${chosen.option_value} on ${product.slug} has an invalid price delta.` };
    }
    deltaCents += delta;
    applied.push({
      group,
      value: chosen.option_value,
      label: chosen.option_label,
      price_delta: fromCents(delta),
    });
  }

  const unitPriceCents = basePriceCents + deltaCents;
  if (unitPriceCents <= 0) {
    return { ok: false, error: `Computed price for ${product.name} is not positive.` };
  }
  return { ok: true, unitPriceCents, unitPrice: fromCents(unitPriceCents), applied };
}
