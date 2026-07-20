'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SafeImage from '@/components/common/SafeImage';
import Button from '@/components/ui/Button';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import type { GalleryPhoto } from '@/lib/public-data';
import { buildGalleryDownloadUrl, galleryDownloadFilename } from '@/lib/gallery/shared';

const INITIAL_VISIBLE = 36;
const LOAD_MORE_STEP = 36;

type AlbumClientProps = {
  albumTitle: string;
  albumAllowsDownload: boolean;
  photos: GalleryPhoto[];
};

function photoAlt(photo: GalleryPhoto, index: number, total: number, albumTitle: string) {
  return photo.alt_text || photo.caption || photo.title || `${albumTitle} photograph ${index + 1} of ${total}`;
}

/**
 * Download target for one photo. Storage-backed photos use the ORIGINAL file
 * via the public object URL with Supabase's `download` parameter; legacy
 * URL-based photos keep the plain anchor `download` behaviour.
 */
function downloadTarget(photo: GalleryPhoto): { href: string; downloadAttr: string | true } {
  if (photo.original_url) {
    const filename = galleryDownloadFilename(photo.original_filename, photo.mime_type);
    return { href: buildGalleryDownloadUrl(photo.original_url, filename), downloadAttr: filename };
  }
  return { href: photo.image_url, downloadAttr: true };
}

export default function AlbumClient({ albumTitle, albumAllowsDownload, photos }: AlbumClientProps) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const visiblePhotos = useMemo(() => photos.slice(0, visibleCount), [photos, visibleCount]);
  const activePhoto = activeIndex === null ? null : photos[activeIndex] ?? null;

  const closeLightbox = useCallback(() => {
    setActiveIndex(null);
    triggerRef.current?.focus();
    triggerRef.current = null;
  }, []);

  const step = useCallback((delta: number) => {
    setActiveIndex((current) => {
      if (current === null) return current;
      const next = current + delta;
      if (next < 0 || next >= photos.length) return current;
      // Keep the grid's rendered range in sync so focus return always lands
      // on a mounted tile.
      setVisibleCount((count) => Math.max(count, next + 1));
      return next;
    });
  }, [photos.length]);

  useEffect(() => {
    if (activeIndex === null) return;
    dialogRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeLightbox();
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        step(-1);
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        step(1);
        return;
      }
      if (event.key === 'Tab') {
        // Focus trap: cycle within the dialog.
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusable = Array.from(
          dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
        );
        if (focusable.length === 0) {
          event.preventDefault();
          dialog.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (event.shiftKey && (active === first || active === dialog)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, closeLightbox, step]);

  const total = photos.length;

  return (
    <>
      <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 list-none p-0" aria-label={`${albumTitle} photos`}>
        {visiblePhotos.map((photo, index) => (
          <li key={photo.id}>
            <button
              type="button"
              onClick={(event) => {
                triggerRef.current = event.currentTarget;
                setActiveIndex(index);
              }}
              aria-label={`View photo ${index + 1} of ${total}: ${photoAlt(photo, index, total, albumTitle)}`}
              className="relative block w-full aspect-[4/3] rounded-xl overflow-hidden group border border-edge-subtle bg-gray-900 shadow-sm hover:shadow-lift hover:-translate-y-0.5 transition-all duration-300 motion-reduce:transition-none motion-reduce:hover:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-500"
            >
              <SafeImage
                src={photo.image_url}
                alt={photoAlt(photo, index, total, albumTitle)}
                fill
                loading={index < 8 ? undefined : 'lazy'}
                className="object-cover group-hover:scale-105 transition-transform duration-300 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                fallback={<div className="absolute inset-0 bg-gray-900" aria-hidden="true" />}
              />
            </button>
          </li>
        ))}
      </ul>

      {visibleCount < total && (
        <div className="mt-8 text-center">
          <Button variant="secondary" onClick={() => setVisibleCount((count) => Math.min(total, count + LOAD_MORE_STEP))}>
            Show more photos ({total - visibleCount} remaining)
          </Button>
        </div>
      )}

      {activePhoto && activeIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/90 p-3 sm:p-8 flex items-center justify-center"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeLightbox();
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Photo ${activeIndex + 1} of ${total}: ${photoAlt(activePhoto, activeIndex, total, albumTitle)}`}
            tabIndex={-1}
            className="w-full max-w-5xl bg-black rounded-xl overflow-hidden outline-none"
          >
            <div className="relative aspect-[4/3] sm:aspect-video">
              <SafeImage
                src={activePhoto.image_url}
                alt={photoAlt(activePhoto, activeIndex, total, albumTitle)}
                fill
                sizes="100vw"
                className="object-contain"
                fallback={
                  <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">
                    Image unavailable
                  </div>
                }
              />
              <button
                type="button"
                onClick={() => step(-1)}
                disabled={activeIndex === 0}
                aria-label="Previous photo"
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <ChevronLeft className="h-6 w-6" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                disabled={activeIndex >= total - 1}
                aria-label="Next photo"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <ChevronRight className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>
            <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-white">
              <div className="min-w-0">
                <p className="text-sm text-white/70" aria-live="polite">{activeIndex + 1} of {total}</p>
                {activePhoto.title && <p className="font-semibold truncate">{activePhoto.title}</p>}
                {activePhoto.caption && <p className="text-sm text-white/80">{activePhoto.caption}</p>}
              </div>
              <div className="flex gap-2 shrink-0">
                {albumAllowsDownload && activePhoto.allow_download && (() => {
                  const target = downloadTarget(activePhoto);
                  return (
                    <a href={target.href} download={target.downloadAttr} rel="noopener" className="inline-flex">
                      <Button variant="secondary" size="sm">
                        <Download className="h-4 w-4 mr-1" aria-hidden="true" />
                        Download original
                      </Button>
                    </a>
                  );
                })()}
                <Button variant="ghost" size="sm" onClick={closeLightbox} className="text-white">
                  <X className="h-4 w-4 mr-1" aria-hidden="true" />
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
