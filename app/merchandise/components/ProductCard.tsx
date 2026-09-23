'use client';

import { ImageOff } from 'lucide-react';
import Card, { CardContent, CardFooter } from '@/components/ui/Card';
import SafeImage from '@/components/common/SafeImage';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { formatCurrency, cn } from '@/lib/utils';
import PersonalisationFields from './PersonalisationFields';
import { PRODUCT_GRADIENTS, PRODUCT_ICONS } from './productVisuals';
import type { DisplayProduct, ProductSelectionState } from './types';

/** One catalogue product: image, price, options, size, personalisation, quantity and add-to-order. */
export default function ProductCard({
  product,
  selection,
  displayUnitPrice,
  handleAddToOrder,
}: {
  product: DisplayProduct;
  selection: ProductSelectionState;
  displayUnitPrice: (product: DisplayProduct) => number;
  handleAddToOrder: (productId: string) => void;
}) {
  const {
    selectedOptions, setSelectedOptions, selectedSizes, setSelectedSizes, sizeErrors, setSizeErrors,
    quantities, setQuantities,
  } = selection;
                  const gradient = PRODUCT_GRADIENTS[product.id] || 'from-maroon-600 to-maroon-800';
                  const iconData = PRODUCT_ICONS[product.id];
                  return (
                    <Card className="product-card hover-lift">
                  {product.image ? (
                    <div className="relative h-56 bg-surface-page">
                      <SafeImage
                        src={product.image}
                        alt={product.imageAlt || product.name}
                        fill
                        className="object-contain"
                        sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        fallback={<div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} aria-hidden="true" />}
                      />
                    </div>
                  ) : (
                    <div
                      className={`h-36 bg-gradient-to-br ${gradient} flex flex-col items-center justify-center gap-2 px-4 text-center`}
                      role="img"
                      aria-label={product.imageAlt || `Product image unavailable for ${product.name}`}
                    >
                      {iconData ? (
                        <svg className={`w-12 h-12 ${iconData.textColor}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d={iconData.path} />
                        </svg>
                      ) : (
                        <ImageOff className="h-8 w-8 text-white/80" aria-hidden="true" />
                      )}
                      <span className="text-xs font-body font-semibold text-white">Product image unavailable</span>
                    </div>
                  )}
                  <CardContent className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display font-bold text-content-primary text-2xl leading-tight">
                        {product.name}
                      </h3>
                      <Badge variant="default" className="flex-shrink-0">{formatCurrency(displayUnitPrice(product))}</Badge>
                    </div>
                    <p className="font-body text-content-muted text-xs">{product.description}</p>

                    {product.customisable && (
                      <Badge variant="info" className="text-xs">Customisable</Badge>
                    )}

                    <details className="club-disclosure"><summary>Choose options for {product.name}</summary><div className="product-options">
                    {/* Option selectors (colour, sleeve length, style, ...) */}
                    {Array.from(new Set(product.options.map((o) => o.option_group))).map((group) => {
                      const values = product.options
                        .filter((o) => o.option_group === group)
                        .sort((a, b) => a.display_order - b.display_order);
                      const current = selectedOptions[product.id]?.[group]
                        ?? values.find((v) => v.is_default)?.option_value
                        ?? values[0]?.option_value;
                      return (
                        <fieldset key={group}>
                          <legend className="form-label text-xs">{group}</legend>
                          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`${product.name} ${group}`}>
                            {values.map((value) => (
                              <button
                                key={value.option_value}
                                type="button"
                                role="radio"
                                aria-checked={current === value.option_value}
                                className={cn(
                                  'focus-ring px-2.5 py-1 rounded-lg border text-xs font-body font-medium transition-colors',
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

                    {/* Size Selector */}
                    <div>
                      <p className="form-label text-xs">Size</p>
                      {product.sizes.length === 0 ? (
                        <p className="text-xs text-content-muted">No size selection required.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {product.sizes.map((size) => (
                            <button
                              key={size}
                              type="button"
                              className={cn(
                                'px-2.5 py-1 rounded-lg border text-xs font-body font-medium transition-colors',
                                selectedSizes[product.id] === size
                                  ? 'border-maroon-700 bg-maroon-700 text-white'
                                  : 'border-edge-strong text-content-secondary hover:border-maroon-400'
                              )}
                              onClick={() => {
                                setSelectedSizes((prev) => ({ ...prev, [product.id]: size }));
                                setSizeErrors((prev) => ({ ...prev, [product.id]: '' }));
                              }}
                              aria-pressed={selectedSizes[product.id] === size}
                            >
                              {size}
                            </button>
                          ))}
                        </div>
                      )}
                      {sizeErrors[product.id] && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{sizeErrors[product.id]}</p>
                      )}
                    </div>

                    {/* Surname and number preferences for customisable products */}
                    {product.customisable && (
                      <PersonalisationFields product={product} selection={selection} />
                    )}

                    {/* Quantity Selector */}
                    <div>
                      <p className="form-label text-xs">Quantity</p>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          className="h-11 w-11 rounded-lg border border-edge-strong flex items-center justify-center text-content-secondary hover:bg-surface-muted transition-colors text-base focus-ring"
                          onClick={() =>
                            setQuantities((prev) => ({
                              ...prev,
                              [product.id]: Math.max(1, (prev[product.id] || 1) - 1),
                            }))
                          }
                          aria-label="Decrease quantity"
                        >
                          -
                        </button>
                        <span className="font-body font-semibold text-content-primary w-6 text-center text-sm">
                          {quantities[product.id] || 1}
                        </span>
                        <button
                          type="button"
                          className="h-11 w-11 rounded-lg border border-edge-strong flex items-center justify-center text-content-secondary hover:bg-surface-muted transition-colors text-base focus-ring"
                          onClick={() =>
                            setQuantities((prev) => ({
                              ...prev,
                              [product.id]: Math.min(10, (prev[product.id] || 1) + 1),
                            }))
                          }
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    </div></details>
                  </CardContent>
                  <CardFooter className="space-y-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={(event) => {
                        const options = event.currentTarget.closest('.product-card')?.querySelector('details');
                        if (options) options.open = true;
                        handleAddToOrder(product.id);
                      }}
                      className="w-full"
                    >
                      Add to Order
                    </Button>
                  </CardFooter>
                    </Card>
  );
}
