'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import SafeImage from '@/components/common/SafeImage';
import Card, { CardContent } from '@/components/ui/Card';
import { parseNewsContent, type NewsGalleryImage } from '@/lib/news-gallery';
import type { PublicNewsRecord } from '@/lib/public-news';
import { formatDate } from '@/lib/utils';

type NewsDetailPost = PublicNewsRecord & { image?: string };

type DisplayImage = NewsGalleryImage;

export default function NewsDetailClient({ post }: { post: NewsDetailPost }) {
  const [linkCopied, setLinkCopied] = useState(false);
  const [selectedImage, setSelectedImage] = useState<DisplayImage | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const parsed = parseNewsContent(post.content);
  const primaryImage = post.image_url || post.image || null;
  const galleryImages: DisplayImage[] = [
    ...(primaryImage ? [{ src: primaryImage, alt: post.title }] : []),
    ...parsed.images.filter((image) => image.src !== primaryImage),
  ];
  const isMultiImageArticle = parsed.images.length > 0;

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = window.location.href;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  }, []);

  const closeLightbox = useCallback(() => {
    setSelectedImage(null);
    window.requestAnimationFrame(() => lastTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!selectedImage) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeLightbox();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [closeLightbox, selectedImage]);

  const openLightbox = (image: DisplayImage, trigger: HTMLButtonElement) => {
    lastTriggerRef.current = trigger;
    setSelectedImage(image);
  };

  return (
    <>
      {/* Hero */}
      <section className="page-hero">
        <div className="container-width">
          <Link
            href="/news"
            className="inline-flex items-center text-maroon-200 hover:text-white font-body text-sm mb-4 transition-colors"
          >
            <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            Back to News
          </Link>
          <h1 className="page-hero-title">{post.title}</h1>
          <div className="flex flex-wrap items-center gap-4 mt-2">
            {post.published_at && (
              <span className="font-body text-gold-200 text-xs font-semibold uppercase tracking-[0.08em]">
                {formatDate(post.published_at)}
              </span>
            )}
            <span className="font-body text-maroon-100 text-sm">by {post.author}</span>
          </div>
        </div>
      </section>

      {/* Article Content */}
      <section className="section-padding">
        <div className="container-width max-w-3xl mx-auto">
          <Card>
            <CardContent className="p-8">
              {galleryImages.length > 0 && (
                isMultiImageArticle ? (
                  <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2" aria-label="Article images">
                    {galleryImages.map((image, index) => (
                      <button
                        key={image.src}
                        type="button"
                        onClick={(event) => openLightbox(image, event.currentTarget)}
                        className="overflow-hidden rounded-lg border border-edge-subtle bg-surface-page cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-maroon-500"
                        aria-label={`View image ${index + 1} of ${galleryImages.length}: ${image.alt}`}
                      >
                        <SafeImage
                          src={image.src}
                          alt={image.alt}
                          width={1200}
                          height={1500}
                          className="h-auto w-full object-contain"
                          sizes="(max-width: 640px) 100vw, 384px"
                          priority={index === 0}
                          fallback={null}
                        />
                      </button>
                    ))}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={(event) => openLightbox(galleryImages[0], event.currentTarget)}
                    className="block w-full mb-6 rounded-lg overflow-hidden cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-maroon-500"
                    aria-label="View full image"
                  >
                    <SafeImage
                      src={galleryImages[0].src}
                      alt={galleryImages[0].alt}
                      width={800}
                      height={500}
                      className="w-full h-auto object-contain rounded-lg"
                      sizes="(max-width: 768px) 100vw, 768px"
                      priority
                      fallback={null}
                    />
                  </button>
                )
              )}

              {selectedImage && (
                <div
                  className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
                  onClick={closeLightbox}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Image lightbox"
                >
                  <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={closeLightbox}
                    className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2 hover:bg-black/80 transition-colors focus:outline-none focus:ring-2 focus:ring-white"
                    aria-label="Close image"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <SafeImage
                    src={selectedImage.src}
                    alt={selectedImage.alt}
                    width={1200}
                    height={1500}
                    className="max-w-full max-h-[90vh] w-auto h-auto object-contain rounded-lg"
                    sizes="100vw"
                    onClick={(event) => event.stopPropagation()}
                    fallback={null}
                  />
                </div>
              )}

              <article className="prose max-w-none">
                <p className="font-body text-content-secondary text-lg leading-relaxed whitespace-pre-line">
                  {parsed.body}
                </p>
              </article>
            </CardContent>
          </Card>

          {/* Share */}
          <div className="mt-8 flex items-center gap-4">
            <span className="font-body text-content-muted text-sm">Share this article:</span>
            <button
              onClick={handleCopyLink}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-edge-strong text-content-secondary hover:bg-surface-page font-body text-sm transition-colors"
              aria-label="Copy link to clipboard"
            >
              {linkCopied ? (
                <>
                  <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-2.066a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364l1.757 1.757" />
                  </svg>
                  Copy Link
                </>
              )}
            </button>
          </div>

          {/* Back Link */}
          <div className="mt-8">
            <Link
              href="/news"
              className="inline-flex items-center text-maroon-700 dark:text-maroon-200 hover:text-maroon-500 font-body font-semibold transition-colors"
            >
              <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
              All News &amp; Announcements
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
