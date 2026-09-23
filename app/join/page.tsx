import Link from 'next/link';
import ScrollReveal, { ScrollRevealItem } from '@/components/common/ScrollReveal';
import Card, { CardContent } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/utils';
import Accordion from '@/components/common/Accordion';
import { getContentBlocks } from '@/lib/content-blocks';
import { getMembershipOptions } from '@/lib/public-form-options';
import SocialMembershipForm from './SocialMembershipForm';

// Server component: membership plans/add-ons and the hero copy are read
// server-side (same sources as /api/memberships and /api/content-blocks);
// ISR is configured in ./layout.tsx. Only the application form is a client
// island.
export default async function JoinPage() {
  const [{ plans, addons }, blocks] = await Promise.all([
    getMembershipOptions(),
    getContentBlocks(['join.hero']),
  ]);
  const heroTitle = blocks['join.hero']?.title || 'Join the Club';
  const heroBody = blocks['join.hero']?.body || 'Choose player registration via PlayHQ or apply for social membership below.';

  return (
    <>
      <section className="page-hero">
        <div className="container-width">
          <ScrollReveal onMount delay={0}><h1 className="page-hero-title">{heroTitle}</h1></ScrollReveal>
          <ScrollReveal onMount delay={0.15}><p className="page-hero-subtitle">{heroBody}</p></ScrollReveal>
        </div>
      </section>
      <div className="container-width px-4 sm:px-6 lg:px-8 py-12 space-y-10">
        <ScrollReveal stagger className="grid md:grid-cols-2 gap-6">
          <ScrollRevealItem>
            <Card>
              <CardContent className="p-6 space-y-3">
                <h2 className="text-2xl font-display font-bold">Player Registration</h2>
                <p className="text-content-muted">Choose the current seasonal PlayHQ registration option and review the club terms.</p>
                <Link href="/player-registration" className="focus-ring inline-flex min-h-11 items-center justify-center rounded-[10px] bg-maroon-700 px-6 py-3 font-body font-semibold text-white transition-colors hover:bg-maroon-800">
                  View Player Registration
                </Link>
              </CardContent>
            </Card>
          </ScrollRevealItem>

          <ScrollRevealItem>
            <Card>
              <CardContent className="p-6 space-y-3">
                <h2 className="text-2xl font-display font-bold">Social Membership</h2>
                <p className="text-content-muted">Apply online, then choose secure card payment or bank transfer.</p>
                <p className="font-semibold">From {plans.length ? formatCurrency(plans[0].price) : '...'}</p>
              </CardContent>
            </Card>
          </ScrollRevealItem>
        </ScrollReveal>

        <ScrollReveal>
          <h2 className="section-title mb-4">How joining works</h2>
          <Accordion
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
                    Apply online using the form below. After submission, choose secure card payment or use the generated bank transfer reference.
                  </p>
                ),
              },
            ]}
          />
        </ScrollReveal>

        <SocialMembershipForm plans={plans} addons={addons} />
      </div>
    </>
  );
}
