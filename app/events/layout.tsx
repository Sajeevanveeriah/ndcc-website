import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Events',
  description:
    'Upcoming events at the Newcomb and District Cricket Club (NDCC Dinos), Grinter Reserve, Moolap.',
};

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
