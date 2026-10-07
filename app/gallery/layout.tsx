import type { Metadata } from 'next';
import { SITE_TITLE_TEMPLATE } from '@/lib/seo';

export const metadata: Metadata = {
  // Re-declare the root template so child detail pages keep the site suffix.
  title: { default: 'Gallery', template: SITE_TITLE_TEMPLATE },
  description:
    'Photo gallery of the Newcomb and District Cricket Club (NDCC Dinos) — matches, events and club life.',
};

export default function GalleryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
