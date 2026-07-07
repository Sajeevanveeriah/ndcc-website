import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Meeting Minutes',
  description:
    'Committee meeting minutes of the Newcomb and District Cricket Club (NDCC Dinos).',
};

// The page itself is a client component, so the segment config lives here.
// Request-time rendering keeps the shared footer/site chrome (server-rendered
// in the root layout) live instead of a build-time snapshot.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default function MinutesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
