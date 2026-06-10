import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Join the Club',
  description:
    'Join the Newcomb and District Cricket Club (NDCC Dinos) — playing memberships, social memberships and how to get involved.',
};

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
