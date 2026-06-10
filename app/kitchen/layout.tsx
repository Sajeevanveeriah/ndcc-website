import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Kitchen',
  description:
    'Canteen and kitchen menu at the Newcomb and District Cricket Club (NDCC Dinos), Grinter Reserve.',
};

export default function KitchenLayout({ children }: { children: React.ReactNode }) {
  return children;
}
