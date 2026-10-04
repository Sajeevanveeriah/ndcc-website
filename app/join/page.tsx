import Link from 'next/link';
import ScrollReveal, { ScrollRevealItem } from '@/components/common/ScrollReveal';
import { formatCurrency } from '@/lib/utils';
import Accordion from '@/components/common/Accordion';
import { getContentBlocks } from '@/lib/content-blocks';
import { getMembershipOptions } from '@/lib/public-form-options';
import { SOCIAL_MEMBERSHIP_ELIGIBILITY } from '@/lib/social-membership';
import { getPotClubProductCode } from '@/lib/server/pot-club';
import SocialMembershipForm from './SocialMembershipForm';

// Choice cards in "1. Choose a membership" are plain links (each option has
// its own flow), styled with the shared .nd-radio-card surface.
const choiceCardClass =
  'nd-radio-card flex h-full flex-col gap-2 no-underline transition-colors hover:border-maroon-700 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-maroon-500 focus-visible:ring-offset-2 dark:hover:border-maroon-300 dark:focus-visible:ring-offset-slate-900';
const choiceCtaClass = 'mt-auto pt-2 text-[15px] font-semibold text-maroon-700 group-hover:underline dark:text-maroon-300';

// Server component: membership plans/add-ons and the hero copy are read
// server-side (same sources as /api/memberships and /api/content-blocks);
// ISR is configured in ./layout.tsx. Only the application form is a client
// island.
export default async function JoinPage() {
  const [{ plans, addons }, blocks, potClubProductCode] = await Promise.all([
    getMembershipOptions(),
    getContentBlocks(['join.hero']),
    getPotClubProductCode(),
  ]);
  const heroTitle = blocks['join.hero']?.title || 'Join the Club';
  const heroBody = blocks['join.hero']?.body || 'Choose player registration via PlayHQ or apply for social membership below.';

  return (
    <>
      <section className="page-hero px-0">
        <div className="nd-wrap">
          <nav aria-label="Breadcrumb" className="nd-crumbs">
            <Link href="/">Home</Link> / <span aria-current="page">Join</span>
          </nav>
          <ScrollReveal onMount delay={0}><h1 className="page-hero-title">{heroTitle}</h1></ScrollReveal>
          <ScrollReveal onMount delay={0.15}><p className="page-hero-subtitle">{heroBody}</p></ScrollReveal>
        </div>
      </section>

      <section className="nd-sec-tight" aria-labelledby="join-choose-title">
        <div className="nd-wrap">
          <h2 id="join-choose-title" className="nd-h2 mb-4" style={{ fontSize: 'clamp(24px, 3vw, 32px)' }}>1. Choose a membership</h2>
          <ScrollReveal stagger className="nd-radio-cards">
            <ScrollRevealItem>
              <Link href="/player-registration" className={`group ${choiceCardClass}`}>
                <span className="nd-pill self-start">PlayHQ</span>
                <h3 className="font-display text-[19px] font-semibold text-content-primary">Player Registration</h3>
                <p className="text-[14.5px] text-content-secondary">Choose the current seasonal PlayHQ registration option and review the club terms.</p>
                <span className={choiceCtaClass}>View Player Registration <span aria-hidden="true">→</span></span>
              </Link>
            </ScrollRevealItem>

            <ScrollRevealItem>
              <a href="#social-membership" className={`group ${choiceCardClass}`}>
                <span className="nd-pill nd-pill-gold self-start">{SOCIAL_MEMBERSHIP_ELIGIBILITY}</span>
                <h3 className="font-display text-[19px] font-semibold text-content-primary">Social Membership</h3>
                <p className="text-[14.5px] text-content-secondary">Apply online, then choose secure card payment or bank transfer.</p>
                <p className="font-semibold text-content-primary">From {plans.length ? formatCurrency(plans[0].price) : '...'}</p>
                <span className={choiceCtaClass}>Apply online <span aria-hidden="true">↓</span></span>
              </a>
            </ScrollRevealItem>

            <ScrollRevealItem>
              <Link href="/pot-club" className={`group ${choiceCardClass}`}>
                <span className="nd-pill self-start">Engraved glass</span>
                <h3 className="font-display text-[19px] font-semibold text-content-primary">Pot Club</h3>
                <p className="text-[14.5px] text-content-secondary">Order your NDCC Pot Club engraved glass and pay online.</p>
                <span className={choiceCtaClass}>Order a Pot Club pot <span aria-hidden="true">→</span></span>
              </Link>
            </ScrollRevealItem>
          </ScrollReveal>
        </div>
      </section>

      <section className="nd-sec-tight pt-0" aria-label="Social membership application and fees">
        <div className="nd-wrap nd-two-col">
          <div id="social-membership" className="scroll-mt-24">
            <SocialMembershipForm plans={plans} addons={addons} potClubProductCode={potClubProductCode}
              heading={
                <div className="mb-5">
                  <span className="nd-eyebrow">Social Membership</span>
                  <h2 className="mt-1 font-display font-semibold tracking-tight text-content-primary" style={{ fontSize: 'clamp(22px, 2.6vw, 28px)' }}>2. Your details</h2>
                </div>
              }
            />
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            {plans.length > 0 && (
              <div className="nd-card p-[26px]">
                <h2 className="mb-3 font-display text-[19px] font-semibold text-content-primary">Fees</h2>
                <p className="mb-2 text-sm font-semibold text-content-muted">Membership Plan</p>
                <dl className="nd-facts grid-cols-[minmax(0,1fr)_auto] text-[15px]">
                  {plans.map((plan) => (
                    <div key={plan.id} className="contents">
                      <dt>{plan.name}</dt>
                      <dd className="text-right">{formatCurrency(plan.price)}</dd>
                    </div>
                  ))}
                </dl>
                {addons.length > 0 && (
                  <>
                    <p className="mb-2 mt-5 text-sm font-semibold text-content-muted">Optional Add-ons</p>
                    <dl className="nd-facts grid-cols-[minmax(0,1fr)_auto] text-[15px]">
                      {addons.map((addon) => (
                        <div key={addon.id} className="contents">
                          <dt>{addon.name} {addon.usage_limit ? `(limit ${addon.usage_limit})` : ''}</dt>
                          <dd className="text-right">{formatCurrency(addon.price)}</dd>
                        </div>
                      ))}
                    </dl>
                  </>
                )}
              </div>
            )}

            <ScrollReveal>
              <h2 className="mb-3 font-display text-[19px] font-semibold text-content-primary">How joining works</h2>
              <Accordion
                className="rounded-[22px]"
                items={[
                  {
                    id: 'player',
                    question: 'How do I register as a player?',
                    answer: (
                      <p>
                        Select the appropriate seasonal option on the{' '}
                        <Link href="/player-registration" className="font-semibold text-maroon-700 underline underline-offset-2 dark:text-maroon-200">
                          Player Registration page
                        </Link>
                        .
                      </p>
                    ),
                  },
                  {
                    id: 'social',
                    question: 'How does social membership work?',
                    answer: (
                      <p>
                        {SOCIAL_MEMBERSHIP_ELIGIBILITY}. Apply online using the{' '}
                        <a href="#social-membership" className="font-semibold text-maroon-700 underline underline-offset-2 dark:text-maroon-200">
                          social membership form
                        </a>
                        . After submission, choose secure card payment or use the generated bank transfer reference.
                      </p>
                    ),
                  },
                ]}
              />
            </ScrollReveal>

            <div>
              <Link href="/club-account" className="btn-secondary">Create or manage your club account</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
