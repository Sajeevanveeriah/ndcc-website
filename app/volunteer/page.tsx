import Card, { CardContent } from '@/components/ui/Card';
import ScrollReveal, { ScrollRevealItem } from '@/components/common/ScrollReveal';
import { VOLUNTEER_ROLES, CLUB_NAME } from '@/lib/constants';
import { getContentBlocks } from '@/lib/content-blocks';
import { getVolunteerPositionTitles } from '@/lib/public-form-options';
import VolunteerForm from './VolunteerForm';

// Server component: CMS volunteer positions and hero copy are read
// server-side (same sources as /api/volunteer-positions and
// /api/content-blocks); ISR is configured in ./layout.tsx. Only the
// registration form is a client island.

const ROLE_DETAILS = [
  {
    title: 'Canteen',
    description:
      'Help run our match-day canteen, serving food and drinks to players, families, and supporters. A great way to meet people and be part of the action.',
    icon: (
      <svg className="w-8 h-8 text-maroon-600 dark:text-maroon-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75-1.5.75a3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0L3 16.5m18-12.75H3" />
      </svg>
    ),
  },
  {
    title: 'Scorer',
    description:
      'Keep the scorebook during matches for our senior or junior teams. Training provided for newcomers — no prior experience necessary, just a keen eye.',
    icon: (
      <svg className="w-8 h-8 text-maroon-600 dark:text-maroon-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
      </svg>
    ),
  },
  {
    title: 'Ground Setup',
    description:
      'Assist with setting up and packing down on match days — laying out the pitch, moving furniture, and ensuring our ground is looking its best for players and visitors.',
    icon: (
      <svg className="w-8 h-8 text-maroon-600 dark:text-maroon-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" />
      </svg>
    ),
  },
  {
    title: 'General Help',
    description:
      'Pitch in wherever needed — from helping at events and fundraisers to welcoming new members. Every contribution makes a difference to our club.',
    icon: (
      <svg className="w-8 h-8 text-maroon-600 dark:text-maroon-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
  },
];

export default async function VolunteerPage() {
  const [positionTitles, blocks] = await Promise.all([
    getVolunteerPositionTitles(),
    getContentBlocks(['volunteer.hero']),
  ]);
  const heroTitle = blocks['volunteer.hero']?.title || 'Volunteer with Us';
  const heroBody = blocks['volunteer.hero']?.body
    || 'Our club runs on the dedication of volunteers. Whether you can spare an hour or a whole day, your help makes a real difference to cricket in our community.';
  const roleOptions = positionTitles.length > 0
    ? positionTitles.map((title) => ({ value: title, label: title }))
    : VOLUNTEER_ROLES.map((r) => ({ value: r, label: r }));

  return (
    <>
      {/* Hero */}
      <section className="page-hero">
        <div className="container-width">
          <ScrollReveal onMount delay={0}><h1 className="page-hero-title">{heroTitle}</h1></ScrollReveal>
          <ScrollReveal onMount delay={0.15}><p className="page-hero-subtitle">{heroBody}</p></ScrollReveal>
        </div>
      </section>

      {/* Intro */}
      <section className="section-padding surface-blue-band">
        <ScrollReveal className="container-width max-w-3xl mx-auto text-center">
          <h2 className="section-title">Why Volunteer?</h2>
          <p className="text-content-muted font-body text-lg leading-relaxed">
            {CLUB_NAME} is a community-run club, and every match day, training session, and event
            relies on people like you stepping up. Volunteering is a brilliant way to connect with
            fellow members, contribute to junior development, and keep the Dinos thriving for
            generations to come. No experience necessary — just enthusiasm and a willingness to lend
            a hand.
          </p>
        </ScrollReveal>
      </section>

      {/* Volunteer Roles */}
      <section className="section-padding" aria-label="Volunteer roles">
        <div className="container-width">
          <h2 className="section-title text-center mb-10">Volunteer Roles</h2>
          <ScrollReveal stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {ROLE_DETAILS.map((role) => (
              <ScrollRevealItem key={role.title}>
              <Card hover className="h-full">
                <CardContent className="text-center py-8">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-maroon-50 dark:bg-maroon-950 mb-4">
                    {role.icon}
                  </div>
                  <h3 className="font-display font-bold text-content-primary text-lg mb-2">{role.title}</h3>
                  <p className="font-body text-content-muted text-sm leading-relaxed">
                    {role.description}
                  </p>
                </CardContent>
              </Card>
              </ScrollRevealItem>
            ))}
          </ScrollReveal>
        </div>
      </section>

      {/* Registration Form */}
      <section className="section-padding surface-blue-band" aria-label="Volunteer registration form">
        <div className="container-width max-w-2xl mx-auto">
          <h2 className="section-title text-center">Register to Volunteer</h2>
          <p className="section-subtitle text-center mx-auto mb-8">
            Keen to get involved? Fill out the form and we&apos;ll match you with a role that suits your
            availability.
          </p>

          <VolunteerForm roleOptions={roleOptions} />
        </div>
      </section>
    </>
  );
}
