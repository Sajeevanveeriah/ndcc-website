import { pageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const metadata: Metadata = pageMetadata("/join", "Join the Dinos", "Find out how to join Newcomb and District Cricket Club, explore playing opportunities and take the next step towards registration.");

// Segment config for this route (the page is a server component with a small
// client form island).
// ISR: regenerated at most every 60s and on demand after admin writes
// (lib/server/revalidate-public.ts). 'force-static' lets the Supabase reads,
// which use cache: 'no-store' fetches, run during static regeneration instead
// of opting the route into per-request rendering. This route reads no
// cookies, headers or searchParams.
export const dynamic = 'force-static';
export const revalidate = 60;

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
