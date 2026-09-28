import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { createServerClient } from '@/lib/supabase-server';
import { loadSpinSegments } from '@/lib/spin-wheel/server';
import { getPublicSpinWheel } from '@/lib/spin-wheel/visibility';
import { formatAud, formatMelbourneDateTime, isSpinCheckoutOpen, publicSegments, SPIN_CHECKOUT_CLOSE_MINUTES, spinWheelPhase } from '@/lib/spin-wheel/rules';
import SpinWheelClient from './SpinWheelClient';

export const dynamic = 'force-dynamic';

// Metadata only while a wheel is public, so a hidden wheel's 404 carries no title.
export async function generateMetadata(): Promise<Metadata> {
  const wheel = await getPublicSpinWheel();
  if (!wheel) return {};
  return pageMetadata('/spin-the-wheel', wheel.name, wheel.description?.slice(0, 160) || `${wheel.name} at Newcomb and District Cricket Club.`);
}

export default async function SpinTheWheelPage() {
  const wheel = await getPublicSpinWheel();
  if (!wheel) notFound();
  const rows = await loadSpinSegments(createServerClient(), wheel.id);
  if (!rows || rows.length < 2) notFound();
  const segments = publicSegments(rows);
  const prizes = segments.filter(segment => segment.is_prize);
  const phase = spinWheelPhase(wheel);
  const starts = formatMelbourneDateTime(wheel.starts_at);
  const ends = formatMelbourneDateTime(wheel.ends_at);
  const subtitle = [
    wheel.free_spins_per_account > 0 ? `${wheel.free_spins_per_account} free ${wheel.free_spins_per_account === 1 ? 'spin' : 'spins'} with a club account.` : '',
    wheel.spin_price_cents ? `${wheel.free_spins_per_account > 0 ? 'Extra spins' : 'Spins'} ${formatAud(wheel.spin_price_cents)} AUD each.` : '',
    wheel.max_spins_per_day ? `Up to ${wheel.max_spins_per_day} ${wheel.max_spins_per_day === 1 ? 'spin' : 'spins'} per person per day.` : '',
  ].filter(Boolean).join(' ');

  return <>
    <section className="page-hero"><div className="container-width">
      <h1 className="page-hero-title">{wheel.name}</h1>
      {subtitle && <p className="page-hero-subtitle">{subtitle}</p>}
    </div></section>
    <main className="section-padding"><div className="container-width max-w-6xl space-y-8">
      <SpinWheelClient
        wheel={{
          id: wheel.id, name: wheel.name, phase, freeSpins: wheel.free_spins_per_account,
          priceCents: wheel.spin_price_cents, maxPerOrder: wheel.max_spins_per_order, perDay: wheel.max_spins_per_day, checkoutOpen: isSpinCheckoutOpen(wheel),
        }}
        segments={segments}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="spin-prizes" className="rounded-xl border border-edge-subtle bg-surface-card p-6">
          <h2 id="spin-prizes" className="font-display text-2xl font-bold mb-3">Prizes on the wheel</h2>
          {prizes.length ? <ul className="space-y-2">
            {prizes.map(prize => <li key={prize.position} className="border-b border-edge-subtle pb-2 last:border-0">
              <strong>{prize.prize_name}</strong>{prize.once_per_spinner && <span className="ml-2 text-sm">(once per person)</span>}{!prize.available && <span className="ml-2 text-sm text-content-muted">(all won)</span>}
              {prize.prize_description && <span className="block text-sm text-content-muted">{prize.prize_description}</span>}
            </li>)}
          </ul> : <p>This wheel has no prize segments.</p>}
        </section>

        <section aria-labelledby="spin-about" className="rounded-xl border border-edge-subtle bg-surface-card p-6 space-y-3">
          <h2 id="spin-about" className="font-display text-2xl font-bold">How it works</h2>
          {wheel.description && <p className="whitespace-pre-line">{wheel.description}</p>}
          <dl className="grid gap-3 sm:grid-cols-2">
            {starts && <div><dt className="font-semibold">Opens</dt><dd>{starts}</dd></div>}
            {ends && <div><dt className="font-semibold">Closes</dt><dd>{ends}</dd></div>}
            <div><dt className="font-semibold">Free spins</dt><dd>{wheel.free_spins_per_account > 0 ? `${wheel.free_spins_per_account} per club account` : 'None on this wheel'}</dd></div>
            {wheel.max_spins_per_day && <div><dt className="font-semibold">Spins per day</dt><dd>Up to {wheel.max_spins_per_day} per person per day (Melbourne time)</dd></div>}
            <div><dt className="font-semibold">Buying spins</dt><dd>{wheel.spin_price_cents ? `${formatAud(wheel.spin_price_cents)} AUD per spin, paid by card${wheel.ends_at ? `. Sales close ${SPIN_CHECKOUT_CLOSE_MINUTES} minutes before the wheel closes` : ''}` : 'Not available on this wheel'}</dd></div>
          </dl>
          {prizes.some(prize => prize.once_per_spinner) && <p>Prizes marked once per person can be won once. If the wheel lands on one you have already won, you get a free spin instead.</p>}
          <p className="text-sm text-content-muted">Each result is chosen by the website&apos;s secure random generator and recorded before the wheel turns. Segment sizes on the wheel are for display; prizes that have all been won can no longer come up.</p>
          {wheel.claim_instructions && <div><h3 className="font-semibold">Claiming a prize</h3><p className="whitespace-pre-line">{wheel.claim_instructions}</p></div>}
        </section>
      </div>
    </div></main>
  </>;
}
