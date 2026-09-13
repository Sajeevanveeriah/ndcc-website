import { pageMetadata } from '@/lib/seo';
import { loadPublicCatalogue } from '@/lib/apparel/public-catalogue';
import MerchandiseClient, { type ApiProduct } from './MerchandiseClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const result = ['payment', 'success', 'cancelled', 'session_id'].some(key => params[key] !== undefined);
  return {
    ...pageMetadata('/merchandise', 'Club Merchandise', 'Browse current NDCC apparel, sizes and prices, check ordering information and order official club merchandise.'),
    ...(result ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function MerchandisePage() {
  // A failed read is a temporary server error, never a fabricated empty catalogue.
  const products = await loadPublicCatalogue();
  return <MerchandiseClient initialProducts={products as unknown as ApiProduct[]} />;
}
