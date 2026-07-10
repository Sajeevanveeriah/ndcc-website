import type { Metadata } from 'next';
import SquadBuilder from '../_components/SquadBuilder';
import FantasyBackLink from '@/components/fantasy/FantasyBackLink';
import SeasonSelector from '@/components/fantasy/SeasonSelector';
import { getSeasonPageContext } from '@/lib/fantasy-seasons';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My Fantasy Squad' };
export default async function FantasySquadPage({ searchParams }: { searchParams?: { season?: string } }) { const seasonContext = await getSeasonPageContext(searchParams?.season || null).catch(() => ({ seasons: [], selected: null, options: [] })); return <section className="section-padding"><div className="container-width"><FantasyBackLink /><h1 className="section-title">My Squad</h1><div className="mb-6"><SeasonSelector seasons={seasonContext.options} selectedSlug={seasonContext.selected?.slug || ''} /></div><SquadBuilder /></div></section>; }
