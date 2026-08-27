import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { serializeJsonLd } from '@/lib/json-ld';
import { getPublishedNews, type PublicNewsRecord } from '@/lib/public-news';
import { truncateText } from '@/lib/utils';
import NewsDetailClient from './NewsDetailClient';

// Request-time rendering: news articles are mutable CMS content.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

async function getPost(id: string): Promise<PublicNewsRecord | null> {
  try {
    const result = await getPublishedNews({ id });
    if (result && !Array.isArray(result)) return result;
    return null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const post = await getPost(params.id);
  if (!post) {
    return { title: 'Article Not Found' };
  }
  const description = truncateText(post.content, 160);
  return {
    title: post.title,
    description,
    openGraph: {
      type: 'article',
      title: post.title,
      description,
      ...(post.published_at ? { publishedTime: post.published_at } : {}),
      images: post.image_url ? [{ url: post.image_url, alt: post.title }] : [{ url: '/images/logo.jpg', alt: 'NDCC Logo' }],
    },
  };
}

export default async function NewsDetailPage({ params }: { params: { id: string } }) {
  const post = await getPost(params.id);
  if (!post) {
    notFound();
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: post.title,
    description: truncateText(post.content, 200),
    ...(post.image_url ? { image: [post.image_url] } : {}),
    ...(post.published_at ? { datePublished: post.published_at } : {}),
    author: {
      '@type': 'Person',
      name: post.author,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Newcomb and District Cricket Club',
      logo: { '@type': 'ImageObject', url: '/images/logo.jpg' },
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <NewsDetailClient post={post} />
    </>
  );
}
