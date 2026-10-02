import Link from 'next/link';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { getNavVisibility } from '@/lib/server/nav-visibility';
import { getPublicRaffleCampaign } from '@/lib/raffle-visibility';
import { formatRaffleAud, RAFFLE_CAMPAIGN_CODE, RAFFLE_FALLBACK_DISPLAY, REVERSE_RAFFLE_CAMPAIGN_CODE } from '@/lib/raffle-constants';
import { getPublicWheelCampaign } from '@/lib/prize-wheel/server';
import { formatAud as formatWheelAud, formatMelbourneDateTime } from '@/lib/prize-wheel/rules';
import { getPublicSpinWheel } from '@/lib/spin-wheel/visibility';
import { formatAud as formatSpinAud } from '@/lib/spin-wheel/rules';
import { getCookieDoughCampaign } from '@/lib/server/site-promotions';
import { COOKIE_DOUGH_ENDS_AT, isCookieDoughOpen } from '@/lib/cookie-dough';
import { getMembershipOptions } from '@/lib/public-form-options';
import { getPotClubProductCode } from '@/lib/server/pot-club';
import { DEFAULT_POT_CLUB_PRODUCT_CODE, formatPotClubPrice } from '@/lib/pot-club';

export const revalidate = 60;

export const metadata: Metadata = pageMetadata(
  '/fundraising',
  'Fund Raiser',
  'Ways to support Newcomb and District Cricket Club: current fundraisers, Pot Club, merchandise and events.',
);

type HubLink = { label: string; href: string; primary?: boolean };
type HubCard = { key: string; pill: string; gold?: boolean; title: string; meta: string; links: HubLink[] };

const sentence = (value: string) => (value && !/[.!?]$/.test(value) ? `${value}.` : value);

