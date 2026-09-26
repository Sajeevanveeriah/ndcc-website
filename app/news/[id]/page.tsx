import { cache } from 'react';
import { pageMetadata, absoluteUrl, authorJsonLd, ORGANIZATION_ID, breadcrumbJsonLd } from '@/lib/seo';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { draftMode } from 'next/headers';
import { serializeJsonLd } from '@/lib/json-ld';
import { parseNewsContent } from '@/lib/news-gallery';
import { getNewsForPreview, getPublishedNews, type PublicNewsRecord } from '@/lib/public-news';
import { canRenderRecord, previewBannerLabel } from '@/lib/preview';
import PreviewBanner from '@/components/common/PreviewBanner';
import { truncateText } from '@/lib/utils';
import NewsDetailClient from './NewsDetailClient';

// ISR: regenerated at most every 60s and on demand after admin writes
// (lib/server/revalidate-public.ts). 'force-static' lets the Supabase reads,
// which use cache: 'no-store' fetches, run during static regeneration instead
// of opting the route into per-request rendering. This route reads no
// cookies, headers or searchParams. Draft mode (committee preview, enabled
// only by /api/admin/preview) renders per request and may show unpublished
// or scheduled articles with a preview banner.
export const dynamic = 'force-static';
export const revalidate = 60;

const getPost = cache(async (id: string, preview: boolean): Promise<PublicNewsRecord | null> => {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return null;
  if (preview) {
    const draft = await getNewsForPreview(id);
    return canRenderRecord(draft, true) ? draft : null;
  }
  const result = await getPublishedNews({ id });
  return result && !Array.isArray(result) ? result : null;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const preview = (await draftMode()).isEnabled;
  const post = await getPost(id, preview);
  if (!post) {
    notFound();
  }

  const parsed = parseNewsContent(post.content);
  const description = truncateText(parsed.body, 160);
  const images = [
    ...(post.image_url ? [{ url: post.image_url, alt: post.title }] : []),
    ...parsed.images.map((image) => ({ url: image.src, alt: image.alt })),
  ];

  const base = pageMetadata(`/news/${post.id}`, post.title, description, images[0]?.url);
  return {
    ...base,
    ...(preview ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      ...base.openGraph,
      type: 'article',
      title: post.title,
      description,
      ...(post.published_at ? { publishedTime: post.published_at } : {}),
      images: images.length ? images : [{ url: '/images/logo.jpg', alt: 'NDCC Logo' }],
    },
  };
}

export default async function NewsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const preview = (await draftMode()).isEnabled;
  const post = await getPost(id, preview);
  if (!post) {
    notFound();
  }
  const bannerLabel = previewBannerLabel(post, preview);

  const parsed = parseNewsContent(post.content);
  const images = [
    ...(post.image_url ? [post.image_url] : []),
    ...parsed.images.map((image) => image.src),
  ];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: post.title,
    description: truncateText(parsed.body, 200),
    ...(images.length ? { image: images.map(absoluteUrl) } : {}),
    ...(post.published_at ? { datePublished: post.published_at } : {}),
    author: authorJsonLd(post.author),
    publisher: {
      '@type': 'Organization',
      name: 'Newcomb and District Cricket Club',
      '@id': ORGANIZATION_ID,
      logo: { '@type': 'ImageObject', url: absoluteUrl('/images/logo.jpg') },
    },
  };

  return (
    <>
      {bannerLabel && <PreviewBanner label={bannerLabel} returnPath={`/news/${post.id}`} />}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd([jsonLd, breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'News', path: '/news' }, { name: post.title, path: `/news/${post.id}` }])]) }}
      />
      <NewsDetailClient post={post} />
    </>
  );
}
