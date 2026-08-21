import type { Metadata } from 'next';
import TransfersClient from '../_components/TransfersClient';
import FantasyBackLink from '@/components/fantasy/FantasyBackLink';
import SeasonSelector from '@/components/fantasy/SeasonSelector';
import { getSeasonPageContext } from '@/lib/fantasy-seasons';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Dino Coach Transfers' };
export default async function FantasyTransfersPage({ searchParams }: { searchParams?: { season?: string } }) { const seasonContext = await getSeasonPageContext(searchParams?.season || null).catch(() => ({ seasons: [], selected: null, options: [] })); return <section className="section-padding"><div className="container-width"><FantasyBackLink /><h1 className="section-title">Dino Coach transfers</h1><div className="mb-6"><SeasonSelector seasons={seasonContext.options} selectedSlug={seasonContext.selected?.slug || ''} /></div><TransfersClient /></div></section>; }
