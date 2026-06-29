'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import SafeImage from '@/components/common/SafeImage';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { FACEBOOK_URL, INSTAGRAM_URL, INSTAGRAM_HANDLE } from '@/lib/constants';
import type { GalleryPhoto } from '@/lib/public-data';

export default function GalleryClient({ photos, error }: { photos: GalleryPhoto[]; error: string | null }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const activePhoto = useMemo(
    () => (activeIndex === null ? null : photos[activeIndex] ?? null),
    [activeIndex, photos]
  );

  return (
    <>
      <section className="section-padding">
        <div className="container-width max-w-6xl mx-auto">
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-5 mb-12">
            {error ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <h2 className="text-2xl font-display font-bold text-maroon-800 mb-2">Gallery could not be loaded</h2>
                  <p className="text-gray-600 font-body">{error}</p>
                </CardContent>
              </Card>
            ) : photos.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <h2 className="text-2xl font-display font-bold text-maroon-800 mb-2">No published gallery images</h2>
                  <p className="text-gray-600 font-body">Published gallery images will appear here after they are added in the CMS.</p>
                </CardContent>
              </Card>
            ) : photos.map((photo, index) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => setActiveIndex(index)}
                className="relative mb-5 block w-full break-inside-avoid aspect-[4/3] rounded-2xl overflow-hidden group text-left border border-gray-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
              >
                <SafeImage
                  src={photo.image_url}
                  alt={photo.alt_text || photo.caption || photo.title}
                  fill
                  className="object-contain bg-gray-900 group-hover:scale-105 transition-transform duration-300"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  fallback={<div className="absolute inset-0 bg-gray-900" aria-hidden="true" />}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent flex items-end p-4">
                  <span className="text-white font-display font-bold text-sm">{photo.caption || photo.title}</span>
                </div>
              </button>
            ))}
          </div>

          <h2 className="section-title text-center mb-8">Follow Us for More</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            <Link href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" className="group">
              <Card hover className="h-full">
                <CardContent className="p-8 text-center">
                  <h3 className="text-xl font-display font-bold text-gray-900 mb-2">Facebook</h3>
                  <p className="text-gray-600 font-body text-sm">
                    Match reports, event photos, and club news shared regularly on our Facebook page.
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Link href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="group">
              <Card hover className="h-full">
                <CardContent className="p-8 text-center">
                  <h3 className="text-xl font-display font-bold text-gray-900 mb-2">Instagram</h3>
                  <p className="text-gray-600 font-body text-sm">
                    Follow {INSTAGRAM_HANDLE} for behind-the-scenes content, training shots, and match day highlights.
                  </p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      </section>

      {activePhoto && (
        <div className="fixed inset-0 z-50 bg-black/85 p-4 sm:p-8 flex items-center justify-center">
          <div className="w-full max-w-5xl bg-black rounded-xl overflow-hidden">
            <div className="relative aspect-video">
              <SafeImage
                src={activePhoto.image_url}
                alt={activePhoto.alt_text || activePhoto.caption || activePhoto.title}
                fill
                sizes="100vw"
                className="object-contain"
                fallback={
                  <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">
                    Image unavailable
                  </div>
                }
              />
            </div>
            <div className="px-4 py-3 flex items-center justify-between gap-3 text-white">
              <div>
                <p className="font-semibold">{activePhoto.title}</p>
                <p className="text-sm text-white/80">{activePhoto.caption}</p>
              </div>
              <div className="flex gap-2">
                {activePhoto.allow_download && (
                  <a href={activePhoto.image_url} download className="inline-flex">
                    <Button variant="secondary" size="sm">Download</Button>
                  </a>
                )}
                <Button variant="ghost" size="sm" onClick={() => setActiveIndex(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
