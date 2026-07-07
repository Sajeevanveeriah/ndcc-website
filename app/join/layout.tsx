import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Join the Club',
  description:
    'Join the Newcomb and District Cricket Club (NDCC Dinos) — playing memberships, social memberships and how to get involved.',
};

// The page itself is a client component, so the segment config lives here.
// Request-time rendering keeps the shared footer/site chrome (server-rendered
// in the root layout) live instead of a build-time snapshot.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
