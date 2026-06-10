import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'News',
  description:
    'Latest news and updates from the Newcomb and District Cricket Club (NDCC Dinos), Geelong Cricket Association.',
};

export default function NewsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
