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
  title: 'Dino Coach',
  description: 'Dino Coach - NDCC player selection, scoring, transfers and leaderboards.',
};

const gameHighlights = [
  'Assign any 15 NDCC players to the 11 playing and 4 bench fantasy slots.',
  'Track player scores and manager rankings across each published round.',
  'Use unlimited free transfers during the weekly Melbourne-time window.',
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

export default async function FantasyPage({ searchParams: searchParamsPromise }: { searchParams?: Promise<{ season?: string }> }) {
  const searchParams = await searchParamsPromise;
  const seasonContext = await getSeasonPageContext(searchParams?.season || null).catch(() => ({ seasons: [], selected: null, options: [] }));
  const seasonQuery = searchParams?.season ? `?season=${encodeURIComponent(searchParams.season)}` : '';
  const seasonName = await getSeasonName(seasonContext.selected?.id);
  return (
    <>
      <section className="page-hero">
        <div className="container-width">
          <span className="eyebrow-gold">{seasonName || `${CLUB_SHORT} Dinos`}</span>
          <ScrollReveal onMount delay={0}><h1 className="page-hero-title">Dino Coach</h1></ScrollReveal>
          <ScrollReveal onMount delay={0.15}><p className="page-hero-subtitle">Build your 15-player NDCC squad with Dino Dollars, make free transfers and follow the competition.</p></ScrollReveal>
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
              <div className="space-y-4 text-content-secondary font-body leading-relaxed max-w-3xl">
                <p>Dino Coach is NDCC&apos;s 18+ fantasy competition for the 2026/2027 season. Entry is AUD 25.00; every squad price and prize shown in Dino Dollars is virtual.</p>
                <p>Squads, assigned fantasy roles, free transfers, player scores and leaderboards use reconciled player identities and published match-stat imports.</p>
              </div>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link href="/fantasy/register" className="btn-primary">Register / Login<ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link>
                <Link href="/fantasy/manager-leaderboard" className="btn-secondary">Manager Leaderboard<Trophy className="ml-2 h-4 w-4" aria-hidden="true" /></Link>
              </div>
            </div>
            <Card className="border-l-4 border-l-maroon-700">
              <CardContent className="p-6">
                <ShieldCheck className="h-10 w-10 text-maroon-700 dark:text-maroon-200 mb-4" aria-hidden="true" />
                <h2 className="text-2xl font-display font-bold text-content-primary mb-3">Safe club scope</h2>
                <ul className="space-y-3 text-sm text-content-secondary font-body leading-relaxed">
                  <li>NDCC colours, language, and club identity only.</li>
                  <li>No public manager data is mixed with committee admin accounts.</li>
                  <li>Draft, reviewed, and rejected import batches stay out of public scoring views.</li>
                </ul>
              </CardContent>
            </Card>
          </ScrollReveal>
        </div>
      </section>

      <section className="section-padding surface-blue-band">
        <div className="container-width">
          <ScrollReveal className="grid grid-cols-1 lg:grid-cols-[1fr_1.15fr] gap-8 items-start">
            <Card className="h-full border-l-4 border-l-sky_accent">
              <CardContent className="p-6">
                <Star className="h-10 w-10 text-maroon-700 dark:text-maroon-200 mb-4" aria-hidden="true" />
                <h2 className="text-2xl font-display font-bold text-content-primary mb-3">Game highlights</h2>
                <p className="font-body text-content-secondary mb-4">A season-long pilot for adult NDCC members, players and supporters.</p>
                <ol className="space-y-3 text-sm text-content-secondary font-body leading-relaxed list-decimal pl-5">
                  {gameHighlights.map((step) => <li key={step}>{step}</li>)}
                </ol>
              </CardContent>
            </Card>
            <Card className="h-full">
              <CardContent className="p-6">
                <Users className="h-10 w-10 text-maroon-700 dark:text-maroon-200 mb-4" aria-hidden="true" />
                <h2 className="text-2xl font-display font-bold text-content-primary mb-3">Manager playbook</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-content-secondary font-body">
                  <p className="rounded-lg bg-surface-page p-3">Register, prove 18+ eligibility and accept the current rules.</p>
                  <p className="rounded-lg bg-surface-page p-3">Pay AUD 25.00 through Stripe-hosted Checkout.</p>
                  <p className="rounded-lg bg-surface-page p-3">Fill 15 explicit fantasy slots and choose captain and vice-captain.</p>
                  <p className="rounded-lg bg-surface-page p-3">Make unlimited free transfers in the open weekly window.</p>
                </div>
              </CardContent>
            </Card>
          </ScrollReveal>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-width">
          <h2 className="section-title">Dino Coach actions</h2>
          <ScrollReveal stagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FANTASY_MODULES.map((module) => (
              <ScrollRevealItem key={module.href}>
                <Link href={`${module.href}${seasonQuery}`} className="block h-full">
                  <Card hover className="h-full">
                    <CardContent className="p-6">
                      <h3 className="text-xl font-display font-bold text-content-primary mb-2">{module.title}</h3>
                      <p className="font-body text-content-secondary">{module.description}</p>
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
