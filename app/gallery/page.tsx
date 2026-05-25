'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { FACEBOOK_URL, INSTAGRAM_URL, INSTAGRAM_HANDLE } from '@/lib/constants';

type GalleryPhoto = {
  id: string;
  image_url: string;
  alt_text: string;
  caption: string;
  title: string;
  allow_download: boolean;
  sort_order: number;
};

export default function GalleryPage() {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    async function loadGallery() {
      try {
        const response = await fetch('/api/gallery', { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to load gallery');
        setPhotos(result.data ?? []);
      } catch {
        setPhotos([]);
      }
    }
    loadGallery();
  }, []);

  const activePhoto = useMemo(
    () => (activeIndex === null ? null : photos[activeIndex] ?? null),
    [activeIndex, photos]
  );

  return (
    <>
      <section className="page-hero">
        <div className="container-width">
          <h1 className="page-hero-title">Gallery</h1>
          <p className="page-hero-subtitle">
            Match day photos, team shots, and club memories. Tap a tile to view larger.
          </p>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-width max-w-5xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
            {photos.map((photo, index) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => setActiveIndex(index)}
                className="relative aspect-[4/3] rounded-xl overflow-hidden group text-left"
              >
                <Image
                  src={photo.image_url}
                  alt={photo.alt_text || photo.caption || photo.title}
                  fill
                  className="object-contain bg-gray-900 group-hover:scale-105 transition-transform duration-300"
                  sizes="(max-width: 640px) 100vw, 50vw"
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
              <Image
                src={activePhoto.image_url}
                alt={activePhoto.alt_text || activePhoto.caption || activePhoto.title}
                fill
                sizes="100vw"
                className="object-contain"
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
