import type { Metadata } from 'next';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import Card, { CardContent } from '@/components/ui/Card';
import { getPublicPlayerRegistration } from '@/lib/public-player-registration';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function generateMetadata(): Promise<Metadata> {
  const registration = await getPublicPlayerRegistration();
  const title = registration?.pageTitle || 'Player Registration';
  return {
    title,
    description: registration?.introText || 'Player registration for Newcomb and District Cricket Club.',
    alternates: { canonical: '/player-registration' },
  };
}

function formatDateTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Australia/Melbourne',
  }).format(date);
}

export default async function PlayerRegistrationPage() {
  const registration = await getPublicPlayerRegistration();
  const pageTitle = registration?.pageTitle || 'Player Registration';
  const canRegister = Boolean(
    registration
    && (registration.availability === 'open' || registration.availability === 'waitlist')
    && registration.options.length > 0,
  );
  const opensAt = formatDateTime(registration?.opensAt || null);
  const closesAt = formatDateTime(registration?.closesAt || null);

  let unavailableMessage = 'Player registration is currently unavailable. Please check back later or contact the club.';
  if (registration?.availability === 'opening_soon') {
    unavailableMessage = opensAt ? `Player registration opens on ${opensAt}.` : 'Player registration is opening soon.';
  } else if (registration?.availability === 'closed') {
    unavailableMessage = 'Player registration is currently closed.';
  } else if (registration && registration.options.length === 0) {
    unavailableMessage = 'No valid registration options are currently published.';
  }

  const cardAccents = ['border-t-maroon-700', 'border-t-sky-500', 'border-t-gold-500'];

  return (
    <>
      <section className="page-hero">
        <div className="container-width">
          <h1 className="page-hero-title">{pageTitle}</h1>
          {registration?.introText && <p className="page-hero-subtitle">{registration.introText}</p>}
        </div>
      </section>

      <main className="container-width space-y-12 px-4 py-12 sm:px-6 lg:px-8">
        <section aria-labelledby="registration-choices-title">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="registration-choices-title" className="section-title">Choose your registration</h2>
              <p className="mt-2 text-content-muted">Each registration is completed securely on PlayHQ.</p>
            </div>
            {registration?.availability === 'waitlist' && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">Waitlist registration</span>
            )}
          </div>

          {canRegister && registration ? (
            <div className="grid gap-5 md:grid-cols-3">
              {registration.options.map((option, index) => (
                <Card key={`${option.label}-${option.url}`} className={`h-full border-t-4 ${cardAccents[index % cardAccents.length]}`}>
                  <CardContent className="flex h-full flex-col p-6">
                    <span className="text-sm font-bold uppercase tracking-wide text-maroon-700 dark:text-maroon-200">Option {index + 1}</span>
                    <h3 className="mt-2 text-xl font-display font-bold text-content-primary">{option.label}</h3>
                    <p className="mt-3 flex-1 text-sm text-content-muted">Continue to PlayHQ to complete this registration securely.</p>
                    <a
                      href={option.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="focus-ring mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-maroon-700 px-4 py-3 text-center font-semibold text-white transition-colors hover:bg-maroon-800"
                      aria-label={`${option.label} on PlayHQ (opens in a new tab)`}
                    >
                      Register on PlayHQ <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    </a>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-edge-subtle bg-surface-card p-6" role="status">
              <h3 className="text-lg font-display font-bold text-content-primary">Registration unavailable</h3>
              <p className="mt-2 text-content-muted">{unavailableMessage}</p>
            </div>
          )}

          {canRegister && closesAt && (
            <p className="mt-4 text-sm text-content-muted">Published registration closes {closesAt}.</p>
          )}
        </section>

        {registration && registration.termsSections.length > 0 && (
          <section aria-labelledby="registration-terms-title" className="border-t border-edge-subtle pt-10">
            <div className="mb-7 flex items-start gap-3">
              <ShieldCheck className="mt-1 h-6 w-6 shrink-0 text-maroon-700 dark:text-maroon-200" aria-hidden="true" />
              <div>
                <h2 id="registration-terms-title" className="section-title">{registration.termsTitle}</h2>
                <p className="mt-2 text-content-muted">Please read these conditions before completing a player registration.</p>
              </div>
            </div>
            <div className="space-y-7">
              {registration.termsSections.map((section) => (
                <article key={section.heading}>
                  <h3 className="text-xl font-display font-bold text-content-primary">{section.heading}</h3>
                  <p className="mt-2 max-w-5xl leading-7 text-content-secondary">{section.body}</p>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
