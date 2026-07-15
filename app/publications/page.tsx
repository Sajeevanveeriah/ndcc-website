import type { Metadata } from 'next';
import Link from 'next/link';
import ScrollReveal from '@/components/common/ScrollReveal';
import PublicationCard from '@/components/publications/PublicationCard';
import Card, { CardContent } from '@/components/ui/Card';
import {
  getPublishedPublications,
  isPublicationType,
  publicationTypeLabel,
  type PublicationType,
} from '@/lib/public-publications';

// Request-time rendering: publications are mutable CMS content, so they must
// never be served from a build-time prerender or the ISR cache.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export const metadata: Metadata = {
  title: 'Publications | Newcomb & District Cricket Club',
  description:
    'Club newsletters and weekly match reports from the Newcomb & District Cricket Club — monthly newsletters, weekly newsletters and match reports.',
};

const LIST_LIMIT = 60;

const FILTERS: Array<{ value: 'all' | PublicationType; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'monthly_newsletter', label: 'Monthly Newsletters' },
  { value: 'weekly_newsletter', label: 'Weekly Newsletters' },
  { value: 'weekly_match_report', label: 'Match Reports' },
];

export default async function PublicationsPage({
  searchParams,
}: {
  searchParams?: { type?: string };
}) {
  const activeType = isPublicationType(searchParams?.type) ? searchParams!.type as PublicationType : undefined;
  const publications = await getPublishedPublications({
    type: activeType,
    limit: LIST_LIMIT,
  });
  const featured = publications.find((p) => p.featured) ?? publications[0] ?? null;
  const rest = featured ? publications.filter((p) => p.id !== featured.id) : publications;

  return (
    <>
      <section className="page-hero">
        <div className="container-width">
          <h1 className="page-hero-title">Publications</h1>
          <p className="page-hero-subtitle">
            Club newsletters and weekly match reports — everything the Dinos put in writing, in one place.
          </p>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-width">
          {/* Filter tabs */}
          <nav aria-label="Filter publications" className="mb-8 flex flex-wrap gap-2">
            {FILTERS.map((filter) => {
              const isActive = (filter.value === 'all' && !activeType) || filter.value === activeType;
              const href = filter.value === 'all' ? '/publications' : `/publications?type=${filter.value}`;
              return (
                <Link
                  key={filter.value}
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`px-4 py-2 rounded-full text-sm font-body font-semibold border transition-colors focus-ring ${
                    isActive
                      ? 'bg-maroon-700 text-white border-maroon-700'
                      : 'bg-surface-card text-content-secondary border-edge-subtle hover:border-maroon-300 hover:text-maroon-700 dark:hover:text-maroon-200'
                  }`}
                >
                  {filter.label}
                </Link>
              );
            })}
          </nav>

          {publications.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center">
                <p className="font-body text-content-muted">
                  {activeType
                    ? `No published ${publicationTypeLabel(activeType).toLowerCase()}s yet. Check back soon.`
                    : 'No publications have been published yet. Check back soon.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Featured latest publication */}
              {featured && (
                <ScrollReveal>
                  <Link
                    href={`/publications/${featured.slug}`}
                    className="group mb-10 block overflow-hidden rounded-2xl border border-edge-subtle bg-surface-card shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift focus-ring"
                  >
                    <div className="band-maroon px-6 py-8 sm:px-10 sm:py-10">
                      <p className="eyebrow-gold">
                        Latest · {publicationTypeLabel(featured.publication_type)}
                      </p>
                      <h2 className="font-display text-2xl sm:text-3xl font-bold uppercase tracking-wide mb-2 group-hover:underline decoration-gold-300/70 underline-offset-4">
                        {featured.title}
                      </h2>
                      <p className="font-body text-maroon-100 text-sm mb-1">
                        {new Date(featured.issue_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
                        {featured.season_label ? ` · ${featured.season_label}` : ''}
                        {featured.round_label ? ` · ${featured.round_label}` : ''}
                      </p>
                      {featured.summary && (
                        <p className="font-body text-maroon-100/90 max-w-3xl">{featured.summary}</p>
                      )}
                    </div>
                  </Link>
                </ScrollReveal>
              )}

              <ScrollReveal stagger className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((publication) => (
                  <PublicationCard key={publication.id} publication={publication} />
                ))}
              </ScrollReveal>
              {publications.length >= LIST_LIMIT && (
                <p className="mt-8 text-center text-sm font-body text-content-muted">
                  Showing the {LIST_LIMIT} most recent publications. Use the filters above to narrow the list.
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
}
