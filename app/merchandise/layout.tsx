import { pageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const metadata: Metadata = pageMetadata("/merchandise", "Club Merchandise", "Browse current NDCC apparel, sizes and prices, check ordering information and order official club merchandise.");

// Segment config (ISR, revalidate 60) lives in page.tsx, which renders the
// catalogue on the server.
export default function MerchandiseLayout({ children }: { children: React.ReactNode }) {
  return children;
}
