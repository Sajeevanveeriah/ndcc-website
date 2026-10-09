import type { Metadata } from 'next';
import Link from 'next/link';
import { pageMetadata } from '@/lib/seo';
import TeamSheetRounds from '@/components/match-day/TeamSheetRounds';
import WinnerCard from '@/components/match-day/WinnerCard';
import PublicationCard from '@/components/publications/PublicationCard';
import { getCurrentTeamSheets, getPublishedWinners, type PublicTeamSheet, type PublicWinner } from '@/lib/server/match-day';
import { getPublishedPublications, type PublicPublicationRecord } from '@/lib/public-publications';
import { clubToday } from '@/lib/match-day';

// Team sheets and winners change through the week, so render per request.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = pageMetadata('/this-week', 'This Week at the Dinos', 'This round\'s team sheets, the latest match reports and this week\'s winners at Newcomb & District Cricket Club.');

async function settle<T>(promise: Promise<T>): Promise<{ data: T | null; failed: boolean }> {
  try { return { data: await promise, failed: false }; } catch { return { data: null, failed: true }; }
}

function sinceDays(days: number) {
  const date = new Date(`${clubToday()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export default async function ThisWeekPage() {
  const [sheets, reports, winners] = await Promise.all([
    settle<PublicTeamSheet[]>(getCurrentTeamSheets()),
    settle<PublicPublicationRecord[]>(getPublishedPublications({ type: 'weekly_match_report', limit: 4 })),
    settle<PublicWinner[]>(getPublishedWinners({ since: sinceDays(13), limit: 24 })),
  ]);
  const unavailable = <p className="rounded-xl border border-edge-subtle bg-surface-card p-6 text-content-secondary">This section is temporarily unavailable. Please refresh in a minute.</p>;

  return <>
    <section className="page-hero">
      <div className="container-width">
        <h1 className="page-hero-title">This week</h1>
        <p className="page-hero-subtitle">Team sheets for this round, the latest match reports and this week&apos;s winners.</p>
      </div>
    </section>

    <section className="section-padding bg-surface-page" aria-labelledby="team-sheets-heading">
      <div className="container-width space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="team-sheets-heading" className="section-title mb-0">Team sheets</h2>
          <div className="flex flex-wrap gap-4"><Link href="/team-sheets" className="font-semibold text-content-blue underline underline-offset-4">All team sheets</Link><Link href="/fixtures" className="font-semibold text-content-blue underline underline-offset-4">Full fixtures</Link></div>
        </div>
        {sheets.failed ? unavailable : sheets.data!.length === 0
          ? <p className="rounded-xl border border-edge-subtle bg-surface-card p-6 text-content-secondary">Team sheets for the next round have not been published yet. Check back after selection night.</p>
          : <TeamSheetRounds sheets={sheets.data!} headingLevel="h3" />}
      </div>
    </section>

    <section className="section-padding bg-surface-muted" aria-labelledby="reports-heading">
      <div className="container-width space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="reports-heading" className="section-title mb-0">Match reports</h2>
          <Link href="/match-reports" className="font-semibold text-content-blue underline underline-offset-4">All match reports</Link>
        </div>
        {reports.failed ? unavailable : reports.data!.length === 0
          ? <p className="rounded-xl border border-edge-subtle bg-surface-card p-6 text-content-secondary">No match reports have been published yet.</p>
          : <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">{reports.data!.map((report) => <PublicationCard key={report.id} publication={report} />)}</div>}
      </div>
    </section>

    <section className="section-padding bg-surface-page" aria-labelledby="winners-heading">
      <div className="container-width space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="winners-heading" className="section-title mb-0">Winners</h2>
          <Link href="/winners" className="font-semibold text-content-blue underline underline-offset-4">All winners</Link>
        </div>
        {winners.failed ? unavailable : winners.data!.length === 0
          ? <p className="rounded-xl border border-edge-subtle bg-surface-card p-6 text-content-secondary">No winners have been announced in the last fortnight. See <Link href="/winners" className="underline">all winners</Link>.</p>
          : <div className="grid gap-4 md:grid-cols-2">{winners.data!.map((winner) => <WinnerCard key={winner.id} winner={winner} />)}</div>}
      </div>
    </section>
  </>;
}
