import { pageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const metadata: Metadata = pageMetadata("/join", "Join the Dinos", "Find out how to join Newcomb and District Cricket Club, explore playing opportunities and take the next step towards registration.");

// The page itself is a client component, so the segment config lives here.
// Request-time rendering keeps the shared footer/site chrome (server-rendered
// in the root layout) live instead of a build-time snapshot.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
