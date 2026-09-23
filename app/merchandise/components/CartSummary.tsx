'use client';

import Card from '@/components/ui/Card';
import { formatCurrency } from '@/lib/utils';
import type { CartItem } from './types';

/** Cart line items with quantity controls, removal and the order total. */
export default function CartSummary({
  cart,
  cartTotal,
  updateCartQuantity,
  handleRemoveFromCart,
}: {
  cart: CartItem[];
  cartTotal: number;
  updateCartQuantity: (index: number, delta: number) => void;
  handleRemoveFromCart: (index: number) => void;
}) {
  return (
              <Card className="mb-8">
                <div className="divide-y divide-edge-subtle">
                  {cart.map((item, idx) => (
                    <div key={`${item.id}-${item.size}-${item.custom_name || ''}-${idx}`} className="px-6 py-4 flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-body font-semibold text-content-primary">{item.name}</p>
                        <p className="font-body text-sm text-content-muted">
                          Size: {item.size} · {formatCurrency(item.price)} each
                        </p>
                        {item.option_labels?.map((label) => (
                          <p key={label} className="font-body text-xs text-content-muted">{label}</p>
                        ))}
                        {item.custom_name && (
                          <p className="font-body text-xs text-maroon-700 dark:text-maroon-200">Surname: {item.custom_name}</p>
                        )}
                        {item.custom_number !== undefined && (
                          <p className="font-body text-xs text-maroon-700 dark:text-maroon-200">
                            Number preferences: {item.custom_number}{item.alternate_number !== undefined ? `, ${item.alternate_number}` : ''} (subject to availability)
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="w-7 h-7 rounded border border-edge-strong flex items-center justify-center text-content-muted hover:bg-surface-muted text-sm transition-colors"
                            onClick={() => updateCartQuantity(idx, -1)}
                            aria-label={`Decrease ${item.name} quantity`}
                          >
                            -
                          </button>
                          <span className="font-body font-semibold w-6 text-center text-sm">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            className="w-7 h-7 rounded border border-edge-strong flex items-center justify-center text-content-muted hover:bg-surface-muted text-sm transition-colors"
                            onClick={() => updateCartQuantity(idx, 1)}
                            aria-label={`Increase ${item.name} quantity`}
                          >
                            +
                          </button>
                        </div>
                        <span className="font-body font-semibold text-content-primary w-20 text-right">
                          {formatCurrency(item.price * item.quantity)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveFromCart(idx)}
                          className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors p-1"
                          aria-label={`Remove ${item.name} from order`}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-6 py-4 bg-maroon-50 dark:bg-maroon-950 border-t border-maroon-100 flex items-center justify-between">
                  <span className="font-display font-bold text-maroon-800 dark:text-maroon-200 text-lg">Total</span>
                  <span className="font-display font-bold text-maroon-800 dark:text-maroon-200 text-xl">
                    {formatCurrency(cartTotal)}
                  </span>
                </div>
              </Card>
  );
}
