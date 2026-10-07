import type { Metadata } from 'next';
import { SITE_TITLE_TEMPLATE } from '@/lib/seo';

export const metadata: Metadata = {
  // Re-declare the root template so child detail pages keep the site suffix.
  title: { default: 'Events', template: SITE_TITLE_TEMPLATE },
  description:
    'Upcoming events at the Newcomb and District Cricket Club (NDCC Dinos), Grinter Reserve, Moolap.',
};

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
