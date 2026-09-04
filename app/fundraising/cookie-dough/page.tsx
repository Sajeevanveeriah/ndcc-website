import type { Metadata } from 'next';
import Image from 'next/image';
import {
  ArrowUpRight,
  CircleDollarSign,
  Cookie,
  Package,
  ReceiptText,
  Share2,
  ShoppingCart,
  UserRoundPlus,
} from 'lucide-react';
import ScrollReveal, { ScrollRevealItem } from '@/components/common/ScrollReveal';
import { COOKIE_DOUGH_FUNDRAISER_LINK } from '@/lib/public-links';

export const metadata: Metadata = {
  title: "Billy G's Cookie Dough Fundraiser",
  description:
    "Register for Newcomb and District Cricket Club's Billy G's Cookie Dough fundraiser, share your page, or purchase cookie dough to support the NDCC Dinos.",
  alternates: { canonical: '/fundraising/cookie-dough' },
  openGraph: {
    title: "Billy G's Cookie Dough Fundraiser | NDCC Dinos",
    description: 'Raise dough for the Dinos by fundraising or purchasing through the official Billy G\'s campaign.',
    images: [
      {
        url: '/images/fundraisers/billy-gs-cookie-selection.png',
        width: 650,
        height: 558,
        alt: "Billy G's Gourmet Cookie Dough tub with baked cookies",
      },
    ],
  },
};

const campaignLink = COOKIE_DOUGH_FUNDRAISER_LINK;

function CampaignLink({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <a href={campaignLink.href} target={campaignLink.target} rel={campaignLink.rel} className={className}>
      {children}
      <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="sr-only">(opens the official Billy G&apos;s campaign in a new tab)</span>
    </a>
  );
}

const steps = [
  {
    title: 'Register',
    description: 'Open the official campaign, register as an NDCC fundraiser and create your personal fundraising page.',
    icon: UserRoundPlus,
  },
  {
    title: 'Share your page',
    description: 'Send your personal link to family, friends, teammates and the local community.',
    icon: Share2,
  },
  {
    title: 'Orders support NDCC',
    description: 'Supporters order and pay online through Billy G\'s, with eligible sales attributed to the club.',
    icon: ShoppingCart,
  },
] as const;

const facts = [
  { label: '$4 club profit per tub', icon: CircleDollarSign },
  { label: '1 kg tubs', icon: Package },
  { label: 'About 40 cookies per tub', icon: Cookie },
  { label: '$22 including GST', icon: ReceiptText },
] as const;

