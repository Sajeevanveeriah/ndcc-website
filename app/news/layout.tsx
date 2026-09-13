import { pageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const metadata: Metadata = pageMetadata('/news', 'Club news', 'Read published news, announcements and club updates from Newcomb and District Cricket Club.');

export default function NewsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
