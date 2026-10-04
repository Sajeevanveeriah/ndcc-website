'use client';

import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import Card, { CardContent } from '@/components/ui/Card';
import SafeImage from '@/components/common/SafeImage';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { formatCurrency, cn } from '@/lib/utils';
import PersonalisationFields from './PersonalisationFields';
import { PRODUCT_GRADIENTS, PRODUCT_ICONS } from './productVisuals';
import type { DisplayProduct, ProductSelectionState } from './types';

function ProductImage({ product, className }: { product: DisplayProduct; className: string }) {
  const gradient = PRODUCT_GRADIENTS[product.id] || 'from-maroon-600 to-maroon-800';
  const iconData = PRODUCT_ICONS[product.id];
  if (product.image) {
    return (
      <div className={cn('relative bg-white', className)}>
        <SafeImage
          src={product.image}
          alt={product.imageAlt || product.name}
          fill
          className="object-contain p-3"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          fallback={<div className={`absolute inset-0 bg-linear-to-br ${gradient}`} aria-hidden="true" />}
        />
      </div>
    );
  }
  return (
    <div
      className={cn(`bg-linear-to-br ${gradient} flex flex-col items-center justify-center gap-2 px-4 text-center`, className)}
      role="img"
      aria-label={product.imageAlt || `Product image unavailable for ${product.name}`}
    >
      {iconData ? (
        <svg className={`w-12 h-12 ${iconData.textColor}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d={iconData.path} />
        </svg>
      ) : (
        <ImageOff className="h-8 w-8 text-white/80" aria-hidden="true" />
      )}
      <span className="text-xs font-body font-semibold text-white">Product image unavailable</span>
    </div>
  );
}

/**
 * One catalogue product. The card stays compact (image, name, price, short
 * description); options, size, personalisation and quantity open in a dialog
 * so the catalogue is not a wall of inline size buttons.
 */
export default function ProductCard({
  product,
  selection,
  displayUnitPrice,
  handleAddToOrder,
  onAdded,
}: {
  product: DisplayProduct;
  selection: ProductSelectionState;
  displayUnitPrice: (product: DisplayProduct) => number;
  handleAddToOrder: (productId: string) => boolean;
  onAdded?: (productName: string) => void;
}) {
  const {
    selectedOptions, setSelectedOptions, selectedSizes, setSelectedSizes, sizeErrors, setSizeErrors,
    quantities, setQuantities,
  } = selection;
  const [open, setOpen] = useState(false);
  const price = formatCurrency(displayUnitPrice(product));
  const groups = Array.from(new Set(product.options.map((o) => o.option_group)));
  const sizeId = `size-${product.id}`;
  const quantity = quantities[product.id] || 1;

  return (
    <Card className="product-card card-interactive flex h-full flex-col overflow-hidden">
      <ProductImage product={product} className="aspect-square w-full border-b border-edge-subtle" />
      <CardContent className="flex flex-1 flex-col gap-2 p-4">
        {product.customisable && (
          <div><Badge variant="info" className="text-xs">Customisable</Badge></div>
        )}
        <h3 className="font-display text-lg font-semibold leading-tight text-content-primary">{product.name}</h3>
        {product.description && <p className="font-body text-sm text-content-muted">{product.description}</p>}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
          <span className="font-display text-lg font-semibold tabular-nums text-content-primary">{price}</span>
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
            Choose options<span className="sr-only"> for {product.name}</span>
          </Button>
        </div>
      </CardContent>

      <Modal isOpen={open} onClose={() => setOpen(false)} title={product.name} size="lg">
        <div className="grid gap-6 sm:grid-cols-[minmax(0,14rem)_1fr]">
          <ProductImage product={product} className="aspect-square w-full rounded-xl border border-edge-subtle" />
          <div className="space-y-5">
            <p className="font-body text-content-secondary">
              <span className="font-display text-xl font-semibold tabular-nums text-content-primary">{price}</span> each
              {product.description && <span className="mt-1 block text-sm text-content-muted">{product.description}</span>}
            </p>

            {/* Option selectors (colour, sleeve length, style, ...) */}
            {groups.map((group) => {
              const values = product.options
                .filter((o) => o.option_group === group)
                .sort((a, b) => a.display_order - b.display_order);
              const current = selectedOptions[product.id]?.[group]
                ?? values.find((v) => v.is_default)?.option_value
                ?? values[0]?.option_value;
              return (
                <fieldset key={group}>
                  <legend className="form-label">{group}</legend>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`${product.name} ${group}`}>
                    {values.map((value) => (
                      <button
                        key={value.option_value}
                        type="button"
                        role="radio"
                        aria-checked={current === value.option_value}
                        className={cn(
                          'focus-ring min-h-11 rounded-full border px-4 text-sm font-body font-medium transition-colors',
                          current === value.option_value
                            ? 'border-maroon-700 bg-maroon-700 text-white'
                            : 'border-edge-strong text-content-secondary hover:border-maroon-400'
                        )}
                        onClick={() =>
                          setSelectedOptions((prev) => ({
                            ...prev,
                            [product.id]: { ...(prev[product.id] || {}), [group]: value.option_value },
                          }))
                        }
                      >
                        {value.option_label}
                        {Number(value.price_delta) > 0 && (
                          <span className="ml-1 opacity-80">+{formatCurrency(Number(value.price_delta))}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </fieldset>
              );
            })}

            {/* Size */}
            {product.sizes.length === 0 ? (
              <p className="font-body text-sm text-content-muted">No size selection required.</p>
            ) : (
              <div>
                <label htmlFor={sizeId} className="form-label">Size</label>
                <select
                  id={sizeId}
                  className="form-input min-h-11"
                  value={selectedSizes[product.id] || ''}
                  aria-invalid={sizeErrors[product.id] ? true : undefined}
                  aria-describedby={sizeErrors[product.id] ? `${sizeId}-error` : undefined}
                  onChange={(event) => {
                    const size = event.target.value;
                    setSelectedSizes((prev) => ({ ...prev, [product.id]: size }));
                    setSizeErrors((prev) => ({ ...prev, [product.id]: '' }));
                  }}
                >
                  <option value="">Choose a size</option>
                  {product.sizes.map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
                {sizeErrors[product.id] && (
                  <p id={`${sizeId}-error`} className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">{sizeErrors[product.id]}</p>
                )}
              </div>
            )}

            {/* Surname and number preferences for customisable products */}
            {product.customisable && (
              <PersonalisationFields product={product} selection={selection} />
            )}

            {/* Quantity */}
            <div>
              <p className="form-label" id={`qty-${product.id}`}>Quantity</p>
              <div className="flex items-center gap-3" role="group" aria-labelledby={`qty-${product.id}`}>
                <button
                  type="button"
                  className="h-11 w-11 rounded-full border border-edge-strong flex items-center justify-center text-content-secondary hover:bg-surface-muted transition-colors text-base focus-ring"
                  onClick={() => setQuantities((prev) => ({ ...prev, [product.id]: Math.max(1, (prev[product.id] || 1) - 1) }))}
                  aria-label="Decrease quantity"
                >
                  -
                </button>
                <output className="w-8 text-center font-body font-semibold tabular-nums text-content-primary" aria-live="polite">{quantity}</output>
                <button
                  type="button"
                  className="h-11 w-11 rounded-full border border-edge-strong flex items-center justify-center text-content-secondary hover:bg-surface-muted transition-colors text-base focus-ring"
                  onClick={() => setQuantities((prev) => ({ ...prev, [product.id]: Math.min(10, (prev[product.id] || 1) + 1) }))}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
            </div>

            <Button
              variant="primary"
              className="w-full"
              onClick={() => {
                if (handleAddToOrder(product.id)) {
                  setOpen(false);
                  onAdded?.(product.name);
                }
              }}
            >
              Add to order
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
