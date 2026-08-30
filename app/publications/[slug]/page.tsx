import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serializeJsonLd } from '@/lib/json-ld';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import SafeImage from '@/components/common/SafeImage';
import {
  getPublishedPublicationBySlug,
  getPublishedPublications,
  publicationTypeLabel,
} from '@/lib/public-publications';
import { formatDate } from '@/lib/utils';

// Request-time rendering: publications are mutable CMS content.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.ndcc.com.au';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const publication = await getPublishedPublicationBySlug(slug);
  if (!publication) return { title: 'Publication not found | Newcomb & District Cricket Club' };
  const description = publication.summary || `${publicationTypeLabel(publication.publication_type)} from the Newcomb & District Cricket Club.`;
  return {
    title: `${publication.title} | Newcomb & District Cricket Club`,
    description,
    openGraph: {
      title: publication.title,
      description,
      type: 'article',
      url: `${SITE_URL}/publications/${publication.slug}`,
      ...(publication.cover_image_url ? { images: [{ url: publication.cover_image_url }] } : {}),
    },
  };
}

export default async function PublicationDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const publication = await getPublishedPublicationBySlug(slug);
  if (!publication) notFound();

  // Previous / next within the same publication type, ordered by issue date.
  const siblings = await getPublishedPublications({ type: publication.publication_type, limit: 200 });
  const index = siblings.findIndex((p) => p.id === publication.id);
  const newer = index > 0 ? siblings[index - 1] : null;
  const older = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': publication.publication_type === 'weekly_match_report' ? 'Article' : 'PublicationIssue',
    headline: publication.title,
    datePublished: publication.published_at || publication.issue_date,
    dateModified: publication.updated_at,
    author: { '@type': 'Organization', name: publication.author || 'Newcomb & District Cricket Club' },
    publisher: { '@type': 'Organization', name: 'Newcomb & District Cricket Club' },
    url: `${SITE_URL}/publications/${publication.slug}`,
    ...(publication.cover_image_url ? { image: publication.cover_image_url } : {}),
    ...(publication.summary ? { description: publication.summary } : {}),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <section className="page-hero">
        <div className="container-width">
          <nav aria-label="Breadcrumb" className="mb-4">
            <ol className="flex flex-wrap items-center gap-1.5 text-sm font-body text-maroon-100">
              <li><Link href="/" className="hover:text-white underline-offset-4 hover:underline">Home</Link></li>
              <li aria-hidden="true">/</li>
              <li><Link href="/publications" className="hover:text-white underline-offset-4 hover:underline">Publications</Link></li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="text-white/90">{publication.title}</li>
            </ol>
          </nav>
          <p className="eyebrow-gold">
            {publicationTypeLabel(publication.publication_type)}
            {publication.round_label ? ` · ${publication.round_label}` : ''}
            {publication.season_label ? ` · ${publication.season_label}` : ''}
          </p>
          <h1 className="page-hero-title">{publication.title}</h1>
          <p className="page-hero-subtitle">
            {formatDate(publication.issue_date)}
            {publication.author ? ` · ${publication.author}` : ''}
          </p>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-width max-w-3xl">
          <article className="card p-6 sm:p-10">
            {publication.cover_image_url && (
              <div className="relative mb-8 h-56 sm:h-72 w-full overflow-hidden rounded-xl bg-surface-muted">
                <SafeImage
                  src={publication.cover_image_url}
                  alt={`${publication.title} cover image`}
              fallback={null}
                  fill
                  sizes="(max-width: 768px) 100vw, 768px"
                  className="object-cover"
                />
              </div>
            )}
            {publication.summary && (
              <p className="mb-6 font-body text-lg font-medium text-content-secondary">{publication.summary}</p>
            )}
            <div className="whitespace-pre-wrap font-body leading-relaxed text-content-secondary">
              {publication.content}
            </div>

            {publication.document_url && (
              <div className="mt-8 rounded-xl border border-edge-subtle bg-surface-muted p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-body text-sm text-content-secondary">
                    The full issue is also available as a PDF document.
                  </p>
                  <a href={publication.document_url} download className="btn-primary text-sm px-4 py-2">
                    <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                    Download PDF
                  </a>
                </div>
                <object
                  data={publication.document_url}
                  type="application/pdf"
                  className="mt-4 hidden h-[70vh] w-full rounded-lg border border-edge-subtle sm:block"
                  aria-label={`${publication.title} PDF document`}
                >
                  <p className="p-4 font-body text-sm text-content-muted">
                    Your browser cannot display the PDF here — use the download button above.
                  </p>
                </object>
              </div>
            )}

            {publication.external_url && (
              <p className="mt-6 font-body text-sm">
                <a
                  href={publication.external_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-maroon-700 underline underline-offset-4 dark:text-maroon-200"
                >
                  Related link (opens in new tab)
                </a>
              </p>
            )}
          </article>

          {(newer || older) && (
            <nav aria-label="More publications" className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {older ? (
                <Link href={`/publications/${older.slug}`} className="card p-4 hover-lift focus-ring group">
                  <span className="flex items-center gap-1 text-xs font-body font-semibold uppercase tracking-wide text-content-muted">
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> Previous
                  </span>
                  <span className="mt-1 block font-display font-bold text-content-primary group-hover:text-maroon-700">{older.title}</span>
                </Link>
              ) : <span aria-hidden="true" />}
              {newer && (
                <Link href={`/publications/${newer.slug}`} className="card p-4 hover-lift focus-ring group text-right">
                  <span className="flex items-center justify-end gap-1 text-xs font-body font-semibold uppercase tracking-wide text-content-muted">
                    Next <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <span className="mt-1 block font-display font-bold text-content-primary group-hover:text-maroon-700">{newer.title}</span>
                </Link>
              )}
            </nav>
          )}

          <p className="mt-8">
            <Link href="/publications" className="btn-secondary text-sm px-4 py-2">
              Back to all publications
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
