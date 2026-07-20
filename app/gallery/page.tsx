import type { Metadata } from 'next';
import Link from 'next/link';
import ScrollReveal from '@/components/common/ScrollReveal';
import SafeImage from '@/components/common/SafeImage';
import Card, { CardContent } from '@/components/ui/Card';
import { getPublicGallery, getPublicGalleryAlbums } from '@/lib/public-data';
import GalleryClient from './GalleryClient';

export const metadata: Metadata = {
  title: 'Gallery',
};

// Request-time rendering: the gallery is mutable CMS content, so it must never
// be served from a build-time prerender or the ISR cache.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

function formatEventDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default async function GalleryPage() {
  const [{ data: photos }, { data: albums }] = await Promise.all([
    getPublicGallery(),
    getPublicGalleryAlbums(),
  ]);

  return (
    <>
      <section className="page-hero">
        <div className="container-width">
          <ScrollReveal onMount delay={0}><h1 className="page-hero-title">Gallery</h1></ScrollReveal>
          <ScrollReveal onMount delay={0.15}><p className="page-hero-subtitle">
            Match day photos, team shots, and club memories, loaded server-side from published CMS records.
          </p></ScrollReveal>
        </div>
      </section>

      {albums.length > 0 && (
        <section className="section-padding pb-0" aria-labelledby="gallery-albums-heading">
          <div className="container-width max-w-6xl mx-auto">
            <h2 id="gallery-albums-heading" className="section-title text-center mb-8">Photo Albums</h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 list-none p-0">
              {albums.map((album) => {
                const eventDate = formatEventDate(album.event_date);
                return (
                  <li key={album.id}>
                    <Link href={`/gallery/${album.slug}`} className="group block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-500 rounded-2xl">
                      <Card hover className="h-full overflow-hidden">
                        <div className="relative aspect-[3/2] bg-gray-900">
                          <SafeImage
                            src={album.cover_image_url || ''}
                            alt=""
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-300 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                            fallback={<div className="absolute inset-0 bg-gradient-to-br from-maroon-900 to-gray-900" aria-hidden="true" />}
                          />
                        </div>
                        <CardContent className="p-5">
                          <h3 className="text-lg font-display font-bold text-content-primary mb-1">{album.title}</h3>
                          {album.description && (
                            <p className="text-sm text-content-muted font-body mb-2 line-clamp-2">{album.description}</p>
                          )}
                          <p className="text-xs text-content-muted font-body">
                            {eventDate ? `${eventDate} · ` : ''}
                            {album.season_label ? `${album.season_label} · ` : ''}
                            {album.image_count} photo{album.image_count === 1 ? '' : 's'}
                            {album.allow_download ? ' · Downloads available' : ''}
                          </p>
                        </CardContent>
                      </Card>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      <GalleryClient
        photos={photos}
        error={null}
        heading={albums.length > 0 && photos.length > 0 ? 'More Club Photos' : undefined}
        showEmptyState={albums.length === 0}
      />
    </>
  );
}
