import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sponsors',
  description:
    'Our valued sponsors and sponsorship opportunities at the Newcomb and District Cricket Club (NDCC Dinos).',
};

export default function SponsorsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
