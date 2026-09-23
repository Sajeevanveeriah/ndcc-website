'use client';

import type { Dispatch, SetStateAction } from 'react';
import Card, { CardContent } from '@/components/ui/Card';
import SizingGuides from '@/components/merchandise/SizingGuides';
import ProductCard from './ProductCard';
import type { DisplayProduct, MerchandiseWindow, ProductSelectionState } from './types';

/** Products grid: ordering copy, sizing guides, unavailable/loading/empty states and grouped product cards. */
export default function ProductCatalogue({
  heroContent,
  liveProductsFailed,
  productsLoading,
  setProductsReloadKey,
  products,
  groupedProducts,
  windowState,
  selection,
  displayUnitPrice,
  handleAddToOrder,
}: {
  heroContent: { title: string; body: string; orderTitle: string; orderBody: string };
  liveProductsFailed: boolean;
  productsLoading: boolean;
  setProductsReloadKey: Dispatch<SetStateAction<number>>;
  products: DisplayProduct[];
  groupedProducts: Record<string, DisplayProduct[]>;
  windowState: { processing_open: boolean; queue_allowed: boolean; current_window: MerchandiseWindow | null; next_window: MerchandiseWindow | null };
  selection: ProductSelectionState;
  displayUnitPrice: (product: DisplayProduct) => number;
  handleAddToOrder: (productId: string) => void;
}) {
  return (
      <section className="section-padding surface-blue-band">
        <div className="container-width">
          <h2 className="section-title mb-2">Products</h2>
          {heroContent.orderBody && (
            <div className="mb-6 panel-blue-subtle p-4">
              <h3 className="font-display font-bold text-maroon-800 dark:text-maroon-200">{heroContent.orderTitle}</h3>
              <p className="mt-2 text-sm text-content-secondary whitespace-pre-line">{heroContent.orderBody}</p>
            </div>
          )}
          <details className="club-disclosure mb-8"><summary>Find your fit - apparel sizing guides</summary><SizingGuides /></details>
          {liveProductsFailed && !productsLoading && (
            <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-4 flex flex-wrap items-center justify-between gap-3" role="alert">
              <p className="font-body text-sm text-amber-900 dark:text-amber-100">
                The live product catalogue is temporarily unavailable, so products and prices cannot be shown right now.
                Please try again in a moment.
              </p>
              <button
                type="button"
                onClick={() => setProductsReloadKey((key) => key + 1)}
                className="focus-ring inline-flex items-center rounded-lg border border-maroon-300 px-3 py-1.5 font-body text-sm font-semibold text-maroon-700 dark:text-maroon-200 transition-colors hover:bg-maroon-50 dark:hover:bg-maroon-900/40"
              >
                Try again
              </button>
            </div>
          )}
          {productsLoading ? (
            <div className="grid grid-cols-1 items-start md:grid-cols-2 lg:grid-cols-3 gap-6" aria-hidden="true">
              {Array.from({ length: 8 }).map((_, i) => (
                <Card key={i}>
                  <div className="h-36 bg-gray-200 animate-pulse" />
                  <CardContent className="space-y-3">
                    <div className="h-5 w-3/4 rounded bg-gray-200 animate-pulse" />
                    <div className="h-4 w-full rounded bg-gray-200 animate-pulse" />
                    <div className="h-4 w-2/3 rounded bg-gray-200 animate-pulse" />
                    <div className="h-9 w-full rounded bg-gray-200 animate-pulse" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : products.length === 0 ? (
            liveProductsFailed ? null : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="font-body font-semibold text-content-secondary">No products currently available</p>
                <p className="font-body text-sm text-content-muted mt-1">
                  Check back soon — new club merchandise will appear here when it goes on sale.
                </p>
              </CardContent>
            </Card>
            )
          ) : (
          <div className="grid grid-cols-1 items-start md:grid-cols-2 lg:grid-cols-3 gap-6">
            {!windowState.processing_open && (
              <div className="md:col-span-2 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-4 text-sm">
                Orders are currently outside the active merch window.
                {windowState.queue_allowed ? ' New orders will be queued for the next window.' : ' Ordering is temporarily unavailable.'}
              </div>
            )}
            {Object.entries(groupedProducts).map(([category, productsInCategory]) => (
              <div key={category} className="md:col-span-2 lg:col-span-3">
                <h3 className="text-xl font-display font-bold text-maroon-800 dark:text-maroon-200 mb-3">{category}</h3>
                <div className="grid grid-cols-1 items-start md:grid-cols-2 lg:grid-cols-3 gap-6">
                {productsInCategory.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    selection={selection}
                    displayUnitPrice={displayUnitPrice}
                    handleAddToOrder={handleAddToOrder}
                  />
                ))}
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      </section>
  );
}
