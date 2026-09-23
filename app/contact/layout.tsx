import { pageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const metadata: Metadata = pageMetadata("/contact", "Contact NDCC", "Contact Newcomb and District Cricket Club at Grinter Reserve, Moolap, with questions about playing, visiting or supporting the club.");

// The page itself is a client component, so the segment config lives here.
// ISR: regenerated at most every 60s and on demand after admin writes
// (lib/server/revalidate-public.ts). 'force-static' lets the Supabase reads,
// which use cache: 'no-store' fetches, run during static regeneration instead
// of opting the route into per-request rendering. This route reads no
// cookies, headers or searchParams.
export const dynamic = 'force-static';
export const revalidate = 60;

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
