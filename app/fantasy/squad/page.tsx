import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import SquadBuilder from '../_components/SquadBuilder';
import FantasyBackLink from '@/components/fantasy/FantasyBackLink';
import SeasonSelector from '@/components/fantasy/SeasonSelector';
import { getSeasonPageContext } from '@/lib/fantasy-seasons';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = pageMetadata('/fantasy/squad', 'My Dino Coach Squad', 'Build your Dino Coach squad.');
export default async function FantasySquadPage({ searchParams }: { searchParams?: Promise<{ season?: string }> }) { const resolvedSearchParams = await searchParams; const seasonContext = await getSeasonPageContext(resolvedSearchParams?.season || null).catch(() => ({ seasons: [], selected: null, options: [] })); return <section className="section-padding"><div className="container-width"><FantasyBackLink /><h1 className="section-title">My Dino Coach squad</h1><div className="mb-6"><SeasonSelector seasons={seasonContext.options} selectedSlug={seasonContext.selected?.slug || ''} /></div><SquadBuilder /></div></section>; }
