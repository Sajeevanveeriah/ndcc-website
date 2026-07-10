import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ShieldCheck, Star, Trophy, Users } from 'lucide-react';
import Card, { CardContent } from '@/components/ui/Card';
import ScrollReveal, { ScrollRevealItem } from '@/components/common/ScrollReveal';
import { CLUB_NICKNAME, CLUB_SHORT } from '@/lib/constants';
import { FANTASY_MODULES } from '@/lib/fantasy';
import { getFantasySettings } from '@/lib/fantasy-game';
import { isServerSupabaseConfigured } from '@/lib/supabase-server';
import SeasonSelector from '@/components/fantasy/SeasonSelector';
import { getSeasonPageContext, seasonStatusLabel } from '@/lib/fantasy-seasons';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Fantasy Cricket',
  description: 'NDCC Fantasy Cricket for squads, transfers, leagues, player scores, and manager leaderboard.',
};

const gameHighlights = [
  'Pick a balanced squad from the club-published player pool.',
  'Track player scores and manager rankings across each published round.',
  'Use transfers and chips to respond as the season unfolds.',
];

async function getSeasonName(seasonId?: string | null): Promise<string | null> {
  if (!isServerSupabaseConfigured()) return null;
  try {
    const settings = await getFantasySettings(seasonId);
    return settings.season_name?.trim() || null;
  } catch {
    return null;
  }
}

export default async function FantasyPage({ searchParams }: { searchParams?: { season?: string } }) {
  const seasonContext = await getSeasonPageContext(searchParams?.season || null).catch(() => ({ seasons: [], selected: null, options: [] }));
  const seasonQuery = searchParams?.season ? `?season=${encodeURIComponent(searchParams.season)}` : '';
  const seasonName = await getSeasonName(seasonContext.selected?.id);
  return (
    <>
      <section className="page-hero">
        <div className="container-width">
          <span className="eyebrow-gold">{seasonName || `${CLUB_SHORT} Dinos`}</span>
          <ScrollReveal onMount delay={0}><h1 className="page-hero-title">Fantasy Cricket</h1></ScrollReveal>
          <ScrollReveal onMount delay={0.15}><p className="page-hero-subtitle">Pick your NDCC fantasy squad, follow published player scores, make transfers, and compete in classic private leagues.</p></ScrollReveal>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <SeasonSelector seasons={seasonContext.options} selectedSlug={seasonContext.selected?.slug || ''} />
            {seasonContext.selected && (
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-body text-white">{seasonStatusLabel(seasonContext.selected)} season</span>
            )}
          </div>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-width">
          <ScrollReveal className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <h2 className="section-title">Built for the {CLUB_NICKNAME}</h2>
              <div className="space-y-4 text-gray-700 font-body leading-relaxed max-w-3xl">
                <p>NDCC Fantasy Cricket is a club-branded game for members, players, families, and supporters. Public fantasy manager accounts are separate from committee admin access.</p>
                <p>Squads, transfers, chips, private leagues, player leaderboard and manager leaderboard are powered by approved fantasy data and published match-stat imports.</p>
              </div>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link href="/fantasy/register" className="btn-primary">Register / Login<ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link>
                <Link href="/fantasy/manager-leaderboard" className="btn-secondary">Manager Leaderboard<Trophy className="ml-2 h-4 w-4" aria-hidden="true" /></Link>
              </div>
            </div>
            <Card className="border-l-4 border-l-maroon-700">
              <CardContent className="p-6">
                <ShieldCheck className="h-10 w-10 text-maroon-700 mb-4" aria-hidden="true" />
                <h2 className="text-2xl font-display font-bold text-gray-900 mb-3">Safe club scope</h2>
                <ul className="space-y-3 text-sm text-gray-700 font-body leading-relaxed">
                  <li>NDCC colours, language, and club identity only.</li>
                  <li>No public manager data is mixed with committee admin accounts.</li>
                  <li>Draft, reviewed, and rejected import batches stay out of public scoring views.</li>
                </ul>
              </CardContent>
            </Card>
          </ScrollReveal>
        </div>
      </section>

      <section className="section-padding surface-sky">
        <div className="container-width">
          <ScrollReveal className="grid grid-cols-1 lg:grid-cols-[1fr_1.15fr] gap-8 items-start">
            <Card className="h-full border-l-4 border-l-sky_accent">
              <CardContent className="p-6">
                <Star className="h-10 w-10 text-maroon-700 mb-4" aria-hidden="true" />
                <h2 className="text-2xl font-display font-bold text-gray-900 mb-3">Game highlights</h2>
                <p className="font-body text-gray-700 mb-4">A season-long fantasy cricket game for NDCC players, members, families, and supporters.</p>
                <ol className="space-y-3 text-sm text-gray-700 font-body leading-relaxed list-decimal pl-5">
                  {gameHighlights.map((step) => <li key={step}>{step}</li>)}
                </ol>
              </CardContent>
            </Card>
            <Card className="h-full">
              <CardContent className="p-6">
                <Users className="h-10 w-10 text-maroon-700 mb-4" aria-hidden="true" />
                <h2 className="text-2xl font-display font-bold text-gray-900 mb-3">Manager playbook</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-700 font-body">
                  <p className="rounded-lg bg-gray-50 p-3">Create a public fantasy manager account.</p>
                  <p className="rounded-lg bg-gray-50 p-3">Build and save a squad within role and budget rules.</p>
                  <p className="rounded-lg bg-gray-50 p-3">Nominate captain, vice-captain and bench order.</p>
                  <p className="rounded-lg bg-gray-50 p-3">Use transfers, chips and private classic leagues.</p>
                </div>
              </CardContent>
            </Card>
          </ScrollReveal>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-width">
          <h2 className="section-title">Fantasy actions</h2>
          <ScrollReveal stagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FANTASY_MODULES.map((module) => (
              <ScrollRevealItem key={module.href}>
                <Link href={`${module.href}${seasonQuery}`} className="block h-full">
                  <Card hover className="h-full">
                    <CardContent className="p-6">
                      <h3 className="text-xl font-display font-bold text-gray-900 mb-2">{module.title}</h3>
                      <p className="font-body text-gray-700">{module.description}</p>
                    </CardContent>
                  </Card>
                </Link>
              </ScrollRevealItem>
            ))}
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
