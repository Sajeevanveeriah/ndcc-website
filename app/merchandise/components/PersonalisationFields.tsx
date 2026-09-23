'use client';

import type { DisplayProduct, ProductSelectionState } from './types';

/** Surname and number preference fields for customisable products. */
export default function PersonalisationFields({
  product,
  selection,
}: {
  product: DisplayProduct;
  selection: ProductSelectionState;
}) {
  const {
    customNames, setCustomNames, customNumbers, setCustomNumbers, alternateNumbers, setAlternateNumbers,
    personalisationConfirmed, setPersonalisationConfirmed, personalisationErrors, setPersonalisationErrors,
  } = selection;
  return (
                      <div className="space-y-2">
                        <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                          Surname only. Nicknames will not be accepted. Both number preferences are requests and remain subject to availability and club confirmation.
                        </p>
                        <div>
                          <label htmlFor={`custom-name-${product.id}`} className="form-label text-xs">Surname (optional)</label>
                          <input
                            id={`custom-name-${product.id}`}
                            type="text"
                            className="w-full px-3 py-1.5 border border-edge-strong rounded-lg text-sm font-body focus:border-maroon-500 focus:ring-1 focus:ring-maroon-500 outline-none"
                            placeholder="e.g. SMITH"
                            maxLength={40}
                            value={customNames[product.id] || ''}
                            onChange={(e) => {
                              setCustomNames((prev) => ({ ...prev, [product.id]: e.target.value }));
                              setPersonalisationErrors((prev) => ({ ...prev, [product.id]: '' }));
                            }}
                          />
                        </div>
                        <div>
                          <label htmlFor={`custom-number-${product.id}`} className="form-label text-xs">First number preference (optional)</label>
                          <input
                            id={`custom-number-${product.id}`}
                            type="number"
                            min={1}
                            max={99}
                            className="w-full px-3 py-1.5 border border-edge-strong rounded-lg text-sm font-body focus:border-maroon-500 focus:ring-1 focus:ring-maroon-500 outline-none"
                            placeholder="1-99"
                            value={customNumbers[product.id] || ''}
                            onChange={(e) => {
                              setCustomNumbers((prev) => ({ ...prev, [product.id]: e.target.value }));
                              setPersonalisationErrors((prev) => ({ ...prev, [product.id]: '' }));
                            }}
                          />
                        </div>
                        <div>
                          <label htmlFor={`alternate-number-${product.id}`} className="form-label text-xs">Second number preference (optional)</label>
                          <input
                            id={`alternate-number-${product.id}`}
                            type="number"
                            min={1}
                            max={99}
                            className="w-full px-3 py-1.5 border border-edge-strong rounded-lg text-sm font-body focus:border-maroon-500 focus:ring-1 focus:ring-maroon-500 outline-none"
                            placeholder="1-99"
                            value={alternateNumbers[product.id] || ''}
                            onChange={(e) => {
                              setAlternateNumbers((prev) => ({ ...prev, [product.id]: e.target.value }));
                              setPersonalisationErrors((prev) => ({ ...prev, [product.id]: '' }));
                            }}
                          />
                        </div>
                        <label className="flex items-start gap-2 text-xs text-content-secondary">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={personalisationConfirmed[product.id] || false}
                            onChange={(e) => {
                              setPersonalisationConfirmed((prev) => ({ ...prev, [product.id]: e.target.checked }));
                              setPersonalisationErrors((prev) => ({ ...prev, [product.id]: '' }));
                            }}
                          />
                          <span>I confirm any name entered is a surname and understand that both number preferences are subject to availability and club confirmation.</span>
                        </label>
                        {personalisationErrors[product.id] && (
                          <p className="text-xs text-red-600 dark:text-red-400" role="alert">{personalisationErrors[product.id]}</p>
                        )}
                      </div>
  );
}
