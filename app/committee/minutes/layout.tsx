import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Meeting Minutes',
  description:
    'Committee meeting minutes of the Newcomb and District Cricket Club (NDCC Dinos).',
};

export default function MinutesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
