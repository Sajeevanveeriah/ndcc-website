import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import TransfersClient from '../_components/TransfersClient';
import FantasyBackLink from '@/components/fantasy/FantasyBackLink';
import SeasonSelector from '@/components/fantasy/SeasonSelector';
import { getCachedSeasonPageContext } from '@/lib/server/dino-public-cache';

export const dynamic = 'force-dynamic';
// Sign-in / signed-in page: keep it out of search results but let crawlers
// follow its links.
export const metadata: Metadata = { ...pageMetadata('/fantasy/transfers', 'Dino Coach Transfers', 'Make your Dino Coach transfers.'), robots: { index: false, follow: true } };
export default async function FantasyTransfersPage({ searchParams }: { searchParams?: Promise<{ season?: string }> }) { const resolvedSearchParams = await searchParams; const seasonContext = await getCachedSeasonPageContext(resolvedSearchParams?.season || null).catch(() => ({ seasons: [], selected: null, options: [] })); return <section className="section-padding"><div className="container-width"><FantasyBackLink /><h1 className="section-title">Dino Coach transfers</h1><div className="mb-6"><SeasonSelector seasons={seasonContext.options} selectedSlug={seasonContext.selected?.slug || ''} /></div><TransfersClient /></div></section>; }
