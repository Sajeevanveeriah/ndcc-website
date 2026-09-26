import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { getClubSettings } from '@/lib/club-settings';
import { createServerClient } from '@/lib/supabase-server';
import { getPublicWheelCampaign, loadPublicWheelResults, loadWheelPrizes } from '@/lib/prize-wheel/server';
import {
  GAMBLING_HELP_PHONE,
  GAMBLING_HELP_URL,
  WHEEL_ONLINE_CLOSE_MINUTES,
  formatAud,
  formatMelbourneDateTime,
  formatMelbourneTime,
  prizeValueCents,
  wheelSalesState,
} from '@/lib/prize-wheel/rules';
import PrizeWheelClient from './PrizeWheelClient';

export const dynamic = 'force-dynamic';

// Metadata only while a wheel campaign is public, so a hidden wheel's 404
// carries no prize wheel title.
export async function generateMetadata(): Promise<Metadata> {
  if (!(await getPublicWheelCampaign())) return {};
  return pageMetadata('/prize-wheel', 'Dinos Prize Wheel', 'Newcomb and District Cricket Club prize wheel raffle, drawn live at the clubrooms. 18+ only.');
}

export default async function PrizeWheelPage() {
  const campaign = await getPublicWheelCampaign();
  if (!campaign) notFound();
  const db = createServerClient();
  const [prizes, settings] = await Promise.all([loadWheelPrizes(db, campaign.id), getClubSettings()]);
  if (!prizes?.length) notFound();
  const results = await loadPublicWheelResults(db, campaign.id, prizes);
  const state = wheelSalesState(campaign);
  const drawTime = formatMelbourneDateTime(campaign.draw_at);
  const salesOpen = formatMelbourneDateTime(campaign.sales_open_at);
  const onlineClose = formatMelbourneTime(new Date(new Date(campaign.draw_at).getTime() - WHEEL_ONLINE_CLOSE_MINUTES * 60_000).toISOString());
  const totalPrizes = prizes.reduce((sum, prize) => sum + prizeValueCents(prize), 0);

  return <>
    <section className="page-hero"><div className="container-width">
      <h1 className="page-hero-title">{campaign.name}</h1>
      <p className="page-hero-subtitle">{formatAud(campaign.price_cents)} AUD per ticket. Drawn live at {campaign.draw_label}. 18+ only.</p>
    </div></section>
    <main className="section-padding"><div className="container-width max-w-5xl space-y-8">
      <section aria-labelledby="wheel-about" className="rounded-xl border border-edge-subtle bg-surface-card p-6 space-y-3">
        <h2 id="wheel-about" className="font-display text-2xl font-bold">About this raffle</h2>
        <p>This is a small raffle conducted by <strong>{settings.club_name}</strong>. Buy a numbered ticket here, then the wheel is spun <strong>live at {campaign.draw_label}</strong>. Nothing is spun or won online.</p>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div><dt className="font-semibold">Draw</dt><dd>{drawTime}, {campaign.draw_label}</dd></div>
          <div><dt className="font-semibold">Ticket sales</dt><dd>From {salesOpen}. Online sales close at {onlineClose}; cash sales at the clubrooms close when the draw starts.</dd></div>
          <div><dt className="font-semibold">Tickets</dt><dd>{campaign.wheel_divisions} numbered tickets (1 to {campaign.wheel_divisions}), one for each wheel number. {formatAud(campaign.price_cents)} AUD each.</dd></div>
          <div><dt className="font-semibold">How winners are drawn</dt><dd>The first number drawn wins first prize, then each prize in order. A ticket can win only one prize. If a number is unsold or a prize is not claimed, the wheel is spun again.</dd></div>
        </dl>
      </section>

      <section aria-labelledby="wheel-prizes" className="rounded-xl border border-edge-subtle bg-surface-card p-6">
        <h2 id="wheel-prizes" className="font-display text-2xl font-bold mb-3">Prizes</h2>
        <ol className="space-y-2">
          {prizes.map(prize => <li key={prize.id} className="flex flex-wrap justify-between gap-2 border-b border-edge-subtle pb-2 last:border-0">
            <span><strong>Prize {prize.position}:</strong> {prize.quantity > 1 ? `${prize.quantity} x ` : ''}{prize.name}{prize.description ? <span className="block text-sm text-content-muted">{prize.description}</span> : null}</span>
            <span className="font-semibold">Retail value {formatAud(prizeValueCents(prize))}</span>
          </li>)}
        </ol>
        <p className="mt-3 text-sm text-content-muted">Total retail value of prizes: {formatAud(totalPrizes)}. No cash prizes.</p>
      </section>

      {results.length > 0 && <section aria-labelledby="wheel-results" className="rounded-xl border border-edge-subtle bg-surface-card p-6">
        <h2 id="wheel-results" className="font-display text-2xl font-bold mb-3">Draw results</h2>
        <ul className="space-y-1">
          {results.map(result => <li key={result.position}>Prize {result.position} ({result.prizeName}): ticket {result.ticketNumber}{result.winnerInitial ? `, ${result.winnerInitial}` : ''}</li>)}
        </ul>
        <p className="mt-3 text-sm text-content-muted">Winners are contacted by the club.</p>
      </section>}

      {state === 'open' && <PrizeWheelClient code={campaign.code} priceCents={campaign.price_cents} divisions={campaign.wheel_divisions} />}
      {state === 'upcoming' && <p role="status" className="rounded-xl border border-edge-subtle bg-surface-card p-6">Ticket sales open {salesOpen}.</p>}
      {state === 'cash_only' && <p role="status" className="rounded-xl border border-edge-subtle bg-surface-card p-6">Online sales have closed. Tickets may still be available by cash at {campaign.draw_label} until the draw starts.</p>}
      {state === 'closed' && results.length === 0 && <p role="status" className="rounded-xl border border-edge-subtle bg-surface-card p-6">Ticket sales have closed. Results will appear here after the live draw.</p>}

      <section aria-labelledby="wheel-responsible" className="rounded-xl border border-edge-subtle bg-surface-card p-6 space-y-2">
        <h2 id="wheel-responsible" className="font-display text-xl font-bold">18+ only. Gamble responsibly.</h2>
        <p>Tickets are for people aged 18 and over. If gambling is a problem for you or someone you know, call Gambling Help Online on <a className="underline" href="tel:1800858858">{GAMBLING_HELP_PHONE}</a> or visit <a className="underline" href={GAMBLING_HELP_URL} target="_blank" rel="noopener noreferrer">gamblinghelponline.org.au</a>.</p>
      </section>
    </div></main>
  </>;
}
