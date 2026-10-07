import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageMetadata } from '@/lib/seo';
import WinnerCard from '@/components/match-day/WinnerCard';
import { getPublishedWinners, getWinnerSeasons } from '@/lib/server/match-day';
import { WINNER_CATEGORIES, WINNER_CATEGORY_LABELS, type WinnerCategory } from '@/lib/match-day';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Params = { category?: string; season?: string };
const isCategory = (value?: string): value is WinnerCategory => (WINNER_CATEGORIES as readonly string[]).includes(value || '');

export async function generateMetadata({ searchParams }: { searchParams?: Promise<Params> }): Promise<Metadata> {
  const params = await searchParams;
  const category = isCategory(params?.category) ? params!.category as WinnerCategory : undefined;
  const query = new URLSearchParams();
  if (category) query.set('category', category);
  return pageMetadata(`/winners${query.size ? `?${query}` : ''}`, category ? `${WINNER_CATEGORY_LABELS[category]} winners` : 'Club winners',
    // A ?category= view lists only that category under its own canonical, so
    // its description names the category instead of repeating the parent's.
    category
      ? `${WINNER_CATEGORY_LABELS[category]} winners at Newcomb & District Cricket Club.`
      : 'Player sponsor awards, Dino Lotto, raffle and event winners at Newcomb & District Cricket Club.');
}

function href(category?: string, season?: string) {
  const query = new URLSearchParams();
  if (category) query.set('category', category);
  if (season) query.set('season', season);
  return `/winners${query.size ? `?${query}` : ''}`;
}

export default async function WinnersPage({ searchParams }: { searchParams?: Promise<Params> }) {
  const params = await searchParams;
  if (params?.category && !isCategory(params.category)) notFound();
  const category = isCategory(params?.category) ? params!.category as WinnerCategory : undefined;
  const season = typeof params?.season === 'string' && params.season.length <= 40 ? params.season : undefined;
  let winners: Awaited<ReturnType<typeof getPublishedWinners>> | null = null;
  let seasons: string[] = [];
  try {
    [winners, seasons] = await Promise.all([getPublishedWinners({ category, season, limit: 300 }), getWinnerSeasons()]);
  } catch { winners = null; }

  const chip = (active: boolean) => `inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${active ? 'border-maroon-700 bg-maroon-700 text-white' : 'border-edge-strong bg-surface-card text-content-primary hover:border-maroon-700'}`;

  return <>
    <section className="page-hero">
      <div className="container-width">
        <h1 className="page-hero-title">Winners</h1>
        <p className="page-hero-subtitle">Player sponsor awards, Dino Lotto, raffle and event winners. Congratulations to everyone and thank you for supporting the Dinos.</p>
      </div>
    </section>
    <section className="section-padding bg-surface-page">
      <div className="container-width space-y-6">
        <nav aria-label="Filter winners by category" className="flex flex-wrap gap-2">
          <Link href={href(undefined, season)} className={chip(!category)} aria-current={!category ? 'page' : undefined}>All</Link>
          {WINNER_CATEGORIES.map((key) => <Link key={key} href={href(key, season)} className={chip(category === key)} aria-current={category === key ? 'page' : undefined}>{WINNER_CATEGORY_LABELS[key]}</Link>)}
        </nav>
        {seasons.length > 1 && <nav aria-label="Filter winners by season" className="flex flex-wrap gap-2 text-sm">
          <span className="self-center text-content-muted">Season:</span>
          <Link href={href(category)} className={chip(!season)} aria-current={!season ? 'page' : undefined}>All seasons</Link>
          {seasons.map((value) => <Link key={value} href={href(category, value)} className={chip(season === value)} aria-current={season === value ? 'page' : undefined}>{value}</Link>)}
        </nav>}
        {winners === null
          ? <p className="rounded-xl border border-edge-subtle bg-surface-card p-6 text-content-secondary">Winners are temporarily unavailable. Please refresh in a minute.</p>
          : winners.length === 0
            ? <p className="rounded-xl border border-edge-subtle bg-surface-card p-6 text-content-secondary">No winners have been published{category ? ` for ${WINNER_CATEGORY_LABELS[category]}` : ''} yet.</p>
            : <div className="grid gap-4 md:grid-cols-2">{winners.map((winner) => <WinnerCard key={winner.id} winner={winner} />)}</div>}
      </div>
    </section>
  </>;
}
