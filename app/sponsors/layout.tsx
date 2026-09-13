import { pageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const metadata: Metadata = pageMetadata("/sponsors", "Club sponsors", "Meet the businesses supporting Newcomb and District Cricket Club and find information about supporting the Dinos through sponsorship.");

// The page itself is a client component, so the segment config lives here.
// Request-time rendering keeps the shared footer/site chrome (server-rendered
// in the root layout) live instead of a build-time snapshot.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default function SponsorsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
