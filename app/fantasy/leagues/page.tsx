import type { Metadata } from 'next';
import LeaguesClient from '../_components/LeaguesClient';
import FantasyBackLink from '@/components/fantasy/FantasyBackLink';
import SeasonSelector from '@/components/fantasy/SeasonSelector';
import { getSeasonPageContext } from '@/lib/fantasy-seasons';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Dino Coach Leagues' };
export default async function FantasyLeaguesPage({ searchParams }: { searchParams?: Promise<{ season?: string }> }) { const resolvedSearchParams = await searchParams; const seasonContext = await getSeasonPageContext(resolvedSearchParams?.season || null).catch(() => ({ seasons: [], selected: null, options: [] })); return <section className="section-padding"><div className="container-width"><FantasyBackLink /><h1 className="section-title">Private Dino Coach leagues</h1><div className="mb-6"><SeasonSelector seasons={seasonContext.options} selectedSlug={seasonContext.selected?.slug || ''} /></div><LeaguesClient /></div></section>;}