export default function CookieDoughFundraiserPage() {
  return (
    <>
      <section className="overflow-hidden border-b border-edge-subtle bg-surface-card px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
        <div className="container-width grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.78fr)]">
          <ScrollReveal onMount>
            <div className="max-w-3xl">
              <h1 className="font-display text-4xl font-bold uppercase leading-[0.98] tracking-tight text-maroon-800 dark:text-maroon-100 sm:text-5xl lg:text-6xl">
                Billy G&apos;s Cookie Dough Fundraiser
              </h1>
              <p className="mt-4 font-display text-2xl font-semibold text-content-blue sm:text-3xl">
                Raise dough for the Dinos
              </p>
              <p className="mt-4 max-w-2xl font-body text-base leading-relaxed text-content-secondary sm:text-lg">
                Register as an NDCC fundraiser, share your page, or purchase cookie dough to support the club.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <CampaignLink className="btn-primary min-h-11 gap-2">
                  Register &amp; Start Fundraising
                </CampaignLink>
                <CampaignLink className="btn-secondary min-h-11 gap-2">
                  Buy Cookie Dough
                </CampaignLink>
              </div>
              <p className="mt-3 max-w-xl font-body text-xs leading-relaxed text-content-muted">
                Both options open the official Billy G&apos;s campaign page, where registration, orders and payments are completed.
              </p>
            </div>
          </ScrollReveal>

          <ScrollReveal direction="right" onMount>
            <div className="relative mx-auto w-full max-w-xl pb-12 pt-4 sm:pb-14">
              <div className="relative aspect-[650/558] w-full">
                <Image
                  src="/images/fundraisers/billy-gs-cookie-selection.png"
                  alt="Billy G's Gourmet Cookie Dough tub with baked cookies"
                  fill
                  priority
                  className="object-contain drop-shadow-[0_22px_26px_rgba(45,0,0,0.16)]"
                  sizes="(max-width: 1024px) 90vw, 42vw"
                />
              </div>
              <div className="absolute bottom-0 right-0 w-36 rounded-xl border border-edge-subtle bg-white p-2 shadow-card sm:w-44 dark:bg-white">
                <Image
                  src="/images/fundraisers/billy-gs-logo.png"
                  alt="Billy G's Gourmet Cookie Dough"
                  width={214}
                  height={176}
                  className="h-auto w-full"
                />
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <section className="surface-blue-band px-4 py-10 sm:px-6 lg:px-8" aria-labelledby="how-it-works-heading">
        <div className="container-width">
          <ScrollReveal>
            <h2 id="how-it-works-heading" className="section-title text-center">How it works</h2>
            <p className="section-subtitle mx-auto text-center">Three steps from registering to raising funds for NDCC.</p>
          </ScrollReveal>
          <ScrollReveal stagger className="mt-8 grid gap-6 md:grid-cols-3">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <ScrollRevealItem key={step.title} className="relative">
                  <div className="flex h-full gap-4 border-b border-edge-blue pb-6 md:border-b-0 md:border-r md:pb-0 md:pr-6 last:border-0 last:pb-0 last:pr-0">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-blue font-display text-xl font-bold text-white">
                      {index + 1}
                    </span>
                    <div>
                      <Icon className="mb-2 h-6 w-6 text-content-blue" aria-hidden="true" />
                      <h3 className="font-display text-xl font-bold text-content-blue">{step.title}</h3>
                      <p className="mt-1 font-body text-sm leading-relaxed text-content-secondary">{step.description}</p>
                    </div>
                  </div>
                </ScrollRevealItem>
              );
            })}
          </ScrollReveal>
        </div>
      </section>

      <section className="bg-surface-card px-4 py-12 sm:px-6 lg:px-8" aria-labelledby="choose-path-heading">
        <div className="container-width">
          <ScrollReveal>
            <h2 id="choose-path-heading" className="section-title text-center">Choose your path</h2>
          </ScrollReveal>
          <ScrollReveal stagger className="mt-7 grid gap-5 lg:grid-cols-2">
            <ScrollRevealItem>
              <div className="flex h-full flex-col border-l-4 border-maroon-700 bg-maroon-50 p-6 dark:bg-maroon-950/40 sm:p-8">
                <UserRoundPlus className="h-9 w-9 text-maroon-700 dark:text-maroon-200" aria-hidden="true" />
                <h3 className="mt-4 font-display text-2xl font-bold text-maroon-800 dark:text-maroon-100">I want to fundraise</h3>
                <ol className="mt-4 list-decimal space-y-2 pl-5 font-body text-sm leading-relaxed text-content-secondary sm:text-base">
                  <li>Open the NDCC campaign and select the registration option.</li>
                  <li>Create your personal fundraising page and set your goal.</li>
                  <li>Share your unique page so supporters can order through you.</li>
                </ol>
                <CampaignLink className="btn-primary mt-6 min-h-11 w-full gap-2 sm:w-fit">
                  Register &amp; Start Fundraising
                </CampaignLink>
              </div>
            </ScrollRevealItem>

            <ScrollRevealItem>
              <div className="flex h-full flex-col border-l-4 border-brand-blue bg-surface-blue-subtle p-6 sm:p-8">
                <ShoppingCart className="h-9 w-9 text-content-blue" aria-hidden="true" />
                <h3 className="mt-4 font-display text-2xl font-bold text-content-blue">I want to buy</h3>
                <ol className="mt-4 list-decimal space-y-2 pl-5 font-body text-sm leading-relaxed text-content-secondary sm:text-base">
                  <li>Open the official NDCC campaign page.</li>
                  <li>Choose the fundraiser you want to support, then select your tubs.</li>
                  <li>Complete payment on Billy G&apos;s platform and follow the campaign&apos;s collection details.</li>
                </ol>
                <CampaignLink className="btn-secondary mt-6 min-h-11 w-full gap-2 sm:w-fit">
                  Buy Cookie Dough
                </CampaignLink>
              </div>
            </ScrollRevealItem>
          </ScrollReveal>
        </div>
      </section>

      <section className="border-y border-edge-subtle bg-surface-page px-4 py-10 sm:px-6 lg:px-8" aria-label="Fundraiser facts">
        <ScrollReveal stagger className="container-width grid grid-cols-2 gap-x-5 gap-y-7 lg:grid-cols-4">
          {facts.map((fact) => {
            const Icon = fact.icon;
            return (
              <ScrollRevealItem key={fact.label}>
                <div className="flex items-center gap-3">
                  <Icon className="h-8 w-8 shrink-0 text-gold-500 dark:text-gold-300" aria-hidden="true" />
                  <p className="font-display text-lg font-bold leading-tight text-content-primary sm:text-xl">{fact.label}</p>
                </div>
              </ScrollRevealItem>
            );
          })}
        </ScrollReveal>
      </section>

      <section className="band-maroon px-4 py-12 sm:px-6 lg:px-8" aria-labelledby="cookie-dough-final-heading">
        <ScrollReveal effect="scale" className="container-width text-center">
          <h2 id="cookie-dough-final-heading" className="font-display text-3xl font-bold uppercase tracking-wide text-white sm:text-4xl">
            Ready to get started?
          </h2>
          <p className="mx-auto mt-3 max-w-2xl font-body text-base text-maroon-100 sm:text-lg">
            Choose your path and help raise dough for the Dinos.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <CampaignLink className="btn-accent min-h-11 gap-2">
              Register &amp; Start Fundraising
            </CampaignLink>
            <CampaignLink className="btn-outline-white min-h-11 gap-2">
              Buy Cookie Dough
            </CampaignLink>
          </div>
          <p className="mx-auto mt-4 max-w-2xl font-body text-xs leading-relaxed text-white/75">
            You will be redirected to the official Billy G&apos;s fundraising site. Check current product, ingredient, allergen and collection information there before ordering.
          </p>
        </ScrollReveal>
      </section>
    </>
  );
}
