import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Merchandise',
  description:
    'Club apparel and merchandise from the Newcomb and District Cricket Club (NDCC Dinos).',
};

export default function MerchandiseLayout({ children }: { children: React.ReactNode }) {
  return children;
}