// One card per fundraiser that is publicly visible right now. Visibility uses
// the same server snapshot as the Navbar's Fund Raiser group (getNavVisibility,
// see resolveGroups in components/layout/Navbar.tsx); each campaign's price
// and dates come from the data its own page reads, and a fact that is not
// available is left out rather than guessed.
async function loadCards(): Promise<HubCard[]> {
  const nav = await getNavVisibility();
  // Same open rule as the Navbar's Cookie Dough link (useCookieDoughOpen).
  const cookieEndsAt = nav.cookieDoughOpen === undefined ? COOKIE_DOUGH_ENDS_AT : nav.cookieDoughOpen ? (nav.cookieDoughEndsAt ?? null) : 0;
  const cookieDoughOpen = isCookieDoughOpen(Date.now(), cookieEndsAt);

  const [reverseCampaign, wheelCampaign, spinWheel, cookieDough, membership, potClubCode] = await Promise.all([
    nav.reverseRafflePublic ? getPublicRaffleCampaign(REVERSE_RAFFLE_CAMPAIGN_CODE) : null,
    nav.prizeWheelPublic === true ? getPublicWheelCampaign().catch(() => null) : null,
    nav.spinWheelPublic === true ? getPublicSpinWheel().catch(() => null) : null,
    cookieDoughOpen ? getCookieDoughCampaign().catch(() => null) : null,
    getMembershipOptions().catch(() => null),
    getPotClubProductCode().catch(() => DEFAULT_POT_CLUB_PRODUCT_CODE),
  ]);

  const cards: HubCard[] = [];

  if (nav.rafflePublic) {
    // Same display values as the /raffle page.
    const raffle = RAFFLE_FALLBACK_DISPLAY[RAFFLE_CAMPAIGN_CODE];
    cards.push({
      key: 'raffle', gold: true,
      pill: `${formatRaffleAud(raffle.priceCents)} per ticket`,
      title: raffle.name,
      meta: sentence(raffle.drawLabel) || 'Support the Dinos and be in the draw.',
      links: [{ label: 'Buy tickets', href: '/raffle', primary: true }],
    });
  }

  if (reverseCampaign) {
    const priceCents = Number(reverseCampaign.price_cents);
    const drawLabel = typeof reverseCampaign.draw_label === 'string' ? reverseCampaign.draw_label.trim() : '';
    cards.push({
      key: 'reverse-raffle',
      pill: Number.isFinite(priceCents) && priceCents > 0 ? `${formatRaffleAud(priceCents)} per ticket` : 'Reverse raffle',
      title: 'Reverse Raffle',
      meta: sentence(drawLabel) || 'Support your club.',
      links: [{ label: 'Reverse raffle details', href: '/reverse-raffle' }],
    });
  }

  if (wheelCampaign) {
    const drawTime = formatMelbourneDateTime(wheelCampaign.draw_at);
    cards.push({
      key: 'prize-wheel',
      pill: `${formatWheelAud(wheelCampaign.price_cents)} AUD per ticket`,
      title: wheelCampaign.name,
      meta: `Drawn live at ${wheelCampaign.draw_label}${drawTime ? `, ${drawTime}` : ''}. 18+ only.`,
      links: [{ label: 'Prize wheel details', href: '/prize-wheel' }],
    });
  }

  if (spinWheel) {
    // Same facts as the Spin the Wheel page subtitle.
    const free = spinWheel.free_spins_per_account;
    const meta = [
      free > 0 ? `${free} free ${free === 1 ? 'spin' : 'spins'} with a club account.` : '',
      spinWheel.max_spins_per_day ? `Up to ${spinWheel.max_spins_per_day} ${spinWheel.max_spins_per_day === 1 ? 'spin' : 'spins'} per person per day.` : '',
    ].filter(Boolean).join(' ');
    cards.push({
      key: 'spin-the-wheel',
      pill: spinWheel.spin_price_cents ? `${formatSpinAud(spinWheel.spin_price_cents)} AUD per spin` : 'Spin the Wheel',
      title: spinWheel.name,
      meta: meta || spinWheel.description?.trim() || `${spinWheel.name} at Newcomb and District Cricket Club.`,
      links: [{ label: 'Spin the wheel', href: '/spin-the-wheel' }],
    });
  }

  if (cookieDough) {
    cards.push({
      key: 'cookie-dough',
      pill: '$22 including GST',
      title: "Billy G's Cookie Dough Fundraiser",
      meta: ['Register as an NDCC fundraiser, share your page, or purchase cookie dough to support the club.', cookieDough.deadlineLabel].filter(Boolean).join(' '),
      links: [{ label: 'Cookie dough details', href: '/fundraising/cookie-dough' }],
    });
  }

  // Pot Club and the shop and events are always in the main navigation.
  const potPlan = membership?.plans.find((plan) => plan.product_code === potClubCode);
  cards.push({
    key: 'pot-club',
    pill: potPlan ? formatPotClubPrice(potPlan.price) : 'Engraved glass',
    title: 'Pot Club',
    meta: !potPlan
      ? 'Order your NDCC Pot Club engraved glass and pay online.'
      : potClubCode === DEFAULT_POT_CLUB_PRODUCT_CODE
        ? 'Join the 2026/2027 Pot Club. Includes an engraved pot glass and 50 cents off each drink for the season.'
        : sentence(potPlan.description?.trim() || `Join ${potPlan.name}`),
    links: [{ label: 'Pot Club details', href: '/pot-club' }],
  });

  cards.push({
    key: 'shop-events',
    pill: 'Shop & events',
    title: 'Merchandise and events',
    meta: 'Order official club merchandise, and find upcoming social nights and community gatherings.',
    links: [{ label: 'Merchandise', href: '/merchandise' }, { label: 'Events', href: '/events' }],
  });

  return cards;
}

export default async function FundraisingPage() {
  const cards = await loadCards();
  return <>
    <section className="page-hero px-0 sm:px-0 lg:px-0"><div className="nd-wrap">
      <nav aria-label="Breadcrumb" className="nd-crumbs"><Link href="/">Home</Link> / <span aria-current="page">Fund Raiser</span></nav>
      <h1 className="page-hero-title">Fund Raiser</h1>
      <p className="page-hero-subtitle">Ways to support the Dinos: current fundraisers, Pot Club, merchandise and events.</p>
    </div></section>
    <section className="nd-sec-tight" aria-label="Current fundraisers"><div className="nd-wrap">
      <ul className="nd-ev-grid m-0 list-none p-0">
        {cards.map((card) => (
          <li key={card.key} className="flex">
            <article className="nd-card nd-ev-card w-full" aria-labelledby={`fundraiser-${card.key}`}>
              <div className="nd-ev-body">
                <span className={`nd-pill self-start${card.gold ? ' nd-pill-gold' : ''}`}>{card.pill}</span>
                <h2 id={`fundraiser-${card.key}`}>{card.title}</h2>
                <p className="nd-ev-meta">{card.meta}</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {card.links.map((link) => link.primary
                    ? <Link key={link.href} href={link.href} className="btn-primary w-full">{link.label}<span className="sr-only"> for {card.title}</span></Link>
                    : <Link key={link.href} href={link.href} className="nd-link">{link.label}</Link>)}
                </div>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </div></section>
  </>;
}
