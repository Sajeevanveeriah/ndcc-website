import type { Metadata } from 'next';
import Link from 'next/link';
import { pageMetadata } from '@/lib/seo';
import TeamSheetRounds from '@/components/match-day/TeamSheetRounds';
import { getTeamSheetGallery, type PublicTeamSheet } from '@/lib/server/match-day';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = pageMetadata('/team-sheets', 'Team sheets', 'Published team sheets for every round at Newcomb & District Cricket Club, grouped by round and grade.');

export default async function TeamSheetsPage() {
  let sheets: PublicTeamSheet[] | null = null;
  try { sheets = await getTeamSheetGallery(); } catch { sheets = null; }

  return <>
    <section className="page-hero">
      <div className="container-width">
        <h1 className="page-hero-title">Team sheets</h1>
        <p className="page-hero-subtitle">Every published team sheet, grouped by round.</p>
      </div>
    </section>
    <section className="section-padding bg-surface-page">
      <div className="container-width space-y-6">
        <p><Link href="/this-week" className="font-semibold text-content-blue underline underline-offset-4">This week</Link></p>
        {sheets === null
          ? <p className="rounded-xl border border-edge-subtle bg-surface-card p-6 text-content-secondary">Team sheets are temporarily unavailable. Please refresh in a minute.</p>
          : sheets.length === 0
            ? <p className="rounded-xl border border-edge-subtle bg-surface-card p-6 text-content-secondary">No team sheets have been published yet.</p>
            : <TeamSheetRounds sheets={sheets} />}
      </div>
    </section>
  </>;
}
