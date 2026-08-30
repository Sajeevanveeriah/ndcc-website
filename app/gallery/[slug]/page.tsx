import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ScrollReveal from '@/components/common/ScrollReveal';
import { getPublicAlbumBySlug } from '@/lib/public-data';
import { isValidAlbumSlug } from '@/lib/gallery/shared';
import AlbumClient from './AlbumClient';

// Request-time rendering, matching /gallery: album content is mutable CMS data.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  // notFound() here (not only in the page body) so the response carries a real
  // 404 status instead of streaming the not-found UI under a 200.
  if (!isValidAlbumSlug(slug)) notFound();
  const detail = await getPublicAlbumBySlug(slug);
  if (!detail) notFound();
  return {
    title: `${detail.album.title} | Gallery`,
    description: detail.album.description || `Photo album from Newcomb and District Cricket Club: ${detail.album.title}.`,
    alternates: { canonical: `/gallery/${detail.album.slug}` },
  };
}

function formatEventDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default async function GalleryAlbumPage({ params }: PageProps) {
  const { slug } = await params;
  if (!isValidAlbumSlug(slug)) notFound();
  const detail = await getPublicAlbumBySlug(slug);
  if (!detail) notFound();

  const { album, photos } = detail;
  const eventDate = formatEventDate(album.event_date);

  return (
    <>
      <section className="page-hero">
        <div className="container-width">
          <ScrollReveal onMount delay={0}>
            <p className="text-sm font-body mb-2">
              <Link href="/gallery" className="underline underline-offset-4 hover:no-underline">Gallery</Link>
              <span aria-hidden="true"> / </span>
              <span className="sr-only">Current album: </span>{album.title}
            </p>
          </ScrollReveal>
          <ScrollReveal onMount delay={0.1}><h1 className="page-hero-title">{album.title}</h1></ScrollReveal>
          <ScrollReveal onMount delay={0.2}>
            <p className="page-hero-subtitle">
              {[eventDate, album.season_label, `${photos.length} photo${photos.length === 1 ? '' : 's'}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </ScrollReveal>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-width max-w-6xl mx-auto">
          {album.description && (
            <p className="text-content-secondary font-body max-w-3xl mb-10">{album.description}</p>
          )}
          {photos.length === 0 ? (
            <div className="bg-surface-card border border-edge-subtle rounded-2xl p-8 text-center">
              <h2 className="text-2xl font-display font-bold text-maroon-800 dark:text-maroon-200 mb-2">No photos published yet</h2>
              <p className="text-content-muted font-body">Photos will appear here once they are published in the CMS.</p>
            </div>
          ) : (
            <AlbumClient albumTitle={album.title} albumAllowsDownload={album.allow_download} photos={photos} />
          )}
        </div>
      </section>
    </>
  );
}
