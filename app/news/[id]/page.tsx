import { cache } from 'react';
import { pageMetadata, absoluteUrl, authorJsonLd, ORGANIZATION_ID, breadcrumbJsonLd } from '@/lib/seo';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { serializeJsonLd } from '@/lib/json-ld';
import { parseNewsContent } from '@/lib/news-gallery';
import { getPublishedNews, type PublicNewsRecord } from '@/lib/public-news';
import { truncateText } from '@/lib/utils';
import NewsDetailClient from './NewsDetailClient';

// Request-time rendering: news articles are mutable CMS content.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const getPost = cache(async (id: string): Promise<PublicNewsRecord | null> => {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return null;
  const result = await getPublishedNews({ id });
  return result && !Array.isArray(result) ? result : null;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const post = await getPost(id);
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
  const post = await getPost(id);
  if (!post) {
    notFound();
  }

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd([jsonLd, breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'News', path: '/news' }, { name: post.title, path: `/news/${post.id}` }])]) }}
      />
      <NewsDetailClient post={post} />
    </>
  );
}
